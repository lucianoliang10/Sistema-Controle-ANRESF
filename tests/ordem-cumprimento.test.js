const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// O que a Ordem de Cumprimento aplicou ao clube (multa, transferban, dedução de
// pontos, exclusão do PARF-B) aparece no cartão e no histórico da etapa e
// conta no rol de sanções: painel Sanções, Panorama e PDFs.
const semAcento = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  normStatus: (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  groupBy: (lista, fn) => lista.reduce((m, i) => { const k = fn(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); return m; }, new Map()),
  currentRows: (rows) => { const o = [...rows].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)); return o.find((r) => String(r.statusEtapa || '').toLowerCase() !== 'finalizado') || o[o.length - 1] || {}; },
  dadosFluxograma: [],
};
vm.createContext(contexto);
contexto.tipoBaseEtapa = (nome) => contexto.normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]);
for (const arquivo of ['js/arrecadacao.js', 'js/panels/operacional.js', 'js/sancao-categorias.js', 'js/panels/panorama.js', 'js/resumo-caso.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
const c = contexto;
const j = (v) => JSON.parse(JSON.stringify(v));

let banco = 1;
const e = (caso, ordem, nome, data, extra = {}) => ({
  etapa_banco_id: banco++, caso_banco_id: caso, casoRaiz: String(caso), clube: `Clube ${caso}`, serie: 'A', origem: 'Solvência', periodo: '2026',
  statusCaso: 'Julgado', etapa: nome, ordem, statusEtapa: 'Finalizado', dataEnvio: data, sancao: null, turma: null, ...extra,
});
const TUDO = { multa: 50000, multaPaga: 20000, transferban: true, pontos: 3, parfb: true };
// Caso 30: acórdão com advertência e multa prospectiva; a ordem aplica tudo.
const caso30 = [
  e(30, 1, 'Auto de Infração - PSO', '01/06/2026', { sancao: 'Advertência + Multa prospectiva' }),
  e(30, 2, 'Acórdão - PSO', '10/07/2026', { sancao: 'Advertência + Multa prospectiva', turma: 'Turma 01' }),
  e(30, 3, 'Ordem de Cumprimento', '20/09/2026', { arrecadacao: TUDO }),
];
// Caso 31: só o acórdão.
const caso31 = [
  e(31, 1, 'Auto de Infração - PSO', '01/06/2026', { sancao: 'Advertência' }),
  e(31, 2, 'Acórdão - PSO', '12/07/2026', { sancao: 'Advertência', turma: 'Turma 02' }),
];
// Caso 32: o acórdão já fala em transferban e a ordem aplica transferban.
const caso32 = [
  e(32, 1, 'Auto de Infração - PSO', '01/06/2026', { sancao: 'Advertência + Transferban' }),
  e(32, 2, 'Acórdão - PSO', '15/07/2026', { sancao: 'Advertência + Transferban', turma: 'Turma 01' }),
  e(32, 3, 'Ordem de Cumprimento', '01/10/2026', { arrecadacao: { transferban: true } }),
];
const todas = [...caso30, ...caso31, ...caso32];
const processosDe = (rows, caso) => Array.from(c.processosSancionadoresDoCaso({ caso: String(caso), rows, clube: `Clube ${caso}`, serie: 'A', origem: 'Solvência' }));

test('medidas da ordem: linhas do cartão e tipos para somar', () => {
  assert.deepEqual(j(c.arrLinhasCumprimento(c.arrNormalizar('cumprimento', TUDO))), [
    { curto: 'Multa', valor: `${c.arrFormatar(50000)} · pago ${c.arrFormatar(20000)}` },
    { curto: 'Transferban', valor: 'Aplicado' },
    { curto: 'Pontos', valor: 'Dedução de 3 pontos' },
    { curto: 'PARF-B', valor: 'Exclusão' },
  ]);
  assert.equal(c.arrLinhasCumprimento(c.arrNormalizar('cumprimento', { multa: 1000, multaPaga: 1000 }))[0].valor, `${c.arrFormatar(1000)} · paga`);
  assert.equal(c.arrLinhasCumprimento(c.arrNormalizar('cumprimento', { multa: 1000 }))[0].valor, `${c.arrFormatar(1000)} · a receber`);
  assert.equal(c.arrLinhasCumprimento(c.arrNormalizar('cumprimento', { pontos: 1 }))[0].valor, 'Dedução de 1 ponto');
  assert.deepEqual(j(c.arrTiposAplicados(c.arrNormalizar('cumprimento', TUDO))), ['Multa', 'Transferban', 'Dedução de pontos', 'Exclusão do PARF-B']);
  assert.deepEqual(j(c.arrTiposAplicados(null)), []);
});

test('cartão e histórico: o quadro "Aplicado ao clube" só na ordem com algo marcado', () => {
  const html = c.arrAplicadoHtmlEtapa(caso30[2]);
  assert.match(html, /^<div class="sancao sancao-cat arr-aplicado"><span class="arr-aplicado-titulo">Aplicado ao clube<\/span>/);
  assert.match(html, /<span>Transferban<\/span><strong>Aplicado<\/strong>/);
  assert.match(html, /<span>PARF-B<\/span><strong>Exclusão<\/strong>/);
  assert.match(c.arrAplicadoHtmlEtapa(caso30[2], 'hist-sancao'), /^<div class="hist-sancao sancao-cat arr-aplicado">/);
  assert.equal(c.arrAplicadoHtmlEtapa(caso30[1]), '', 'acórdão não é ordem');
  assert.equal(c.arrAplicadoHtmlEtapa(e(40, 1, 'Ordem de Cumprimento', '01/10/2026')), '', 'ordem sem nada marcado');
  assert.equal(c.arrAplicadoHtmlEtapa(e(40, 1, 'Admissão de Recurso', '01/10/2026', { arrecadacao: { valor: 500 } })), '', 'preparo de recurso não é sanção');
});

test('rol de sanções: o que a ordem aplicou entra no processo e conta por tipo', () => {
  const [p] = processosDe(caso30, 30);
  assert.equal(p.ordens.length, 1);
  assert.deepEqual(j(p.cumprimentoTexto), [`Multa de ${c.arrFormatar(50000)}`, 'Transferban', 'Dedução de 3 pontos', 'Exclusão do PARF-B']);
  assert.deepEqual(j(c.sancTiposDasOrdens(p)), ['Multa', 'Transferban', 'Dedução de pontos', 'Exclusão do PARF-B']);
  assert.deepEqual(j(c.sancListaAplicadas(p)), ['Advertência', 'Multa prospectiva', 'Multa', 'Transferban', 'Dedução de pontos', 'Exclusão do PARF-B']);
  // processo sem ordem segue como antes
  const [semOrdem] = processosDe(caso31, 31);
  assert.deepEqual(j(semOrdem.ordens), []);
  assert.deepEqual(j(c.sancListaAplicadas(semOrdem)), ['Advertência']);
});

test('o mesmo nome no acórdão e na ordem conta uma vez só por processo', () => {
  const [p] = processosDe(caso32, 32);
  assert.deepEqual(j(c.sancListaAplicadas(p)), ['Advertência', 'Transferban']);
  const contagem = j(c.sancContagemAplicadas(todas.length ? [...processosDe(caso30, 30), ...processosDe(caso31, 31), ...processosDe(caso32, 32)] : []));
  assert.deepEqual(contagem, [['Advertência', 3], ['Transferban', 2], ['Dedução de pontos', 1], ['Exclusão do PARF-B', 1], ['Multa', 1], ['Multa prospectiva', 1]]);
});

test('duas ordens no caso somam os tipos sem repetir; ordem sem nada marcado não entra', () => {
  const rows = [...caso31, e(31, 3, 'Ordem de Cumprimento', '01/09/2026', { arrecadacao: { transferban: true } }), e(31, 4, 'Ordem de Cumprimento', '01/10/2026', { arrecadacao: { transferban: true, parfb: true } }), e(31, 5, 'Ordem de Cumprimento', '01/11/2026')];
  const [p] = processosDe(rows, 31);
  assert.equal(p.ordens.length, 2);
  assert.deepEqual(j(c.sancTiposDasOrdens(p)), ['Transferban', 'Exclusão do PARF-B']);
  assert.deepEqual(j(p.cumprimentoTexto), ['Transferban', 'Transferban', 'Exclusão do PARF-B']);
});

test('caso com dois processos: a ordem entra no que tem o acórdão mais recente', () => {
  const rows = [
    e(50, 1, 'Auto de Infração - PSS', '01/03/2026', { sancao: 'Advertência' }), e(50, 2, 'Acórdão - PSS', '20/03/2026', { sancao: 'Advertência' }),
    e(50, 3, 'Auto de Infração - PSO', '01/06/2026', { sancao: 'Multa' }), e(50, 4, 'Acórdão - PSO', '10/07/2026', { sancao: 'Multa prospectiva' }),
    e(50, 5, 'Ordem de Cumprimento', '01/09/2026', { arrecadacao: { parfb: true } }),
  ];
  const processos = processosDe(rows, 50);
  assert.deepEqual(j(processos.map((p) => `${p.processo}:${p.ordens.length}`)), ['PSS:0', 'PSO:1']);
});

test('painel Sanções: a célula e a exportação mostram a ordem abaixo da decisão', () => {
  const [p] = processosDe(caso32, 32);
  const celula = c.sancSancaoCelula(p);
  assert.match(celula, /Ordem de cumprimento<\/small>/);
  assert.match(celula, /class="sanc-ordem"/);
  assert.equal(c.sancTextoSancao(p), 'Advertência + Transferban | Ordem de cumprimento: Transferban');
  const [semOrdem] = processosDe(caso31, 31);
  assert.doesNotMatch(c.sancSancaoCelula(semOrdem), /sanc-ordem/);
  assert.equal(c.sancTextoSancao(semOrdem), 'Advertência');
});

test('Panorama: "Sanções aplicadas" soma as ordens, e o detalhe traz os processos', () => {
  const r = c.panResumo(todas, '2026-12');
  assert.deepEqual(j(r.sancoesPorTipo), [['Advertência', 3], ['Transferban', 2], ['Dedução de pontos', 1], ['Exclusão do PARF-B', 1], ['Multa', 1], ['Multa prospectiva', 1]]);
  assert.equal(r.sancoesAplicadas, 3, 'o cartão segue contando processos com sanção');
  const detalhe = c.panDetalhe(r, { dim: 'sancaoTipo', val: 'Exclusão do PARF-B' });
  assert.deepEqual(j(detalhe.itens.map((p) => p.caso)), ['30']);
  assert.deepEqual(j(c.panDetalhe(r, { dim: 'sancaoTipo', val: 'Transferban' }).itens.map((p) => p.caso)), ['30', '32']);
});

test('Panorama por período: a ordem conta pela data dela', () => {
  // setembro a dezembro: os acórdãos são de julho; só as ordens caem no período
  const r = c.panResumo(todas, '2026-12', '2026-09');
  assert.deepEqual(j(r.sancoesPorTipo), [['Transferban', 2], ['Dedução de pontos', 1], ['Exclusão do PARF-B', 1], ['Multa', 1]]);
  assert.deepEqual(j(r.listaProcessos.map((p) => p.caso)), ['30', '32'], 'o processo entra pela ordem, mesmo com o acórdão antes do período');
  assert.equal(r.sancoesAplicadas, 0, 'nenhum acórdão com sanção no período');
  // junho a agosto: só os acórdãos
  assert.deepEqual(j(c.panResumo(todas, '2026-08', '2026-06').sancoesPorTipo), [['Advertência', 3], ['Multa prospectiva', 1], ['Transferban', 1]]);
});

test('PDF do caso e do clube: o processo sancionador mostra a ordem de cumprimento', () => {
  const ficha = c.resumoFicha(caso30);
  assert.deepEqual(j(ficha.processos[0].cumprimento), [`Multa de ${c.arrFormatar(50000)}`, 'Transferban', 'Dedução de 3 pontos', 'Exclusão do PARF-B']);
  const html = c.resumoDocumentoHtml({ modo: 'caso', clube: 'Clube 30', fichas: [ficha], historico: [], geradoEm: '26/11/2026', geradoPor: 'Luciano' });
  assert.match(html, /Ordem de cumprimento:<\/span> Multa de /);
  assert.match(html, /Exclusão do PARF-B/);
  const semOrdem = c.resumoFicha(caso31);
  assert.deepEqual(j(semOrdem.processos[0].cumprimento), []);
  // PDF do clube: a coluna de desfecho do caso finalizado também traz a ordem
  const finalizado = caso30.map((r) => ({ ...r, statusCaso: 'Finalizado' }));
  const doClube = c.resumoDocumentoHtml({ modo: 'clube', clube: 'Clube 30', fichas: [c.resumoFicha(finalizado)], historico: [], geradoEm: '26/11/2026', geradoPor: 'Luciano' });
  assert.match(doClube, /Ordem de cumprimento: Multa de /);
});
