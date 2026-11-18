const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Resumo do caso: ficha automática, histórico de decisões por clube, texto
// escrito e a API que grava o resumo na coluna casos.resumo.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  groupBy: (lista, fn) => lista.reduce((m, i) => { const k = fn(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); return m; }, new Map()),
  currentRows: (rows) => { const o = [...rows].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)); return o.find((r) => String(r.statusEtapa || '').toLowerCase() !== 'finalizado') || o[o.length - 1] || {}; },
  dadosFluxograma: [],
};
vm.createContext(contexto);
for (const arquivo of ['js/arrecadacao.js', 'js/panels/operacional.js', 'js/resumo-caso.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
const c = contexto;
let banco = 1;
const e = (caso, clube, ordem, nome, status, data, extra = {}) => ({ etapa_banco_id: banco++, caso_banco_id: caso, casoRaiz: String(caso), clube, serie: 'A', origem: 'Solvência', periodo: '2026/06/30', statusCaso: 'Em andamento', etapa: nome, ordem, statusEtapa: status, dataEnvio: data, ...extra });

const resumoEscrito = { trata: 'Atraso no pagamento de salários.', pontos: '- Três meses em aberto\n2) Clube reconheceu a dívida\n\nSem acordo com os atletas', decisao: 'Multa mantida pela Turma.', atualizado_em: '2026-11-10T12:00:00Z', atualizado_por: 'Ana' };
const caso48 = [
  e(48, 'Clube C', 1, 'Auto de Infração - PSO', 'Finalizado', '01/06/2026', { sancao: 'Advertência + Multa 40k', id: '012/2026', statusCaso: 'Finalizado', resumoCaso: resumoEscrito }),
  e(48, 'Clube C', 2, 'Parecer Técnico', 'Finalizado', '20/06/2026', { statusCaso: 'Finalizado' }),
  e(48, 'Clube C', 3, 'Despacho do Relator', 'Finalizado', '10/07/2026', { responsavel: 'Pedro Lima', statusCaso: 'Finalizado' }),
  e(48, 'Clube C', 4, 'Acórdão - PSO', 'Finalizado', '20/07/2026', { sancao: 'Multa 40k', turma: 'Turma 01', id: '048/2026', doc: 'https://exemplo/acordao.zip', statusCaso: 'Finalizado' }),
  e(48, 'Clube C', 5, 'Admissão de Recurso', 'Finalizado', '01/08/2026', { arrecadacao: { valor: 40000 }, statusCaso: 'Finalizado' }),
  e(48, 'Clube C', 6, 'Despacho do Relator Recursal', 'Finalizado', '10/08/2026', { responsavel: 'Marina Fernandes', statusCaso: 'Finalizado' }),
  e(48, 'Clube C', 7, 'Plenário', 'Finalizado', '01/09/2026', { sancao: 'Multa 20k', statusCaso: 'Finalizado' }),
  e(48, 'Clube C', 8, 'Ordem de Cumprimento', 'Finalizado', '01/10/2026', { arrecadacao: { multa: 20000, multaPaga: 5000, transferban: true }, statusCaso: 'Finalizado' }),
];
const caso60 = [
  e(60, 'Clube C', 1, 'Auto de Infração - PSS', 'Finalizado', '05/10/2026', { sancao: 'Advertência' }),
  e(60, 'Clube C', 2, 'Acórdão - PSS', 'Pendente ANRESF', '02/11/2026', { turma: 'Turma 02', prazoFinal: '30/11/2026' }),
];
const outroClube = [e(70, 'Clube J', 1, 'Decisão de Indeferimento', 'Finalizado', '03/11/2026')];

test('texto escrito: só tópicos preenchidos; vazio vira null; lista sem marcadores', () => {
  assert.equal(c.resumoNormalizar(null), null);
  assert.equal(c.resumoNormalizar({ trata: '   ', pontos: '' }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(c.resumoNormalizar({ trata: ' A \r\n B ', atencao: '', outro: 'x', atualizado_por: 'Ana' }))), { trata: 'A \n B', atualizado_por: 'Ana' });
  assert.deepEqual(Array.from(c.resumoItens(resumoEscrito.pontos)), ['Três meses em aberto', 'Clube reconheceu a dívida', 'Sem acordo com os atletas']);
  assert.equal(vm.runInContext('RESUMO_TOPICOS.map((t) => t.chave).join()', contexto), 'trata,pontos,decisao,atencao');
});

test('decisões do caso: tipo, órgão, resultado e ordem', () => {
  const atos = c.resumoDecisoes(caso48);
  assert.deepEqual(Array.from(atos, (a) => `${a.data} ${a.tipo} ${a.orgao || '-'} | ${a.resultado.replace(/\s/g, ' ')}`), [
    '01/06/2026 auto - | Sanção proposta: Advertência + Multa 40k',
    '20/07/2026 decisao Turma 01 | Multa 40k',
    '01/08/2026 recurso - | Recurso admitido',
    '01/09/2026 decisao Plenário | Multa 20k',
    '01/10/2026 cumprimento - | Multa de R$ 20.000,00 + Transferban. Pago R$ 5.000,00, a receber R$ 15.000,00',
  ]);
  assert.equal(atos[1].numero, '048/2026');
  assert.equal(atos[1].doc, 'https://exemplo/acordao.zip');
  // decisão ainda não finalizada não é dada como aplicada
  assert.equal(c.resumoDecisoes(caso60)[1].resultado, 'Aguardando julgamento');
  // etapa comum não entra
  assert.equal(c.resumoTipoAto({ etapa: 'Parecer Técnico' }), '');
  assert.equal(c.resumoDecisoes(outroClube)[0].resultado, 'Arquivado');
});

test('recurso recusado aparece como não admitido', () => {
  const rows = [
    e(80, 'Clube K', 1, 'Acórdão - PSO', 'Finalizado', '01/10/2026', { sancao: 'Multa', statusCaso: 'Finalizado' }),
    e(80, 'Clube K', 2, 'Admissão de Recurso', 'Finalizado', '15/10/2026', { statusCaso: 'Finalizado' }),
  ];
  assert.equal(c.resumoDecisoes(rows)[1].resultado, 'Recurso não admitido');
});

test('ficha automática do caso', () => {
  const f = c.resumoFicha(caso48);
  assert.equal(f.caso, '48');
  assert.equal(f.clube, 'Clube C');
  assert.equal(f.casoBancoId, 48);
  assert.equal(f.status, 'Finalizado');
  assert.equal(f.finalizado, true);
  assert.equal(f.prazo, '', 'caso finalizado não tem próximo prazo');
  assert.equal(`${f.inicio} a ${f.ultima}`, '01/06/2026 a 01/10/2026');
  assert.equal(f.relator, 'Pedro Lima');
  assert.equal(f.relatorRecurso, 'Marina Fernandes');
  assert.equal(f.processos.length, 1);
  assert.equal(f.processos[0].sancao, 'Multa 20k', 'vale a decisão do Plenário');
  assert.equal(f.processos[0].aplicada, true);
  assert.equal(f.decisoes.length, 5);
  assert.equal(f.valores.arrecadado, 45000);
  assert.equal(f.valores.aReceber, 15000);
  assert.equal(f.resumo.trata, 'Atraso no pagamento de salários.');

  const aberto = c.resumoFicha(caso60);
  assert.equal(aberto.status, 'Em andamento');
  assert.equal(aberto.etapaAtual, 'Acórdão - PSS');
  assert.equal(aberto.prazo, '30/11/2026');
  assert.equal(aberto.resumo, null);
  assert.equal(aberto.processos[0].aplicada, false);
});

test('histórico do clube junta os casos, do mais recente para o mais antigo', () => {
  const todos = [...caso48, ...caso60, ...outroClube];
  const hist = c.resumoHistoricoClube(todos.filter((r) => r.clube === 'Clube C'));
  assert.equal(hist.length, 7);
  assert.deepEqual(Array.from(hist.slice(0, 3), (a) => `${a.data} caso ${a.caso}`), ['02/11/2026 caso 60', '05/10/2026 caso 60', '01/10/2026 caso 48']);
  assert.ok(hist.every((a) => a.clube === 'Clube C'));
  const fichas = c.resumoFichasDoClube(todos, 'Clube C');
  assert.deepEqual(Array.from(fichas, (f) => f.caso), ['48', '60']);
});

test('documento: caso e clube; texto escapado; tópico vazio não aparece', () => {
  const ficha = c.resumoFicha(caso48.map((r) => ({ ...r, resumoCaso: r.resumoCaso ? { ...r.resumoCaso, trata: 'Atraso <b>grave</b> & reiterado' } : undefined })));
  const doc = c.resumoDocumentoHtml({ modo: 'caso', clube: 'Clube C', fichas: [ficha], historico: [], geradoEm: '17/11/2026', geradoPor: 'Luciano' });
  assert.ok(doc.startsWith('<!doctype html>'));
  assert.ok(doc.includes('<title>Resumo do caso 48 - Clube C</title>'));
  assert.ok(doc.includes('Atraso &lt;b&gt;grave&lt;/b&gt; &amp; reiterado') && !doc.includes('<b>grave</b>'));
  assert.ok(doc.includes('<li>Três meses em aberto</li>'));
  assert.ok(doc.includes('Decisão e fundamento') && !doc.includes('Pontos de atenção'), 'tópico em branco fica de fora');
  assert.ok(doc.includes('Gerado em 17/11/2026 por Luciano'));
  assert.ok(doc.includes('Cumprimento e valores') && doc.includes('Processos sancionadores'));
  assert.ok(!doc.includes('<script'));

  const semTexto = c.resumoDocumentoHtml({ modo: 'caso', clube: 'Clube C', fichas: [c.resumoFicha(caso60)], historico: [], geradoEm: '17/11/2026', geradoPor: '' });
  assert.ok(!semTexto.includes('<h2>Resumo</h2>'));
  assert.ok(!semTexto.includes('Cumprimento e valores'));

  const todos = [...caso48, ...caso60];
  const clube = c.resumoDocumentoHtml({ modo: 'clube', clube: 'Clube C', fichas: c.resumoFichasDoClube(todos, 'Clube C'), historico: c.resumoHistoricoClube(todos), geradoEm: '17/11/2026', geradoPor: 'Luciano' });
  assert.ok(clube.includes('2 casos · 1 em andamento · 1 finalizado'));
  assert.ok(clube.includes('Histórico de decisões') && clube.includes('Caso 48') && clube.includes('Caso 60'));
});

test('PDF do clube: histórico por caso, na ordem dos atos, e observação do caso', () => {
  const comObs = [...caso60, ...caso48].map((r) => (r.caso_banco_id === 60 ? { ...r, observacaoCaso: 'Denúncia de <atleta>\nAguardando sessão' } : r));
  const porCaso = c.resumoHistoricoClube(comObs, 'caso');
  assert.deepEqual(Array.from(porCaso, (a) => `${a.caso} ${a.data}`), [
    '48 01/06/2026', '48 20/07/2026', '48 01/08/2026', '48 01/09/2026', '48 01/10/2026',
    '60 05/10/2026', '60 02/11/2026',
  ]);
  // a tela do Dossiê continua do mais recente para o mais antigo
  assert.equal(c.resumoHistoricoClube(comObs)[0].data, '02/11/2026');
  const fichas = c.resumoFichasDoClube(comObs, 'Clube C');
  assert.equal(fichas[1].observacao, 'Denúncia de <atleta>\nAguardando sessão');
  assert.equal(fichas[0].observacao, '');
  const doc = c.resumoDocumentoHtml({ modo: 'clube', clube: 'Clube C', fichas, historico: porCaso, geradoEm: '18/11/2026', geradoPor: '' });
  assert.ok(doc.includes('<th>Observação</th>'));
  assert.ok(doc.includes('<td class="obs">Denúncia de &lt;atleta&gt;\nAguardando sessão</td>') && doc.includes('<td class="obs">—</td>'));
  assert.equal(doc.split('class="grupo-titulo"').length - 1, 2, 'um bloco por caso');
  const blocos = doc.split('<tbody class="grupo">').slice(1);
  assert.ok(blocos[0].includes('Caso 48') && !blocos[0].includes('Acórdão - PSS'));
  assert.ok(blocos[0].indexOf('Auto de Infração - PSO') < blocos[0].indexOf('Plenário'), 'proposto antes do decidido');
  assert.ok(blocos[1].includes('Caso 60') && blocos[1].split('</tbody>')[0].includes('Acórdão - PSS'));
});

// ---------- API ----------
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const casosApi = require('../api/casos.js');
const etapasApi = require('../api/etapas.js');
const chamar = async (handler, req) => { const res = { statusCode: 0, corpo: '', setHeader() {}, end(t) { this.corpo = t; } }; await handler({ headers: { authorization: 'Bearer t' }, ...req }, res); return { status: res.statusCode, json: JSON.parse(res.corpo) }; };
const r = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
const usuario = { id: 'u1', email: 'ana.souza@exemplo.org', user_metadata: { nome: 'Ana Souza' } };

test('API: grava só os tópicos com texto, com autor e data', async () => {
  let gravado = null;
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return r(200, usuario);
    if (opcoes.method === 'PATCH' && u.includes('/rest/v1/casos?id=eq.48')) { gravado = JSON.parse(opcoes.body); return r(200, [{ id: 48 }]); }
    return r(404, null);
  };
  const resp = await chamar(casosApi, { method: 'POST', body: { acao: 'resumo', id: 48, resumo: { trata: '  Texto  ', pontos: '', decisao: 'x'.repeat(7000), atualizado_por: 'Forjado', outro: 1 } } });
  assert.equal(resp.status, 200, JSON.stringify(resp.json));
  assert.deepEqual(Object.keys(gravado), ['resumo']);
  assert.deepEqual(Object.keys(gravado.resumo).sort(), ['atualizado_em', 'atualizado_por', 'decisao', 'trata']);
  assert.equal(gravado.resumo.trata, 'Texto');
  assert.equal(gravado.resumo.decisao.length, 6000);
  assert.equal(gravado.resumo.atualizado_por, 'Ana Souza', 'o autor vem do login, não do corpo');
  assert.ok(!Number.isNaN(Date.parse(gravado.resumo.atualizado_em)));
  assert.deepEqual(resp.json.resumo, gravado.resumo);

  // tudo em branco apaga o resumo
  await chamar(casosApi, { method: 'POST', body: { acao: 'resumo', id: 48, resumo: { trata: ' ' } } });
  assert.deepEqual(gravado, { resumo: null });
});

test('API: validações, coluna ausente e caso inexistente', async () => {
  let chamadas = 0;
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return r(200, usuario);
    if (opcoes.method === 'PATCH') { chamadas += 1; return u.includes('id=eq.99') ? r(200, []) : r(400, { code: 'PGRST204', message: "Could not find the 'resumo' column of 'casos' in the schema cache" }); }
    return r(404, null);
  };
  assert.equal((await chamar(casosApi, { method: 'POST', body: { acao: 'resumo', id: 'x', resumo: {} } })).status, 400);
  assert.equal((await chamar(casosApi, { method: 'POST', body: { acao: 'resumo', id: 48, resumo: 'texto' } })).status, 400);
  assert.equal(chamadas, 0);
  const semColuna = await chamar(casosApi, { method: 'POST', body: { acao: 'resumo', id: 48, resumo: { trata: 'a' } } });
  assert.equal(semColuna.status, 409);
  assert.equal(semColuna.json.semColunaResumo, true);
  assert.equal((await chamar(casosApi, { method: 'POST', body: { acao: 'resumo', id: 99, resumo: { trata: 'a' } } })).status, 404);
  global.fetch = async () => r(401, null);
  assert.equal((await chamar(casosApi, { method: 'POST', headers: {}, body: { acao: 'resumo', id: 48, resumo: {} } })).status, 401);
});

