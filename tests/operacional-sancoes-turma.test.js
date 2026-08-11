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

test('aceita todas as turmas quando o filtro está em todas', () => {
  assert.equal(contexto.sancoesTurmaAceita({ turma: 'Turma 01' }, 'todos'), true);
});

test('aceita somente a turma julgadora selecionada', () => {
  assert.equal(contexto.sancoesTurmaAceita({ turma: 'Turma 02' }, 'Turma 02'), true);
  assert.equal(contexto.sancoesTurmaAceita({ turma: 'Turma 01' }, 'Turma 02'), false);
});

test('permite filtrar processos sem turma informada', () => {
  assert.equal(contexto.sancoesTurmaAceita({ turma: 'Sem turma' }, 'Sem turma'), true);
});
