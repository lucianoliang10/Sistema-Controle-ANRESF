// Limpeza dos anexos sem uso no Supabase Storage. Só administradores.
//
// O sistema nunca apagava arquivo do Storage: ao trocar o anexo de uma etapa
// ou excluir uma etapa/tarefa, o arquivo antigo continuava ocupando espaço.
// Esta função mostra o que está guardado e apaga, a pedido, só o que nenhum
// caso, etapa ou tarefa cita mais.
//
// GET  /api/anexos-limpeza → uso do bucket e a lista dos arquivos sem uso.
// POST { acao: 'excluir', nomes: [...] } → apaga os arquivos pedidos, depois
//      de conferir DE NOVO que cada um continua sem uso.
//
// Regras de segurança:
//   * "em uso" é qualquer arquivo cujo nome apareça em QUALQUER campo de
//     casos, etapas ou tarefas (não só nos campos de anexo);
//   * as três tabelas são lidas por inteiro, com paginação e conferência da
//     contagem. Se uma leitura falhar ou vier incompleta, nada é listado nem
//     apagado (um arquivo em uso poderia parecer sem uso);
//   * arquivo enviado há menos de 24 horas nunca entra na lista: pode ser de
//     uma etapa que ainda está sendo preenchida;
//   * arquivos dentro de pastas do bucket não são tocados.

const { verificarAutenticacao } = require('./_auth');
const { montarUsuario } = require('./login');

const BUCKET_ANEXOS = 'etapas-anexos';
const TABELAS = ['casos', 'etapas', 'tarefas'];
const CARENCIA_HORAS = 24;
const PAGINA = 1000;
const LOTE_EXCLUSAO = 100;
const MAX_NOMES = 2000;

function responder(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!rawUrl || !supabaseKey) throw new Error('Variáveis de ambiente do Supabase não configuradas.');
  const supabaseUrl = rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  return { supabaseUrl, supabaseKey };
}

function obterCorpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

async function chamar(caminho, opcoes = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  const resposta = await fetch(`${supabaseUrl}${caminho}`, {
    method: opcoes.method || 'GET',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
    body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
  });
  const dados = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, dados, resposta };
}

