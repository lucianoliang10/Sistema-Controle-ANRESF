// Indicadores do RSSF: base de dados das demonstrações financeiras dos clubes
// (BP, DRE, DMPL, DFC) e a configuração das fórmulas dos indicadores.
//
// Tabelas (criadas à mão no SQL Editor do Supabase):
//   * indicadores_dados  — uma linha por rubrica/clube/exercício, marcada com o
//     `lote` da importação que a trouxe;
//   * indicadores_config — pares chave/valor (jsonb): 'lote_ativo' (qual
//     importação está valendo + resumo), 'catalogo' (rubricas do modelo) e
//     'formulas' (ajustes feitos nas fórmulas pelo site).
//
// GET  /api/indicadores            → tudo que os painéis de cálculo precisam:
//        lote, catálogo, config e as linhas NÃO zeradas de BP/DRE/DMPL de todos
//        os clubes, em formato compacto (textos num dicionário).
// GET  /api/indicadores?clube=X    → todas as linhas do clube (com zeradas e
//        DFC), para o painel "Base de dados".
// POST { acao: 'importar' | 'ativar' | 'descartar' }  → carga da planilha, em
//        lotes; só administradores.
// POST { acao: 'salvar-config', config }              → ajustes das fórmulas;
//        administradores e gestores.
//
// A importação grava as linhas novas com um lote novo e só troca o lote ativo
// no fim ('ativar'), depois de conferir a contagem. Assim uma carga que falhe
// no meio não deixa a base pela metade: o lote antigo segue valendo.

const { verificarAutenticacao } = require('./_auth');
const { montarUsuario } = require('./login');

const DEMONSTRACOES = ['BP', 'DRE', 'DMPL', 'DFC'];
const PAGINA = 1000; // teto padrão de linhas por resposta no Supabase
const MAX_LINHAS_POR_ENVIO = 5000;
const MAX_CONFIG_BYTES = 200 * 1024;

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

function cabecalhos(extra = {}) {
  const { supabaseKey } = getSupabaseConfig();
  return { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', ...extra };
}

function obterCorpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

async function rest(caminho, opcoes = {}) {
  const { supabaseUrl } = getSupabaseConfig();
  const resposta = await fetch(`${supabaseUrl}/rest/v1/${caminho}`, {
    method: opcoes.method || 'GET',
    headers: cabecalhos(opcoes.headers),
    body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
  });
  const dados = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, dados, resposta };
}

// As tabelas ainda não foram criadas no Supabase?
function faltaTabela(r) {
  const codigo = r.dados && r.dados.code;
  return !r.ok && (codigo === 'PGRST205' || codigo === '42P01' || (r.status === 404 && /indicadores_/.test(JSON.stringify(r.dados || ''))));
}

// Total informado no cabeçalho Content-Range ("0-999/8155").
function totalDoContentRange(resposta) {
  const cr = resposta.headers && typeof resposta.headers.get === 'function' ? resposta.headers.get('content-range') : '';
  const m = String(cr || '').match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

// Busca TODAS as linhas de uma consulta, paginando (o Supabase devolve no
// máximo ~1000 por resposta). A primeira página traz o total; as demais são
// pedidas em paralelo. `caminho` precisa ter uma ordenação estável.
async function buscarTudo(caminho) {
  const primeira = await rest(caminho, { headers: { 'Range-Unit': 'items', Range: `0-${PAGINA - 1}`, Prefer: 'count=exact' } });
  if (!primeira.ok) return primeira;
  const linhas = Array.isArray(primeira.dados) ? primeira.dados : [];
  const total = totalDoContentRange(primeira.resposta);
  if (total === null || linhas.length >= total || linhas.length === 0) return { ok: true, status: 200, dados: linhas };
  const passo = linhas.length; // o projeto pode ter um teto menor que PAGINA
  const pedidos = [];
  for (let inicio = passo; inicio < total; inicio += passo) {
    pedidos.push(rest(caminho, { headers: { 'Range-Unit': 'items', Range: `${inicio}-${inicio + passo - 1}` } }));
  }
  const paginas = await Promise.all(pedidos);
  const falha = paginas.find((p) => !p.ok);
  if (falha) return falha;
  paginas.forEach((p) => { (Array.isArray(p.dados) ? p.dados : []).forEach((l) => linhas.push(l)); });
  return { ok: true, status: 200, dados: linhas };
}

async function lerConfigs() {
  const r = await rest('indicadores_config?select=chave,valor,atualizado_em,atualizado_por');
  if (!r.ok) return r;
  const mapa = {};
  (Array.isArray(r.dados) ? r.dados : []).forEach((linha) => { mapa[linha.chave] = linha; });
  return { ok: true, mapa };
}

async function gravarConfig(chave, valor, autor) {
  return rest('indicadores_config?on_conflict=chave', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [{ chave, valor, atualizado_em: new Date().toISOString(), atualizado_por: autor || null }],
  });
}

