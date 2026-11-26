const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Panorama › tempo dos casos › visão "Por tipo de caso": até a decisão, depois
// da decisão, caso inteiro e o tempo de cada fase, por tipo de caso (origem).
const semAcento = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  normStatus: (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  dadosFluxograma: [],
};
vm.createContext(contexto);
contexto.tipoBaseEtapa = (nome) => contexto.normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]);
for (const arquivo of ['js/panels/operacional.js', 'js/sancao-categorias.js', 'js/panels/panorama.js', 'js/panels/panorama-ritos.js', 'js/panels/panorama-prazos.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);

const HOJE = new Date(2026, 10, 25).getTime(); // 25/11/2026
let ordem = 1;
const e = (caso, nome, data, extra = {}) => ({
  casoRaiz: String(caso), etapa: nome, dataEnvio: data, ordem: ordem++, statusEtapa: 'Finalizado', statusCaso: 'Finalizado',
  clube: `Clube ${caso}`, origem: 'Solvência', serie: 'A', sancao: null, turma: null, etapa_banco_id: `${caso}-${ordem}`, ...extra,
});
const NOMES_PSO = ['Auto de Infração - PSO', 'Parecer Técnico Conclusivo', 'Despacho de Distribuição', 'Despacho do Relator', 'Acórdão - PSO'];
// `envioAuto` é a data de envio da etapa do Auto: a entrega da defesa.
const ordinario = (caso, datas, extra = {}, envioAuto = '') => NOMES_PSO.map((nome, i) => e(caso, nome, datas[i], i === 0 && envioAuto ? { ...extra, enviadaEm: envioAuto } : extra));
const NOMES_DEN = ['Denúncia Recebida', 'Nota de Admissibilidade', 'Denúncia', 'Parecer Técnico Conclusivo', 'Despacho de Distribuição', 'Despacho do Relator', 'Acórdão - PSO'];
const denuncia = (caso, datas, extra = {}, envioDenuncia = '') => NOMES_DEN.map((nome, i) => e(caso, nome, datas[i], { origem: 'Denúncia', ...(i === 2 && envioDenuncia ? { enviadaEm: envioDenuncia } : {}), ...extra }));
const prazos = (linhas, corte = '2026-12') => {
  const base = contexto.panTempoItens(contexto.panResumo(linhas, corte), linhas, HOJE);
  return contexto.panPrazos(Array.from(base.itens), base.referencia);
};
const j = (v) => JSON.parse(JSON.stringify(v));
const tipo = (r, nome) => Array.from(r.tipos).find((t) => t.nome === nome);
const caminho = (t, id) => Array.from(t.caminhos).find((c) => c.id === id);
const processo = (c, caso) => Array.from(c.processos).find((p) => p.caso === String(caso));

test('Auto com distribuição: três fases; a defesa é o início do Parecer, mesmo com data de envio no Auto', () => {
  const linhas = [
    // Auto 01/06, Parecer 11/06, distribuição 21/06, acórdão 01/07; o envio do Auto (08/06) não entra
    ...ordinario(1, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '01/07/2026'], {}, '08/06/2026'),
  ];
  const t = tipo(prazos(linhas), 'Solvência');
  const c = caminho(t, 'auto-dist');
  assert.equal(c.nome, 'Com distribuição à Turma');
  assert.deepEqual(j(c.fases.map((f) => `${f.rotulo} (${f.quem})`)), ['Auto até a defesa (com o clube)', 'Defesa até o parecer (Unidade Técnica e Presidência)', 'Parecer até a decisão (Turma)']);
  const p = processo(c, 1);
  assert.deepEqual(j(p.fases), [10, 10, 10]);
  assert.equal(p.total, 30);
  assert.equal(p.defesaFonte, 'parecer');
  assert.equal(p.completo, true);
});

test('sem data de envio no Auto dá o mesmo resultado', () => {
  const linhas = [...ordinario(1, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '01/07/2026'])];
  const c = caminho(tipo(prazos(linhas), 'Solvência'), 'auto-dist');
  const p = processo(c, 1);
  assert.deepEqual(j(p.fases), [10, 10, 10]);
  assert.equal(p.defesaFonte, 'parecer');
});

