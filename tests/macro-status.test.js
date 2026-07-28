const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function normStatus(status) {
  return String(status || '').trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  isFinalizada: (row) => normStatus(row.statusEtapa) === 'finalizado',
  navItems: [],
  normStatus,
};

vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/macro.js', 'utf8'), contexto);

test('mantém em andamento quando existe etapa aberta, mesmo com status do caso finalizado', () => {
  const status = contexto.macroStatusCaso([
    { statusCaso: 'Finalizado', statusEtapa: 'Finalizado' },
    { statusCaso: 'Finalizado', statusEtapa: 'Pendente ANRESF' },
  ]);

  assert.equal(status, 'Em andamento');
});

test('mantém em andamento quando o caso está aberto, mesmo com todas as etapas finalizadas', () => {
  const status = contexto.macroStatusCaso([
    { statusCaso: 'Em andamento', statusEtapa: 'Finalizado' },
    { statusCaso: 'Em andamento', statusEtapa: 'Finalizado' },
  ]);

  assert.equal(status, 'Em andamento');
});

test('finaliza somente quando todas as etapas estão finalizadas', () => {
  const status = contexto.macroStatusCaso([
    { statusCaso: 'Finalizado', statusEtapa: 'Finalizado' },
    { statusCaso: 'Finalizado', statusEtapa: 'Finalizado' },
  ]);

  assert.equal(status, 'Finalizado');
});

test('mantém retorno específico para lista sem etapas', () => {
  assert.equal(contexto.macroStatusCaso([]), 'Sem status');
});