function erroSupabase(res, r, mensagem) {
  if (faltaTabela(r)) {
    return responder(res, 409, { erro: 'As tabelas dos indicadores ainda não foram criadas no Supabase.', semTabelas: true });
  }
  return responder(res, r.status >= 400 ? r.status : 500, { erro: mensagem, detalhe: r.dados });
}

// ---------- leitura ----------

const COLUNAS = 'demonstracao,ano,clube,serie,centro_custo,descricao,classificacao,subclassificacao,valor';

function vazio(extra = {}) {
  return { lote: null, catalogo: [], config: null, clubes: [], dic: [], linhas: [], ...extra };
}

// Linhas de cálculo em formato compacto: os textos viram índices de um
// dicionário, e cada linha é [dem, ano, clube, centro, descrição,
// classificação, subclassificação, valor].
function compactar(linhas) {
  const dic = [];
  const posicao = new Map();
  const idx = (texto) => {
    const t = texto === null || texto === undefined ? '' : String(texto);
    if (!posicao.has(t)) { posicao.set(t, dic.length); dic.push(t); }
    return posicao.get(t);
  };
  const clubes = [];
  const posClube = new Map();
  const compactas = linhas.map((l) => {
    if (!posClube.has(l.clube)) { posClube.set(l.clube, clubes.length); clubes.push([l.clube, l.serie || '']); }
    return [DEMONSTRACOES.indexOf(l.demonstracao), Number(l.ano), posClube.get(l.clube), idx(l.centro_custo), idx(l.descricao), idx(l.classificacao), idx(l.subclassificacao), Number(l.valor)];
  });
  return { dic, clubes, linhas: compactas };
}

async function listar(req, res, usuario) {
  const configs = await lerConfigs();
  if (!configs.ok) {
    if (faltaTabela(configs)) return responder(res, 200, vazio({ semTabelas: true, perfil: usuario.perfil }));
    return erroSupabase(res, configs, 'Erro ao ler a configuração dos indicadores.');
  }
  const formulas = configs.mapa.formulas;
  const config = formulas ? { valor: formulas.valor, atualizado_em: formulas.atualizado_em, atualizado_por: formulas.atualizado_por } : null;
  const lote = configs.mapa.lote_ativo ? configs.mapa.lote_ativo.valor : null;
  const catalogo = configs.mapa.catalogo && Array.isArray(configs.mapa.catalogo.valor) ? configs.mapa.catalogo.valor : [];
  if (!lote || !lote.lote) return responder(res, 200, vazio({ config, perfil: usuario.perfil }));

  const url = new URL(req.url || '/', 'http://local');
  const clube = url.searchParams.get('clube');
  const filtroLote = `lote=eq.${encodeURIComponent(lote.lote)}`;

  if (clube) {
    const r = await buscarTudo(`indicadores_dados?select=${COLUNAS},ordem&${filtroLote}&clube=eq.${encodeURIComponent(clube)}&order=id.asc`);
    if (!r.ok) return erroSupabase(res, r, 'Erro ao ler a base de dados do clube.');
    return responder(res, 200, {
      clube,
      linhas: r.dados.map((l) => ({
        dem: l.demonstracao, ano: Number(l.ano), clube: l.clube, serie: l.serie || '', centro: l.centro_custo || '', descricao: l.descricao,
        classificacao: l.classificacao || '', subclassificacao: l.subclassificacao || '', valor: l.valor === null ? null : Number(l.valor), ordem: l.ordem,
      })),
    });
  }

  // Para os cálculos bastam as linhas com valor (zeradas não mudam soma) das
  // demonstrações que entram nas fórmulas.
  const r = await buscarTudo(`indicadores_dados?select=${COLUNAS}&${filtroLote}&demonstracao=in.(BP,DRE,DMPL)&valor=neq.0&order=id.asc`);
  if (!r.ok) return erroSupabase(res, r, 'Erro ao ler a base de dados dos indicadores.');
  return responder(res, 200, { lote, catalogo, config, perfil: usuario.perfil, ...compactar(r.dados) });
}

