const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
};

vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);

function registro({ clube = 'Botafogo', tipo = 'Parecer Técnico', dup = false, semId = false } = {}) {
  return { tipo, dup, semId, row: { clube } };
}

test('aceita mais de um clube selecionado', () => {
  const filtros = { clubes: ['Botafogo', 'Flamengo'], tipos: [], situacoes: [] };
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ clube: 'Flamengo' }), filtros), true);
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ clube: 'Palmeiras' }), filtros), false);
});

test('aceita mais de uma etapa selecionada', () => {
  const filtros = { clubes: [], tipos: ['Parecer Técnico', 'Acórdão'], situacoes: [] };
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ tipo: 'Acórdão' }), filtros), true);
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ tipo: 'Denúncia' }), filtros), false);
});

test('combina campos diferentes com E e opções do mesmo campo com OU', () => {
  const filtros = { clubes: ['Botafogo'], tipos: ['Parecer Técnico', 'Acórdão'], situacoes: ['com-id'] };
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ clube: 'Botafogo', tipo: 'Acórdão' }), filtros), true);
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ clube: 'Flamengo', tipo: 'Acórdão' }), filtros), false);
});

test('aceita mais de uma situação selecionada', () => {
  const filtros = { clubes: [], tipos: [], situacoes: ['inconsistencias', 'sem-id'] };
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ dup: true }), filtros), true);
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro({ semId: true }), filtros), true);
  assert.equal(contexto.idsFiltrosMultiplosAceitam(registro(), filtros), false);
});
