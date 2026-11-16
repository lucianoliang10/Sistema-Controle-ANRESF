const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// ID de etapa e etapas complementares ("021-A/2026"): leitura do ID, sugestão
// de ID vago, aviso de ID repetido, Controle de IDs e duplicação de caso.
const id = require('../js/id-etapa.js');

const normStatus = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tipoBaseEtapa = (nome) => normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]);
const ANO = new Date().getFullYear();

test('leitura do ID: padrão, complementar e o que fica de fora', () => {
  assert.deepEqual(id.idEtapaLer('021/2026'), { numero: 21, sufixo: '', ano: 2026 });
  assert.deepEqual(id.idEtapaLer('021-A/2026'), { numero: 21, sufixo: 'A', ano: 2026 });
  assert.deepEqual(id.idEtapaLer(' 21 - b / 2026 '), { numero: 21, sufixo: 'B', ano: 2026 });
  assert.deepEqual(id.idEtapaLer('021a/2026'), { numero: 21, sufixo: 'A', ano: 2026 });
  for (const fora of ['', null, '021-A', '2026.073', 'Sem ID', '021/26', '021-ABC/2026', '021/2026-A']) assert.equal(id.idEtapaLer(fora), null, String(fora));
  assert.equal(id.idEtapaMontar(21, 'a', 2026), '021-A/2026');
  assert.equal(id.idEtapaMontar(7, '', 2026), '007/2026');
});

test('normalização: só o ID complementar é ajustado; o resto fica como foi digitado', () => {
  assert.equal(id.idEtapaNormalizar('021a/2026'), '021-A/2026');
  assert.equal(id.idEtapaNormalizar(' 21 - b/2026 '), '021-B/2026');
  assert.equal(id.idEtapaNormalizar(' 21/2026 '), '21/2026');
  assert.equal(id.idEtapaNormalizar('2026.073'), '2026.073');
  assert.equal(id.idEtapaNormalizar(''), '');
  assert.equal(id.idEtapaOrigem('021-A/2026'), '021/2026');
  assert.equal(id.idEtapaOrigem('021/2026'), '');
});

test('ordem: a complementar fica logo depois da etapa de origem', () => {
  const ids = ['022/2026', '021-B/2026', '003/2027', '021/2026', 'fora do padrão', '021-A/2026', '100/2025'];
  const ordenados = ids.slice().sort((a, b) => id.idEtapaChaveOrdem(a) - id.idEtapaChaveOrdem(b));
  assert.deepEqual(ordenados, ['100/2025', '021/2026', '021-A/2026', '021-B/2026', '022/2026', '003/2027', 'fora do padrão']);
  assert.equal(id.idEtapaProximoSufixo([]), 'A');
  assert.equal(id.idEtapaProximoSufixo(['', 'A', 'b']), 'C');
  assert.equal(id.idEtapaProximoSufixo('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), 'AA');
});

// ----- formulário de etapa (fluxograma.js) -----
function fluxograma(rows) {
  const contexto = {
    console: { ...console, log: () => {} },
    document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
    window: {}, fetch: () => new Promise(() => {}), navItems: [],
    valor: (v, fb = '—') => (v === null || v === undefined || String(v).trim() === '' ? fb : v),
    esc: (s) => String(s), normStatus, tipoBaseEtapa,
    groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
    compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }),
    numeroCaso: (row) => String(row.casoRaiz || 'Caso'),
    dadosFluxograma: rows,
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('js/id-etapa.js', 'utf8'), contexto);
  vm.runInContext(fs.readFileSync('js/panels/fluxograma.js', 'utf8'), contexto);
  return contexto;
}
const linha = (banco, etapa, idEtapa, extra = {}) => ({ etapa_banco_id: banco, etapa, id: idEtapa, casoRaiz: '48', clube: 'Clube X', ...extra });

