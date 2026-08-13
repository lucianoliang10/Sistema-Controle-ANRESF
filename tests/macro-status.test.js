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
  esc: (value) => String(value ?? ''),
  isFinalizada: (row) => normStatus(row.statusEtapa) === 'finalizado',
  navItems: [],
  normStatus,
  valor: (value, fallback = '—') => value || fallback,
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

test('não exibe sanção em caso que ainda está em andamento', () => {
  const sancao = contexto.macroSancao([
    { etapa: 'Acórdão - PSS', sancao: 'Advertência' },
  ], 'Em andamento');

  assert.equal(sancao, '—');
});

test('exibe sanção decidida quando o caso está finalizado', () => {
  const sancao = contexto.macroSancao([
    { etapa: 'Acórdão - PSS', sancao: 'Advertência' },
  ], 'Finalizado');

  assert.equal(sancao, 'Advertência');
});

test('usa a observação geral do caso e não a observação de uma etapa', () => {
  const observacao = contexto.macroObservacaoCaso([
    { observacaoCaso: 'Acompanhar julgamento', observacao: 'Observação da etapa' },
  ]);

  assert.equal(observacao, 'Acompanhar julgamento');
});

test('exibe marcador quando o caso não possui observação', () => {
  assert.equal(contexto.macroObservacaoCaso([{ observacao: 'Observação da etapa' }]), '—');
});

test('identifica o painel como Processos', () => {
  const hero = contexto.renderMacroHero();

  assert.match(hero, />Processos</);
  assert.match(hero, />Visão dos processos</);
});

test('omite as colunas de prazo da tabela de casos consolidados', () => {
  const caso = {
    caso: '1', titulo: 'Caso 1', clube: 'Clube', serie: 'A', origem: 'PSS',
    status: 'Em andamento', etapaAtual: 'Defesa', pendencia: 'Clube',
    dataInicial: '01/01/2026', proximoPrazo: '10/01/2026', dias: 9,
    sancao: '—', observacaoCaso: '—', finalizado: false,
  };
  const tabela = contexto.renderMacroTable([caso], [caso]);

  assert.doesNotMatch(tabela, /Data inicial/);
  assert.doesNotMatch(tabela, /Próximo prazo/);
  assert.doesNotMatch(tabela, /data-macro-sort="dias"/);
  assert.doesNotMatch(tabela, /01\/01\/2026|10\/01\/2026/);
});
