const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// exportar-excel.js usa o montador de ZIP de anexos.js e os helpers globais de
// script.js/macro.js; aqui os helpers são stubs mínimos. O estado dos filtros
// do painel Processos (macroBusca etc.) é simulado em cada teste.
const contexto = {
  console, TextEncoder, TextDecoder,
  groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
  numeroCaso: (row) => String(row.casoRaiz || row.numero_caso || 'Caso'),
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  valor: (v, fb = '—') => (v === null || v === undefined || String(v).trim() === '' ? fb : v),
  documento: (row) => row.id || '',
  dataOrdenavel: (br) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; },
  isoToBrDate: (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''),
  ordemNumero: (row) => Number(row.ordem || 0),
  tarefasDaEtapa: () => [],
  tarefaFinalizada: () => false,
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/anexos.js', 'utf8'), contexto);
vm.runInContext(fs.readFileSync('js/exportar-excel.js', 'utf8'), contexto);

const { montarXlsx, montarLinhasCasosExport, montarLinhasResumoCasosExport, casosParaExport, exportTemFiltroAtivo } = contexto;
const g = (nome) => vm.runInContext(nome, contexto);

// O .xlsx é um ZIP sem compressão (método "store"), então dá para ler cada
// parte direto dos cabeçalhos locais, sem biblioteca.
function lerZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const partes = new Map();
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const tam = dv.getUint32(p + 18, true);
    const nomeLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const nome = dec.decode(bytes.subarray(p + 30, p + 30 + nomeLen));
    const ini = p + 30 + nomeLen + extraLen;
    partes.set(nome, dec.decode(bytes.subarray(ini, ini + tam)));
    p = ini + tam;
  }
  return partes;
}
const contarLinhas = (xml) => (xml.match(/<row /g) || []).length;
const textosDaLinha = (xml, r) => {
  const linha = new RegExp(`<row r="${r}">(.*?)</row>`).exec(xml)?.[1] || '';
  return Array.from(linha.matchAll(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>(?:<is><t[^>]*>(.*?)<\/t><\/is>)?<\/c>)/g)).map((m) => m[1] ?? '');
};

test('uma aba só continua funcionando como antes (Sanções e Julgamentos)', () => {
  const partes = lerZip(montarXlsx([['A', 'B'], ['1', '2']], 'Sanções'));
  assert.match(partes.get('xl/workbook.xml'), /<sheet name="Sanções" sheetId="1" r:id="rId1"\/>/);
  assert.equal(partes.has('xl/worksheets/sheet1.xml'), true);
  assert.equal(partes.has('xl/worksheets/sheet2.xml'), false);
  assert.match(partes.get('xl/_rels/workbook.xml.rels'), /Id="rId2"[^>]*styles\.xml/);
  assert.equal(contarLinhas(partes.get('xl/worksheets/sheet1.xml')), 2);
});

test('várias abas: cada uma com sua planilha, content type e relacionamento', () => {
  const bytes = montarXlsx([
    { nome: 'Etapas e tarefas', linhas: [['A'], ['1'], ['2']] },
    { nome: 'Por caso', linhas: [['B'], ['x']] },
  ]);
  const partes = lerZip(bytes);
  const wb = partes.get('xl/workbook.xml');
  assert.match(wb, /<sheet name="Etapas e tarefas" sheetId="1" r:id="rId1"\/><sheet name="Por caso" sheetId="2" r:id="rId2"\/>/);
  assert.equal(contarLinhas(partes.get('xl/worksheets/sheet1.xml')), 3);
  assert.equal(contarLinhas(partes.get('xl/worksheets/sheet2.xml')), 2);
  const ct = partes.get('[Content_Types].xml');
  assert.match(ct, /\/xl\/worksheets\/sheet1\.xml/);
  assert.match(ct, /\/xl\/worksheets\/sheet2\.xml/);
  const rels = partes.get('xl/_rels/workbook.xml.rels');
  assert.match(rels, /Id="rId1"[^>]*worksheets\/sheet1\.xml/);
  assert.match(rels, /Id="rId2"[^>]*worksheets\/sheet2\.xml/);
  assert.match(rels, /Id="rId3"[^>]*styles\.xml/, 'styles vem depois da última aba');
});

