const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// fluxograma.js registra um ouvinte de teclado e dispara o carregamento de
// dados ao carregar; aqui o DOM é um stub e o fetch nunca resolve. Só as
// funções de rótulo/título são exercitadas.
const contexto = {
  console: { ...console, log: () => {} },
  document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  fetch: () => new Promise(() => {}),
  navItems: [],
  valor: (v, fb = '—') => (v === null || v === undefined || String(v).trim() === '' ? fb : v),
  esc: (s) => String(s),
  groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
  normStatus: (s) => String(s || '').toLowerCase(),
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }),
  numeroCaso: (row) => String(row.casoRaiz || row.numero_caso || 'Caso'),
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/fluxograma.js', 'utf8'), contexto);

const { parteCasoFluxograma, labelCasoFluxograma, labelCaso } = contexto;

const denuncia = { casoRaiz: '53', clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Heber', periodo: '2026', serie: 'B' };
const solvencia = { casoRaiz: '56', clube: 'Grêmio', origem: 'Solvência 2026/06/30', denunciante: null, periodo: '2026/06/30' };

test('caso de Denúncia é identificado como "Denunciante x Clube"', () => {
  assert.equal(parteCasoFluxograma(denuncia), 'Atleta Heber x América MG');
  assert.equal(parteCasoFluxograma({ ...denuncia, origem: 'denuncia' }), 'Atleta Heber x América MG', 'origem sem acento/maiúscula');
});

test('demais origens continuam mostrando só o clube', () => {
  assert.equal(parteCasoFluxograma(solvencia), 'Grêmio');
  // Denunciante preenchido por engano num caso que não é denúncia não aparece.
  assert.equal(parteCasoFluxograma({ ...solvencia, denunciante: 'Alguém' }), 'Grêmio');
});

test('denúncia sem denunciante cadastrado cai para o clube', () => {
  assert.equal(parteCasoFluxograma({ ...denuncia, denunciante: '' }), 'América MG');
  assert.equal(parteCasoFluxograma({ ...denuncia, denunciante: '   ' }), 'América MG');
  assert.equal(parteCasoFluxograma({ ...denuncia, denunciante: undefined }), 'América MG');
});

test('seletor de casos do Fluxograma usa as partes no lugar do clube', () => {
  assert.equal(labelCasoFluxograma('53', [denuncia]), 'Caso 53 · Atleta Heber x América MG · Denúncia · 2026');
  assert.equal(labelCasoFluxograma('56', [solvencia]), 'Caso 56 · Grêmio · Solvência 2026/06/30 · 2026/06/30');
});

test('seletor de caso do modal de etapa (dados de /api/casos) segue a mesma regra', () => {
  assert.equal(labelCaso({ id: 9, numero_caso: 53, clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Heber', periodo: '2026' }),
    'Caso 53 · Atleta Heber x América MG · Denúncia · 2026');
  assert.equal(labelCaso({ id: 1, numero_caso: 56, clube: 'Grêmio', origem: 'Solvência' }), 'Caso 56 · Grêmio · Solvência');
});