test('sugestão de ID vago: a complementar ocupa o número da sua origem', () => {
  const f = fluxograma([
    linha(1, 'Ofício de Intimação', `001/${ANO}`),
    linha(2, 'Ofício de Intimação', `002-A/${ANO}`), // sobrou só a complementar do 002
    linha(3, 'Acórdão - PSO', `003/${ANO}`),          // outro tipo: não interfere
  ]);
  assert.deepEqual(Array.from(f.idsUsadosEtapa('Ofício de Intimação')).sort(), [1, 2]);
  assert.equal(f.proximoIdEtapa('Ofício de Intimação'), `003/${ANO}`);
});

test('aviso de ID repetido oferece o ID da etapa complementar', () => {
  const rows = [
    linha(1, 'Ofício de Intimação', '021/2026'),
    linha(2, 'Ofício de Intimação - Diligência', '030/2026', { casoRaiz: '60' }),
    linha(3, 'Ofício de Intimação', '030-A/2026', { casoRaiz: '60' }),
    linha(4, 'Acórdão - PSO', '021/2026'),
  ];
  const f = fluxograma(rows);
  const s = f.complementarSugerida('Ofício de Intimação', '021/2026');
  assert.equal(s.idSugerido, '021-A/2026');
  assert.equal(s.existente.etapa_banco_id, 1);
  // Já existe a 030-A: a próxima complementar é a 030-B.
  assert.equal(f.complementarSugerida('Ofício de Intimação', '030/2026').idSugerido, '030-B/2026');
  assert.equal(f.complementarSugerida('Ofício de Intimação', '030-a/2026').idSugerido, '030-B/2026', 'a letra digitada já está em uso');
  // ID livre, ID de outro tipo de etapa e a própria etapa em edição: sem aviso.
  assert.equal(f.complementarSugerida('Ofício de Intimação', '021-A/2026'), null);
  assert.equal(f.complementarSugerida('Ofício de Intimação', '022/2026'), null);
  assert.equal(f.complementarSugerida('Despacho', '021/2026'), null);
  assert.equal(f.complementarSugerida('Ofício de Intimação', '021/2026', 1), null);
  assert.equal(f.complementarSugerida('Ofício de Intimação', 'texto livre'), null);
});

// ----- Controle de IDs (operacional.js) -----
function controleDeIds(rows) {
  const contexto = {
    console, document: { querySelector: () => null, querySelectorAll: () => [] }, navItems: [],
    normStatus, tipoBaseEtapa, esc: (s) => String(s),
    isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
    compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
    groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
    dadosFluxograma: rows,
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync('js/id-etapa.js', 'utf8'), contexto);
  vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);
  return contexto;
}

test('Controle de IDs: complementar não é ID repetido, aponta a origem e ordena ao lado dela', () => {
  const c = controleDeIds([
    linha(1, 'Ofício de Intimação', '021/2026'),
    linha(2, 'Ofício de Intimação', '021-A/2026'),
    linha(3, 'Ofício de Intimação', '022/2026'),
    linha(4, 'Ofício de Intimação', '022/2026', { casoRaiz: '60' }),
    linha(5, 'Ofício de Intimação', '040-A/2026'),
    linha(6, 'Despacho', '021-A/2026'),
  ]);
  const linhas = Array.from(c.idRows());
  const de = (banco) => linhas.find((x) => x.row.etapa_banco_id === banco);
  assert.equal(de(1).dup, false);
  assert.equal(de(2).dup, false, '021-A não repete o 021');
  assert.equal(de(2).obs, 'Complementar de 021/2026');
  assert.equal(de(3).dup, true);
  assert.equal(de(4).dup, true, 'o mesmo ID em duas etapas do tipo continua sendo inconsistência');
  assert.equal(de(5).obs, 'Complementar sem a etapa de origem 040/2026');
  assert.equal(de(5).semOrigem, true);
  assert.equal(de(6).semOrigem, true, 'a origem precisa ser do mesmo tipo de etapa');
  const ordenados = linhas.filter((x) => x.tipo === 'Ofício de Intimação').sort((a, b) => c.compararIds(a, b, 'id', 'asc')).map((x) => x.id);
  assert.deepEqual(ordenados, ['021/2026', '021-A/2026', '022/2026', '022/2026', '040-A/2026']);
});

