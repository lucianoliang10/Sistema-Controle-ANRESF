// Listas padrão do sistema, editadas no painel Administração.
//
// Hoje há uma: a lista padrão de SANÇÕES, que alimenta a lista suspensa dos
// campos de sanção do formulário de etapa. Ela fica na tabela de pares
// chave/valor que os Indicadores já usam (indicadores_config), na chave
// 'sancoes_lista', com o valor { itens: [...] }. Assim não é preciso criar
// tabela nova.
//
// GET  /api/listas → { sancoes: { itens, atualizado_em, atualizado_por } | null }
//      null = ninguém salvou a lista ainda (o site usa a base automática).
// POST { acao: 'salvar-sancoes', itens: [...] } → grava a lista inteira.
//
// Qualquer usuário autenticado lê e grava, como o restante de Administração.

const { verificarAutenticacao } = require('./_auth');
const { montarUsuario } = require('./login');

const TABELA = 'indicadores_config';
const CHAVE_SANCOES = 'sancoes_lista';
const MAX_ITENS = 200;
const MAX_TEXTO = 80;

function responder(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!rawUrl || !supabaseKey) throw new Error('Variáveis de ambiente do Supabase não configuradas.');
  return { supabaseUrl: rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), supabaseKey };
}

async function rest(caminho, opcoes = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  const resposta = await fetch(`${supabaseUrl}/rest/v1/${caminho}`, {
    method: opcoes.method || 'GET',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
    body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
  });
  const dados = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, dados };
}

function faltaTabela(r) {
  const codigo = r.dados && r.dados.code;
  return !r.ok && (codigo === 'PGRST205' || codigo === '42P01' || (r.status === 404 && /indicadores_config/.test(JSON.stringify(r.dados || ''))));
}

function obterCorpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function chaveTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Itens limpos: texto aparado, sem repetição (ignorando acento e caixa) e sem
// o sinal "+", que no campo de sanção separa uma sanção da outra.
function normalizarItens(itens) {
  const vistos = new Set();
  const limpos = [];
  (Array.isArray(itens) ? itens : []).forEach((bruto) => {
    if (typeof bruto !== 'string') return;
    const texto = bruto.replace(/\s+/g, ' ').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO).trim();
    const chave = chaveTexto(texto);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    limpos.push(texto);
  });
  return limpos.slice(0, MAX_ITENS);
}

async function ler(res) {
  const r = await rest(`${TABELA}?select=chave,valor,atualizado_em,atualizado_por&chave=eq.${CHAVE_SANCOES}`);
  // Sem a tabela, o site segue com a base automática; o painel avisa.
  if (faltaTabela(r)) return responder(res, 200, { sancoes: null, semTabela: true });
  if (!r.ok) return responder(res, r.status >= 400 ? r.status : 500, { erro: 'Erro ao ler a lista padrão de sanções.', detalhe: r.dados });
  const linha = Array.isArray(r.dados) ? r.dados[0] : null;
  const itens = linha ? normalizarItens(linha.valor && linha.valor.itens) : [];
  return responder(res, 200, { sancoes: itens.length ? { itens, atualizado_em: linha.atualizado_em || null, atualizado_por: linha.atualizado_por || null } : null });
}

async function salvarSancoes(corpo, res, usuario) {
  if (!Array.isArray(corpo.itens)) return responder(res, 400, { erro: 'itens deve ser a lista de sanções.' });
  const itens = normalizarItens(corpo.itens);
  if (!itens.length) return responder(res, 400, { erro: 'A lista precisa ter pelo menos uma sanção.' });
  const registro = { chave: CHAVE_SANCOES, valor: { itens }, atualizado_em: new Date().toISOString(), atualizado_por: usuario.nome || usuario.email || null };
  const r = await rest(`${TABELA}?on_conflict=chave`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: [registro] });
  if (faltaTabela(r)) {
    return responder(res, 409, { erro: 'Falta criar a tabela indicadores_config no Supabase. Rode o comando no SQL Editor e tente de novo.', semTabela: true });
  }
  if (!r.ok) return responder(res, r.status >= 400 ? r.status : 500, { erro: 'Erro ao salvar a lista padrão de sanções.', detalhe: r.dados });
  return responder(res, 200, { sucesso: true, sancoes: { itens, atualizado_em: registro.atualizado_em, atualizado_por: registro.atualizado_por } });
}

module.exports = async function handler(req, res) {
  try {
    const user = await verificarAutenticacao(req);
    if (!user) return responder(res, 401, { erro: 'Não autenticado. Faça login para continuar.' });
    if (req.method === 'GET') return await ler(res);
    if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido. Use GET ou POST.' });
    const corpo = obterCorpo(req);
    if (corpo.acao === 'salvar-sancoes') return await salvarSancoes(corpo, res, montarUsuario(user));
    return responder(res, 400, { erro: 'acao inválida. Use "salvar-sancoes".' });
  } catch (erro) {
    return responder(res, 500, { erro: 'Erro interno ao processar as listas.', detalhe: erro.message });
  }
};

module.exports.normalizarItens = normalizarItens;