test('API: a lista de etapas traz o resumo do caso e funciona sem a coluna', async () => {
  const montar = (comColuna) => async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return r(200, usuario);
    if (u.includes('v_data_fluxograma')) return r(200, [{ etapa_banco_id: 1, caso_banco_id: 48, etapa: 'Acórdão - PSO' }]);
    if (u.includes('/rest/v1/etapas?')) return r(200, [{ id: 1, turma: 'Turma 01', responsavel: null, sancao_detalhe: null, arrecadacao: null }]);
    if (u.includes('/rest/v1/casos?select=')) {
      if (u.includes('resumo')) return comColuna ? r(200, [{ id: 48, denunciante: null, periodo: '2026', observacao: 'obs', resumo: { trata: 'Texto' } }]) : r(400, { message: 'column casos.resumo does not exist' });
      return r(200, [{ id: 48, denunciante: null, periodo: '2026', observacao: 'obs' }]);
    }
    return r(404, null);
  };
  global.fetch = montar(true);
  const com = await chamar(etapasApi, { method: 'GET' });
  assert.deepEqual(com.json[0].resumoCaso, { trata: 'Texto' });
  assert.equal(com.json[0].observacaoCaso, 'obs');
  global.fetch = montar(false);
  const sem = await chamar(etapasApi, { method: 'GET' });
  assert.equal(sem.status, 200);
  assert.equal(sem.json[0].resumoCaso, null);
  assert.equal(sem.json[0].observacaoCaso, 'obs', 'sem a coluna, os outros campos do caso continuam vindo');
});