test('data de envio fora de ordem no Auto também não muda nada', () => {
  const linhas = [...ordinario(1, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '01/07/2026'], {}, '28/06/2026')];
  const p = processo(caminho(tipo(prazos(linhas), 'Solvência'), 'auto-dist'), 1);
  assert.equal(p.defesaFonte, 'parecer');
  assert.deepEqual(j(p.fases), [10, 10, 10]);
});

test('Auto sem Parecer nem distribuição: duas fases, com a defesa pela data de envio; sem ela, só o total', () => {
  const linhas = [
    e(1, 'Auto de Infração - PSS', '01/06/2026', { origem: 'DF', enviadaEm: '05/06/2026' }), e(1, 'Acórdão - PSS', '15/06/2026', { origem: 'DF' }),
    e(2, 'Auto de Infração - PSS', '01/06/2026', { origem: 'DF' }), e(2, 'Acórdão - PSS', '11/06/2026', { origem: 'DF' }),
  ];
  const t = tipo(prazos(linhas), 'DF');
  const c = caminho(t, 'auto-direto');
  assert.deepEqual(j(c.fases.map((f) => f.rotulo)), ['Auto até a defesa', 'Defesa até a decisão']);
  assert.deepEqual(j(processo(c, 1).fases), [4, 10]);
  assert.equal(processo(c, 2).completo, false);
  assert.equal(processo(c, 2).total, 10);
  assert.equal(c.incompletos, 1);
  // a barra "Todos" usa só o processo completo; o cartão usa os dois
  const todos = c.grupos[0];
  assert.equal(`${todos.processos}/${todos.completos}`, '2/1');
  assert.deepEqual(j(todos.fases), [4, 10]);
  assert.equal(todos.totalCompletos, 14);
  assert.equal(t.decisao.media, 12);
});

test('Denúncia: intimação até a defesa vai do início da Denúncia ao início do Parecer; defesa até o parecer, do Parecer à distribuição', () => {
  const linhas = [
    // recebida 01/09, intimação 05/09, Parecer 20/09, distribuição 01/10, acórdão 11/10; o envio da Denúncia (15/09) não entra
    ...denuncia(1, ['01/09/2026', '03/09/2026', '05/09/2026', '20/09/2026', '01/10/2026', '05/10/2026', '11/10/2026'], {}, '15/09/2026'),
    // sem envio: mesmas contas
    ...denuncia(2, ['01/09/2026', '03/09/2026', '05/09/2026', '20/09/2026', '01/10/2026', '05/10/2026', '11/10/2026']),
  ];
  const t = tipo(prazos(linhas), 'Denúncia');
  const c = caminho(t, 'den-dist');
  assert.deepEqual(j(c.fases.map((f) => f.rotulo)), ['Recebida até a intimação', 'Intimação até a defesa', 'Defesa até o parecer', 'Parecer até a decisão']);
  assert.deepEqual(j(processo(c, 1).fases), [4, 15, 11, 10]);
  assert.deepEqual(j(processo(c, 2).fases), [4, 15, 11, 10]);
  assert.equal(t.decisao.media, 40);
});