test('nome de aba: limite de 31 caracteres e caracteres proibidos trocados', () => {
  const partes = lerZip(montarXlsx([{ nome: 'Casos: 2026/06 [filtro?]*', linhas: [['A']] }]));
  assert.match(partes.get('xl/workbook.xml'), /<sheet name="Casos  2026 06  filtro"/);
  const longo = 'x'.repeat(40);
  const p2 = lerZip(montarXlsx([{ nome: longo, linhas: [['A']] }]));
  assert.match(p2.get('xl/workbook.xml'), new RegExp(`<sheet name="${'x'.repeat(31)}"`));
});

// ---- integração com os filtros do painel Processos ----

const etapa = (caso, nome, data, extra = {}) => ({
  casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado',
  clube: `Clube ${caso}`, origem: 'Solvência', serie: 'A', ordem: 1, id: `${caso}.${nome}`, ...extra,
});
const resumo = (caso, extra = {}) => ({
  caso: String(caso), titulo: `Caso ${caso}`, clube: `Clube ${caso}`, serie: 'A', origem: 'Solvência',
  status: 'Em andamento', etapaAtual: 'Defesa', pendencia: 'Clube', dataInicial: '01/06/2026',
  proximoPrazo: '—', sancao: '—', observacaoCaso: '—', ...extra,
});

function comPainel(casosFiltrados, filtros = {}) {
  contexto.macroBusca = filtros.busca ?? '';
  contexto.macroFiltro = filtros.filtro ?? 'todos';
  contexto.macroTipoCaso = filtros.tipo ?? 'todos';
  contexto.macroComputeCaseMetrics = () => [resumo(1), resumo(2), resumo(3)];
  contexto.macroCasosFiltrados = () => casosFiltrados;
}
function semPainel() {
  ['macroBusca', 'macroFiltro', 'macroTipoCaso', 'macroComputeCaseMetrics', 'macroCasosFiltrados']
    .forEach((k) => { delete contexto[k]; });
}

test.beforeEach(() => {
  contexto.dadosFluxograma = [
    etapa(1, 'Auto de Infração', '01/06/2026'),
    etapa(1, 'Defesa', '10/06/2026', { statusEtapa: 'Pendente Clube', ordem: 2 }),
    etapa(2, 'Auto de Infração', '02/06/2026'),
    etapa(3, 'Auto de Infração', '03/06/2026', { origem: 'Denúncia' }),
  ];
});
test.afterEach(semPainel);

test('aba de etapas sai só com os casos filtrados, na ordem da tabela', () => {
  comPainel([resumo(3), resumo(1)], { busca: 'x' });
  const linhas = montarLinhasCasosExport(casosParaExport());
  assert.deepEqual(Array.from(linhas.slice(1), (l) => l[0]), ['Caso 3', 'Caso 1', 'Caso 1']);
  assert.equal(linhas.some((l) => l[0] === 'Caso 2'), false, 'caso fora do filtro não entra');
});

test('status do caso na aba de etapas é o mesmo que a tabela de Processos mostra', () => {
  // Pelas etapas, o caso 2 seria "Finalizado"; a tabela diz "Em andamento"
  // (statusCaso do banco). O Excel tem de bater com a tela.
  comPainel([resumo(2, { status: 'Em andamento' })]);
  const linhas = montarLinhasCasosExport(casosParaExport());
  assert.equal(linhas[1][4], 'Em andamento');
});

test('aba "Por caso": uma linha por caso, colunas da tabela, traço vira vazio', () => {
  comPainel([resumo(1, { sancao: 'Advertência', proximoPrazo: '20/09/2026' }), resumo(3, { origem: 'Denúncia' })]);
  const linhas = montarLinhasResumoCasosExport(casosParaExport());
  assert.deepEqual(Array.from(linhas[0]), Array.from(g('EXPORT_CABECALHO_RESUMO')));
  assert.equal(linhas.length, 3);
  assert.deepEqual(Array.from(linhas[1]), ['Caso 1', 'Clube 1', 'A', 'Solvência', 'Em andamento', 'Defesa', 'Clube', '01/06/2026', '20/09/2026', 'Advertência', '']);
  assert.equal(linhas[2][3], 'Denúncia');
  assert.equal(linhas[2][8], '', 'próximo prazo "—" sai em branco');
});

