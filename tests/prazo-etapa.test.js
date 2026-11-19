const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Prazo da etapa (início, prazo final e envio) e a coluna etapas.data_envio.
const contexto = { console };
vm.createContext(contexto);
for (const arquivo of ['js/prazo-calculo.js', 'js/prazo-etapa.js']) vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto);
const p = contexto;
const etapa = (inicio, prazo, envio) => ({ dataEnvio: inicio, prazoFinal: prazo, enviadaEm: envio });

test('antes, no dia e depois do prazo', () => {
  const antes = p.petSituacao(etapa('02/11/2026', '13/11/2026', '11/11/2026'));
  assert.equal(antes.tipo, 'antes');
  assert.equal(antes.saldo, 2);
  assert.equal(antes.texto, '2 dias antes do prazo');
  assert.equal(antes.classe, 'green');
  assert.equal(antes.usados, 9);
  assert.equal(antes.concedidos, 11);

  const noDia = p.petSituacao(etapa('02/11/2026', '13/11/2026', '13/11/2026'));
  assert.equal(`${noDia.tipo}/${noDia.texto}/${noDia.classe}`, 'no-dia/No dia do prazo/green');

  const depois = p.petSituacao(etapa('02/11/2026', '13/11/2026', '14/11/2026'));
  assert.equal(`${depois.tipo}/${depois.saldo}/${depois.texto}/${depois.classe}`, 'depois/-1/1 dia depois do prazo/red');
});

test('sem envio não há selo; envio sem prazo mostra o tempo usado', () => {
  const aberto = p.petSituacao(etapa('02/11/2026', '13/11/2026', null));
  assert.equal(aberto.tipo, '');
  assert.equal(aberto.concedidos, 11);
  assert.equal(p.petSeloHtml(etapa('02/11/2026', '13/11/2026', '')), '');

  const semPrazo = p.petSituacao(etapa('02/11/2026', '', '05/11/2026'));
  assert.equal(`${semPrazo.tipo}/${semPrazo.texto}/${semPrazo.classe}`, 'enviada/Enviada em 3 dias/neutral');
  assert.equal(p.petSituacao(etapa('', '', '05/11/2026')).texto, 'Enviada');
  assert.equal(p.petSituacao({ dataEtapa: '02/11/2026', prazoFinal: '2026-11-13', enviadaEm: '2026-11-12' }).saldo, 1, 'aceita data ISO e o campo antigo dataEtapa');
});

test('dias úteis pulam fim de semana e feriado nacional', () => {
  const ms = p.petMs;
  assert.equal(p.petDiasUteis(ms('13/11/2026'), ms('16/11/2026')), 1, 'sexta até segunda');
  assert.equal(p.petDiasUteis(ms('16/11/2026'), ms('23/11/2026')), 4, '20/11 é feriado nacional');
  assert.equal(p.petDiasUteis(ms('16/11/2026'), ms('16/11/2026')), 0);
  assert.equal(p.petDiasUteis(ms('16/11/2026'), ms('13/11/2026')), -1);
  assert.equal(p.petDias(ms('13/11/2026'), ms('16/11/2026')), 3);
  // virada do horário não entorta a conta de dias corridos
  assert.equal(p.petDias(ms('01/03/2026'), ms('01/04/2026')), 31);
});

test('selo: texto, cor e dica escapados', () => {
  const html = p.petSeloHtml(etapa('02/11/2026', '13/11/2026', '16/11/2026'));
  assert.match(html, /class="pet-selo red"/);
  assert.match(html, />3 dias depois do prazo</);
  assert.match(html, /Início 02\/11\/2026 · Prazo 13\/11\/2026 · Envio 16\/11\/2026/);
  assert.match(html, /Usou 14 dias corridos de 11 \(10 dias úteis\)\./);
});

test('aviso de datas incoerentes no formulário', () => {
  assert.equal(p.petAvisoDatas('2026-11-02', '2026-11-13', '2026-11-10', '2026-11-19'), '');
  assert.match(p.petAvisoDatas('2026-11-02', '2026-11-13', '2026-11-01', '2026-11-19'), /anterior ao início/);
  assert.match(p.petAvisoDatas('2026-11-02', '2026-11-13', '2026-11-25', '2026-11-19'), /futuro/);
  assert.match(p.petAvisoDatas('2026-11-02', '2026-10-30', '', '2026-11-19'), /prazo final é anterior/);
  assert.equal(p.petAvisoDatas('', '', '', '2026-11-19'), '');
});

