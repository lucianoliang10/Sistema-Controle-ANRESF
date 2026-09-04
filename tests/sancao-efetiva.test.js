const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Arquivamento e "Sem sanção" são desfechos SEM sanção: a Turma decidiu e não
// puniu. Estes testes travam essa classificação, que alimenta o "Desfecho dos
// processos" do Panorama e os KPIs das Sanções.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);
vm.runInContext(fs.readFileSync('js/panels/panorama.js', 'utf8'), contexto);

const etapa = (caso, nome, sancao, extra = {}) => ({
  casoRaiz: String(caso), etapa: nome, sancao, statusEtapa: 'Finalizado',
  dataEnvio: '10/07/2026', clube: `Clube ${caso}`, origem: 'Solvência', serie: 'A', turma: 'Turma 02', ...extra,
});
const caso = (n, sancaoAcordao, extra = {}) => ({
  caso: String(n), clube: `Clube ${n}`, origem: 'Solvência', serie: 'A',
  rows: [
    etapa(n, 'Auto de Infração - PSO', 'Advertência'),
    etapa(n, 'Acórdão - PSO', sancaoAcordao, extra),
  ],
});
const situacaoDe = (n, sancaoAcordao, extra) => contexto.processosSancionadoresDoCaso(caso(n, sancaoAcordao, extra))[0].situacaoLabel;

test('ehSancaoEfetiva separa punição de desfecho sem punição', () => {
  assert.equal(contexto.ehSancaoEfetiva('Advertência'), true);
  assert.equal(contexto.ehSancaoEfetiva('Multa 40k'), true);
  assert.equal(contexto.ehSancaoEfetiva('Arquivado'), false);
  assert.equal(contexto.ehSancaoEfetiva('Arquivamento'), false);
  assert.equal(contexto.ehSancaoEfetiva('Arquivamento do processo'), false);
  assert.equal(contexto.ehSancaoEfetiva('Sem sanção'), false);
  assert.equal(contexto.ehSancaoEfetiva(''), false);
});

test('acórdão que arquiva conta como "Decidido sem sanção"', () => {
  assert.equal(situacaoDe(17, 'Arquivado'), 'Decidido sem sanção');
  assert.equal(situacaoDe(24, 'Arquivamento'), 'Decidido sem sanção');
  assert.equal(situacaoDe(14, 'Sem sanção'), 'Decidido sem sanção');
  assert.equal(situacaoDe(99, ''), 'Decidido sem sanção');
});

test('acórdão que pune continua como "Sanção aplicada"', () => {
  assert.equal(situacaoDe(23, 'Advertência'), 'Sanção aplicada');
  assert.equal(situacaoDe(7, 'Advertência + Multa 40k'), 'Sanção aplicada');
});

test('texto misto: sobra só a parte que pune', () => {
  assert.equal(situacaoDe(50, 'Advertência + Arquivamento parcial'), 'Sanção aplicada');
  assert.deepEqual(Array.from(contexto.sancPartesEfetivas('Advertência + Arquivamento parcial')), ['Advertência']);
});

test('acórdão ainda pendente não vira desfecho sem sanção', () => {
  assert.equal(situacaoDe(60, 'Arquivado', { statusEtapa: 'Pendente ANRESF' }), 'Aguardando decisão');
});

test('Panorama: arquivados saem de "Sanções aplicadas" e entram no desfecho sem sanção', () => {
  const rows = [
    ...caso(17, 'Arquivado').rows,
    ...caso(23, 'Advertência').rows,
    ...caso(24, 'Arquivamento').rows,
  ];
  const r = contexto.panResumo(rows, '2026-08');
  assert.equal(r.sancoesAplicadas, 1, 'só o caso 23 pune');
  assert.deepEqual(Object.fromEntries(r.desfechos), { 'Decidido sem sanção': 2, 'Sanção aplicada': 1 });
  assert.deepEqual(Object.fromEntries(r.sancoesPorTipo), { Advertência: 1 }, 'Arquivado não é tipo de sanção');
});