test('Denúncia indeferida antes da intimação fica num caminho sem fases', () => {
  const linhas = [
    ...denuncia(1, ['01/09/2026', '03/09/2026', '05/09/2026', '20/09/2026', '01/10/2026', '05/10/2026', '11/10/2026']),
    e(2, 'Denúncia Recebida', '01/09/2026', { origem: 'Denúncia' }), e(2, 'Decisão de Indeferimento', '09/09/2026', { origem: 'Denúncia' }),
    // encerrada pela Presidência depois do parecer: sem distribuição
    e(3, 'Denúncia Recebida', '01/09/2026', { origem: 'Denúncia' }), e(3, 'Nota de Admissibilidade', '02/09/2026', { origem: 'Denúncia' }), e(3, 'Denúncia', '03/09/2026', { origem: 'Denúncia' }),
    e(3, 'Parecer Técnico Conclusivo', '13/09/2026', { origem: 'Denúncia' }), e(3, 'Decisão da Presidência', '18/09/2026', { origem: 'Denúncia' }),
  ];
  const t = tipo(prazos(linhas), 'Denúncia');
  assert.deepEqual(j(t.caminhos.map((c) => `${c.id}:${c.processos.length}`)).sort(), ['den-direto:1', 'den-dist:1', 'den-sem-intimacao:1']);
  // caminhos com fases vêm antes do que só tem o total
  assert.equal(t.caminhos[t.caminhos.length - 1].id, 'den-sem-intimacao');
  assert.equal(caminho(t, 'den-sem-intimacao').fases.length, 0);
  assert.equal(processo(caminho(t, 'den-sem-intimacao'), 2).total, 8);
  assert.deepEqual(j(processo(caminho(t, 'den-direto'), 3).fases), [2, 10, 5]);
});

test('os três tempos: até a decisão, depois da decisão e caso inteiro', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '01/07/2026']),            // 30 até a decisão
    e(1, 'Admissão de Recurso', '11/07/2026'), e(1, 'Ordem de Cumprimento', '31/07/2026'),                // +30 depois
    ...ordinario(2, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '21/07/2026']),            // 50, sem nada depois
    // decidido, mas o caso segue aberto: entra só no "até a decisão"
    ...ordinario(3, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '11/07/2026'], { statusCaso: 'Em fase de recurso' }),
    e(3, 'Admissão de Recurso', '20/07/2026', { statusCaso: 'Em fase de recurso', statusEtapa: 'Pendente ANRESF' }),
  ];
  const t = tipo(prazos(linhas), 'Solvência');
  assert.equal(t.decisao.processos, 3);
  assert.equal(t.decisao.media, 40);
  assert.equal(`${t.decisao.menor}/${t.decisao.maior}/${t.decisao.mediana}`, '30/50/40');
  assert.equal(t.inteiro.casos, 2);
  assert.equal(t.inteiro.media, 55);          // (60 + 50) / 2
  assert.equal(t.depois.casos, 2);
  assert.equal(t.depois.media, 15);           // (30 + 0) / 2
  assert.equal(t.depois.ate, 40);             // 40 + 15 = 55
  assert.equal(t.abertos.length, 0);
});

