const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// panorama.js reaproveita regras de operacional.js (ehAutoInfracao, ehAcordao,
// processosSancionadoresDoCaso, sancPartes); carrega os dois no mesmo contexto.
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

const etapa = (caso, nome, data, extra = {}) => ({
  casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado',
  clube: `Clube ${caso}`, origem: 'Solvência 2026/06/30', serie: 'A', sancao: null, turma: null,
  etapa_banco_id: `${caso}-${nome}`, ...extra,
});

// Dois casos completos em junho/julho, um auto em setembro (fora do corte de agosto)
// e uma etapa sem data. O caso 8 é arquivado: desfecho SEM sanção (ver
// tests/sancao-efetiva.test.js), então não conta em "Sanções aplicadas".
const rows = [
  etapa(7, 'Auto de Infração - PSS', '15/06/2026', { sancao: 'Advertência + Multa 40k' }),
  etapa(7, 'Acórdão - PSS', '05/07/2026', { sancao: 'Advertência', turma: 'Turma 01' }),
  etapa(8, 'Auto de Infração - PSO', '02/07/2026', { sancao: 'Advertência', serie: 'B' }),
  etapa(8, 'Acórdão - PSO', '21/08/2026', { sancao: 'Arquivado', turma: 'Turma 02', serie: 'B' }),
  etapa(9, 'Auto de Infração - PSO', '10/09/2026', { sancao: 'Advertência' }),
  etapa(9, 'Acórdão - PSO', '02/10/2026', { statusEtapa: 'Pendente ANRESF' }),
  etapa(7, 'Acompanhamento', '', { statusEtapa: 'Finalizado' }),
];

test('corte temporal: sem data entra; com data, só até o fim do mês', () => {
  assert.equal(contexto.panDentroDoCorte({ dataEnvio: '31/08/2026' }, '2026-08'), true);
  assert.equal(contexto.panDentroDoCorte({ dataEnvio: '01/09/2026' }, '2026-08'), false);
  assert.equal(contexto.panDentroDoCorte({ dataEnvio: '' }, '2026-08'), true);
  assert.equal(contexto.panDentroDoCorte({ dataEnvio: '01/09/2026' }, ''), true, 'corte inválido = sem corte');
});

test('chave e rótulo de mês', () => {
  assert.equal(contexto.panMesChave('05/07/2026'), '2026-07');
  assert.equal(contexto.panMesChave('2026-08-21'), '2026-08');
  assert.equal(contexto.panMesChave(''), '');
  assert.equal(contexto.panMesLabel('2026-08'), 'ago/2026');
});

test('resumo até agosto: conta o que aconteceu até lá e deixa setembro de fora', () => {
  const r = contexto.panResumo(rows, '2026-08');
  assert.equal(r.casos.total, 2, 'caso 9 só começa em setembro');
  assert.equal(r.casos.finalizados, 2);
  assert.equal(r.autos, 2);
  assert.equal(r.decisoes, 2);
  assert.equal(r.decisoesPendentes, 0);
  assert.equal(r.sancoesAplicadas, 1, 'o caso 8 foi arquivado, não punido');
  assert.equal(r.clubes, 2);
  assert.equal(r.semData, 1, 'a etapa Acompanhamento sem data entra e é informada');
});

test('resumo até outubro inclui o caso 9 com decisão pendente', () => {
  const r = contexto.panResumo(rows, '2026-10');
  assert.equal(r.casos.total, 3);
  assert.equal(r.casos.emAndamento, 1);
  assert.equal(r.autos, 3);
  assert.equal(r.decisoes, 2);
  assert.equal(r.decisoesPendentes, 1);
  assert.deepEqual(Object.fromEntries(r.desfechos), { 'Sanção aplicada': 1, 'Decidido sem sanção': 1, 'Aguardando decisão': 1 });
});

