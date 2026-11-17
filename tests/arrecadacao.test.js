const assert = require('node:assert/strict');
const test = require('node:test');

// Arrecadação: quais etapas arrecadam, leitura dos valores, lançamentos e
// totais do painel, e a gravação pela API (com e sem a coluna no banco).
const a = require('../js/arrecadacao.js');

test('tipo de arrecadação sai do nome da etapa', () => {
  assert.equal(a.arrTipoEtapa('Plano de Recuperação e Sustentabilidade (PRS)'), 'prs');
  assert.equal(a.arrTipoEtapa('plano de recuperacao e sustentabilidade'), 'prs');
  assert.equal(a.arrTipoEtapa('PRS'), 'prs');
  assert.equal(a.arrTipoEtapa('Admissão de Recurso'), 'recurso');
  assert.equal(a.arrTipoEtapa('ADMISSAO DE RECURSO - PSO'), 'recurso');
  assert.equal(a.arrTipoEtapa('Ordem de Cumprimento'), 'cumprimento');
  assert.equal(a.arrTipoEtapa('Ordem de Cumprimento - PSS'), 'cumprimento');
  for (const fora of ['Parecer Técnico Recursal', 'Despacho de Distribuição Recursal', 'Nota de Admissibilidade', 'Acórdão - PSO', 'Auto de Infração - PSS', 'Comprovação de cumprimento', 'Expresso', '', null]) {
    assert.equal(a.arrTipoEtapa(fora), '', String(fora));
  }
});

test('valores: leitura no padrão brasileiro e formatação', () => {
  assert.equal(a.arrLerValor('20.000,00'), 20000);
  assert.equal(a.arrLerValor('R$ 40.000'), 40000);
  assert.equal(a.arrLerValor('1500,5'), 1500.5);
  assert.equal(a.arrLerValor('100000'), 100000);
  assert.equal(a.arrLerValor('0'), 0);
  for (const ruim of ['', '  ', 'vinte mil', '-500', '1.2.3', null, undefined]) assert.equal(a.arrLerValor(ruim), null, String(ruim));
  assert.equal(a.arrFormatar(20000).replace(/\s/g, ' '), 'R$ 20.000,00');
  assert.equal(a.arrFormatar(null), '—');
  assert.equal(a.arrParaCampo(20000), '20.000,00');
  assert.equal(a.arrParaCampo(null), '');
});

test('normalização: taxa e preparo guardam o valor; a ordem de cumprimento guarda as medidas', () => {
  assert.deepEqual(a.arrNormalizar('prs', { valor: '50.000,00' }), { valor: 50000 });
  assert.deepEqual(a.arrNormalizar('recurso', { valor: 0 }), { valor: 0 }, 'zero informado é diferente de não informado');
  assert.equal(a.arrNormalizar('recurso', { valor: '' }), null);
  assert.equal(a.arrNormalizar('prs', null), null);
  assert.equal(a.arrNormalizar('', { valor: 10 }), null, 'etapa que não arrecada não guarda nada');
  assert.deepEqual(a.arrNormalizar('cumprimento', { multa: '100.000,00', multaPaga: '40.000', transferban: true, pontos: '3', parfb: false }), { multa: 100000, multaPaga: 40000, transferban: true, pontos: 3 });
  assert.deepEqual(a.arrNormalizar('cumprimento', { multa: '100000', multaPaga: '' }), { multa: 100000, multaPaga: 0 }, 'multa ainda não paga');
  assert.deepEqual(a.arrNormalizar('cumprimento', { multa: '100000', multaPaga: '250000' }), { multa: 100000, multaPaga: 100000 }, 'o pago não passa da multa');
  assert.deepEqual(a.arrNormalizar('cumprimento', { parfb: true }), { parfb: true });
  assert.equal(a.arrNormalizar('cumprimento', { multa: '', pontos: 0, transferban: false }), null);
  // Dado de outro tipo (a etapa foi renomeada) não é aproveitado.
  assert.equal(a.arrNormalizar('prs', { multa: 100000, transferban: true }), null);
  assert.deepEqual(a.arrMedidas({ multa: 100000, multaPaga: 0, transferban: true, pontos: 1, parfb: true }).map((t) => t.replace(/\s/g, ' ')), ['Multa de R$ 100.000,00', 'Transferban', 'Dedução de 1 ponto', 'Exclusão do PARF-B']);
});

