const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Panorama › tempo dos casos › visão "Até o acórdão": processos iguais, da
// primeira etapa ao primeiro acórdão, agrupados por rito (mesmas etapas).
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
for (const arquivo of ['js/panels/operacional.js', 'js/sancao-categorias.js', 'js/panels/panorama.js', 'js/panels/panorama-ritos.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);

const HOJE = new Date(2026, 10, 25).getTime(); // 25/11/2026
let ordem = 1;
const e = (caso, nome, data, extra = {}) => ({
  casoRaiz: String(caso), etapa: nome, dataEnvio: data, ordem: ordem++, statusEtapa: 'Finalizado', statusCaso: 'Finalizado',
  clube: `Clube ${caso}`, origem: 'Solvência', serie: 'A', sancao: null, turma: null, etapa_banco_id: `${caso}-${ordem}`, ...extra,
});
const ordinario = (caso, datas, extra = {}) => ['Auto de Infração - PSO', 'Parecer Técnico Conclusivo', 'Despacho de Distribuição', 'Despacho do Relator', 'Acórdão - PSO'].map((nome, i) => e(caso, nome, datas[i], extra));
const ritos = (linhas, corte = '2026-12') => {
  const base = contexto.panTempoItens(contexto.panResumo(linhas, corte), linhas, HOJE);
  return contexto.panRitos(Array.from(base.itens), base.referencia);
};
const grupo = (r, nome) => Array.from(r.grupos).find((g) => g.nome === nome);
const j = (v) => JSON.parse(JSON.stringify(v));

test('tipo da etapa: PSS e PSO juntos; acórdão da Presidência é acórdão', () => {
  assert.equal(contexto.panRitoTipo('Auto de Infração - PSO'), 'auto-de-infracao');
  assert.equal(contexto.panRitoTipo('Auto de Infração'), 'auto-de-infracao');
  assert.equal(contexto.panRitoTipo('Acórdão - PSS'), 'acordao');
  assert.equal(contexto.panRitoTipo('Acórdão Decisão da Presidência'), 'acordao');
  assert.equal(contexto.panRitoTipo('Parecer Técnico Conclusivo - Complementar'), 'parecer-tecnico-conclusivo');
  assert.equal(contexto.panRitoCurto('etapa-nova', 'Etapa Nova - X'), 'Etapa Nova');
});

test('rito ordinário: para no acórdão e abre o tempo por trecho', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '16/06/2026', '18/06/2026', '01/07/2026']),             // 30 dias
    ...ordinario(2, ['01/06/2026', '21/06/2026', '26/06/2026', '30/06/2026', '31/07/2026']),             // 60 dias
    // o recurso e o cumprimento vêm depois do acórdão e não entram na conta
    e(2, 'Admissão de Recurso', '10/08/2026'), e(2, 'Plenário - Recursal', '20/09/2026'), e(2, 'Ordem de Cumprimento', '01/11/2026'),
    // omissão: mesmo rito, mesmo grupo (Auto de Infração sem PSS/PSO)
    e(3, 'Auto de Infração', '01/08/2026', { origem: 'Omissão Solvência' }), e(3, 'Parecer Técnico Conclusivo', '11/08/2026'), e(3, 'Despacho de Distribuição', '13/08/2026'), e(3, 'Despacho do Relator', '15/08/2026'), e(3, 'Acórdão - PSO', '31/08/2026'), // 30 dias
  ];
  const r = ritos(linhas);
  assert.equal(r.grupos.length, 1);
  const g = r.grupos[0];
  assert.equal(g.nome, 'Ordinário');
  assert.deepEqual(j(g.etapas), ['Auto', 'Parecer', 'Distribuição', 'Relator', 'Acórdão']);
  assert.equal(g.processos.length, 3);
  assert.equal(g.media, 40);
  assert.equal(g.mediana, 30);
  assert.equal(`${g.maisRapido.total}/${g.maisLongo.total}/${g.maisLongo.caso}`, '30/60/2');
  assert.deepEqual(j(Array.from(g.trechos, (t) => `${t.rotulo}:${t.media}`)), ['Auto → Parecer:' + (10 + 20 + 10) / 3, 'Parecer → Distribuição:4', 'Distribuição → Relator:' + (2 + 4 + 2) / 3, 'Relator → Acórdão:' + (13 + 31 + 16) / 3]);
  assert.equal(g.proprio, false);
  assert.deepEqual(j(g.processos.find((p) => p.caso === '2').trechos), [20, 5, 4, 31]);
  assert.equal(r.andamento.length, 0);
});