// ---------- API ----------
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/etapas.js');
const chamar = async (req) => { const cab = {}; const res = { statusCode: 0, corpo: '', setHeader(k, v) { cab[k] = v; }, end(t) { this.corpo = t; } }; await handler({ headers: { authorization: 'Bearer t' }, ...req }, res); return { status: res.statusCode, json: JSON.parse(res.corpo), cab }; };
const r = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
function supabase({ temColuna }) {
  const gravados = [];
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url); const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    if (u.includes('/auth/v1/user')) return r(200, { id: 'u1' });
    if (u.includes('v_data_fluxograma')) return r(200, [{ etapa_banco_id: 10, caso_banco_id: 1, etapa: 'Parecer Técnico', dataEnvio: '02/11/2026', prazoFinal: '13/11/2026' }]);
    if (u.includes('/rest/v1/etapas?select=')) {
      if (!temColuna && u.includes('data_envio')) return r(400, { code: '42703', message: 'column etapas.data_envio does not exist' });
      return r(200, [{ id: 10, turma: null, responsavel: 'Ana', sancao_detalhe: null, arrecadacao: null, ...(temColuna ? { data_envio: '2026-11-11' } : {}) }]);
    }
    if (u.includes('/rest/v1/casos?')) return r(200, []);
    if (u.includes('/rest/v1/etapas')) {
      if (!temColuna && corpo && 'data_envio' in corpo) return r(400, { code: 'PGRST204', message: "Could not find the 'data_envio' column of 'etapas' in the schema cache" });
      gravados.push({ method: opcoes.method, corpo });
      return r(opcoes.method === 'POST' ? 201 : 200, [{ id: 10, ...corpo }]);
    }
    return r(404, null);
  };
  return gravados;
}
const nova = { acao: 'criar', caso_id: 1, nome_etapa: 'Parecer Técnico', ordem: 2, status_etapa: 'Pendente ANRESF', data_etapa: '2026-11-02', prazo: '2026-11-13' };

test('API: a lista traz a data de envio em dd/mm/aaaa e funciona sem a coluna', async () => {
  supabase({ temColuna: true });
  const com = await chamar({ method: 'GET' });
  assert.equal(com.json[0].enviadaEm, '11/11/2026');
  assert.equal(com.json[0].dataEnvio, '02/11/2026', 'o início do prazo continua no campo de sempre');
  supabase({ temColuna: false });
  const sem = await chamar({ method: 'GET' });
  assert.equal(sem.status, 200);
  assert.equal(sem.json[0].enviadaEm, null);
  assert.equal(sem.json[0].responsavel, 'Ana', 'sem a coluna, os outros campos continuam vindo');
});

test('API: cria e edita com data de envio; vazio limpa; texto inválido é recusado', async () => {
  const g = supabase({ temColuna: true });
  assert.equal((await chamar({ method: 'POST', body: { ...nova, data_envio: '2026-11-11' } })).status, 201);
  assert.equal(g[0].corpo.data_envio, '2026-11-11');
  await chamar({ method: 'POST', body: nova });
  assert.equal('data_envio' in g[1].corpo, false, 'sem envio, a coluna nem vai na criação');
  await chamar({ method: 'POST', body: { acao: 'editar', id: 10, data_envio: '' } });
  assert.deepEqual(g[2].corpo, { data_envio: null }, 'campo vazio limpa a data');
  await chamar({ method: 'POST', body: { acao: 'editar', id: 10, status_etapa: 'Finalizado' } });
  assert.deepEqual(g[3].corpo, { status_etapa: 'Finalizado' }, 'edição sem o campo não mexe na data');
  for (const ruim of ['11/11/2026', '2026-13-40', 'ontem']) {
    assert.equal((await chamar({ method: 'POST', body: { acao: 'editar', id: 10, data_envio: ruim } })).status, 400, ruim);
    assert.equal((await chamar({ method: 'POST', body: { ...nova, data_envio: ruim } })).status, 400, ruim);
  }
  assert.equal(g.length, 4);
});

test('API: sem a coluna, grava o resto e avisa; só o envio devolve 409', async () => {
  const g = supabase({ temColuna: false });
  const criada = await chamar({ method: 'POST', body: { ...nova, data_envio: '2026-11-11' } });
  assert.equal(criada.status, 201);
  assert.equal(criada.cab['X-Data-Envio'], 'ignorada');
  assert.equal('data_envio' in g[0].corpo, false);
  const status = await chamar({ method: 'POST', body: { acao: 'editar', id: 10, status_etapa: 'Finalizado', data_envio: '2026-11-19' } });
  assert.equal(status.status, 200);
  assert.equal(status.cab['X-Data-Envio'], 'ignorada');
  assert.deepEqual(g[1].corpo, { status_etapa: 'Finalizado' });
  const soEnvio = await chamar({ method: 'POST', body: { acao: 'editar', id: 10, data_envio: '2026-11-19' } });
  assert.equal(soEnvio.status, 409);
  assert.equal(soEnvio.json.semColunaDataEnvio, true);
  // limpar a data sem a coluna: não há o que gravar, mas também não é aviso de perda
  const limpar = await chamar({ method: 'POST', body: { acao: 'editar', id: 10, status_etapa: 'Pendente Clube', data_envio: null } });
  assert.equal(limpar.status, 200);
  assert.equal(limpar.cab['X-Data-Envio'], undefined);
});
