const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Lista padrão de sanções: base automática, uso nas etapas, a lista suspensa
// do formulário e a API que guarda a lista.
const normStatus = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  normStatus,
  tipoBaseEtapa: (nome) => normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]),
  esc: (s) => String(s ?? ''),
  dadosFluxograma: [],
};
vm.createContext(contexto);
for (const arquivo of ['js/sugestoes-etapa.js', 'js/sancao-categorias.js', 'js/sancao-lista.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
const c = contexto;
const estado = () => vm.runInContext('sancListaEstado', contexto);
let banco = 1;
const etapa = (caso, sancao, extra = {}) => ({ etapa_banco_id: banco++, casoRaiz: String(caso), etapa: 'Acórdão - PSO', sancao, ...extra });

const rows = [
  etapa(1, 'Advertência'),
  etapa(2, 'Advertência + Multa 40k'),
  etapa(3, 'advertencia'),
  etapa(4, 'Advertência  +  Transferban'),
  etapa(5, 'Multa de R$ 100.000,00'),
  etapa(6, 'Indeferido'),
  etapa(7, null, { sancaoDetalhe: { geral: 'Advertência', transicao: 'Transferban + Advertência' } }),
  etapa(8, ''),
  { casoRaiz: '9', etapa: 'Caso sem etapa', sancao: 'Não conta' },
];

test('base automática: o que já foi digitado, do mais usado para o menos usado', () => {
  const base = Array.from(c.sancListaBase(rows), (b) => `${b.texto}:${b.n}`);
  assert.deepEqual(base, ['Advertência:5', 'Transferban:2', 'Indeferido:1', 'Multa 40k:1', 'Multa de R$ 100.000,00:1']);
  assert.deepEqual(Array.from(c.sancListaBase([])), []);
});

test('lista em vigor: a salva; sem ela, a base automática', () => {
  estado().salva = null;
  assert.deepEqual(Array.from(c.sancListaItens(rows)).slice(0, 2), ['Advertência', 'Transferban']);
  estado().salva = { itens: ['Multa', 'Advertência'] };
  assert.deepEqual(Array.from(c.sancListaItens(rows)), ['Multa', 'Advertência']);
  estado().salva = null;
});

test('texto dentro do padrão: igual ao item ou começando por ele', () => {
  const itens = ['Advertência', 'Multa'];
  assert.equal(c.sancListaAceita('advertencia', itens), true);
  assert.equal(c.sancListaAceita('Multa de R$ 40.000,00', itens), true);
  assert.equal(c.sancListaAceita('Multa', itens), true);
  assert.equal(c.sancListaAceita('Multas', itens), false, 'só vale palavra inteira');
  assert.equal(c.sancListaAceita('Transferban', itens), false);
  assert.equal(c.sancListaAceita('', itens), true);
  assert.deepEqual(Array.from(c.sancListaForaDoPadrao(['Advertência + Transferbam', 'Multa 10k + transferbam'], itens)), ['Transferbam']);
});

test('uso da lista: etapas por item e o que ficou de fora', () => {
  const uso = c.sancListaUso(rows, ['Advertência', 'Multa', 'Multa de R$']);
  assert.deepEqual(Array.from(uso.porItem), [5, 1, 1], 'cada texto conta no item mais específico');
  assert.deepEqual(Array.from(uso.fora, (f) => `${f.texto}:${f.n}:${Array.from(f.casos).join(',')}`), ['Transferban:2:4,7', 'Indeferido:1:6']);
});

test('limpeza: sem repetição, sem "+" e sem vazios', () => {
  assert.deepEqual(Array.from(c.sancListaLimpar([' Advertência ', 'ADVERTENCIA', '', 'Multa + juros', null, 'Transferban'])), ['Advertência', 'Multa juros', 'Transferban']);
});

test('formulário: os campos de sanção usam a lista padrão; o motivo continua pelo histórico', () => {
  estado().salva = { itens: ['Advertência', 'Multa', 'Transferban'] };
  assert.deepEqual(Array.from(c.sugestoesDoCampo(rows, 'Acórdão - PSO', 'sancao:geral')), ['Advertência', 'Multa', 'Transferban']);
  assert.deepEqual(Array.from(c.sugestoesDoCampo(rows, 'Parecer', 'sancao:livre')), ['Advertência', 'Multa', 'Transferban'], 'não depende do tipo da etapa');
  assert.equal(c.sugestoesEhListaPadrao('sancao:transicao'), true);
  assert.equal(c.sugestoesEhListaPadrao('sancao:motivo'), false);
  assert.equal(c.sugestoesEhListaPadrao('objeto'), false);
  estado().salva = null;
});

// ---------- API ----------
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/listas.js');
const chamar = async (req) => { const res = { statusCode: 0, corpo: '', setHeader() {}, end(t) { this.corpo = t; } }; await handler({ headers: { authorization: 'Bearer t' }, ...req }, res); return { status: res.statusCode, json: JSON.parse(res.corpo) }; };
const r = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
function supabase({ linha = null, semTabela = false, logado = true } = {}) {
  const gravados = [];
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return logado ? r(200, { id: 'u1', email: 'ana.souza@exemplo.org', user_metadata: { nome: 'Ana Souza', perfil: 'analista' } }) : r(401, {});
    if (u.includes('/rest/v1/indicadores_config')) {
      if (semTabela) return r(404, { code: 'PGRST205', message: "Could not find the table 'public.indicadores_config' in the schema cache" });
      if (opcoes.method === 'POST') { const corpo = JSON.parse(opcoes.body); gravados.push({ url: u, corpo, prefer: opcoes.headers.Prefer }); return r(201, corpo); }
      return r(200, linha ? [linha] : []);
    }
    return r(404, null);
  };
  return gravados;
}

test('API: lê a lista salva; sem lista devolve null', async () => {
  supabase();
  assert.deepEqual((await chamar({ method: 'GET' })).json, { sancoes: null });
  supabase({ linha: { chave: 'sancoes_lista', valor: { itens: ['Advertência', 'advertencia', ' Multa '] }, atualizado_em: '2026-11-25T12:00:00Z', atualizado_por: 'Ana' } });
  const lida = await chamar({ method: 'GET' });
  assert.equal(lida.status, 200);
  assert.deepEqual(lida.json.sancoes, { itens: ['Advertência', 'Multa'], atualizado_em: '2026-11-25T12:00:00Z', atualizado_por: 'Ana' });
});

test('API: salva a lista limpa, com autor do login, para qualquer perfil', async () => {
  const g = supabase();
  const salva = await chamar({ method: 'POST', body: { acao: 'salvar-sancoes', itens: ['Advertência', ' advertência ', 'Multa + juros', '', 42, 'x'.repeat(200)] } });
  assert.equal(salva.status, 200, JSON.stringify(salva.json));
  assert.equal(g.length, 1);
  assert.match(g[0].url, /on_conflict=chave/);
  assert.match(g[0].prefer, /merge-duplicates/);
  const reg = g[0].corpo[0];
  assert.equal(reg.chave, 'sancoes_lista');
  assert.deepEqual(reg.valor.itens.slice(0, 2), ['Advertência', 'Multa juros']);
  assert.equal(reg.valor.itens[2].length, 80, 'texto longo é cortado');
  assert.equal(reg.atualizado_por, 'Ana Souza');
  assert.deepEqual(salva.json.sancoes.itens, reg.valor.itens);
});

test('API: validações, tabela ausente e falta de login', async () => {
  const g = supabase();
  assert.equal((await chamar({ method: 'POST', body: { acao: 'salvar-sancoes', itens: 'Advertência' } })).status, 400);
  assert.equal((await chamar({ method: 'POST', body: { acao: 'salvar-sancoes', itens: [' ', '+'] } })).status, 400, 'lista vazia não é salva');
  assert.equal((await chamar({ method: 'POST', body: { acao: 'outra' } })).status, 400);
  assert.equal(g.length, 0);
  supabase({ semTabela: true });
  assert.deepEqual((await chamar({ method: 'GET' })).json, { sancoes: null, semTabela: true }, 'sem a tabela o site segue com a base automática');
  const semTabela = await chamar({ method: 'POST', body: { acao: 'salvar-sancoes', itens: ['Advertência'] } });
  assert.equal(semTabela.status, 409);
  assert.equal(semTabela.json.semTabela, true);
  supabase({ logado: false });
  assert.equal((await chamar({ method: 'GET' })).status, 401);
  assert.equal((await chamar({ method: 'POST', body: { acao: 'salvar-sancoes', itens: ['A'] } })).status, 401);
});