test('ritos diferentes não se misturam; sequência única vai para "outras"', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '16/06/2026', '18/06/2026', '01/07/2026']),
    ...ordinario(2, ['01/06/2026', '11/06/2026', '16/06/2026', '18/06/2026', '11/07/2026']),
    e(3, 'Auto de Infração - PSS', '01/06/2026'), e(3, 'Acórdão - PSS', '06/06/2026'),
    e(4, 'Auto de Infração - PSS', '01/06/2026'), e(4, 'Acórdão - PSS', '16/06/2026'),
    e(5, 'Diligência', '01/05/2026', { origem: 'Monitoramento' }), e(5, 'Auto de Infração - PSS', '01/06/2026'), e(5, 'Acórdão - PSS', '11/06/2026'),
  ];
  const r = ritos(linhas);
  assert.deepEqual(Array.from(r.grupos, (g) => `${g.nome}:${g.processos.length}:${g.media}`), ['Ordinário:2:35', 'Sumário:2:10']);
  assert.deepEqual(Array.from(r.outros, (p) => `${p.caso}:${p.total}:${p.assinatura}`), ['5:41:diligencia|auto-de-infracao|acordao']);
  assert.equal(r.processos, 5);
});

test('denúncia: com acórdão, encerrada pela Presidência e indeferida', () => {
  const den = { origem: 'Denúncia' };
  const comAcordao = (caso, fim) => ['Denúncia Recebida', 'Nota de Admissibilidade', 'Denúncia', 'Parecer Técnico Conclusivo', 'Despacho de Distribuição', 'Despacho do Relator', 'Acórdão - PSO'].map((nome, i) => e(caso, nome, i === 6 ? fim : `0${i + 1}/09/2026`, den));
  const presidencia = (caso, fim, extra = {}) => ['Denúncia Recebida', 'Nota de Admissibilidade', 'Denúncia', 'Parecer Técnico Conclusivo', 'Decisão da Presidência'].map((nome, i) => e(caso, nome, i === 4 ? fim : `0${i + 1}/09/2026`, { ...den, ...extra }));
  const linhas = [
    ...comAcordao(1, '01/10/2026'), ...comAcordao(2, '21/10/2026'),
    ...presidencia(3, '11/09/2026'), ...presidencia(4, '21/09/2026'),
    // caso ainda aberto parado na Decisão da Presidência: não é fim de processo
    ...presidencia(5, '11/09/2026', { statusCaso: 'Em andamento' }),
    e(6, 'Denúncia Recebida', '01/11/2026', den), e(6, 'Decisão de Indeferimento', '04/11/2026', den),
    e(7, 'Denúncia Recebida', '01/11/2026', den), e(7, 'Decisão de Indeferimento', '08/11/2026', den),
  ];
  const r = ritos(linhas);
  assert.deepEqual(Array.from(r.grupos, (g) => `${g.nome}:${g.processos.length}:${g.media}`).sort(), ['Denúncia encerrada pela Presidência:2:15', 'Denúncia indeferida:2:5', 'Denúncia:2:40']);
  assert.deepEqual(Array.from(r.andamento, (p) => `${p.caso}:${p.etapaAtual}`), ['5:Decisão da Presidência']);
});

test('em andamento: sem acórdão finalizado, fica à parte e fora das médias', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '16/06/2026', '18/06/2026', '01/07/2026']),
    ...ordinario(2, ['01/06/2026', '11/06/2026', '16/06/2026', '18/06/2026', '01/07/2026']),
    // acórdão cadastrado, mas ainda não finalizado
    ...ordinario(3, ['26/10/2026', '05/11/2026', '10/11/2026', '12/11/2026', '20/11/2026'], { statusCaso: 'Em andamento' }).map((row, i) => (i === 4 ? { ...row, statusEtapa: 'Pendente ANRESF' } : row)),
    // parou no parecer
    e(4, 'Auto de Infração - PSO', '15/11/2026', { statusCaso: 'Em andamento' }), e(4, 'Parecer Técnico Conclusivo', '20/11/2026', { statusCaso: 'Em andamento', statusEtapa: 'Pendente ANRESF' }),
    // evento de insolvência não termina em acórdão: não entra na fila
    e(5, 'Evento de Insolvência', '01/10/2026', { statusCaso: 'Em andamento', origem: 'Evento de Insolvência' }),
  ];
  const r = ritos(linhas);
  assert.equal(r.grupos[0].processos.length, 2);
  assert.deepEqual(Array.from(r.andamento, (p) => `${p.caso}:${p.dias}:${p.etapaAtual}`), ['3:30:Acórdão - PSO', '4:10:Parecer Técnico Conclusivo']);
});