test('o .xlsx final tem as duas abas com o conteúdo esperado', () => {
  comPainel([resumo(1), resumo(3)]);
  const casos = casosParaExport();
  const partes = lerZip(montarXlsx([
    { nome: 'Etapas e tarefas', linhas: montarLinhasCasosExport(casos) },
    { nome: 'Por caso', linhas: montarLinhasResumoCasosExport(casos) },
  ]));
  const s1 = partes.get('xl/worksheets/sheet1.xml');
  const s2 = partes.get('xl/worksheets/sheet2.xml');
  assert.equal(contarLinhas(s1), 1 + 3, 'cabeçalho + 2 etapas do caso 1 + 1 do caso 3');
  assert.equal(contarLinhas(s2), 1 + 2, 'cabeçalho + um por caso');
  assert.deepEqual(textosDaLinha(s1, 1).slice(0, 5), ['Caso', 'Clube', 'Origem', 'Série', 'Status do caso']);
  assert.deepEqual(textosDaLinha(s2, 2).slice(0, 2), ['Caso 1', 'Clube 1']);
  assert.deepEqual(textosDaLinha(s2, 3).slice(0, 2), ['Caso 3', 'Clube 3']);
});

test('tarefas iniciadas no mesmo dia saem em ordem de prazo, a mais longa por último', () => {
  // Caso real: duas tarefas de 14/09 na mesma etapa, prazos 14/10 e 21/09.
  // Cadastradas nessa ordem (id 1 = prazo maior), a de 21/09 deve vir antes.
  contexto.tarefasDaEtapa = (etapaId) => (etapaId === 'pi' ? [
    { id: 1, data_inicial: '2026-09-14', data_final: '2026-10-14', observacao: 'Relatório auditado' },
    { id: 2, data_inicial: '2026-09-14', data_final: '2026-09-21', observacao: 'Acompanhar envio' },
    { id: 3, data_inicial: '2026-09-14', data_final: null, observacao: 'Sem prazo' },
  ] : []);
  try {
    contexto.dadosFluxograma = [etapa(86, 'Procedimento de Insolvência', '18/08/2026', { etapa_banco_id: 'pi' })];
    comPainel([resumo(86)]);
    const linhas = montarLinhasCasosExport(casosParaExport()).slice(1);
    assert.deepEqual(Array.from(linhas, (l) => `${l[7]}:${l[11]}`), [
      'Etapa:', 'Tarefa:Acompanhar envio', 'Tarefa:Relatório auditado', 'Tarefa:Sem prazo',
    ]);
  } finally {
    contexto.tarefasDaEtapa = () => [];
  }
});

test('sem o painel carregado, exporta todos os casos em ordem numérica', () => {
  semPainel();
  const casos = casosParaExport();
  assert.deepEqual(Array.from(casos, (c) => c.caso), ['1', '2', '3']);
  assert.equal(casos[0].status, 'Em andamento', 'tem etapa pendente');
  assert.equal(casos[1].status, 'Finalizado');
  assert.equal(montarLinhasCasosExport(casos).length, 1 + 4);
});

test('detecção de filtro ativo: busca, filtro rápido ou tipo; ordenação não conta', () => {
  comPainel([]);
  assert.equal(exportTemFiltroAtivo(), false);
  comPainel([], { busca: '  ' });
  assert.equal(exportTemFiltroAtivo(), false, 'busca só com espaços não é filtro');
  comPainel([], { busca: 'grêmio' });
  assert.equal(exportTemFiltroAtivo(), true);
  comPainel([], { filtro: 'vencido' });
  assert.equal(exportTemFiltroAtivo(), true);
  comPainel([], { tipo: 'Denúncia' });
  assert.equal(exportTemFiltroAtivo(), true);
  semPainel();
  assert.equal(exportTemFiltroAtivo(), false);
});
