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
contexto.tipoBaseEtapa = (nome) => contexto.normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]);
vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);
vm.runInContext(fs.readFileSync('js/sancao-categorias.js', 'utf8'), contexto);
vm.runInContext(fs.readFileSync('js/panels/panorama.js', 'utf8'), contexto);

const etapa = (caso, nome, data, extra = {}) => ({
  casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado',
  statusCaso: 'Finalizado',
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
  etapa(9, 'Auto de Infração - PSO', '10/09/2026', { sancao: 'Advertência', statusCaso: 'Em andamento' }),
  etapa(9, 'Acórdão - PSO', '02/10/2026', { statusEtapa: 'Pendente ANRESF', statusCaso: 'Em andamento' }),
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

// --- Semântica de "caso finalizado" -----------------------------------------
// Finalizado = o STATUS DO CASO diz que sim; a data da ÚLTIMA etapa diz em que
// corte ele entra. Antes, "finalizado" era derivado das etapas dentro do corte,
// e um caso encerrado em agosto voltava a "em andamento" no corte de setembro
// assim que ganhava uma etapa aberta em setembro.

const fim = (mes) => contexto.panFimDoMes(mes);
const listaDe = (statusCaso, ...etapas) => etapas.map((e) => ({ ...e, statusCaso }));

test('o status do caso prevalece sobre o das etapas', () => {
  const todasFinalizadas = listaDe('Em andamento', { statusEtapa: 'Finalizado', dataEnvio: '05/07/2026' });
  assert.equal(contexto.panCasoFinalizado(todasFinalizadas, contexto.panMs('05/07/2026'), fim('2026-08')), false,
    'cadastro diz "Em andamento" — não finaliza mesmo com todas as etapas fechadas');

  const etapaAberta = listaDe('Finalizado', { statusEtapa: 'Pendente ANRESF', dataEnvio: '05/07/2026' });
  assert.equal(contexto.panCasoFinalizado(etapaAberta, contexto.panMs('05/07/2026'), fim('2026-08')), true,
    'cadastro diz "Finalizado" — finaliza mesmo com etapa aberta');
});

test('a última etapa define o corte em que o caso entra como finalizado', () => {
  const lista = listaDe('Finalizado', {});
  const ultima = contexto.panMs('23/09/2026');
  assert.equal(contexto.panCasoFinalizado(lista, ultima, fim('2026-08')), false, 'em agosto ainda não estava encerrado');
  assert.equal(contexto.panCasoFinalizado(lista, ultima, fim('2026-09')), true);
  assert.equal(contexto.panCasoFinalizado(lista, ultima, fim('2026-10')), true, 'e continua encerrado depois');
});

test('caso finalizado sem nenhuma etapa datada vale pelo status', () => {
  assert.equal(contexto.panCasoFinalizado(listaDe('Finalizado', {}), 0, fim('2026-08')), true);
  assert.equal(contexto.panCasoFinalizado(listaDe('Em andamento', {}), 0, fim('2026-08')), false);
});

test('finalizados não caem ao avançar o corte (o caso do relato)', () => {
  // Caso 20: encerrado em julho. Caso 21: cadastro Finalizado, mas com uma
  // etapa aberta em setembro — só entra como finalizado a partir de setembro.
  const cenario = [
    etapa(20, 'Auto de Infração - PSS', '10/06/2026'),
    etapa(20, 'Acórdão - PSS', '05/07/2026', { sancao: 'Advertência' }),
    etapa(21, 'Auto de Infração - PSO', '10/06/2026'),
    etapa(21, 'Acórdão - PSO', '05/07/2026', { sancao: 'Advertência' }),
    etapa(21, 'Despacho do Relator', '23/09/2026', { statusEtapa: 'Pendente ANRESF' }),
  ];
  const finalizadosEm = (corte) => contexto.panResumo(cenario, corte).casos.finalizados;
  assert.equal(finalizadosEm('2026-08'), 1, 'só o caso 20 estava encerrado em agosto');
  assert.equal(finalizadosEm('2026-09'), 2, 'o caso 21 entra em setembro — não some do total');
  assert.equal(finalizadosEm('2026-10'), 2, 'e permanece');
});

test('o caso carrega a data da última etapa para auditoria', () => {
  const r = contexto.panResumo(rows, '2026-08');
  const caso8 = r.listaCasos.find((c) => c.caso === '8');
  assert.equal(contexto.panDataBrDeMs(caso8.ultima), '21/08/2026');
  assert.equal(caso8.statusCaso, 'Finalizado');
});

// ---- barras: valor zero não tem preenchimento ----

test('barras do Panorama, Sanções e Julgamentos: zero fica vazio; positivo pequeno ganha largura mínima', () => {
  const largura = (html) => Number(/width:(\d+)%/.exec(html)[1]);
  assert.equal(largura(contexto.panBar('mar/2026', 0, 26, 'orange', 'mes-autos', '2026-03')), 0);
  assert.equal(largura(contexto.panBar('abr/2026', 1, 26, 'orange', 'mes-autos', '2026-04')), 4, '1 de 26 arredonda para 4%, a mínima');
  assert.equal(largura(contexto.panBar('jun/2026', 26, 26, 'orange', 'mes-autos', '2026-06')), 100);
  assert.equal(largura(contexto.sancBar('turma', 'Turma 01', 0, 36, 'blue')), 0);
  assert.equal(largura(contexto.sancBar('turma', 'Turma 01', 1, 36, 'blue')), 6);
  assert.equal(largura(contexto.julgBar('clube', 'Remo', 0, 5, 'purple')), 0);
  assert.equal(largura(contexto.julgBar('clube', 'Remo', 5, 5, 'purple')), 100);
});

// ---- recorte por origem/período e retrato ----

test('recorte: chave e rótulo por origem e período; opções com nº de casos', () => {
  assert.equal(contexto.panRecorteLabel(contexto.panRecorteChave({ origem: 'Solvência', periodo: '2026/06/30' })), 'Solvência · 30/06/2026');
  assert.equal(contexto.panRecorteLabel(contexto.panRecorteChave({ origem: 'Denúncia', periodo: '2026' })), 'Denúncia · 2026');
  assert.equal(contexto.panRecorteLabel(contexto.panRecorteChave({ origem: 'Monitoramento' })), 'Monitoramento');
  const linhas = [
    { casoRaiz: '1', origem: 'Solvência', periodo: '2026/02/28' }, { casoRaiz: '1', origem: 'Solvência', periodo: '2026/02/28' },
    { casoRaiz: '2', origem: 'Solvência', periodo: '2026/06/30' }, { casoRaiz: '3', origem: 'Solvência', periodo: '2026/06/30' },
    { casoRaiz: '4', origem: 'Denúncia', periodo: '2026' },
  ];
  const ops = contexto.panOpcoesRecorte(linhas).map(([, l, n]) => `${l}:${n}`);
  assert.deepEqual(Array.from(ops), ['Solvência · 30/06/2026:2', 'Denúncia · 2026:1', 'Solvência · 28/02/2026:1']);
  assert.equal(contexto.panFiltrarRecorte(linhas, 'Solvência|2026/06/30').length, 2);
  assert.equal(contexto.panFiltrarRecorte(linhas, 'todos').length, 5);
});

test('tipos de sanção a partir do texto do acórdão', () => {
  const c = contexto.panSancaoCodigos('Advertência + Transferban Prospectivo + Multa Pecuniária');
  assert.deepEqual(Object.keys(c).sort(), ['ADV', 'M', 'TB']);
  assert.equal(c.TB, 'Transferban Prospectivo');
  assert.deepEqual(Object.keys(contexto.panSancaoCodigos('Exclusão do PARF-B Prospectivo')), ['PB']);
  assert.deepEqual(Object.keys(contexto.panSancaoCodigos('Arquivado')), ['ARQ']);
  assert.deepEqual(Object.keys(contexto.panSancaoCodigos('')), []);
});

test('retrato: julgado, em pauta e em andamento, com os cartões do recorte', () => {
  const e = (caso, nome, data, extra = {}) => ({ casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado', statusCaso: 'Em andamento',
    clube: `Clube ${caso}`, origem: 'Solvência', periodo: '2026/06/30', serie: caso < 3 ? 'A' : 'B', sancao: null, turma: null, etapa_banco_id: `${caso}-${nome}`, ...extra });
  const linhas = [
    e(1, 'Auto de Infração - PSO', '01/08/2026', { sancao: 'Advertência + Transferban prospectivo' }),
    e(1, 'Acórdão - PSO', '08/10/2026', { sancao: 'Advertência + Transferban prospectivo', turma: 'Turma 01' }),
    e(2, 'Auto de Infração - PSO', '01/08/2026', { sancao: 'Advertência' }),
    e(2, 'Acórdão - PSO', '08/10/2026', { sancao: 'Advertência', turma: 'Turma 02' }),
    e(3, 'Auto de Infração - PSO', '01/08/2026', { sancao: 'Advertência' }),
    e(3, 'Acórdão - PSO', '14/10/2026', { statusEtapa: 'Pendente ANRESF', turma: 'Turma 01' }),
    e(4, 'Auto de Infração - PSO', '01/08/2026', { sancao: 'Advertência' }),
  ];
  const r = contexto.panResumo(linhas, '2026-10');
  const hoje = new Date(2026, 9, 9).getTime();
  const rt = contexto.panRetrato(r, hoje);
  assert.equal(rt.total, 4);
  assert.equal(rt.julgados, 2);
  assert.equal(rt.pauta, 1);
  assert.equal(rt.andamento, 1);
  assert.equal(rt.comSancao, 2);
  assert.equal(rt.porTipo.TB, 1);
  assert.equal(rt.linhas[0].clube, 'Clube 1', 'o processo com Transferban vem primeiro');
  assert.equal(rt.linhas[0].situacaoLabel, 'Julgado em 08/10');
  const emPauta = rt.linhas.find((l) => l.caso === '3');
  assert.equal(emPauta.situacaoLabel, 'Em pauta em 14/10');
  assert.equal(emPauta.turma, 'Turma 01');
  assert.deepEqual(Object.keys(emPauta.codigos), [], 'sem sanção enquanto não julgado');
  assert.deepEqual(Array.from(rt.datasJulgamento).map((ms) => contexto.panDataCurta(ms)), ['08/10']);
  const html = contexto.panRetratoSecao(r, 'Solvência|2026/06/30', hoje);
  assert.match(html, /Solvência · 30\/06\/2026: 4 processos sancionadores/);
  assert.match(html, /Clube · Série A/);
  assert.match(html, /Clube · Série B/);
  assert.match(html, /PSO instaurados/);
  assert.match(html, /Em pauta em 14\/10/);
  assert.match(html, /1 com Transferban/);
});

test('retrato: casos ainda sem processo sancionador entram como "em instrução"', () => {
  const e = (caso, nome, data, extra = {}) => ({ casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado', statusCaso: 'Em andamento',
    clube: `Clube ${caso}`, origem: 'Denúncia', periodo: '2026', serie: 'B', denunciante: `Atleta ${caso}`, sancao: null, turma: null, etapa_banco_id: `${caso}-${nome}`, ...extra });
  const linhas = [
    // 1: julgado em PSO
    e(1, 'Denúncia', '01/07/2026'), e(1, 'Parecer Técnico Conclusivo', '10/07/2026'),
    e(1, 'Acórdão - PSO', '08/08/2026', { sancao: 'Advertência', turma: 'Turma 01', statusCaso: 'Finalizado' }),
    // 2: parecer técnico ainda pendente, sem PSO
    e(2, 'Denúncia', '02/09/2026'), e(2, 'Parecer Técnico Conclusivo', '17/09/2026', { statusEtapa: 'Pendente ANRESF' }),
    // 3: só recebida e admitida, nada pendente cadastrado
    e(3, 'Denúncia Recebida', '21/09/2026'), e(3, 'Denúncia', '22/09/2026'),
    // 4: acórdão já cadastrado, mas o parecer segue pendente
    e(4, 'Parecer Técnico Conclusivo', '18/08/2026', { statusEtapa: 'Pendente ANRESF' }),
    e(4, 'Acórdão - PSO', '09/09/2026', { statusEtapa: 'Aguardando etapa anterior', turma: 'Turma 02' }),
  ];
  const r = contexto.panResumo(linhas, '2026-10');
  const hoje = new Date(2026, 9, 15).getTime();
  const rt = contexto.panRetrato(r, hoje);
  assert.equal(rt.total, 4, 'todos os casos do recorte aparecem');
  assert.equal(rt.casos, 4);
  assert.equal(rt.semProcesso, 2);
  assert.equal(rt.julgados, 1);
  assert.equal(rt.andamento, 3);
  const por = Object.fromEntries(rt.linhas.map((l) => [l.caso, l]));
  assert.equal(por['2'].situacaoLabel, 'Parecer técnico pendente');
  assert.equal(por['3'].situacaoLabel, 'Em instrução');
  assert.equal(por['4'].situacaoLabel, 'Parecer técnico pendente', 'parecer pendente vale mais que o acórdão já agendado');
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(rt.andamentoPorSituacao.entries()))), [['em instrução', 3]]);
  assert.equal(rt.linhas[rt.linhas.length - 1].situacao, 'instrucao', 'em instrução por último');
  const html = contexto.panRetratoSecao(r, 'Denúncia|2026', hoje);
  assert.match(html, /Denúncia · 2026: 4 casos/);
  assert.match(html, /Denúncias recebidas/);
  assert.match(html, /4 da Série B · 2 PSO instaurados/);
  assert.match(html, /3 em instrução/);
  assert.match(html, /caso ainda em instrução/);
});