test('processo sem decisão: onde está e há quanto tempo', () => {
  const aberto = { statusCaso: 'Em andamento' };
  const linhas = [
    // aguardando a defesa desde 15/11
    e(1, 'Auto de Infração - PSO', '15/11/2026', { ...aberto, statusEtapa: 'Pendente Clube' }),
    // Parecer iniciado em 12/11: a defesa já chegou
    e(2, 'Auto de Infração - PSO', '01/11/2026', { ...aberto, enviadaEm: '10/11/2026' }), e(2, 'Parecer Técnico Conclusivo', '12/11/2026', { ...aberto, statusEtapa: 'Pendente ANRESF' }),
    // distribuído em 20/11
    ...ordinario(3, ['01/10/2026', '15/10/2026', '20/11/2026', '22/11/2026', ''], aberto).slice(0, 4),
    // denúncia ainda em admissibilidade
    e(4, 'Denúncia Recebida', '20/11/2026', { ...aberto, origem: 'Denúncia', statusEtapa: 'Pendente ANRESF' }),
    // evento de insolvência não espera decisão
    e(5, 'Evento de Insolvência', '01/10/2026', { ...aberto, origem: 'Evento de Insolvência' }),
  ];
  const r = prazos(linhas);
  const abertos = Array.from(tipo(r, 'Solvência').abertos);
  const de = (caso) => abertos.find((p) => p.caso === String(caso));
  assert.equal(`${de(1).estado.rotulo}|${de(1).estado.quem}|${de(1).estado.dias}|${de(1).dias}`, 'Aguardando a defesa|com o clube|10|10');
  assert.equal(`${de(2).estado.rotulo}|${de(2).estado.dias}|${de(2).dias}`, 'Defesa entregue, em análise|13|24');
  assert.equal(`${de(3).estado.rotulo}|${de(3).estado.quem}|${de(3).estado.dias}|${de(3).dias}`, 'Distribuído, aguardando a decisão|Turma|5|55');
  // do mais antigo para o mais novo
  assert.deepEqual(j(abertos.map((p) => p.caso)), ['3', '2', '1']);
  assert.equal(tipo(r, 'Solvência').abertosMedia, (55 + 24 + 10) / 3);
  assert.equal(tipo(r, 'Denúncia').abertos[0].estado.rotulo, 'Recebida, em admissibilidade');
  assert.equal(tipo(r, 'Evento de Insolvência').abertos.length, 0);
  assert.equal(tipo(r, 'Solvência').decisao.processos, 0);
});

test('régua por período e por série, com a comparação entre períodos', () => {
  const p1 = { periodo: '2026/03/31' };
  const p2 = { periodo: '2026/06/30' };
  const linhas = [
    // 1º período: 10 + 40 + 10 = 60
    ...ordinario(1, ['01/04/2026', '11/04/2026', '21/05/2026', '25/05/2026', '31/05/2026'], { ...p1 }),
    ...ordinario(2, ['01/04/2026', '11/04/2026', '21/05/2026', '25/05/2026', '31/05/2026'], { ...p1, serie: 'B' }),
    // 2º período: 14 + 10 + 6 = 30
    ...ordinario(3, ['01/07/2026', '15/07/2026', '25/07/2026', '27/07/2026', '31/07/2026'], { ...p2 }),
    ...ordinario(4, ['01/07/2026', '15/07/2026', '25/07/2026', '27/07/2026', '31/07/2026'], { ...p2, serie: 'B' }),
  ];
  const c = caminho(tipo(prazos(linhas), 'Solvência'), 'auto-dist');
  assert.deepEqual(j(c.grupos.map((g) => `${g.grupo}|${g.nome}|${g.processos}|${g.totalCompletos}`)), [
    'todos|Todos|4|45', 'periodo|31/03/2026|2|60', 'periodo|30/06/2026|2|30', 'serie|Série A|2|45', 'serie|Série B|2|45',
  ]);
  assert.deepEqual(j(c.grupos[1].fases), [10, 40, 10]);
  assert.deepEqual(j(c.grupos[2].fases), [14, 10, 6]);
  assert.deepEqual(j(c.achado), { de: '31/03/2026', para: '30/06/2026', antes: 60, depois: 30, fase: 'Defesa até o parecer', faseAntes: 40, faseDepois: 10 });
});

test('um período só, ou diferença pequena, não gera comparação', () => {
  const linhas = [
    ...ordinario(1, ['01/04/2026', '11/04/2026', '21/04/2026', '25/04/2026', '01/05/2026'], { periodo: '2026/03/31' }),
    ...ordinario(2, ['01/04/2026', '11/04/2026', '21/04/2026', '25/04/2026', '01/05/2026'], { periodo: '2026/03/31' }),
  ];
  const c = caminho(tipo(prazos(linhas), 'Solvência'), 'auto-dist');
  assert.equal(c.achado, null);
  assert.deepEqual(j(c.grupos.map((g) => g.grupo)), ['todos']);
});

