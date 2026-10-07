const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Lógica da busca global: índice, filtro, destaque e recentes. A interface
// (overlay, teclado) depende de DOM e fica de fora.
const storage = new Map();
const contexto = {
  console,
  document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) },
  esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
  numeroCaso: (row) => String(row.casoRaiz || row.numero_caso || 'Caso'),
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }),
  currentRows: (rows) => rows.find((r) => r.statusEtapa !== 'Finalizado') || rows[rows.length - 1] || {},
  parteCasoFluxograma: (r) => (r.denunciante ? `${r.denunciante} x ${r.clube}` : r.clube),
  tarefaFinalizada: (t) => t.status_tarefa === 'Concluída',
  tarefaSituacaoLabel: () => 'faltam 13d',
  tarefaSituacao: () => 'ok',
  isoToBrDate: (iso) => (iso ? iso.split('-').reverse().join('/') : ''),
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/busca-global.js', 'utf8'), contexto);
const { buscaIndexar, buscaFiltrar, buscaDestacar, buscaRecentes, buscaRegistrarRecente } = contexto;

const etapas = [
  { casoRaiz: '53', etapa_banco_id: 1, id: '001/2026', etapa: 'Auto de Infração - PSO', statusEtapa: 'Finalizado', clube: 'América MG', denunciante: 'Atleta Heber', origem: 'Denúncia', serie: 'B', dataEnvio: '01/09/2026' },
  { casoRaiz: '53', etapa_banco_id: 2, id: '002/2026', etapa: 'Defesa', statusEtapa: 'Pendente Clube', clube: 'América MG', denunciante: 'Atleta Heber', origem: 'Denúncia', serie: 'B', prazoFinal: '30/09/2026' },
  { casoRaiz: '56', etapa_banco_id: 5, id: '005/2026', etapa: 'Despacho do Relator', statusEtapa: 'Pendente ANRESF', clube: 'Grêmio', origem: 'Solvência', serie: 'A', responsavel: 'Vantuil Gonçalves' },
  { casoRaiz: '9', etapa: 'Sem id de banco', statusEtapa: 'Finalizado', clube: 'Remo' },
];
const tarefas = [
  { id: 1, etapa_id: 2, numero_caso: 53, nome_etapa: 'Defesa', observacao: 'Acompanhar defesa', responsavel: 'Luciano', data_final: '2026-10-20', status_tarefa: 'Pendente' },
  { id: 2, etapa_id: 5, numero_caso: 56, nome_etapa: 'Despacho do Relator', observacao: 'Tarefa já concluída', responsavel: 'Luciano', status_tarefa: 'Concluída' },
];

test('índice: um item por caso, por etapa com id de banco e por tarefa aberta', () => {
  const itens = buscaIndexar(etapas, tarefas);
  assert.deepEqual(Array.from(itens.filter((i) => i.tipo === 'caso').map((i) => i.titulo)), ['Caso 9 · Remo', 'Caso 53 · Atleta Heber x América MG', 'Caso 56 · Grêmio']);
  assert.equal(itens.filter((i) => i.tipo === 'etapa').length, 3, 'etapa sem etapa_banco_id não entra');
  assert.deepEqual(Array.from(itens.filter((i) => i.tipo === 'tarefa').map((i) => i.titulo)), ['Acompanhar defesa'], 'concluída não entra');
  const caso53 = itens.find((i) => i.tipo === 'caso' && i.caso === '53');
  assert.equal(caso53.status, 'Pendente Clube', 'status da etapa atual');
  assert.match(caso53.sub, /Denúncia · Série B · 2 etapas · Etapa atual: Defesa/);
});

test('filtro acha por denunciante, clube, número, ID e responsável — sem acento', () => {
  const itens = buscaIndexar(etapas, tarefas);
  assert.deepEqual(Array.from(buscaFiltrar(itens, 'heber').casos.map((i) => i.caso)), ['53']);
  assert.equal(buscaFiltrar(itens, 'heber').etapas.length, 2);
  assert.equal(buscaFiltrar(itens, 'heber').tarefas.length, 1);
  assert.deepEqual(Array.from(buscaFiltrar(itens, 'america').casos.map((i) => i.caso)), ['53']);
  assert.deepEqual(Array.from(buscaFiltrar(itens, '002/2026').etapas.map((i) => i.titulo)), ['002/2026 · Defesa']);
  assert.deepEqual(Array.from(buscaFiltrar(itens, 'vantuil').etapas.map((i) => i.caso)), ['56']);
  assert.deepEqual(Array.from(buscaFiltrar(itens, 'GRÊMIO despacho').etapas.map((i) => i.caso)), ['56'], 'todas as palavras precisam casar');
  assert.deepEqual(JSON.parse(JSON.stringify(buscaFiltrar(itens, ''))), { casos: [], etapas: [], tarefas: [] });
  assert.equal(buscaFiltrar(itens, 'xyz').casos.length, 0);
});

test('número exato do caso vem primeiro', () => {
  const muitos = etapas.concat([{ casoRaiz: '5', etapa_banco_id: 50, etapa: 'Caso 5 fala de 53 na origem', statusEtapa: 'Finalizado', clube: 'Clube 53', origem: 'Solvência' }]);
  const r = buscaFiltrar(buscaIndexar(muitos, []), '53');
  assert.equal(r.casos[0].caso, '53');
  assert.ok(r.casos.some((i) => i.caso === '5'), 'o outro caso que cita 53 também aparece, depois');
});

test('destaque marca o trecho no texto original, com acento, e escapa HTML', () => {
  assert.equal(buscaDestacar('Atleta Heber x América MG', 'heber'), 'Atleta <mark>Heber</mark> x América MG');
  assert.equal(buscaDestacar('Atleta Heber x América MG', 'america'), 'Atleta Heber x <mark>América</mark> MG');
  assert.equal(buscaDestacar('Grêmio <SAF>', 'gremio'), '<mark>Grêmio</mark> &lt;SAF&gt;');
  assert.equal(buscaDestacar('Defesa', ''), 'Defesa');
  assert.equal(buscaDestacar('Defesa', 'zzz'), 'Defesa');
});

test('recentes: o mais novo primeiro, sem repetir, no máximo 5', () => {
  ['1', '2', '3', '4', '5', '6', '2'].forEach(buscaRegistrarRecente);
  assert.deepEqual(Array.from(buscaRecentes()), ['2', '6', '5', '4', '3']);
  buscaRegistrarRecente('');
  assert.equal(buscaRecentes().length, 5);
});
