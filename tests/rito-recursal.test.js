const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Rito recursal (Admissão de Recurso → Parecer Técnico Recursal → Despacho de
// Distribuição Recursal → Despacho do Relator Recursal → Plenário) nos painéis
// Sanções e Julgamentos, e relator/turma padronizados.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);
const c = contexto;
const e = (nome, status, data, extra = {}) => ({ casoRaiz: '60', etapa: nome, statusEtapa: status, dataEnvio: data, ordem: extra.ordem || 0, ...extra });
const caso = (rows) => ({ caso: '60', clube: 'Vasco', serie: 'A', origem: 'Solvência', rows });

const base = [
  e('Auto de Infração - PSO', 'Finalizado', '01/06/2026', { sancao: 'Advertência + Multa 40k', ordem: 1 }),
  e('Despacho do Relator', 'Finalizado', '10/07/2026', { responsavel: 'Jose Fausto', ordem: 2 }),
  e('Acórdão - PSO', 'Finalizado', '20/07/2026', { sancao: 'Advertência + Multa 40k', turma: 'Turma 01', ordem: 3 }),
];

test('predicados do rito recursal', () => {
  assert.equal(c.ehEtapaRecursal('Admissão de Recurso'), true);
  assert.equal(c.ehEtapaRecursal('Parecer Técnico Recursal'), true);
  assert.equal(c.ehEtapaRecursal('Despacho de Distribuição Recursal'), true);
  assert.equal(c.ehEtapaRecursal('Plenário'), true);
  assert.equal(c.ehEtapaRecursal('Pedido de Reconsideração'), false);
  assert.equal(c.ehAcordao('Plenário', ''), true);
  assert.equal(c.ehParecerConclusivo('Parecer Técnico Recursal'), true);
  assert.equal(c.ehDespachoRelator('Despacho do Relator Recursal'), true);
});

test('Sanções: a sanção aplicada fica de pé enquanto o Plenário não decide', () => {
  const rows = base.concat([
    e('Admissão de Recurso', 'Finalizado', '01/08/2026', { ordem: 4 }),
    e('Despacho do Relator Recursal', 'Finalizado', '10/08/2026', { responsavel: 'Marina Fernandes', ordem: 5 }),
    e('Plenário', 'Pendente ANRESF', '15/09/2026', { ordem: 6 }),
  ]);
  const [p] = c.processosSancionadoresDoCaso(caso(rows));
  assert.equal(p.situacao, 'aplicada');
  assert.equal(p.sancaoAplicada, 'Advertência + Multa 40k');
  assert.equal(p.acordao.etapa, 'Acórdão - PSO', 'a referência segue o acórdão finalizado');
  assert.equal(p.recursoEmJulgamento, true);
  assert.equal(p.recursoLabel, 'Em julgamento');
  assert.equal(p.recurso, true);
  assert.equal(p.relatorRecurso, 'Marina Fernandes');
});

test('Sanções: Plenário finalizado passa a ser a decisão do processo', () => {
  const rows = base.concat([
    e('Admissão de Recurso', 'Finalizado', '01/08/2026', { ordem: 4 }),
    e('Plenário', 'Finalizado', '15/09/2026', { sancao: 'Advertência', turma: 'Plenário', ordem: 6 }),
  ]);
  const [p] = c.processosSancionadoresDoCaso(caso(rows));
  assert.equal(p.acordao.etapa, 'Plenário');
  assert.equal(p.sancaoAplicada, 'Advertência');
  assert.equal(p.recursoEmJulgamento, false);
  assert.equal(p.recursoLabel, 'Sim');
  assert.equal(c.sancTurmaLabel(p), 'Plenário');
});

test('Sanções: só recurso em admissão ainda não muda nada, mas marca recurso', () => {
  const [p] = c.processosSancionadoresDoCaso(caso(base.concat([e('Admissão de Recurso', 'Pendente ANRESF', '01/08/2026', { ordem: 4 })])));
  assert.equal(p.situacao, 'aplicada');
  assert.equal(p.recursoEmJulgamento, false);
  assert.equal(p.recursoLabel, 'Sim');
});

test('Julgamentos: cada etapa recursal pendente vira uma pendência da rota "Rito recursal"', () => {
  const j = (extra) => c.julgamentoDoCaso(caso(base.concat(extra)));
  assert.equal(j([]), null, 'acórdão finalizado e sem recurso: fora da fila');
  assert.equal(j([e('Admissão de Recurso', 'Pendente ANRESF', '01/08/2026', { ordem: 4 })]).situacaoLabel, 'Admissão do recurso');
  assert.equal(j([e('Admissão de Recurso', 'Finalizado', '01/08/2026', { ordem: 4 }), e('Parecer Técnico Recursal', 'Pendente ANRESF', '05/08/2026', { ordem: 5 })]).situacaoLabel, 'Parecer recursal pendente');
  assert.equal(j([e('Despacho de Distribuição Recursal', 'Pendente ANRESF', '08/08/2026', { ordem: 6 })]).situacaoLabel, 'Aguardando distribuição (recurso)');
  const rel = j([e('Despacho do Relator Recursal', 'Pendente ANRESF', '10/08/2026', { responsavel: 'Marina Fernandes', ordem: 7 })]);
  assert.equal(rel.situacaoLabel, 'Com o relator (recurso)');
  assert.equal(rel.relator, 'Marina Fernandes');
  assert.equal(rel.rota, 'Rito recursal');
  assert.equal(rel.turma, 'Plenário');
  const plen = j([e('Despacho do Relator Recursal', 'Finalizado', '10/08/2026', { responsavel: 'Marina Fernandes', ordem: 7 }), e('Plenário', 'Aguardando etapa anterior', '15/09/2026', { ordem: 8 })]);
  assert.equal(plen.situacaoLabel, 'Aguardando Plenário');
  assert.equal(plen.dataJulgamento, '15/09/2026');
  assert.equal(j([e('Plenário', 'Finalizado', '15/09/2026', { sancao: 'Advertência', ordem: 8 })]), null, 'Plenário finalizado: sai da fila');
});

test('relator: grafia mais usada vale para todos; turma do processo cai para a turma do relator', () => {
  const rows = [
    ...base.map((r) => ({ ...r, casoRaiz: '60' })),
    e('Despacho do Relator', 'Finalizado', '10/07/2026', { casoRaiz: '61', responsavel: 'José Fausto' }),
    e('Acórdão - PSO', 'Finalizado', '20/07/2026', { casoRaiz: '61', sancao: 'Advertência', turma: 'Turma 01' }),
    e('Despacho do Relator', 'Finalizado', '10/07/2026', { casoRaiz: '62', responsavel: 'José Fausto' }),
    e('Acórdão - PSO', 'Finalizado', '20/07/2026', { casoRaiz: '62', sancao: 'Advertência', turma: '' }),
  ];
  contexto.dadosFluxograma = rows;
  assert.equal(c.sancNomeRelator('Jose Fausto'), 'José Fausto');
  assert.equal(c.sancNomeRelator('JOSÉ FAUSTO'), 'José Fausto');
  assert.equal(c.sancTurmaDoRelator('Jose Fausto'), 'Turma 01');
  const [p60] = c.processosSancionadoresDoCaso({ caso: '60', clube: 'Vasco', serie: 'A', origem: 'Solvência', rows: rows.filter((r) => r.casoRaiz === '60') });
  assert.equal(p60.relator, 'José Fausto');
  const [p62] = c.processosSancionadoresDoCaso({ caso: '62', clube: 'Vasco', serie: 'A', origem: 'Solvência', rows: rows.filter((r) => r.casoRaiz === '62') });
  assert.equal(c.sancTurmaLabel(p62), 'Turma 01', 'acórdão sem turma: usa a turma do relator');
  const [semRel] = c.processosSancionadoresDoCaso({ caso: '63', clube: 'Vasco', serie: 'A', origem: 'Solvência', rows: [e('Acórdão - PSO', 'Finalizado', '20/07/2026', { casoRaiz: '63', sancao: 'Advertência' })] });
  assert.equal(c.sancTurmaLabel(semRel), 'Sem turma', 'sem relator e sem turma: sem turma');
  contexto.dadosFluxograma = [];
});

test('Decisão de Indeferimento finalizada: encerra o caso com desfecho "Arquivado"', () => {
  const rows = [
    e('Denúncia Recebida', 'Finalizado', '01/06/2026', { ordem: 1 }),
    e('Decisão de Indeferimento', 'Finalizado', '10/06/2026', { ordem: 2 }), // sem sanção escrita
  ];
  assert.equal(c.ehIndeferimento('Decisão de Indeferimento'), true);
  assert.equal(c.ehAcordao('Decisão de Indeferimento', ''), true);
  assert.equal(c.sancaoDaDecisao(rows[1]), 'Arquivado');
  assert.equal(c.sancaoDaDecisao({ etapa: 'Decisão de Indeferimento', sancao: 'Arquivado parcial' }), 'Arquivado parcial', 'texto escrito prevalece');
  assert.equal(c.casoIndeferido(rows), true);
  assert.equal(c.casoIndeferido([e('Decisão de Indeferimento', 'Pendente ANRESF', '10/06/2026')]), false);
  const [p] = c.processosSancionadoresDoCaso({ caso: '70', clube: 'Remo', serie: 'B', origem: 'Denúncia', rows });
  assert.equal(p.situacao, 'sem-sancao-final');
  assert.equal(p.situacaoLabel, 'Decidido sem sanção');
  assert.equal(p.sancaoAplicada, 'Arquivado');
  assert.equal(c.sancTurmaLabel(p), 'Presidência');
  assert.equal(c.julgamentoDoCaso({ caso: '70', clube: 'Remo', serie: 'B', origem: 'Denúncia', rows }), null, 'sai da fila de julgamento');
});

test('Pedido de Reconsideração é decisão: pendente mantém o acórdão; finalizado substitui a sanção', () => {
  assert.equal(c.ehReconsideracao('Pedido de Reconsideração'), true);
  assert.equal(c.ehAcordao('Pedido de Reconsideração', ''), true);
  assert.equal(c.ehEtapaRecursal('Pedido de Reconsideração'), false);
  const pend = base.concat([e('Pedido de Reconsideração', 'Pendente ANRESF', '05/08/2026', { turma: 'Turma 01', ordem: 4 })]);
  const [p1] = c.processosSancionadoresDoCaso(caso(pend));
  assert.equal(p1.sancaoAplicada, 'Advertência + Multa 40k');
  assert.equal(p1.reconsideracaoEmJulgamento, true);
  assert.equal(p1.recursoLabel, 'Reconsideração em julgamento');
  const j = c.julgamentoDoCaso(caso(pend));
  assert.equal(j.situacaoLabel, 'Aguardando julgamento');
  assert.equal(j.turma, 'Turma 01');
  const fin = base.concat([e('Pedido de Reconsideração', 'Finalizado', '05/08/2026', { sancao: 'Advertência', turma: 'Turma 01', ordem: 4 })]);
  const [p2] = c.processosSancionadoresDoCaso(caso(fin));
  assert.equal(p2.acordao.etapa, 'Pedido de Reconsideração');
  assert.equal(p2.sancaoAplicada, 'Advertência');
  assert.equal(p2.recursoLabel, 'Reconsideração');
  assert.equal(c.julgamentoDoCaso(caso(fin)), null);
});
