const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Painel Processos: a coluna Clube de um caso de Denúncia mostra as partes.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
  navItems: [],
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  valor: (v, fb = '—') => (v === null || v === undefined || String(v).trim() === '' ? fb : v),
  groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
  stageSort: (a, b) => Number(a.ordem || 0) - Number(b.ordem || 0),
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/macro.js', 'utf8'), contexto);

const etapa = (caso, extra = {}) => ({
  casoRaiz: String(caso), etapa: 'Auto de Infração - PSO', dataEnvio: '01/06/2026', statusEtapa: 'Pendente Clube',
  statusCaso: 'Em andamento', clube: `Clube ${caso}`, origem: 'Solvência', serie: 'A', ordem: 1, ...extra,
});
const casoPorNumero = (n) => contexto.macroComputeCaseMetrics().find((c) => c.caso === String(n));

test('caso de Denúncia mostra "Denunciante x Clube" na coluna Clube', () => {
  contexto.dadosFluxograma = [
    etapa(53, { clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Heber' }),
    etapa(53, { clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Heber', etapa: 'Defesa', ordem: 2 }),
    etapa(56, { clube: 'Grêmio' }),
  ];
  assert.equal(casoPorNumero(53).clube, 'Atleta Heber x América MG');
  assert.equal(casoPorNumero(56).clube, 'Grêmio', 'demais origens seguem só com o clube');
});

test('a busca encontra tanto pelo denunciante quanto pelo clube', () => {
  contexto.dadosFluxograma = [etapa(53, { clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Heber' })];
  const c = casoPorNumero(53);
  assert.ok(c.busca.includes('atleta heber'));
  assert.ok(c.busca.includes('américa mg'));
});

test('denúncia sem denunciante cadastrado cai para o clube; denunciante fora de denúncia é ignorado', () => {
  contexto.dadosFluxograma = [
    etapa(60, { clube: 'Corinthians', origem: 'Denúncia', denunciante: '' }),
    etapa(61, { clube: 'Botafogo', origem: 'Solvência', denunciante: 'Alguém' }),
  ];
  assert.equal(casoPorNumero(60).clube, 'Corinthians');
  assert.equal(casoPorNumero(61).clube, 'Botafogo');
});

test('com a regra do Fluxograma carregada, é ela quem decide', () => {
  contexto.parteCasoFluxograma = (r) => `[${r.denunciante} x ${r.clube}]`;
  try {
    contexto.dadosFluxograma = [etapa(53, { clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Heber' })];
    assert.equal(casoPorNumero(53).clube, '[Atleta Heber x América MG]');
  } finally {
    delete contexto.parteCasoFluxograma;
  }
});