test('"Dados até" começa no mês atual', () => {
  const d = new Date();
  assert.equal(contexto.panCortePadrao(), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
});

test('retrato: colunas de sanção seguem a origem do recorte', () => {
  const colunas = (origem) => Array.from(contexto.panColunasSancao(origem).colunas).map((c) => c.curto);
  assert.deepEqual(colunas('Denúncia'), ['Transitório', 'Apl. plena', 'Geral']);
  assert.deepEqual(colunas('Solvência'), ['Transição', 'Empregados', 'Clubes nac.', 'Clubes estr.', 'Poder públ.', 'Geral']);
  assert.deepEqual(colunas('Monitoramento'), colunas('Solvência'));
  assert.deepEqual(colunas('Omissão'), ['Omissão']);
  assert.deepEqual(colunas('DF'), ['Sanção']);
  assert.deepEqual(colunas('Evento de Insolvência'), ['Sanção']);
  assert.equal(contexto.panSancaoCurta('Advertência + Transferban prospectivo + Multa 100k'), 'ADV + TB* + M 100k');
  assert.equal(contexto.panSancaoCurta('Advertência + Multa 50k + 10k por dia'), 'ADV + M 50k + 10k/dia');
  assert.equal(contexto.panSancaoCurta('Multa prospectiva 100k'), 'M 100k*');
  assert.equal(contexto.panSancaoCurta('Advertência + Multa pecuniária'), 'ADV + M');
  assert.equal(contexto.panSancaoCurta('Multa de R$ 150.000,00'), 'M 150k');
  assert.equal(contexto.panSancaoCurta('Multa de 20 mil reais'), 'M 20k');
  assert.equal(contexto.panSancaoCurta('Multa de R$ 1.500,00'), 'M 1,5k');
  assert.equal(contexto.panSancaoCurta('Multa de 1,5 milhão'), 'M 1500k');
  assert.equal(contexto.panValorMulta('Multa pecuniária'), '');
  assert.equal(contexto.panSancaoCurta('Arquivamento'), 'ARQ');
  assert.equal(contexto.panSancaoCurta('Não regularização acarretará nova Infração'), 'Não regularizaç…');
  const cols = Array.from(contexto.panColunasSancao('Denúncia').colunas);
  const comDetalhe = { sancaoDetalhe: { plena: 'Transferban', geral: 'Advertência' }, sancaoTexto: 'Advertência + Transferban' };
  assert.deepEqual(cols.map((c) => contexto.panValorColunaSancao(comDetalhe, c, cols)), ['', 'Transferban', 'Advertência']);
  const antiga = { sancaoDetalhe: null, sancaoTexto: 'Advertência' };
  assert.deepEqual(cols.map((c) => contexto.panValorColunaSancao(antiga, c, cols)), ['', '', 'Advertência'], 'texto antigo cai no Geral');
  const unica = Array.from(contexto.panColunasSancao('DF').colunas);
  assert.deepEqual(unica.map((c) => contexto.panValorColunaSancao(antiga, c, unica)), ['Advertência'], 'sem Geral, cai na coluna única');
  const livre = { sancaoDetalhe: { livre: [{ motivo: 'Atraso', sancao: 'Multa 20k' }] }, sancaoTexto: 'Multa 20k' };
  assert.deepEqual(unica.map((c) => contexto.panValorColunaSancao(livre, c, unica)), ['Atraso: Multa 20k']);
});

test('retrato de denúncia: cabeçalho por período e célula com o texto completo no title', () => {
  const e = (caso, nome, data, extra = {}) => ({ casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado', statusCaso: 'Finalizado',
    clube: `Clube ${caso}`, origem: 'Denúncia', periodo: '2026', serie: 'B', denunciante: `Atleta ${caso}`, sancao: null, turma: null, etapa_banco_id: `${caso}-${nome}`, ...extra });
  const linhas = [
    e(1, 'Auto de Infração - PSO', '01/07/2026', { sancao: 'Advertência' }),
    e(1, 'Acórdão - PSO', '08/08/2026', { sancao: 'Advertência + Transferban prospectivo', sancaoDetalhe: { plena: 'Transferban prospectivo', geral: 'Advertência' }, turma: 'Turma 01' }),
    e(2, 'Auto de Infração - PSO', '01/07/2026', { sancao: 'Advertência' }),
    e(2, 'Acórdão - PSO', '21/08/2026', { sancao: 'Advertência', turma: 'Turma 02' }),
  ];
  const r = contexto.panResumo(linhas, '2026-10');
  const html = contexto.panRetratoSecao(r, 'Denúncia|2026', new Date(2026, 9, 27).getTime());
  assert.match(html, /<th title="Atraso no período transitório">Transitório<\/th><th title="Atraso na aplicação plena">Apl. plena<\/th><th title="Geral \(processo todo\)">Geral<\/th>/);
  assert.doesNotMatch(html, /<th title="Advertência">ADV<\/th>/);
  assert.match(html, /title="Transferban prospectivo">TB<sup>\*<\/sup><\/td>/);
  assert.match(html, /title="Advertência">ADV<\/td>/);
  assert.match(html, /pan-rt-larga/, 'mais de uma coluna de sanção: tabela na largura toda');
  assert.doesNotMatch(contexto.panRetratoSecao(contexto.panResumo(linhas.map((l) => ({ ...l, origem: 'DF' })), '2026-10'), 'DF|2026', 0), /pan-rt-larga/, 'coluna única: tabelas lado a lado');
});

test('Decisão de Indeferimento finalizada conta como caso finalizado e "Arquivado em"', () => {
  const linhas = [
    etapa(30, 'Denúncia Recebida', '01/06/2026', { origem: 'Denúncia', periodo: '2026', statusCaso: 'Em andamento' }),
    etapa(30, 'Decisão de Indeferimento', '10/06/2026', { origem: 'Denúncia', periodo: '2026', statusCaso: 'Em andamento' }),
  ];
  const r = contexto.panResumo(linhas, '2026-10');
  assert.equal(r.casos.finalizados, 1);
  const rt = contexto.panRetrato(r, new Date(2026, 10, 6).getTime());
  assert.equal(rt.linhas[0].situacaoLabel, 'Arquivado em 10/06');
  assert.equal(rt.linhas[0].sancaoTexto, 'Arquivado');
});

test('retrato: turma só aparece quando o acórdão já está em curso', () => {
  const e = (caso, nome, data, extra = {}) => ({ casoRaiz: String(caso), etapa: nome, dataEnvio: data, statusEtapa: 'Finalizado', statusCaso: 'Em andamento',
    clube: `Clube ${caso}`, origem: 'Denúncia', periodo: '2026', serie: 'B', denunciante: `Atleta ${caso}`, sancao: null, turma: null, etapa_banco_id: `${caso}-${nome}`, ...extra });
  const linhas = [
    // 1: parecer pendente, acórdão "Aguardando etapa anterior" com turma já cadastrada → sem turma
    e(1, 'Parecer Técnico Conclusivo', '18/08/2026', { statusEtapa: 'Pendente ANRESF' }),
    e(1, 'Acórdão - PSO', '09/09/2026', { statusEtapa: 'Aguardando etapa anterior', turma: 'Turma 02' }),
    // 2: acórdão em pauta (pendente, não "aguardando") → turma aparece
    e(2, 'Parecer Técnico Conclusivo', '18/08/2026'),
    e(2, 'Acórdão - PSO', '20/11/2026', { statusEtapa: 'Pendente ANRESF', turma: 'Turma 01' }),
    // 3: julgado → turma aparece
    e(3, 'Acórdão - PSO', '08/08/2026', { sancao: 'Advertência', turma: 'Turma 01', statusCaso: 'Finalizado' }),
  ];
  const r = contexto.panResumo(linhas, '2026-11');
  const rt = contexto.panRetrato(r, new Date(2026, 10, 9).getTime());
  const por = Object.fromEntries(rt.linhas.map((l) => [l.caso, l]));
  assert.equal(por['1'].situacaoLabel, 'Parecer técnico pendente');
  assert.equal(por['1'].turma, '');
  assert.equal(por['2'].situacaoLabel, 'Em pauta em 20/11');
  assert.equal(por['2'].turma, 'Turma 01');
  assert.equal(por['3'].turma, 'Turma 01');
});

// ---------- tempo dos casos ----------

const HOJE = new Date(2026, 10, 16).getTime(); // 16/11/2026
const tempos = (linhas, corte = '2026-12') => contexto.panTempos(contexto.panResumo(linhas, corte), linhas, HOJE);
const doCaso = (t, caso) => Array.from(t.itens).find((i) => i.caso === String(caso));

test('tempo do caso: da primeira à última data das etapas', () => {
  const linhas = [
    etapa(7, 'Auto de Infração - PSS', '15/06/2026'),
    etapa(7, 'Parecer Técnico', '', { dataEtapa: '10/06/2026' }), // sem envio: vale a data da etapa
    etapa(7, 'Acórdão - PSS', '05/07/2026'),
    etapa(7, 'Acompanhamento', ''),                                // etapa sem data não atrapalha
  ];
  const c = doCaso(tempos(linhas), 7);
  assert.equal(contexto.panDataBrDeMs(c.inicio), '10/06/2026');
  assert.equal(contexto.panDataBrDeMs(c.fim), '05/07/2026');
  assert.equal(c.dias, 25);
  assert.equal(c.datas, 3);
});

test('tempo do caso: só datas de etapas; tarefas, prazo, cadastro e datas futuras não contam', () => {
  const linhas = [
    etapa(7, 'Auto de Infração - PSS', '15/06/2026', { prazoFinal: '30/11/2026', created_at: '2026-01-01T10:00:00Z' }),
    etapa(7, 'Acórdão - PSS', '05/07/2026', { prazoFinal: '31/12/2026' }),
    etapa(7, 'Ofício', '20/12/2026'), // data depois de hoje (16/11/2026)
  ];
  const c = doCaso(tempos(linhas), 7);
  assert.equal(contexto.panDataBrDeMs(c.inicio), '15/06/2026', 'cadastro não conta');
  assert.equal(contexto.panDataBrDeMs(c.fim), '05/07/2026', 'prazo e data futura não contam');
  assert.equal(c.dias, 20);
  // O cálculo nem recebe as tarefas: não há como uma data de tarefa entrar.
  assert.equal(contexto.panTempos.length, 3);
  assert.equal(typeof contexto.panTarefasPorCaso, 'undefined');
});

test('tempo médio usa só os finalizados; em andamento conta até hoje, à parte', () => {
  const linhas = [
    etapa(1, 'Auto de Infração - PSO', '01/06/2026'), etapa(1, 'Acórdão - PSO', '11/06/2026'),   // 10 dias
    etapa(2, 'Auto de Infração - PSO', '01/06/2026'), etapa(2, 'Acórdão - PSO', '01/07/2026'),   // 30 dias
    etapa(3, 'Auto de Infração - PSO', '01/06/2026', { serie: 'B' }), etapa(3, 'Acórdão - PSO', '31/08/2026', { serie: 'B' }), // 91 dias
    etapa(4, 'Auto de Infração - PSO', '17/10/2026', { statusCaso: 'Em andamento' }),             // aberto há 30 dias
    etapa(5, 'Acompanhamento', '', {}),                                                           // finalizado sem data
  ];
  const t = tempos(linhas);
  assert.equal(t.finalizados.casos, 3);
  assert.equal(Math.round(t.finalizados.media * 100) / 100, 43.67);
  assert.equal(t.finalizados.mediana, 30);
  assert.equal(t.finalizados.maisRapido.caso, '1');
  assert.equal(t.finalizados.maisLongo.caso, '3');
  assert.equal(t.finalizados.semDatas, 1);
  assert.equal(doCaso(t, 5).dias, null);
  assert.equal(t.andamento.casos, 1);
  assert.equal(t.andamento.media, 30);
  assert.equal(doCaso(t, 4).finalizado, false);
  assert.deepEqual(Array.from(t.porSerie).map((g) => [g.nome, g.casos, g.media]), [['A', 2, 20], ['B', 1, 91]]);
});

test('tempo dos casos respeita o mês de corte', () => {
  const linhas = [
    etapa(1, 'Auto de Infração - PSO', '01/06/2026'), etapa(1, 'Acórdão - PSO', '11/06/2026'),
    etapa(2, 'Auto de Infração - PSO', '01/06/2026'), etapa(2, 'Acórdão - PSO', '20/09/2026'),
  ];
  // Em julho o caso 2 ainda não tinha terminado: conta como em andamento até 31/07.
  const t = tempos(linhas, '2026-07');
  assert.equal(t.finalizados.casos, 1);
  assert.equal(t.finalizados.media, 10);
  assert.equal(doCaso(t, 2).finalizado, false);
  assert.equal(doCaso(t, 2).dias, 60, 'de 01/06 a 31/07');
  assert.equal(contexto.panDataBrDeMs(t.referencia), '31/07/2026');
});

test('comparação caso a caso: visão e ordem', () => {
  const linhas = [
    etapa(1, 'Auto de Infração - PSO', '01/07/2026'), etapa(1, 'Acórdão - PSO', '11/07/2026'),
    etapa(2, 'Auto de Infração - PSO', '01/06/2026'), etapa(2, 'Acórdão - PSO', '01/08/2026'),
    etapa(4, 'Auto de Infração - PSO', '17/10/2026', { statusCaso: 'Em andamento' }),
  ];
  const t = tempos(linhas);
  const casos = (visao, ordem) => Array.from(contexto.panTempoLinhas(t, visao, ordem)).map((i) => i.caso);
  assert.deepEqual(casos('finalizados', 'maior'), ['2', '1']);
  assert.deepEqual(casos('finalizados', 'menor'), ['1', '2']);
  assert.deepEqual(casos('todos', 'inicio'), ['2', '1', '4']);
  assert.deepEqual(casos('todos', 'maior'), ['2', '4', '1']);
  assert.equal(contexto.panDias(1), '1 dia');
  assert.equal(contexto.panDias(43.67), '44 dias');
  assert.equal(contexto.panDias(null), '—');
  assert.equal(contexto.panMesesAprox(20), '');
  assert.equal(contexto.panMesesAprox(73), '≈ 2,4 meses');
});

// ---------- filtros do tempo dos casos ----------

function casosParaFiltro() {
  const caso = (n, serie, inicio, fim, extra = {}) => [
    etapa(n, 'Auto de Infração - PSO', inicio, { serie, sancao: 'Advertência', ...extra, ...(extra.auto || {}) }),
    etapa(n, 'Acórdão - PSO', fim, { serie, ...extra, ...(extra.acordao || {}) }),
  ];
  return [
    ...caso(1, 'A', '01/06/2026', '11/06/2026', { acordao: { sancao: 'Advertência', turma: 'Turma 01' } }),                    // 10 dias, com sanção
    ...caso(2, 'A', '01/06/2026', '01/07/2026', { acordao: { sancao: 'Arquivado', turma: 'Turma 02' } }),                       // 30 dias, sem sanção
    ...caso(3, 'B', '01/06/2026', '31/07/2026', { clube: 'Clube Z', acordao: { sancao: 'Advertência', turma: 'Turma 01' } }),   // 60 dias
    etapa(3, 'Admissão de Recurso', '10/08/2026', { serie: 'B', clube: 'Clube Z' }),                                           // recurso: estica para 70 dias
    etapa(4, 'Auto de Infração - PSS', '01/10/2026', { serie: 'B', statusCaso: 'Em andamento', sancao: 'Advertência' }),        // em andamento
    // Denúncia que não foi adiante: 4 dias, encerrada por indeferimento.
    etapa(5, 'Nota de Admissibilidade', '01/09/2026', { serie: 'C', origem: 'Denúncia' }),
    etapa(5, 'Decisão de Indeferimento', '05/09/2026', { serie: 'C', origem: 'Denúncia' }),
  ];
}
const baseFiltro = () => { const linhas = casosParaFiltro(); return contexto.panTempoItens(contexto.panResumo(linhas, '2026-12'), linhas, HOJE); };

test('filtros do tempo: em cada filtro dá para marcar várias opções; filtros diferentes se somam', () => {
  const base = baseFiltro();
  const casos = (filtros) => Array.from(contexto.panTempoFiltrar(base.itens, filtros)).map((i) => i.caso).sort();
  assert.deepEqual(casos({}), ['1', '2', '3', '4', '5']);
  assert.deepEqual(casos({ serie: ['A'] }), ['1', '2']);
  assert.deepEqual(casos({ serie: ['A', 'C'] }), ['1', '2', '5'], 'A ou C');
  assert.deepEqual(casos({ serie: ['A', 'B', 'C'] }), ['1', '2', '3', '4', '5']);
  assert.deepEqual(casos({ sancao: ['Com sanção aplicada'] }), ['1', '3']);
  assert.deepEqual(casos({ recurso: ['Com recurso'] }), ['3']);
  assert.deepEqual(casos({ clube: ['Clube Z', 'Clube 1'] }), ['1', '3']);
  assert.deepEqual(casos({ serie: ['A', 'B'], sancao: ['Com sanção aplicada'] }), ['1', '3'], '(A ou B) e com sanção');
  assert.deepEqual(casos({ serie: ['A'], recurso: ['Com recurso'] }), []);
  assert.deepEqual(casos({ serie: [] }), ['1', '2', '3', '4', '5'], 'lista vazia não filtra');
});

test('filtros do tempo: tirar os indeferidos mostra o tempo de quem foi admitido', () => {
  const base = baseFiltro();
  assert.deepEqual(Array.from(base.itens).filter((i) => i.indeferido).map((i) => i.caso), ['5']);
  const resumo = (filtros) => contexto.panTempoResumo(contexto.panTempoFiltrar(base.itens, filtros), base.referencia);
  const todos = resumo({});
  assert.equal(todos.finalizados.casos, 4);
  assert.equal(todos.finalizados.media, 28.5, '(10 + 30 + 70 + 4) / 4: o indeferido puxa para baixo');
  const admitidos = resumo({ admissao: ['Admitidos'] });
  assert.equal(admitidos.finalizados.casos, 3);
  assert.equal(Math.round(admitidos.finalizados.media * 100) / 100, 36.67, '(10 + 30 + 70) / 3');
  assert.equal(admitidos.andamento.casos, 1, 'caso em andamento não indeferido continua');
  const indeferidos = resumo({ admissao: ['Indeferidos'] });
  assert.equal(indeferidos.finalizados.casos, 1);
  assert.equal(indeferidos.finalizados.media, 4);
  // Indeferimento ainda não finalizado não tira o caso da conta dos admitidos.
  const pendente = [etapa(9, 'Nota de Admissibilidade', '01/09/2026'), etapa(9, 'Decisão de Indeferimento', '05/09/2026', { statusEtapa: 'Pendente ANRESF', statusCaso: 'Em andamento' })];
  assert.equal(contexto.panTempoItens(contexto.panResumo(pendente, '2026-12'), pendente, HOJE).itens[0].indeferido, false);
});

test('filtros do tempo: processo e turma julgadora saíram; os demais continuam', () => {
  const ids = vm.runInContext('PAN_TEMPO_FILTROS.map((f) => f.id)', contexto);
  assert.deepEqual(Array.from(ids), ['serie', 'origem', 'situacao', 'admissao', 'relator', 'sancao', 'recurso', 'clube']);
  assert.equal(contexto.panTempoResumo(baseFiltro().itens, HOJE).porTurma, undefined);
});

test('filtros do tempo: opções, contagens, marcar e desmarcar', () => {
  const base = baseFiltro();
  // `const` de um script não vira propriedade do contexto: lê pelo próprio contexto.
  const filtro = (id) => vm.runInContext('PAN_TEMPO_FILTROS', contexto).find((f) => f.id === id);
  const opcoes = (id, filtros) => Array.from(contexto.panTempoOpcoes(base.itens, filtros, filtro(id))).map((o) => Array.from(o));
  assert.deepEqual(opcoes('serie', {}), [['A', 'Série A', 2], ['B', 'Série B', 2], ['C', 'Série C', 1]]);
  assert.deepEqual(opcoes('admissao', {}), [['Admitidos', 'Admitidos', 4], ['Indeferidos', 'Indeferidos', 1]]);
  // A contagem de um filtro olha os OUTROS filtros, não ele mesmo.
  assert.deepEqual(opcoes('serie', { serie: ['A'], admissao: ['Admitidos'] }), [['A', 'Série A', 2], ['B', 'Série B', 2], ['C', 'Série C', 0]]);
  const alternar = (f, id, v) => ({ ...contexto.panTempoAlternar(f, id, v) });
  let f = alternar({}, 'relator', 'Pedro');
  f = alternar(f, 'relator', 'Vantuil');
  assert.deepEqual(Array.from(f.relator), ['Pedro', 'Vantuil']);
  f = alternar(f, 'relator', 'Pedro');
  assert.deepEqual(Array.from(f.relator), ['Vantuil']);
  assert.deepEqual(alternar(f, 'relator', 'Vantuil'), {}, 'desmarcar a última tira o filtro');
  // Opção que não existe mais cai; marcar todas é o mesmo que não filtrar.
  const validos = contexto.panTempoFiltrosValidos(base.itens, { serie: ['A', 'Z'], clube: ['Clube Z'], admissao: ['Admitidos', 'Indeferidos'], recurso: ['Sumiu'] });
  assert.deepEqual(JSON.parse(JSON.stringify(validos)), { serie: ['A'], clube: ['Clube Z'] });
});

// --- Casos julgados no tempo dos casos ---------------------------------------
// "Julgado": os trâmites da Agência terminaram e o caso segue aberto só para
// acompanhar o cumprimento. Entra no tempo médio como os finalizados.
test('tempo médio inclui os casos julgados; em fase de recurso continua em andamento', () => {
  const linhas = [
    etapa(1, 'Auto de Infração - PSO', '01/06/2026'), etapa(1, 'Acórdão - PSO', '11/06/2026'),                                             // finalizado, 10 dias
    etapa(2, 'Auto de Infração - PSO', '01/06/2026', { statusCaso: 'Julgado' }), etapa(2, 'Acórdão - PSO', '21/07/2026', { statusCaso: 'Julgado' }), // julgado, 50 dias
    etapa(3, 'Auto de Infração - PSO', '17/10/2026', { statusCaso: 'Em fase de recurso' }),                                              // aberto há 30 dias
    etapa(4, 'Auto de Infração - PSO', '06/11/2026', { statusCaso: 'Em andamento' }),                                                    // aberto há 10 dias
  ];
  const t = tempos(linhas);
  assert.equal(t.finalizados.casos, 2);
  assert.equal(t.finalizados.julgados, 1);
  assert.equal(t.finalizados.media, 30, '(10 + 50) / 2');
  assert.equal(t.finalizados.maisLongo.caso, '2');
  const julgado = doCaso(t, 2);
  assert.equal(`${julgado.finalizado}/${julgado.julgado}/${julgado.concluido}/${julgado.situacao}/${julgado.dias}`, 'false/true/true/Julgado/50');
  assert.equal(contexto.panDataBrDeMs(julgado.fim), '21/07/2026', 'conta até a última etapa, não até hoje');
  assert.equal(t.andamento.casos, 2);
  assert.equal(t.andamento.media, 20);
  assert.equal(doCaso(t, 3).situacao, 'Em fase de recurso');
  assert.equal(doCaso(t, 3).concluido, false);
  assert.deepEqual(Array.from(contexto.panTempoLinhas(t, 'finalizados', 'maior')).map((i) => i.caso), ['2', '1']);
  assert.deepEqual(Array.from(contexto.panTempoLinhas(t, 'todos', 'maior')).map((i) => i.caso), ['2', '3', '1', '4']);
  // o filtro de situação separa finalizados de julgados
  const soJulgados = contexto.panTempoResumo(contexto.panTempoFiltrar(Array.from(t.itens), { situacao: ['Julgado'] }), t.referencia);
  assert.equal(`${soJulgados.finalizados.casos}/${soJulgados.finalizados.media}`, '1/50');
});

test('caso julgado respeita o mês de corte', () => {
  const linhas = [
    etapa(2, 'Auto de Infração - PSO', '01/06/2026', { statusCaso: 'Julgado' }), etapa(2, 'Acórdão - PSO', '20/09/2026', { statusCaso: 'Julgado' }),
  ];
  // Em julho o acórdão ainda não existia: o caso conta como em andamento.
  const emJulho = tempos(linhas, '2026-07');
  assert.equal(emJulho.finalizados.casos, 0);
  assert.equal(doCaso(emJulho, 2).concluido, false);
  assert.equal(doCaso(emJulho, 2).dias, 60);
  const emSetembro = tempos(linhas, '2026-09');
  assert.equal(emSetembro.finalizados.casos, 1);
  assert.equal(doCaso(emSetembro, 2).dias, 111);
});

test('nome do caso na comparação: denunciante x clube nas denúncias', () => {
  const linhas = [
    etapa(54, 'Denúncia', '01/06/2026', { origem: 'Denúncia', denunciante: 'Atleta Fulano', clube: 'Clube N' }), etapa(54, 'Acórdão - PSO', '11/06/2026', { origem: 'Denúncia', denunciante: 'Atleta Fulano', clube: 'Clube N' }),
    etapa(29, 'Auto de Infração - PSO', '01/06/2026', { clube: 'Clube M' }), etapa(29, 'Acórdão - PSO', '21/06/2026', { clube: 'Clube M' }),
  ];
  const t = tempos(linhas);
  assert.equal(contexto.panTempoRotuloCaso(doCaso(t, 29)), 'Caso 29 - Clube M');
  if (typeof contexto.parteCasoFluxograma === 'function') assert.equal(contexto.panTempoRotuloCaso(doCaso(t, 54)), 'Caso 54 - Atleta Fulano x Clube N');
  else assert.equal(contexto.panTempoRotuloCaso(doCaso(t, 54)), 'Caso 54 - Clube N', 'sem o Fluxograma carregado, cai para o clube');
});

// --- Indeferimento dado em Decisão da Presidência ----------------------------
test('decisão com sanção "Indeferido" marca o caso como indeferido no tempo dos casos', () => {
  const den = { origem: 'Denúncia' };
  const linhas = [
    etapa(105, 'Denúncia', '01/11/2026', den), etapa(105, 'Decisão da Presidência', '06/11/2026', { ...den, sancao: 'Indeferido' }),
    etapa(106, 'Denúncia', '01/11/2026', den), etapa(106, 'Decisão da Presidência', '10/11/2026', { ...den, sancao: 'Advertência' }),
    etapa(107, 'Denúncia', '01/11/2026', den), etapa(107, 'Decisão da Presidência', '10/11/2026', { ...den, sancao: 'Indeferido', statusEtapa: 'Pendente ANRESF' }),
    etapa(108, 'Acórdão - PSO', '01/10/2026', { sancao: 'Multa' }), etapa(108, 'Pedido de Reconsideração', '10/11/2026', { sancao: 'Indeferido' }),
    etapa(109, 'Denúncia', '01/11/2026', den), etapa(109, 'Decisão de Indeferimento', '03/11/2026', den),
  ];
  const t = tempos(linhas);
  const ind = (caso) => doCaso(t, caso).indeferido;
  assert.equal(ind(105), true, 'Decisão da Presidência finalizada com sanção Indeferido');
  assert.equal(ind(106), false, 'outra sanção não indefere');
  assert.equal(ind(107), false, 'decisão ainda não finalizada não indefere');
  assert.equal(ind(108), false, 'pedido de reconsideração indeferido não é caso indeferido');
  assert.equal(ind(109), true, 'a etapa Decisão de Indeferimento continua valendo');
  assert.equal(doCaso(t, 105).dias, 5);
  const soIndeferidos = contexto.panTempoFiltrar(Array.from(t.itens), { admissao: ['Indeferidos'] });
  assert.deepEqual(Array.from(soIndeferidos, (i) => i.caso).sort(), ['105', '109']);
  // "Indeferido" é desfecho sem sanção, não sanção aplicada
  assert.equal(contexto.ehSancaoEfetiva('Indeferido'), false);
  assert.equal(doCaso(t, 105).comSancao, false);
  assert.equal(contexto.ehSancaoEfetiva('Advertência'), true);
});

// ---------- período: "Dados de" + "Dados até" ----------

test('mês inicial: começo do mês e texto do período', () => {
  assert.equal(contexto.panInicioDoMes('2026-07'), new Date(2026, 6, 1).getTime());
  assert.equal(contexto.panInicioDoMes(''), 0, 'vazio = desde o início');
  assert.equal(contexto.panInicioDoMes('julho'), 0);
  assert.equal(contexto.panPeriodoTexto('2026-08', ''), 'até ago/2026');
  assert.equal(contexto.panPeriodoTexto('2026-08', '2026-07'), 'de jul/2026 a ago/2026');
});

test('sem mês inicial o resumo é o de sempre', () => {
  const antes = contexto.panResumo(rows, '2026-08');
  const vazio = contexto.panResumo(rows, '2026-08', '');
  assert.equal(vazio.inicio, '');
  assert.equal(`${vazio.casos.total}/${vazio.autos}/${vazio.decisoes}/${vazio.sancoesAplicadas}`, `${antes.casos.total}/${antes.autos}/${antes.decisoes}/${antes.sancoesAplicadas}`);
});

test('período de julho a agosto: conta o que aconteceu dentro dele', () => {
  const r = contexto.panResumo(rows, '2026-08', '2026-07');
  assert.equal(r.inicio, '2026-07');
  assert.equal(r.casos.total, 2, 'casos 7 e 8 tiveram etapa no período; o 9 começa em setembro');
  assert.equal(r.autos, 1, 'o auto do caso 7 é de junho e fica de fora');
  assert.equal(r.listaAutos[0].casoRaiz, '8');
  assert.equal(r.decisoes, 2);
  assert.equal(r.sancoesAplicadas, 1, 'acórdão do caso 7, em julho');
  assert.equal(r.listaProcessos.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(r.linhaTempo)), [
    { chave: '2026-07', casos: 1, autos: 1, decisoes: 1, sancoes: 1 },
    { chave: '2026-08', casos: 0, autos: 0, decisoes: 1, sancoes: 0 },
  ], 'caso iniciado em junho não conta como iniciado no período');
  assert.equal(r.semData, 1, 'a etapa sem data é informada, mas não coloca nada no período');
});

