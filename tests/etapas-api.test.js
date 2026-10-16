const assert = require('node:assert/strict');
const test = require('node:test');

// /api/etapas com o Supabase simulado: grava e lê a sanção por categoria
// (coluna sancao_detalhe) e continua funcionando se a coluna ainda não existir.
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/etapas.js');

function simularSupabase({ temColuna }) {
  const chamadas = [];
  global.fetch = async (url, opcoes = {}) => {
    const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    chamadas.push({ url: String(url), method: opcoes.method, corpo });
    const responder = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
    if (String(url).includes('/auth/v1/user')) return responder(200, { id: 'u1' });
    if (String(url).includes('/rest/v1/v_data_fluxograma')) {
      return responder(200, [{ etapa_banco_id: 10, caso_banco_id: 1, etapa: 'Auto de Infração - PSO', sancao: 'Advertência + Transferban' }]);
    }
    if (String(url).includes('/rest/v1/etapas?select=')) {
      if (!temColuna && String(url).includes('sancao_detalhe')) return responder(400, { code: '42703', message: 'column etapas.sancao_detalhe does not exist' });
      return responder(200, [{ id: 10, turma: null, responsavel: 'Ana', ...(temColuna ? { sancao_detalhe: { transicao: 'Transferban', geral: 'Advertência' } } : {}) }]);
    }
    if (String(url).includes('/rest/v1/casos?')) return responder(200, []);
    if (String(url).includes('/rest/v1/etapas')) {
      if (!temColuna && corpo && 'sancao_detalhe' in corpo) {
        return responder(400, { code: 'PGRST204', message: "Could not find the 'sancao_detalhe' column of 'etapas' in the schema cache" });
      }
      return responder(opcoes.method === 'POST' ? 201 : 200, [{ id: 10, ...corpo }]);
    }
    return responder(404, null);
  };
  return chamadas;
}

async function chamar(method, body) {
  const headers = {};
  const res = {
    statusCode: 0, corpo: '',
    setHeader(k, v) { headers[k] = v; },
    end(t) { this.corpo = t; },
  };
  await handler({ method, body, headers: { authorization: 'Bearer token' } }, res);
  return { status: res.statusCode, headers, dados: JSON.parse(res.corpo || 'null') };
}

const detalhe = { transicao: 'Transferban', geral: 'Advertência' };

test('editar grava a sanção por categoria junto com o resumo', async () => {
  const chamadas = simularSupabase({ temColuna: true });
  const r = await chamar('POST', { acao: 'editar', id: 10, sancao: 'Advertência + Transferban', sancao_detalhe: detalhe });
  assert.equal(r.status, 200);
  assert.equal(r.headers['X-Sancao-Detalhe'], undefined);
  const patch = chamadas.find((c) => c.method === 'PATCH');
  assert.deepEqual(patch.corpo.sancao_detalhe, detalhe);
  assert.equal(patch.corpo.sancao, 'Advertência + Transferban');
});

test('editar só o status não mexe na sanção', async () => {
  const chamadas = simularSupabase({ temColuna: true });
  await chamar('POST', { acao: 'editar', id: 10, status_etapa: 'Finalizado' });
  const patch = chamadas.find((c) => c.method === 'PATCH');
  assert.equal('sancao' in patch.corpo, false);
  assert.equal('sancao_detalhe' in patch.corpo, false);
});

test('sem a coluna no banco: salva o resto e avisa pelo cabeçalho', async () => {
  const chamadas = simularSupabase({ temColuna: false });
  const r = await chamar('POST', { acao: 'editar', id: 10, sancao: 'Advertência + Transferban', sancao_detalhe: detalhe });
  assert.equal(r.status, 200);
  assert.equal(r.headers['X-Sancao-Detalhe'], 'ignorado');
  const patches = chamadas.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 2, 'tenta com a coluna e repete sem ela');
  assert.equal('sancao_detalhe' in patches[1].corpo, false);
  assert.equal(patches[1].corpo.sancao, 'Advertência + Transferban', 'o resumo é gravado');
});

test('criar sem a coluna e sem sanção: não avisa à toa', async () => {
  simularSupabase({ temColuna: false });
  const r = await chamar('POST', { acao: 'criar', caso_id: 1, nome_etapa: 'Notificação', ordem: 3, status_etapa: 'Pendente ANRESF', sancao: null, sancao_detalhe: null });
  assert.equal(r.status, 201);
  assert.equal(r.headers['X-Sancao-Detalhe'], undefined);
});

test('listar devolve sancaoDetalhe; sem a coluna, mantém turma e responsável', async () => {
  simularSupabase({ temColuna: true });
  let r = await chamar('GET');
  assert.deepEqual(r.dados[0].sancaoDetalhe, detalhe);
  assert.equal(r.dados[0].responsavel, 'Ana');

  simularSupabase({ temColuna: false });
  r = await chamar('GET');
  assert.equal(r.dados[0].sancaoDetalhe, null);
  assert.equal(r.dados[0].responsavel, 'Ana');
});