const linha = (banco, etapa, arrecadacao, extra = {}) => ({ etapa_banco_id: banco, casoRaiz: '48', clube: 'Clube X', etapa, dataEnvio: '10/09/2026', arrecadacao, ...extra });

test('lançamentos e totais: só entra o que foi pago; multa não paga fica a receber', () => {
  const rows = [
    linha(1, 'Plano de Recuperação e Sustentabilidade (PRS)', { valor: 50000 }, { dataEnvio: '05/08/2026' }),
    linha(2, 'Admissão de Recurso', { valor: 40000 }),
    linha(3, 'Admissão de Recurso', { valor: 20000 }, { clube: 'Clube Y', casoRaiz: '60', dataEnvio: '20/09/2026' }),
    linha(4, 'Admissão de Recurso', null, { clube: 'Clube Z' }),                                             // sem valor informado
    linha(5, 'Ordem de Cumprimento', { multa: 100000, multaPaga: 30000, transferban: true }, { dataEnvio: '01/10/2026' }),
    linha(6, 'Ordem de Cumprimento', { pontos: 3, parfb: true }, { dataEnvio: '' }),                         // sem multa: não arrecada
    linha(7, 'Ordem de Cumprimento', { multa: 10000, multaPaga: 10000 }, { dataEnvio: '15/10/2026' }),
    linha(8, 'Acórdão - PSO', { valor: 999999 }),                                                            // etapa que não arrecada
    linha(null, 'Admissão de Recurso', { valor: 5 }),                                                        // linha sem etapa no banco
  ];
  const lancs = a.arrLancamentos(rows);
  assert.equal(lancs.length, 7);
  const r = a.arrResumo(lancs);
  assert.equal(r.total, 50000 + 40000 + 20000 + 30000 + 10000);
  assert.equal(r.aReceber, 70000);
  assert.equal(r.semValor, 1);
  assert.deepEqual(r.porTipo.prs, { etapas: 1, informadas: 1, arrecadado: 50000 });
  assert.deepEqual(r.porTipo.recurso, { etapas: 3, informadas: 2, arrecadado: 60000 });
  assert.deepEqual(r.porTipo.cumprimento, { etapas: 3, informadas: 3, arrecadado: 40000 });
  assert.deepEqual(r.medidas, { ordens: 3, multas: 2, multaAplicada: 110000, multaPaga: 40000, transferban: 1, pontos: 3, parfb: 1 });
  assert.deepEqual(r.porMes.map((m) => [m.chave, m.total]), [['2026-08', 50000], ['2026-09', 60000], ['2026-10', 40000]]);
  assert.equal(r.porMes[2].cumprimento, 40000);
  const ordem = lancs.find((l) => l.row.etapa_banco_id === 5);
  assert.equal(ordem.arrecadado, 30000);
  assert.equal(ordem.aReceber, 70000);
  assert.deepEqual(ordem.medidas.map((t) => t.replace(/\s/g, ' ')), ['Multa de R$ 100.000,00', 'Transferban']);
  assert.equal(lancs.find((l) => l.row.etapa_banco_id === 4).semValor, true);
});

test('campos do formulário: taxa/preparo têm um valor; a ordem de cumprimento tem as quatro medidas', () => {
  const taxa = a.arrCamposHtml('prs', { valor: 50000 });
  assert.ok(taxa.includes('data-arr="valor"') && taxa.includes('value="50.000,00"'));
  const ordem = a.arrCamposHtml('cumprimento', { multa: 100000, multaPaga: 30000, parfb: true });
  for (const medida of ['multa', 'transferban', 'pontos', 'parfb']) assert.ok(ordem.includes(`data-arr-marca="${medida}"`), medida);
  assert.ok(ordem.includes('data-arr-marca="multa" checked') && ordem.includes('data-arr-marca="parfb" checked'));
  assert.ok(!ordem.includes('data-arr-marca="transferban" checked'));
  assert.ok(ordem.includes('value="100.000,00"') && ordem.includes('value="30.000,00"'));
});

// ----- API -----
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/etapas.js');