test('PDF do clube: desfecho só em caso finalizado; situação Julgado', () => {
  const julgado = caso60.map((r) => ({ ...r, statusCaso: 'Julgado', statusEtapa: 'Finalizado', sancao: 'Advertência' }));
  const aberto = [e(61, 'Clube C', 1, 'Auto de Infração - PSO', 'Finalizado', '01/11/2026', { sancao: 'Multa' }), e(61, 'Clube C', 2, 'Acórdão - PSO', 'Finalizado', '10/11/2026', { sancao: 'Multa 10k', turma: 'Turma 01' })];
  const todos = [...caso48, ...julgado, ...aberto];
  const fichas = c.resumoFichasDoClube(todos, 'Clube C');
  assert.deepEqual(Array.from(fichas, (f) => `${f.caso}:${f.status}:${f.finalizado}`), ['48:Finalizado:true', '60:Julgado:false', '61:Em andamento:false']);
  const doc = c.resumoDocumentoHtml({ modo: 'clube', clube: 'Clube C', fichas, historico: c.resumoHistoricoClube(todos, 'caso'), geradoEm: '18/11/2026', geradoPor: '' });
  const tabela = doc.split('<h2>Casos do clube</h2>')[1].split('</table>')[0];
  const linhas = tabela.split('<tr>').slice(2).map((l) => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.match(linhas[0], /^Caso 48 Solvência Finalizado PSO: Sanção aplicada \(Multa 20k\)/);
  assert.match(linhas[1], /^Caso 60 Solvência Julgado — /, 'julgado, mas ainda aberto: sem desfecho');
  assert.match(linhas[2], /^Caso 61 Solvência Em andamento — /, 'em andamento: sem desfecho, mesmo com acórdão finalizado');
  assert.ok(tabela.includes('class="tag jul">Julgado<') && tabela.includes('class="tag ok">Finalizado<') && tabela.includes('class="tag and">Em andamento<'));
  assert.ok(doc.includes('3 casos · 1 em andamento · 1 julgado · 1 finalizado'));
  // a decisão continua aparecendo no histórico e na ficha do caso
  assert.ok(doc.split('<h2>Histórico de decisões</h2>')[1].includes('Multa 10k'));
});
