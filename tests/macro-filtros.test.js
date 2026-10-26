const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Filtros combináveis do painel Processos: OR dentro do campo, AND entre campos.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  esc: (v) => String(v ?? ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  navItems: [],
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'),
  valor: (v, fb = '—') => v || fb,
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/macro.js', 'utf8'), contexto);
const c = contexto;
const ms = (d) => { const [dd, mm, aa] = d.split('/'); return Date.UTC(+aa, +mm - 1, +dd); };
const caso = (n, extra = {}) => ({ caso: String(n), titulo: `Caso ${n}`, clube: 'Grêmio', serie: 'A', origem: 'Solvência', periodo: '2026/06/30', status: 'Em andamento', etapaAtual: 'Defesa', pendencia: 'Clube', sancao: '—', dias: 10, finalizado: false, dataInicialSort: ms('10/06/2026'), busca: `caso ${n} grêmio`, proximoPrazoSort: 1, ...extra });
const casos = [
  caso(1),
  caso(2, { clube: 'Náutico', serie: 'B', origem: 'Denúncia', periodo: '2026', pendencia: 'ANRESF', etapaAtual: 'Parecer Técnico Conclusivo', dias: -3, dataInicialSort: ms('01/08/2026') }),
  caso(3, { clube: 'Vasco', status: 'Finalizado', finalizado: true, sancao: 'Advertência', dias: null, etapaAtual: 'Acórdão - PSO', pendencia: 'Sem pendência', dataInicialSort: ms('15/03/2026') }),
  caso(4, { clube: 'Grêmio', origem: 'DF', periodo: '2025', dias: null, dataInicialSort: 0 }),
];
const ids = (lista) => Array.from(lista).map((x) => x.caso);
// macroFiltros/macroFiltro/macroBusca são `let` do script: só dá para mexer por runInContext.
const definir = (f = {}, rapido = 'todos', busca = '') => vm.runInContext(`macroFiltros = Object.assign(macroFiltrosPadrao(), ${JSON.stringify(f)}); macroFiltro = ${JSON.stringify(rapido)}; macroBusca = ${JSON.stringify(busca)};`, contexto);
const filtrar = (f) => { definir(f); return ids(c.macroCasosFiltrados(casos)); };

test('sem filtro, todos os casos', () => { assert.deepEqual(filtrar({}), ['1', '2', '3', '4']); });

test('OR dentro do campo, AND entre campos', () => {
  assert.deepEqual(filtrar({ clubes: ['Grêmio', 'Vasco'] }), ['1', '3', '4']);
  assert.deepEqual(filtrar({ clubes: ['Grêmio'], origens: ['DF'] }), ['4']);
  assert.deepEqual(filtrar({ series: ['B'] }), ['2']);
  assert.deepEqual(filtrar({ periodos: ['2026/06/30', '2025'] }), ['1', '3', '4']);
  assert.deepEqual(filtrar({ status: ['Finalizado'] }), ['3']);
  assert.deepEqual(filtrar({ etapas: ['Defesa'] }), ['1', '4']);
  assert.deepEqual(filtrar({ pendencias: ['ANRESF', 'Sem pendência'] }), ['2', '3']);
});

test('sanção, prazo e data de início', () => {
  assert.deepEqual(filtrar({ sancao: 'com' }), ['3']);
  assert.deepEqual(filtrar({ sancao: 'sem' }), ['1', '2', '4']);
  assert.deepEqual(filtrar({ prazo: 'vencido' }), ['2']);
  assert.deepEqual(filtrar({ prazo: '30' }), ['1']);
  assert.deepEqual(filtrar({ prazo: 'sem' }), ['4'], 'finalizado sem prazo não conta');
  assert.deepEqual(filtrar({ inicioDe: '2026-06-01' }), ['1', '2'], 'sem data de início fica de fora');
  assert.deepEqual(filtrar({ inicioAte: '2026-06-30' }), ['1', '3']);
  assert.deepEqual(filtrar({ inicioDe: '2026-06-01', inicioAte: '2026-06-30' }), ['1']);
});

test('filtro rápido dos KPIs e busca se combinam com os demais', () => {
  definir({ clubes: ['Grêmio'] }, 'vencido');
  assert.deepEqual(ids(c.macroCasosFiltrados(casos)), []);
  definir({ clubes: ['Grêmio'] }, 'todos', 'caso 4');
  assert.deepEqual(ids(c.macroCasosFiltrados(casos)), ['4']);
});

test('chips, remoção de um filtro e "tem filtro ativo"', () => {
  definir();
  assert.equal(c.macroTemFiltroAtivo(), false);
  definir({ clubes: ['Grêmio', 'Vasco'], sancao: 'com', prazo: '7', inicioDe: '2026-06-01' });
  const chips = Array.from(c.macroChipsFiltros()).map((x) => x.rotulo);
  assert.deepEqual(chips, ['Clube: Grêmio', 'Clube: Vasco', 'Sanção: Com sanção', 'Prazo: Até 7 dias', 'Início a partir de 01/06/2026']);
  assert.equal(c.macroTemFiltroAtivo(), true);
  c.macroRemoverFiltro('clubes', 'Vasco'); c.macroRemoverFiltro('sancao', 'com'); c.macroRemoverFiltro('prazo', '7'); c.macroRemoverFiltro('inicioDe', '');
  assert.deepEqual(Array.from(c.macroChipsFiltros()).map((x) => x.rotulo), ['Clube: Grêmio']);
  const html = c.renderMacroFiltros(casos);
  assert.match(html, /data-macro-multi="clubes"/);
  assert.match(html, /<input type="checkbox" value="Grêmio" checked>/);
  assert.match(html, /<em>2<\/em>/, 'opção mostra a contagem');
  assert.match(html, /data-macro-chip="clubes" data-macro-chip-valor="Grêmio"/);
  definir();
});