function supabase({ temColuna = true } = {}) {
  const chamadas = [];
  const semColuna = { code: 'PGRST204', message: "Could not find the 'arrecadacao' column of 'etapas' in the schema cache" };
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url); const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    chamadas.push({ url: u, method: opcoes.method || 'GET', corpo });
    const r = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
    if (u.includes('/auth/v1/user')) return r(200, { id: 'u1' });
    if (u.includes('/rest/v1/v_data_fluxograma')) return r(200, [{ etapa_banco_id: 10, caso_banco_id: 1, etapa: 'Admissão de Recurso' }]);
    if (u.includes('/rest/v1/etapas?select=')) {
      if (!temColuna && u.includes('arrecadacao')) return r(400, { code: '42703', message: 'column etapas.arrecadacao does not exist' });
      return r(200, [{ id: 10, turma: null, responsavel: 'Ana', sancao_detalhe: null, ...(temColuna ? { arrecadacao: { valor: 40000 } } : {}) }]);
    }
    if (u.includes('/rest/v1/casos?')) return r(200, []);
    if (u.includes('/rest/v1/etapas')) {
      if (!temColuna && corpo && 'arrecadacao' in corpo) return r(400, semColuna);
      return r(opcoes.method === 'POST' ? 201 : 200, [{ id: 10, ...corpo }]);
    }
    return r(404, null);
  };
  return chamadas;
}

async function chamar(method, body) {
  const headers = {};
  const res = { statusCode: 0, corpo: '', setHeader(k, v) { headers[k] = v; }, end(t) { this.corpo = t; } };
  await handler({ method, url: '/api/etapas', body, headers: { authorization: 'Bearer t' } }, res);
  return { status: res.statusCode, dados: JSON.parse(res.corpo || 'null'), headers };
}
const gravacoes = (chamadas) => chamadas.filter((c) => c.url.includes('/rest/v1/etapas') && c.method !== 'GET');

test('API: a arrecadação vem junto com as etapas; sem a coluna, a leitura segue', async () => {
  supabase();
  assert.deepEqual((await chamar('GET')).dados[0].arrecadacao, { valor: 40000 });
  supabase({ temColuna: false });
  const r = await chamar('GET');
  assert.equal(r.status, 200);
  assert.equal(r.dados[0].arrecadacao, null);
  assert.equal(r.dados[0].responsavel, 'Ana', 'os outros campos continuam chegando');
});

test('API: lançar só a arrecadação não mexe no resto da etapa', async () => {
  const chamadas = supabase();
  const r = await chamar('POST', { acao: 'editar', id: 10, arrecadacao: { multa: 100000, multaPaga: 0, transferban: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(gravacoes(chamadas)[0].corpo, { arrecadacao: { multa: 100000, multaPaga: 0, transferban: true } });
  // Limpar o lançamento grava null.
  const limpar = supabase();
  await chamar('POST', { acao: 'editar', id: 10, arrecadacao: null });
  assert.deepEqual(gravacoes(limpar)[0].corpo, { arrecadacao: null });
});

test('API: sem a coluna no banco, a etapa é salva e o site é avisado', async () => {
  const etapa = { caso_id: 1, nome_etapa: 'Admissão de Recurso', ordem: 3, status_etapa: 'Finalizado' };
  // Criar com valor: salva a etapa sem a arrecadação e avisa.
  let chamadas = supabase({ temColuna: false });
  let r = await chamar('POST', { acao: 'criar', ...etapa, arrecadacao: { valor: 40000 } });
  assert.equal(r.status, 201);
  assert.equal(r.headers['X-Arrecadacao'], 'ignorada');
  assert.equal('arrecadacao' in gravacoes(chamadas).at(-1).corpo, false);
  // Criar sem valor: o campo nem é enviado, então nada falha nem avisa.
  chamadas = supabase({ temColuna: false });
  r = await chamar('POST', { acao: 'criar', ...etapa });
  assert.equal(r.status, 201);
  assert.equal(r.headers['X-Arrecadacao'], undefined);
  assert.equal(gravacoes(chamadas).length, 1);
  // Lançamento só da arrecadação (painel): não há o que salvar, e o erro explica.
  supabase({ temColuna: false });
  r = await chamar('POST', { acao: 'editar', id: 10, arrecadacao: { valor: 40000 } });
  assert.equal(r.status, 409);
  assert.equal(r.dados.semColunaArrecadacao, true);
  // Com a coluna, criar grava o valor e não avisa.
  chamadas = supabase();
  r = await chamar('POST', { acao: 'criar', ...etapa, arrecadacao: { valor: 40000 } });
  assert.equal(r.headers['X-Arrecadacao'], undefined);
  assert.deepEqual(gravacoes(chamadas)[0].corpo.arrecadacao, { valor: 40000 });
});