test('dois processos no mesmo caso: novo Auto depois do acórdão abre outro', () => {
  const linhas = [
    e(1, 'Auto de Infração - PSS', '01/06/2026', { statusCaso: 'Em andamento' }), e(1, 'Acórdão - PSS', '11/06/2026', { statusCaso: 'Em andamento' }),
    e(1, 'Certificação de Descumprimento', '01/08/2026'), e(1, 'Ordem de Cumprimento', '10/08/2026'),
    e(1, 'Auto de Infração - PSO', '01/11/2026'), e(1, 'Parecer Técnico Conclusivo', '10/11/2026', { statusEtapa: 'Pendente ANRESF' }),
    e(2, 'Auto de Infração - PSS', '01/06/2026'), e(2, 'Acórdão - PSS', '21/06/2026'),
  ];
  const r = ritos(linhas);
  const sumario = grupo(r, 'Sumário');
  assert.deepEqual(Array.from(sumario.processos, (p) => `${p.caso}:${p.total}:${p.indice + 1}/${p.totalDoCaso}`).sort(), ['1:10:1/2', '2:20:1/1']);
  assert.deepEqual(Array.from(r.andamento, (p) => `${p.caso}:${p.indice + 1}:${p.assinatura}:${p.dias}`), ['1:2:auto-de-infracao|parecer-tecnico-conclusivo:24']);
  assert.equal(contexto.panRitoRotuloProcesso(sumario.processos.find((p) => p.caso === '1')), 'Caso 1 - Clube 1 (1º processo)');
});

test('etapas seguidas do mesmo tipo contam como uma; corte de mês e datas faltando', () => {
  const linhas = [
    e(1, 'Auto de Infração - PSO', '01/06/2026'), e(1, 'Auto de Infração - PSO', '03/06/2026'), e(1, 'Acórdão - PSO', '11/06/2026'),
    e(2, 'Auto de Infração - PSO', '01/06/2026'), e(2, 'Acórdão - PSO', '20/09/2026'),
    e(3, 'Auto de Infração - PSO', ''), e(3, 'Acórdão - PSO', '20/06/2026'),
  ];
  const r = ritos(linhas);
  const sumario = grupo(r, 'Sumário');
  assert.deepEqual(Array.from(sumario.processos, (p) => `${p.caso}:${p.total}`).sort(), ['1:10', '2:111']);
  assert.equal(r.semData, 1, 'sem data na primeira etapa não entra na média');
  // em julho o acórdão do caso 2 ainda não existia
  const emJulho = ritos(linhas, '2026-07');
  assert.equal(emJulho.grupos.length, 0, 'só um processo julgado até julho: não forma grupo');
  assert.deepEqual(Array.from(emJulho.outros, (p) => p.caso), ['1']);
});

test('tela: tabela de ritos, trechos e processos; caso finalizado sem acórdão fica de fora', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '16/06/2026', '18/06/2026', '01/07/2026']),
    ...ordinario(2, ['01/06/2026', '21/06/2026', '26/06/2026', '30/06/2026', '31/07/2026']),
    e(9, 'Diligência', '01/06/2026', { origem: 'Monitoramento' }), e(9, 'Nota Técnica', '10/06/2026', { origem: 'Monitoramento' }),
  ];
  const base = contexto.panTempoItens(contexto.panResumo(linhas, '2026-12'), linhas, HOJE);
  const html = contexto.panRitosHtml(Array.from(base.itens), base.referencia);
  assert.match(html, /data-pan-rito="auto-de-infracao\|parecer-tecnico-conclusivo\|despacho-de-distribuicao\|despacho-do-relator\|acordao"/);
  assert.match(html, /Ordinário · onde o tempo é gasto/);
  assert.match(html, /Auto → Parecer/);
  assert.match(html, /Caso 2 - Clube 2/);
  assert.match(html, /1 processo de caso encerrado sem acórdão ficou de fora\./);
  assert.doesNotMatch(html, /Em andamento até o acórdão/);
});

