const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Só a lógica de seleção/filtro; a parte de interface depende de DOM.
// tipoBaseEtapa/normStatus são os de script.js, reproduzidos aqui.
const contexto = {
  console,
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  esc: (s) => String(s),
};
contexto.tipoBaseEtapa = (nome) => contexto.normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]);
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/sugestoes-etapa.js', 'utf8'), contexto);
const { sugestoesPorEtapa, filtrarSugestoes, sugestoesRotuloTipo } = contexto;

const rows = [
  { etapa: 'Parecer Técnico Conclusivo', objeto: 'Análise das demonstrações', sancao: 'Recomenda multa' },
  { etapa: 'Parecer Técnico Conclusivo', objeto: 'Análise das demonstrações', sancao: '' },
  { etapa: 'Parecer Técnico Conclusivo', objeto: 'Análise da folha', sancao: null },
  { etapa: 'Acórdão - PSS', objeto: 'Julgamento do auto', sancao: 'Advertência' },
  { etapa: 'Acórdão - PSO', objeto: 'Julgamento do auto', sancao: 'Advertência + Multa' },
  { etapa: 'Acórdão - PSO', objeto: 'Julgamento de recurso', sancao: 'Advertência' },
  { etapa: 'Auto de Infração - PSO', objeto: 'Lavratura', sancao: 'Multa 40k' },
  { etapa: 'Acórdão - PSO', objeto: '  ', sancao: '   ' },
];

test('parecer só sugere textos de outros pareceres, os mais usados primeiro', () => {
  assert.deepEqual(Array.from(sugestoesPorEtapa(rows, 'Parecer Técnico Conclusivo', 'objeto')),
    ['Análise das demonstrações', 'Análise da folha']);
  assert.deepEqual(Array.from(sugestoesPorEtapa(rows, 'Parecer Técnico Conclusivo', 'sancao')), ['Recomenda multa']);
});

test('acórdão PSS e PSO compartilham sugestões (mesmo tipo-base), auto fica de fora', () => {
  assert.deepEqual(Array.from(sugestoesPorEtapa(rows, 'Acórdão - PSO', 'sancao')), ['Advertência', 'Advertência + Multa']);
  assert.deepEqual(Array.from(sugestoesPorEtapa(rows, 'Acórdão - PSS', 'objeto')), ['Julgamento do auto', 'Julgamento de recurso']);
  assert.equal(sugestoesPorEtapa(rows, 'Acórdão - PSO', 'sancao').includes('Multa 40k'), false);
});

test('nome da etapa sem acento/caixa casa com o histórico; vazio devolve tudo', () => {
  assert.deepEqual(Array.from(sugestoesPorEtapa(rows, 'acordao - pss', 'sancao')), ['Advertência', 'Advertência + Multa']);
  assert.equal(sugestoesPorEtapa(rows, '', 'objeto').length, 5);
  assert.equal(sugestoesPorEtapa(rows, '   ', 'sancao').length, 4);
});

test('etapa inédita não tem sugestões; valores em branco nunca entram', () => {
  assert.deepEqual(Array.from(sugestoesPorEtapa(rows, 'Diligência', 'objeto')), []);
  assert.equal(sugestoesPorEtapa(rows, 'Acórdão - PSO', 'objeto').some((t) => !t.trim()), false);
  assert.deepEqual(Array.from(sugestoesPorEtapa(undefined, 'Acórdão', 'objeto')), []);
});

test('filtro pelo digitado ignora acento e caixa e não repete o texto idêntico', () => {
  const lista = ['Advertência', 'Advertência + Multa', 'Arquivado'];
  assert.deepEqual(Array.from(filtrarSugestoes(lista, 'advert')), ['Advertência', 'Advertência + Multa']);
  assert.deepEqual(Array.from(filtrarSugestoes(lista, 'ADVERTENCIA')), ['Advertência + Multa']);
  assert.deepEqual(Array.from(filtrarSugestoes(lista, '')), lista);
  assert.deepEqual(Array.from(filtrarSugestoes(lista, 'xyz')), []);
});

test('rótulo do cabeçalho é o tipo da etapa (antes do " - ")', () => {
  assert.equal(sugestoesRotuloTipo('Acórdão - PSO'), 'Acórdão');
  assert.equal(sugestoesRotuloTipo('Parecer Técnico Conclusivo'), 'Parecer Técnico Conclusivo');
  assert.equal(sugestoesRotuloTipo(''), '');
});
