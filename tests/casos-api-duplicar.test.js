const assert = require('node:assert/strict');
const test = require('node:test');

// /api/casos duplicar: a cópia nasce sem anexos e com todas as etapas
// "Aguardando etapa anterior".
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/casos.js');

test('duplicar: etapas sem doc e aguardando etapa anterior; tarefas sem anexo', async () => {
  const inseridos = {};
  global.fetch = async (url, opcoes = {}) => {
    const u = String(url); const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    const r = (status, dados) => ({ ok: status < 400, status, json: async () => dados });
    if (u.includes('/auth/v1/user')) return r(200, { id: 'u1' });
    if (opcoes.method === 'POST' && u.endsWith('/rest/v1/casos')) { inseridos.caso = corpo; return r(201, [{ id: 900, ...corpo }]); }
    if (opcoes.method === 'POST' && u.endsWith('/rest/v1/etapas')) { inseridos.etapas = corpo; return r(201, corpo.map((e, i) => ({ id: 1000 + i, ...e }))); }
    if (opcoes.method === 'POST' && u.endsWith('/rest/v1/tarefas')) { inseridos.tarefas = corpo; return r(201, corpo); }
    if (u.includes('casos?id=eq.5')) return r(200, [{ id: 5, numero_caso: 5, origem: 'DF', clube: 'Remo', periodo: '2026', serie: 'A', status_caso: 'Finalizado', observacao: 'o' }]);
    if (u.includes('casos?select=numero_caso')) return r(200, [{ numero_caso: 90 }]);
    if (u.includes('etapas?caso_id=eq.5')) return r(200, [
      { id: 1, nome_etapa: 'Auto de Infração - PSS', ordem: 1, id_etapa: '001/2026', status_etapa: 'Finalizado', doc: 'https://x/auto.zip', sancao: 'Advertência', sancao_detalhe: { livre: [{ motivo: 'Atraso', sancao: 'Advertência' }] } },
      { id: 2, nome_etapa: 'Acórdão - PSS', ordem: 2, id_etapa: '002/2026', status_etapa: 'Pendente ANRESF', doc: null, sancao: null },
    ]);
    if (u.includes('etapas?select=nome_etapa,id_etapa')) return r(200, []);
    if (u.includes('tarefas?etapa_id=in.')) return r(200, [{ id: 7, etapa_id: 1, observacao: 't', responsavel: 'Ana', anexo_url: 'https://x/t.pdf', anexo_nome: 't.pdf', status_tarefa: 'Pendente' }]);
    return r(404, null);
  };
  const res = { statusCode: 0, corpo: '', setHeader() {}, end(t) { this.corpo = t; } };
  await handler({ method: 'POST', body: { acao: 'duplicar', id: 5 }, headers: { authorization: 'Bearer t' } }, res);
  assert.equal(res.statusCode, 201, res.corpo);
  assert.equal(inseridos.etapas.length, 2);
  inseridos.etapas.forEach((e) => { assert.equal(e.status_etapa, 'Aguardando etapa anterior'); assert.equal(e.doc, null); });
  assert.deepEqual(inseridos.etapas[0].sancao_detalhe, { livre: [{ motivo: 'Atraso', sancao: 'Advertência' }] }, 'sanção por categoria é copiada');
  assert.equal('sancao_detalhe' in inseridos.etapas[1], false, 'sem detalhe, não manda a coluna');
  assert.equal(inseridos.tarefas[0].anexo_url, null);
  assert.equal(inseridos.tarefas[0].anexo_nome, null);
});
