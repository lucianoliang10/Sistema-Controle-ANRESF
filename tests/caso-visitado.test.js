const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

// Marca "último aberto": o item em que a pessoa clicou para abrir o fluxograma
// de um caso. A parte de tela é conferida no navegador; aqui ficam as regras
// de como o item é reencontrado depois que o painel é remontado.
const { visitadoSeletor, visitadoLocalizar } = require('../js/caso-visitado.js');

test('seletor do item: atributo do caso, com aspas e barras protegidas', () => {
  assert.equal(visitadoSeletor({ base: '', atributo: 'data-caso', valor: '31' }), '[data-caso="31"]');
  assert.equal(visitadoSeletor({ base: '.inicio-card', atributo: 'data-numero', valor: '34' }), '.inicio-card[data-numero="34"]');
  assert.equal(visitadoSeletor({ base: '', atributo: 'data-caso', valor: 'Caso "A"\\B' }), '[data-caso="Caso \\"A\\"\\\\B"]');
});

test('entre os itens do mesmo caso, vale o da posição clicada; se a lista encolheu, o primeiro', () => {
  assert.equal(visitadoLocalizar(['pss', 'pso'], 1), 'pso');
  assert.equal(visitadoLocalizar(['pss', 'pso'], 0), 'pss');
  assert.equal(visitadoLocalizar(['pss'], 1), 'pss');
  assert.equal(visitadoLocalizar([], 0), null);
});

test('o script é carregado pela página e o estilo da marca existe', () => {
  assert.match(fs.readFileSync('index.html', 'utf8'), /<script src="js\/caso-visitado\.js\?v=/);
  const css = fs.readFileSync('style.css', 'utf8');
  assert.match(css, /tr\.caso-visitado>td/);
  assert.match(css, /último aberto/);
  assert.match(css, /@media print\{tr\.caso-visitado/, 'a marca não sai na impressão');
});