test('período de um mês só: o caso entra com o histórico inteiro', () => {
  const r = contexto.panResumo(rows, '2026-08', '2026-08');
  assert.equal(r.casos.total, 1);
  assert.equal(r.listaCasos[0].caso, '8');
  assert.equal(r.listaCasos[0].rows.length, 2, 'o auto de julho continua no caso, para o tempo e o desfecho');
  assert.equal(r.autos, 0);
  assert.equal(r.decisoes, 1);
  assert.equal(r.sancoesAplicadas, 0);
  assert.equal(r.listaProcessos.length, 1, 'o processo entra pela decisão, mesmo com o auto antes do período');
  assert.equal(r.casos.finalizados, 1);
});

test('período de setembro a outubro: só o caso 9, com a decisão pendente', () => {
  const r = contexto.panResumo(rows, '2026-10', '2026-09');
  assert.equal(`${r.casos.total}/${r.autos}/${r.decisoes}/${r.decisoesPendentes}/${r.sancoesAplicadas}`, '1/1/0/1/0');
  assert.equal(r.casos.emAndamento, 1);
});

test('caso só com etapa sem data não entra num período', () => {
  const linhas = [etapa(30, 'Auto de Infração - PSS', ''), ...rows];
  assert.equal(contexto.panResumo(linhas, '2026-08').casos.total, 3, 'sem mês inicial ele entra, como sempre');
  assert.equal(contexto.panResumo(linhas, '2026-08', '2026-07').casos.total, 2);
  assert.equal(contexto.panResumo(linhas, '2026-08', '2026-07').autos, 1);
});