// ---------- importação ----------

function loteValido(lote) {
  return typeof lote === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(lote);
}

function texto(valor, max = 300) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Confere e limpa uma linha vinda do navegador. Devolve null se for inválida.
function linhaParaBanco(lote, l) {
  if (!l || typeof l !== 'object') return null;
  const dem = texto(l.dem, 10).toUpperCase();
  const ano = Number(l.ano);
  const clube = texto(l.clube, 120);
  const descricao = texto(l.descricao);
  if (!DEMONSTRACOES.includes(dem) || !Number.isInteger(ano) || ano < 1990 || ano > 2100 || !clube || !descricao) return null;
  const valor = l.valor === null || l.valor === undefined || l.valor === '' ? null : Number(l.valor);
  if (valor !== null && !Number.isFinite(valor)) return null;
  const ordem = Number.isInteger(Number(l.ordem)) ? Number(l.ordem) : null;
  return {
    lote, demonstracao: dem, ano, clube, serie: texto(l.serie, 20) || null,
    centro_custo: texto(l.centro), descricao, classificacao: texto(l.classificacao), subclassificacao: texto(l.subclassificacao),
    valor, ordem,
  };
}

async function importar(corpo, res) {
  if (!loteValido(corpo.lote)) return responder(res, 400, { erro: 'lote inválido.' });
  const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : [];
  if (!linhas.length) return responder(res, 400, { erro: 'Nenhuma linha para importar.' });
  if (linhas.length > MAX_LINHAS_POR_ENVIO) return responder(res, 400, { erro: `Envie no máximo ${MAX_LINHAS_POR_ENVIO} linhas por vez.` });
  const paraBanco = linhas.map((l) => linhaParaBanco(corpo.lote, l));
  const invalidas = paraBanco.filter((l) => !l).length;
  if (invalidas) return responder(res, 400, { erro: `${invalidas} linha(s) inválida(s) neste envio (demonstração, exercício, clube ou valor).` });
  const r = await rest('indicadores_dados', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: paraBanco });
  if (!r.ok) return erroSupabase(res, r, 'Erro ao gravar as linhas no Supabase.');
  return responder(res, 201, { sucesso: true, gravadas: paraBanco.length });
}

async function contarLote(lote) {
  const r = await rest(`indicadores_dados?select=id&lote=eq.${encodeURIComponent(lote)}`, { headers: { 'Range-Unit': 'items', Range: '0-0', Prefer: 'count=exact' } });
  if (!r.ok) return r;
  return { ok: true, total: totalDoContentRange(r.resposta) };
}

