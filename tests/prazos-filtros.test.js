const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Globais que prazos.js espera do script.js e de outros painéis; aqui só o
// mínimo para carregar o arquivo e exercitar a regra pura de filtros.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  valor: (v, fb = '—') => (v === null || v === undefined || v === '' ? fb : v),
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  dadosTarefas: [],
  dadosFluxograma: [],
};

vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/prazos.js', 'utf8'), contexto);
// `const` declaradas no arquivo não viram propriedades do contexto; lê-las por expressão.
const g = (expressao) => vm.runInContext(expressao, contexto);

function registro(extra = {}) {
  return {
    grupoPrazo: 'upcoming', diasPrazo: 5, responsavelPrazo: 'Ana', clubePrazo: 'Remo',
    origemPrazo: 'DF 2026', seriePrazo: 'A', etapaBasePrazo: 'Acórdão - PSO',
    tipoPrazo: 'Tarefa', processoPrazo: 'PSO', minhaPrazo: false,
    ...extra,
  };
}
const filtros = (extra = {}) => ({
  situacoes: [], responsaveis: [], clubes: [], origens: [], series: [], etapas: [],
  tipos: [], processos: [], janela: 'todas', somenteMinhas: false, ...extra,
});

test('sem filtro aceita tudo', () => {
  assert.equal(contexto.prazosFiltrosAceitam(registro(), filtros()), true);
  assert.equal(contexto.prazosFiltrosVazios(filtros()), true);
});

test('dentro de um campo é OU: mais de uma origem selecionada', () => {
  const f = filtros({ origens: ['DF 2026', 'Solvência 2026/06/30'] });
  assert.equal(contexto.prazosFiltrosAceitam(registro({ origemPrazo: 'Solvência 2026/06/30' }), f), true);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ origemPrazo: 'Monitoramento 2026' }), f), false);
});

test('entre campos é E: clube certo com série errada não passa', () => {
  const f = filtros({ clubes: ['Remo'], series: ['B'] });
  assert.equal(contexto.prazosFiltrosAceitam(registro({ seriePrazo: 'A' }), f), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ seriePrazo: 'B' }), f), true);
});

test('filtra por situação (grupo), tipo, etapa e processo', () => {
  assert.equal(contexto.prazosFiltrosAceitam(registro({ grupoPrazo: 'overdue' }), filtros({ situacoes: ['overdue', 'today'] })), true);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ grupoPrazo: 'upcoming' }), filtros({ situacoes: ['overdue', 'today'] })), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ tipoPrazo: 'Etapa' }), filtros({ tipos: ['Tarefa'] })), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ etapaBasePrazo: 'Despacho do Relator' }), filtros({ etapas: ['Acórdão - PSO'] })), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ processoPrazo: 'PSS' }), filtros({ processos: ['PSO'] })), false);
});

test('janela de prazo: próximos N dias inclui hoje e exclui vencidas e sem prazo', () => {
  const f = filtros({ janela: 'prox7' });
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: 0 }), f), true);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: 7 }), f), true);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: 8 }), f), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: -1 }), f), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ grupoPrazo: 'no-date', diasPrazo: null }), f), false);
});

test('janela de prazo: vencidas há mais de 30 dias', () => {
  const f = filtros({ janela: 'atraso30' });
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: -31 }), f), true);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: -30 }), f), false);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ diasPrazo: 3 }), f), false);
});

test('"só as minhas" mantém apenas registros do usuário', () => {
  const f = filtros({ somenteMinhas: true });
  assert.equal(contexto.prazosFiltrosAceitam(registro({ minhaPrazo: true }), f), true);
  assert.equal(contexto.prazosFiltrosAceitam(registro({ minhaPrazo: false }), f), false);
});

test('processo é lido do nome da etapa', () => {
  assert.equal(contexto.prazoProcesso('Acórdão - PSO'), 'PSO');
  assert.equal(contexto.prazoProcesso('Auto de Infração - PSS'), 'PSS');
  assert.equal(contexto.prazoProcesso('Acompanhamento'), 'Sem PSS/PSO');
});

test('ordenação igual ao Início: mais urgente primeiro, sem prazo por último', () => {
  const a = { diasPrazo: 3, id: 1 };
  const b = { diasPrazo: -10, id: 2 };
  const c = { diasPrazo: null, id: 3 };
  const d = { diasPrazo: 0, id: 4 };
  const ordenado = [a, b, c, d].sort(contexto.compararPrazos).map((r) => r.id);
  assert.deepEqual(ordenado, [2, 4, 1, 3]);
});

test('agrupamento segue a ordem Vencidas, Vencem hoje, À vencer, Sem prazo', () => {
  // Array.from traz os arrays do realm do vm para o realm do teste (deepEqual
  // estrito compara protótipos).
  assert.deepEqual(Array.from(g('PRAZO_GROUPS'), (grupo) => grupo.key), ['overdue', 'today', 'upcoming', 'no-date']);
  const grupos = contexto.agruparPrazos([
    registro({ grupoPrazo: 'upcoming', diasPrazo: 9, id: 1 }),
    registro({ grupoPrazo: 'overdue', diasPrazo: -2, id: 2 }),
    registro({ grupoPrazo: 'upcoming', diasPrazo: 1, id: 3 }),
  ]);
  assert.deepEqual(Array.from(grupos.get('upcoming'), (r) => r.id), [3, 1]);
  assert.deepEqual(Array.from(grupos.get('overdue'), (r) => r.id), [2]);
  assert.equal(grupos.get('today').length, 0);
});

test('limpar filtros zera tudo', () => {
  const estado = g('prazosFiltros');
  estado.clubes = ['Remo'];
  estado.janela = 'prox7';
  estado.somenteMinhas = true;
  contexto.limparFiltrosPrazos();
  assert.equal(contexto.prazosFiltrosVazios(estado), true);
});