// --- Trechos próprios da Denúncia --------------------------------------------
// Só dois trechos, medidos pela data de envio; sem envio, vale o início da
// etapa seguinte indicada pela equipe.
test('denúncia: Recebida até Admissibilidade e Denúncia até Parecer, pela data de envio', () => {
  const den = { origem: 'Denúncia' };
  const caso = (n, envioAdm, envioParecer, extra = {}) => [
    e(n, 'Denúncia Recebida', '01/09/2026', den),
    e(n, 'Nota de Admissibilidade', '03/09/2026', { ...den, enviadaEm: envioAdm }),
    e(n, 'Denúncia', '10/09/2026', den),
    e(n, 'Parecer Técnico Conclusivo', '20/09/2026', { ...den, enviadaEm: envioParecer }),
    e(n, 'Despacho de Distribuição', '05/10/2026', den),
    e(n, 'Despacho do Relator', '08/10/2026', den),
    e(n, 'Acórdão - PSO', '31/10/2026', { ...den, ...extra }),
  ];
  const linhas = [
    ...caso(1, '06/09/2026', '30/09/2026'),   // com as duas datas de envio
    ...caso(2, null, null),                    // sem envio: vale o padrão
    ...caso(3, '2026-09-08', ''),              // envio só na admissibilidade (data ISO)
  ];
  const r = ritos(linhas);
  const g = grupo(r, 'Denúncia');
  assert.equal(g.proprio, true);
  assert.deepEqual(j(Array.from(g.trechos, (t) => t.rotulo)), ['Recebida até Admissibilidade', 'Denúncia até Parecer']);
  const de = (n) => g.processos.find((p) => p.caso === String(n));
  // caso 1: 01/09 → envio 06/09 = 5; parecer 20/09 → envio 30/09 = 10
  assert.deepEqual(j(de(1).trechos), [5, 10]);
  assert.deepEqual(j(de(1).fontesTrechos), ['envio', 'envio']);
  // caso 2: 01/09 → início da Denúncia 10/09 = 9; parecer 20/09 → início da Distribuição 05/10 = 15
  assert.deepEqual(j(de(2).trechos), [9, 15]);
  assert.deepEqual(j(de(2).fontesTrechos), ['padrao', 'padrao']);
  // caso 3: envio da admissibilidade em 08/09 = 7; parecer pelo padrão = 15
  assert.deepEqual(j(de(3).trechos), [7, 15]);
  assert.deepEqual(j(de(3).fontesTrechos), ['envio', 'padrao']);
  assert.deepEqual(j(Array.from(g.trechos, (t) => `${t.media}/${t.semEnvio}`)), ['7/1', `${40 / 3}/2`]);
  // o prazo final continua sendo o tempo todo, da primeira etapa ao acórdão
  assert.deepEqual(Array.from(g.processos, (p) => p.total), [60, 60, 60]);

  const base = contexto.panTempoItens(contexto.panResumo(linhas, '2026-12'), linhas, HOJE);
  vm.runInContext("panRitoSelecionado = ''", contexto);
  const html = contexto.panRitosHtml(Array.from(base.itens), base.referencia);
  assert.match(html, />Recebida até Admissibilidade<\/th>/);
  assert.match(html, />Denúncia até Parecer<\/th>/);
  assert.match(html, />Prazo final<\/th>/);
  assert.doesNotMatch(html, /Admissibilidade → Denúncia<\/th>|Relator → Acórdão<\/th>|>Total<\/th>/);
  assert.match(html, /9<span class="pan-rito-marca">\*<\/span>/);
  assert.match(html, /Etapa sem data de envio: o trecho foi contado até o início da etapa seguinte\./);
  assert.doesNotMatch(html, /% do tempo/);
});

test('denúncia: envio incoerente ou etapa faltando não inventa número', () => {
  const den = { origem: 'Denúncia', statusCaso: 'Finalizado' };
  const presidencia = (n, envioAdm, envioParecer) => [
    e(n, 'Denúncia Recebida', '01/09/2026', den),
    e(n, 'Nota de Admissibilidade', '03/09/2026', { ...den, enviadaEm: envioAdm }),
    e(n, 'Denúncia', '10/09/2026', den),
    e(n, 'Parecer Técnico Conclusivo', '20/09/2026', { ...den, enviadaEm: envioParecer }),
    e(n, 'Decisão da Presidência', '28/09/2026', den),
  ];
  const linhas = [
    ...presidencia(1, '25/08/2026', null),   // envio anterior ao início: trecho sem número
    ...presidencia(2, null, '24/09/2026'),
    // denúncia indeferida não tem admissibilidade: segue com os trechos comuns
    e(3, 'Denúncia Recebida', '01/11/2026', den), e(3, 'Decisão de Indeferimento', '04/11/2026', den),
    e(4, 'Denúncia Recebida', '01/11/2026', den), e(4, 'Decisão de Indeferimento', '08/11/2026', den),
  ];
  const r = ritos(linhas);
  const pres = grupo(r, 'Denúncia encerrada pela Presidência');
  const de = (n) => pres.processos.find((p) => p.caso === String(n));
  assert.equal(pres.proprio, true);
  assert.deepEqual(j(de(1).trechos), [null, 8], 'sem Distribuição, o padrão vai até a etapa seguinte ao parecer (28/09)');
  assert.deepEqual(j(de(2).trechos), [9, 4]);
  assert.equal(pres.trechos[0].casos, 1, 'o trecho sem número não entra na média');
  const indeferida = grupo(r, 'Denúncia indeferida');
  assert.equal(indeferida.proprio, false);
  assert.deepEqual(j(Array.from(indeferida.trechos, (t) => `${t.rotulo}:${t.media}`)), ['Recebida → Indeferimento:5']);
});