// Fim da importação: confere a contagem, passa a valer o lote novo e apaga os antigos.
async function ativar(corpo, res, usuario) {
  if (!loteValido(corpo.lote)) return responder(res, 400, { erro: 'lote inválido.' });
  const resumo = corpo.resumo && typeof corpo.resumo === 'object' ? corpo.resumo : {};
  const esperado = Number(resumo.total);
  const contagem = await contarLote(corpo.lote);
  if (!contagem.ok) return erroSupabase(res, contagem, 'Erro ao conferir a importação.');
  if (!Number.isFinite(esperado) || contagem.total !== esperado) {
    return responder(res, 409, { erro: `A importação ficou incompleta: ${contagem.total ?? 0} de ${Number.isFinite(esperado) ? esperado : '?'} linhas gravadas. A base anterior continua valendo. Importe de novo.` });
  }
  const meta = {
    lote: corpo.lote, importado_em: new Date().toISOString(), importado_por: usuario.nome || usuario.email || '',
    arquivo: texto(resumo.arquivo, 200), total: esperado,
    porDemonstracao: resumo.porDemonstracao && typeof resumo.porDemonstracao === 'object' ? resumo.porDemonstracao : {},
    clubes: Array.isArray(resumo.clubes) ? resumo.clubes.map((c) => texto(c, 120)).slice(0, 500) : [],
    anos: Array.isArray(resumo.anos) ? resumo.anos.map(Number).filter(Number.isInteger).slice(0, 50) : [],
  };
  const catalogo = (Array.isArray(corpo.catalogo) ? corpo.catalogo : []).slice(0, 5000).map((c) => ({
    dem: texto(c && c.dem, 10), centro: texto(c && c.centro), classificacao: texto(c && c.classificacao), subclassificacao: texto(c && c.subclassificacao), descricao: texto(c && c.descricao),
  })).filter((c) => DEMONSTRACOES.includes(c.dem) && c.descricao);

  const g1 = await gravarConfig('catalogo', catalogo, meta.importado_por);
  if (!g1.ok) return erroSupabase(res, g1, 'Erro ao gravar o catálogo de rubricas.');
  const g2 = await gravarConfig('lote_ativo', meta, meta.importado_por);
  if (!g2.ok) return erroSupabase(res, g2, 'Erro ao ativar a nova base.');
  // Daqui em diante a base nova já vale. Apagar a antiga é limpeza: se falhar,
  // as linhas velhas ficam sem uso (as leituras filtram pelo lote ativo).
  const limpeza = await rest(`indicadores_dados?lote=neq.${encodeURIComponent(corpo.lote)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return responder(res, 200, { sucesso: true, lote: meta, limpezaOk: limpeza.ok });
}

// Importação que falhou no meio: apaga o que chegou a ser gravado.
async function descartar(corpo, res) {
  if (!loteValido(corpo.lote)) return responder(res, 400, { erro: 'lote inválido.' });
  const configs = await lerConfigs();
  if (configs.ok && configs.mapa.lote_ativo && configs.mapa.lote_ativo.valor && configs.mapa.lote_ativo.valor.lote === corpo.lote) {
    return responder(res, 409, { erro: 'Este é o lote em uso; não pode ser descartado.' });
  }
  const r = await rest(`indicadores_dados?lote=eq.${encodeURIComponent(corpo.lote)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!r.ok) return erroSupabase(res, r, 'Erro ao descartar a importação.');
  return responder(res, 200, { sucesso: true });
}

// ---------- configuração das fórmulas ----------

async function salvarConfig(corpo, res, usuario) {
  const config = corpo.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return responder(res, 400, { erro: 'config deve ser um objeto.' });
  if (Buffer.byteLength(JSON.stringify(config), 'utf8') > MAX_CONFIG_BYTES) return responder(res, 400, { erro: 'Configuração grande demais.' });
  const r = await gravarConfig('formulas', config, usuario.nome || usuario.email || '');
  if (!r.ok) return erroSupabase(res, r, 'Erro ao salvar a configuração das fórmulas.');
  const linha = Array.isArray(r.dados) ? r.dados[0] : null;
  return responder(res, 200, { sucesso: true, config: { valor: config, atualizado_em: linha ? linha.atualizado_em : new Date().toISOString(), atualizado_por: linha ? linha.atualizado_por : (usuario.nome || '') } });
}

module.exports = async function handler(req, res) {
  try {
    const user = await verificarAutenticacao(req);
    if (!user) return responder(res, 401, { erro: 'Não autenticado. Faça login para continuar.' });
    const usuario = montarUsuario(user);

    if (req.method === 'GET') return await listar(req, res, usuario);
    if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido. Use GET ou POST.' });

    const corpo = obterCorpo(req);
    const ehAdm = usuario.perfil === 'adm';
    if (corpo.acao === 'salvar-config') {
      if (!ehAdm && usuario.perfil !== 'gestor') return responder(res, 403, { erro: 'Só administradores e gestores podem alterar as fórmulas dos indicadores.' });
      return await salvarConfig(corpo, res, usuario);
    }
    if (['importar', 'ativar', 'descartar'].includes(corpo.acao)) {
      if (!ehAdm) return responder(res, 403, { erro: 'Só administradores podem importar a base de dados dos indicadores.' });
      if (corpo.acao === 'importar') return await importar(corpo, res);
      if (corpo.acao === 'ativar') return await ativar(corpo, res, usuario);
      return await descartar(corpo, res);
    }
    return responder(res, 400, { erro: 'acao inválida. Use "importar", "ativar", "descartar" ou "salvar-config".' });
  } catch (erro) {
    return responder(res, 500, { erro: 'Erro interno ao processar os indicadores.', detalhe: erro.message });
  }
};

module.exports.compactar = compactar;
module.exports.linhaParaBanco = linhaParaBanco;