test('sanções por tipo dividem o "+" e turmas vêm das decisões finalizadas', () => {
  const r = contexto.panResumo(rows, '2026-08');
  assert.deepEqual(Object.fromEntries(r.sancoesPorTipo), { Advertência: 1 }, 'Arquivado não é tipo de sanção');
  assert.deepEqual(Object.fromEntries(r.porTurma), { 'Turma 01': 1, 'Turma 02': 1 });
  assert.deepEqual(Object.fromEntries(r.porProcesso), { PSS: 1, PSO: 1 });
  assert.deepEqual(Object.fromEntries(r.porSerie), { A: 1, B: 1 });
});

test('linha do tempo mensal em ordem cronológica, com totais coerentes', () => {
  const r = contexto.panResumo(rows, '2026-08');
  assert.deepEqual(Array.from(r.linhaTempo, (m) => m.chave), ['2026-06', '2026-07', '2026-08']);
  const jul = r.linhaTempo.find((m) => m.chave === '2026-07');
  assert.equal(jul.casos, 1, 'caso 8 começa em julho');
  assert.equal(jul.autos, 1);
  assert.equal(jul.decisoes, 1);
  assert.equal(jul.sancoes, 1);
  const ago = r.linhaTempo.find((m) => m.chave === '2026-08');
  assert.equal(ago.decisoes, 1, 'o acórdão do caso 8 é proferido em agosto');
  assert.equal(ago.sancoes, 0, 'mas arquiva, então não entra em sanções');
});

test('detalhe do card: cada recorte devolve os registros que compõem o número', () => {
  const r = contexto.panResumo(rows, '2026-10');
  const det = (dim, val) => contexto.panDetalhe(r, { dim, val });

  assert.equal(det(null), null, 'sem recorte não abre detalhe');
  assert.equal(contexto.panDetalhe(r, { dim: 'inexistente' }), null);

  // KPIs
  assert.equal(det('casos').itens.length, r.casos.total);
  assert.equal(det('casos').tipo, 'caso');
  assert.equal(det('autos').itens.length, r.autos);
  assert.equal(det('decisoes').itens.length, r.decisoes);
  assert.equal(det('pendentes').itens.length, r.decisoesPendentes);
  assert.equal(det('sancoes').itens.length, r.sancoesAplicadas);
  assert.equal(det('clubes').tipo, 'clube');
  assert.equal(det('clubes').itens.length, r.clubes);

  // Barras
  assert.equal(det('desfecho', 'Decidido sem sanção').itens.length, 1);
  assert.deepEqual(Array.from(det('desfecho', 'Decidido sem sanção').itens, (p) => p.caso), ['8']);
  assert.deepEqual(Array.from(det('sancaoTipo', 'Advertência').itens, (p) => p.caso), ['7']);
  assert.deepEqual(Array.from(det('turma', 'Turma 02').itens, (e) => contexto.panNumeroCaso(e)), ['8']);
  assert.deepEqual(Array.from(det('serie', 'B').itens, (c) => c.caso), ['8']);
  assert.deepEqual(Array.from(det('processoAuto', 'PSS').itens, (e) => contexto.panNumeroCaso(e)), ['7']);
  assert.deepEqual(Array.from(det('clube', 'Clube 9').itens, (p) => p.caso), ['9']);
});

test('detalhe por mês bate com a linha do tempo', () => {
  const r = contexto.panResumo(rows, '2026-08');
  const det = (dim, val) => contexto.panDetalhe(r, { dim, val });
  r.linhaTempo.forEach((m) => {
    assert.equal(det('mes-autos', m.chave).itens.length, m.autos, `autos em ${m.chave}`);
    assert.equal(det('mes-decisoes', m.chave).itens.length, m.decisoes, `decisões em ${m.chave}`);
    assert.equal(det('mes-casos', m.chave).itens.length, m.casos, `casos em ${m.chave}`);
    assert.equal(det('mes-sancoes', m.chave).itens.length, m.sancoes, `sanções em ${m.chave}`);
  });
  assert.deepEqual(Array.from(det('mes-decisoes', '2026-08').itens, (e) => e.etapa), ['Acórdão - PSO']);
});