// ----- duplicar caso (api/casos.js) -----
test('duplicar caso: a complementar acompanha o número novo da etapa de origem', async () => {
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'chave';
  const handler = require('../api/casos.js');
  let etapasNovas = [];
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url); const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    const r = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
    if (u.includes('/auth/v1/user')) return r(200, { id: 'u1' });
    if (opcoes.method === 'POST' && u.endsWith('/rest/v1/casos')) return r(201, [{ id: 900, ...corpo }]);
    if (opcoes.method === 'POST' && u.endsWith('/rest/v1/etapas')) { etapasNovas = corpo; return r(201, corpo.map((e, i) => ({ id: 1000 + i, ...e }))); }
    if (opcoes.method === 'POST' && u.endsWith('/rest/v1/tarefas')) return r(201, corpo);
    if (u.includes('casos?id=eq.5')) return r(200, [{ id: 5, numero_caso: 5, origem: 'DF', clube: 'Remo', periodo: '2026', serie: 'A', status_caso: 'Finalizado' }]);
    if (u.includes('casos?select=numero_caso')) return r(200, [{ numero_caso: 90 }]);
    if (u.includes('etapas?caso_id=eq.5')) return r(200, [
      { id: 1, nome_etapa: 'Ofício de Intimação', ordem: 1, id_etapa: '021-A/2026' }, // complementar antes da origem
      { id: 2, nome_etapa: 'Ofício de Intimação', ordem: 2, id_etapa: '021/2026' },
      { id: 3, nome_etapa: 'Ofício de Intimação', ordem: 3, id_etapa: '021-B/2026' },
      { id: 4, nome_etapa: 'Ofício de Intimação', ordem: 4, id_etapa: '025/2026' },
      { id: 5, nome_etapa: 'Parecer Técnico', ordem: 5, id_etapa: '2026.073' },
    ]);
    // No sistema já existem os ofícios 001, 002 e a complementar 003-A.
    if (u.includes('etapas?select=nome_etapa,id_etapa')) return r(200, [
      { nome_etapa: 'Ofício de Intimação', id_etapa: '001/2026' }, { nome_etapa: 'Ofício de Intimação', id_etapa: '002/2026' },
      { nome_etapa: 'Ofício de Intimação', id_etapa: '003-A/2026' }, { nome_etapa: 'Ofício de Intimação', id_etapa: '021/2026' },
      { nome_etapa: 'Ofício de Intimação', id_etapa: '021-A/2026' }, { nome_etapa: 'Ofício de Intimação', id_etapa: '021-B/2026' },
      { nome_etapa: 'Ofício de Intimação', id_etapa: '025/2026' },
    ]);
    if (u.includes('tarefas?etapa_id=in.')) return r(200, []);
    return r(404, null);
  };
  const res = { statusCode: 0, corpo: '', setHeader() {}, end(t) { this.corpo = t; } };
  await handler({ method: 'POST', body: { acao: 'duplicar', id: 5 }, headers: { authorization: 'Bearer t' } }, res);
  assert.ok(res.statusCode < 300, res.corpo);
  // 003 está ocupado pela complementar 003-A; os próximos vagos são 004 e 005.
  assert.deepEqual(etapasNovas.map((e) => e.id_etapa), ['004-A/2026', '004/2026', '004-B/2026', '005/2026', '2026.073']);
});

test('a leitura do ID no servidor é a mesma do navegador', () => {
  const fonte = fs.readFileSync('api/casos.js', 'utf8');
  const corpo = fonte.slice(fonte.indexOf('function lerIdEtapaServer'), fonte.indexOf('\n}\n', fonte.indexOf('function lerIdEtapaServer')) + 2);
  const lerServer = vm.runInNewContext(`(${corpo})`);
  for (const t of ['021/2026', '021-A/2026', '21 – b/2026', '021a/2026', '021-A', '2026.073', '', null, '021-ABC/2026']) {
    assert.deepEqual(JSON.parse(JSON.stringify(lerServer(t))), id.idEtapaLer(t), String(t));
  }
});