test('tipos ordenados pelo número de processos decididos; novo Auto abre outro processo', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '01/07/2026']),
    e(1, 'Auto de Infração - PSS', '01/08/2026'), e(1, 'Acórdão - PSS', '11/08/2026'),
    ...denuncia(2, ['01/09/2026', '03/09/2026', '05/09/2026', '20/09/2026', '01/10/2026', '05/10/2026', '11/10/2026']),
  ];
  const r = prazos(linhas);
  assert.deepEqual(j(r.tipos.map((t) => `${t.nome}:${t.decisao.processos}:${t.casos}`)), ['Solvência:2:1', 'Denúncia:1:1']);
  // o caso inteiro vai do primeiro Auto ao último acórdão; "depois" conta da PRIMEIRA decisão
  const t = tipo(r, 'Solvência');
  assert.equal(`${t.inteiro.media}/${t.depois.ate}/${t.depois.media}`, '71/30/41');
});

test('a tela: cartões, três tempos, régua, tabela e é a visão padrão do quadro', () => {
  const linhas = [
    ...ordinario(1, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '01/07/2026'], {}, '08/06/2026'),
    ...ordinario(2, ['01/06/2026', '11/06/2026', '21/06/2026', '25/06/2026', '11/07/2026']),
    e(3, 'Auto de Infração - PSO', '15/11/2026', { statusCaso: 'Em andamento', statusEtapa: 'Pendente Clube' }),
    ...denuncia(4, ['01/09/2026', '03/09/2026', '05/09/2026', '20/09/2026', '01/10/2026', '05/10/2026', '11/10/2026']),
  ];
  const base = contexto.panTempoItens(contexto.panResumo(linhas, '2026-12'), linhas, HOJE);
  const html = contexto.panPrazosHtml(Array.from(base.itens), base.referencia);
  assert.match(html, /data-pan-prazo-tipo="Solvência"[^>]*aria-pressed="true"/);
  assert.match(html, /data-pan-prazo-tipo="Denúncia"[^>]*aria-pressed="false"/);
  assert.match(html, /poucos casos/);
  assert.match(html, /Solvência · os três tempos/);
  assert.match(html, /<strong>35 dias<\/strong><span>Até a decisão<\/span>/);
  assert.match(html, /Depois da decisão/);
  assert.match(html, /Caso inteiro/);
  assert.match(html, /Auto até a defesa<small>com o clube<\/small>/);
  assert.match(html, /pan-pz-seg pan-pz-analise/);
  assert.match(html, /Solvência · processo a processo/);
  assert.doesNotMatch(html, /pan-rito-marca/, 'não há mais asterisco: a defesa é sempre o início do Parecer');
  assert.match(html, /<strong>Defesa<\/strong> é o início do Parecer Técnico Conclusivo/);
  assert.match(html, /Solvência · ainda sem decisão/);
  assert.match(html, /Aguardando a defesa/);
  // um caminho só: sem abas de caminho
  assert.doesNotMatch(html, /data-pan-prazo-caminho/);
  // a seção de tempo abre nessa visão, com as outras duas como opção
  const secao = contexto.panTempoSecao(base, 'todos');
  assert.match(secao, /data-pan-tempo-modo="tipo" aria-pressed="true">Por tipo de caso/);
  assert.match(secao, /data-pan-tempo-modo="acordao" aria-pressed="false">Por rito/);
  assert.match(secao, /data-pan-tempo-modo="caso" aria-pressed="false">Caso inteiro/);
  assert.match(secao, /os três tempos/);
});

test('escala da régua: teto redondo e no máximo sete intervalos', () => {
  assert.deepEqual(j(contexto.panPrazoEscala(47)), [50, 10]);
  assert.deepEqual(j(contexto.panPrazoEscala(61)), [70, 10]);
  assert.deepEqual(j(contexto.panPrazoEscala(14)), [15, 5]);
  assert.deepEqual(j(contexto.panPrazoEscala(130)), [140, 20]);
  assert.deepEqual(j(contexto.panPrazoEscala(1)), [5, 5]);
});