function totalDoContentRange(resposta) {
  const cr = resposta.headers && typeof resposta.headers.get === 'function' ? resposta.headers.get('content-range') : '';
  const m = String(cr || '').match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

// Todas as linhas de uma tabela. Lança erro se qualquer página falhar ou se o
// total lido não bater com a contagem informada pelo Supabase.
async function lerTabelaInteira(tabela) {
  const caminho = `/rest/v1/${tabela}?select=*&order=id.asc`;
  const primeira = await chamar(caminho, { headers: { 'Range-Unit': 'items', Range: `0-${PAGINA - 1}`, Prefer: 'count=exact' } });
  if (!primeira.ok || !Array.isArray(primeira.dados)) throw new Error(`Não foi possível ler a tabela ${tabela}.`);
  const total = totalDoContentRange(primeira.resposta);
  if (total === null) throw new Error(`O Supabase não informou o total de linhas da tabela ${tabela}.`);
  const linhas = primeira.dados.slice();
  while (linhas.length < total) {
    const inicio = linhas.length;
    const pagina = await chamar(caminho, { headers: { 'Range-Unit': 'items', Range: `${inicio}-${inicio + PAGINA - 1}` } });
    if (!pagina.ok || !Array.isArray(pagina.dados) || pagina.dados.length === 0) throw new Error(`A leitura da tabela ${tabela} ficou incompleta.`);
    pagina.dados.forEach((l) => linhas.push(l));
  }
  if (linhas.length !== total) throw new Error(`A leitura da tabela ${tabela} ficou incompleta.`);
  return linhas;
}

// Tudo o que casos, etapas e tarefas citam, de um jeito fácil de consultar.
async function lerReferencias() {
  const tabelas = await Promise.all(TABELAS.map(lerTabelaInteira));
  const texto = JSON.stringify(tabelas);
  // Nomes citados em links do bucket, também na forma decodificada (%20 etc.).
  const citados = new Set();
  const padrao = new RegExp(`${BUCKET_ANEXOS}/([^"?#\\s\\\\]+)`, 'g');
  let m;
  while ((m = padrao.exec(texto)) !== null) {
    citados.add(m[1]);
    try { citados.add(decodeURIComponent(m[1])); } catch (e) { /* nome com % solto */ }
  }
  const emUso = (nome) => citados.has(nome) || texto.includes(nome) || texto.includes(encodeURIComponent(nome)) || texto.includes(encodeURI(nome));
  return { emUso, linhas: tabelas.reduce((s, t) => s + t.length, 0) };
}

// Todos os arquivos da raiz do bucket (é onde o sistema grava os anexos).
async function listarArquivos() {
  const arquivos = [];
  let pastas = 0;
  // Avança pelo tamanho de cada página recebida, até vir uma vazia: funciona
  // mesmo que o Storage devolva menos itens por página do que o pedido.
  for (let offset = 0; ;) {
    const r = await chamar(`/storage/v1/object/list/${BUCKET_ANEXOS}`, {
      method: 'POST', body: { prefix: '', limit: PAGINA, offset, sortBy: { column: 'name', order: 'asc' } },
    });
    if (!r.ok || !Array.isArray(r.dados)) throw new Error('Não foi possível listar os arquivos do Storage.');
    r.dados.forEach((o) => {
      if (!o || !o.name) return;
      if (!o.id) { pastas += 1; return; } // pasta: não é mexida
      arquivos.push({ nome: o.name, bytes: Number(o.metadata && o.metadata.size) || 0, criado_em: o.created_at || o.updated_at || null });
    });
    if (!r.dados.length) break;
    offset += r.dados.length;
  }
  return { arquivos, pastas };
}

function urlPublica(nome) {
  const { supabaseUrl } = getSupabaseConfig();
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_ANEXOS}/${encodeURIComponent(nome)}`;
}

async function analisar(agora = Date.now()) {
  const [{ arquivos, pastas }, referencias] = await Promise.all([listarArquivos(), lerReferencias()]);
  const limite = agora - CARENCIA_HORAS * 3600 * 1000;
  const semUso = [];
  let recentes = 0;
  let bytesEmUso = 0;
  let qtdEmUso = 0;
  arquivos.forEach((a) => {
    if (referencias.emUso(a.nome)) { qtdEmUso += 1; bytesEmUso += a.bytes; return; }
    const criado = a.criado_em ? Date.parse(a.criado_em) : NaN;
    // Sem data conhecida ou recente demais: fica fora da lista, por cautela.
    if (!Number.isFinite(criado) || criado > limite) { recentes += 1; return; }
    semUso.push(a);
  });
  const soma = (lista) => lista.reduce((s, a) => s + a.bytes, 0);
  return {
    arquivos, semUso, pastas, recentes,
    total: { arquivos: arquivos.length, bytes: soma(arquivos) },
    emUso: { arquivos: qtdEmUso, bytes: bytesEmUso },
    linhasConferidas: referencias.linhas,
  };
}

async function listar(res) {
  const a = await analisar();
  const lista = a.semUso.slice().sort((x, y) => y.bytes - x.bytes).map((x) => ({ nome: x.nome, bytes: x.bytes, criado_em: x.criado_em, url: urlPublica(x.nome) }));
  return responder(res, 200, {
    bucket: BUCKET_ANEXOS, carenciaHoras: CARENCIA_HORAS, total: a.total, emUso: a.emUso,
    semUso: { arquivos: lista.length, bytes: lista.reduce((s, x) => s + x.bytes, 0), lista },
    recentes: a.recentes, pastasIgnoradas: a.pastas, linhasConferidas: a.linhasConferidas,
  });
}

async function excluir(corpo, res, usuario) {
  const pedidos = Array.isArray(corpo.nomes) ? Array.from(new Set(corpo.nomes.filter((n) => typeof n === 'string' && n))) : [];
  if (!pedidos.length) return responder(res, 400, { erro: 'Informe os arquivos a excluir.' });
  if (pedidos.length > MAX_NOMES) return responder(res, 400, { erro: `Envie no máximo ${MAX_NOMES} arquivos por vez.` });

  // Confere de novo, agora: só sai o que continua sem uso neste instante.
  const a = await analisar();
  const permitidos = new Map(a.semUso.map((x) => [x.nome, x]));
  const alvo = pedidos.filter((n) => permitidos.has(n));
  const recusados = pedidos.filter((n) => !permitidos.has(n));

  let excluidos = 0;
  let bytes = 0;
  let falha = null;
  for (let i = 0; i < alvo.length; i += LOTE_EXCLUSAO) {
    const lote = alvo.slice(i, i + LOTE_EXCLUSAO);
    const r = await chamar(`/storage/v1/object/${BUCKET_ANEXOS}`, { method: 'DELETE', body: { prefixes: lote } });
    if (!r.ok) { falha = `O Storage recusou a exclusão (HTTP ${r.status}).`; break; }
    // O Storage devolve os objetos que apagou de fato.
    const apagados = Array.isArray(r.dados) ? r.dados.map((o) => o && o.name).filter(Boolean) : lote;
    apagados.forEach((nome) => { excluidos += 1; bytes += permitidos.has(nome) ? permitidos.get(nome).bytes : 0; });
  }
  console.log(`[anexos-limpeza] ${usuario.nome || usuario.email || 'adm'} excluiu ${excluidos} arquivo(s) sem uso (${bytes} bytes).`);
  return responder(res, falha && !excluidos ? 502 : 200, { sucesso: !falha, excluidos, bytes, recusados, ...(falha ? { erro: falha } : {}) });
}

module.exports = async function handler(req, res) {
  try {
    const user = await verificarAutenticacao(req);
    if (!user) return responder(res, 401, { erro: 'Não autenticado. Faça login para continuar.' });
    const usuario = montarUsuario(user);
    if (usuario.perfil !== 'adm') return responder(res, 403, { erro: 'Só administradores podem ver e limpar o armazenamento de anexos.' });

    if (req.method === 'GET') return await listar(res);
    if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido. Use GET ou POST.' });
    const corpo = obterCorpo(req);
    if (corpo.acao === 'excluir') return await excluir(corpo, res, usuario);
    return responder(res, 400, { erro: 'acao inválida. Use "excluir".' });
  } catch (erro) {
    // Qualquer dúvida na leitura interrompe tudo: nada é listado nem apagado.
    return responder(res, 500, { erro: erro.message || 'Erro ao analisar o armazenamento de anexos.' });
  }
};

module.exports.analisar = analisar;