test('filtros: os dois meses, o botão "Desde o início" e a nota do período', () => {
  const semInicio = contexto.panFiltros(contexto.panResumo(rows, '2026-08'), []);
  assert.match(semInicio, /Dados de<\/span><input id="pan-inicio" type="month" value=""/);
  assert.match(semInicio, /Dados até<\/span><input id="pan-corte"/);
  assert.doesNotMatch(semInicio, /pan-inicio-limpar/);
  assert.match(semInicio, /1 etapa sem data foi incluída/);
  vm.runInContext("panInicio = '2026-07'; panCorte = '2026-08';", contexto);
  try {
    const html = contexto.panFiltros(contexto.panResumo(rows, '2026-08', '2026-07'), []);
    assert.match(html, /id="pan-inicio" type="month" value="2026-07" max="2026-08"/);
    assert.match(html, /id="pan-corte" type="month" value="2026-08" min="2026-07"/);
    assert.match(html, /id="pan-inicio-limpar"[^>]*>Desde o início</);
    assert.match(html, /Período de jul\/2026 a ago\/2026: autos, decisões e sanções contam pela data da etapa/);
    assert.match(html, /1 etapa sem data ficou de fora/);
    assert.match(contexto.panKpis(contexto.panResumo(rows, '2026-08', '2026-07')), /com etapa no período · 0 em andamento · 2 finalizados/);
  } finally {
    vm.runInContext("panInicio = ''; panCorte = panCortePadrao();", contexto);
  }
});
