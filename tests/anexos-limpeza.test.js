const assert = require('node:assert/strict');
const test = require('node:test');

// /api/anexos-limpeza com o Supabase simulado. O que importa aqui é nunca
// apagar um arquivo em uso: os testes cobrem as formas de citação, a leitura
// paginada das tabelas e as falhas, que precisam interromper tudo.
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/anexos-limpeza.js');

const BASE = 'https://exemplo.supabase.co/storage/v1/object/public/etapas-anexos/';
const antigo = '2026-01-10T12:00:00Z';
const arq = (name, size = 1000, created_at = antigo) => ({ name, id: `id-${name}`, created_at, metadata: { size } });

function banco({ perfil = 'adm', objetos = [], casos = [], etapas = [], tarefas = [], teto = 1000, tetoStorage = 1000, falhar = null, contagemErrada = null } = {}) {
  const estado = { objetos: objetos.slice(), tabelas: { casos, etapas, tarefas }, apagados: [], chamadas: [] };
  global.fetch = async (url, opcoes = {}) => {
    const u = new URL(String(url));
    const metodo = opcoes.method || 'GET';
    const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    const h = opcoes.headers || {};
    estado.chamadas.push({ metodo, caminho: u.pathname, corpo });
    const resp = (status, payload, cab = {}) => ({ ok: status < 400, status, json: async () => payload, headers: { get: (k) => cab[k.toLowerCase()] ?? null } });
    if (u.pathname === '/auth/v1/user') return resp(200, { id: 'u1', email: 'ana@anresf.org.br', user_metadata: { perfil, nome: 'Ana' } });
    if (u.pathname === '/storage/v1/object/list/etapas-anexos') {
      if (falhar === 'storage') return resp(500, { message: 'erro' });
      return resp(200, estado.objetos.slice(corpo.offset, corpo.offset + Math.min(corpo.limit, tetoStorage)));
    }
    if (u.pathname === '/storage/v1/object/etapas-anexos' && metodo === 'DELETE') {
      if (falhar === 'delete') return resp(500, { message: 'erro' });
      const saem = estado.objetos.filter((o) => corpo.prefixes.includes(o.name));
      estado.objetos = estado.objetos.filter((o) => !corpo.prefixes.includes(o.name));
      saem.forEach((o) => estado.apagados.push(o.name));
      return resp(200, saem.map((o) => ({ name: o.name })));
    }
    const tabela = u.pathname.replace('/rest/v1/', '');
    if (estado.tabelas[tabela]) {
      if (falhar === tabela) return resp(500, { message: 'erro' });
      const todas = estado.tabelas[tabela];
      const [ini, fim] = (h.Range || `0-${teto - 1}`).split('-').map(Number);
      const pagina = todas.slice(ini, Math.min(fim + 1, ini + teto));
      const total = contagemErrada && contagemErrada.tabela === tabela ? contagemErrada.total : todas.length;
      return resp(200, pagina, { 'content-range': `${ini}-${ini + pagina.length - 1}/${total}` });
    }
    return resp(404, null);
  };
  return estado;
}

const semUsoDe = (r) => r.dados.arquivos.filter((x) => x.situacao === 'sem-uso');

async function chamar(method, body) {
  const res = { statusCode: 0, corpo: '', setHeader() {}, end(t) { this.corpo = t; } };
  await handler({ method, url: '/api/anexos-limpeza', body, headers: { authorization: 'Bearer token' } }, res);
  return { status: res.statusCode, dados: JSON.parse(res.corpo || 'null') };
}

test('só administrador vê e limpa o armazenamento', async () => {
  for (const perfil of ['gestor', 'analista']) {
    const estado = banco({ perfil, objetos: [arq('1-a.pdf')] });
    assert.equal((await chamar('GET')).status, 403);
    assert.equal((await chamar('POST', { acao: 'excluir', nomes: ['1-a.pdf'] })).status, 403);
    assert.equal(estado.apagados.length, 0);
  }
});

test('em uso é o que aparece em qualquer campo de casos, etapas ou tarefas', async () => {
  banco({
    objetos: [arq('1-etapa.pdf', 100), arq('2-tarefa.zip', 200), arq('3-caso.pdf', 300), arq('4 com espaço.pdf', 400), arq('5-no-json.pdf', 500), arq('6-solto.pdf', 600), arq('7-solto.pdf', 700)],
    etapas: [{ id: 1, doc: `${BASE}1-etapa.pdf` }, { id: 2, doc: `${BASE}4%20com%20espa%C3%A7o.pdf` }, { id: 3, doc: null, sancao_detalhe: { anexo: `${BASE}5-no-json.pdf` } }],
    tarefas: [{ id: 1, anexo_url: `${BASE}2-tarefa.zip?download=1`, anexo_nome: 'x' }],
    casos: [{ id: 1, observacao: 'ver arquivo 3-caso.pdf' }],
  });
  const r = await chamar('GET');
  assert.equal(r.status, 200);
  assert.deepEqual(semUsoDe(r).map((x) => x.nome), ['7-solto.pdf', '6-solto.pdf'], 'do maior para o menor');
  assert.equal(r.dados.semUso.bytes, 1300);
  assert.deepEqual(r.dados.total, { arquivos: 7, bytes: 2800 });
  assert.deepEqual(r.dados.emUso, { arquivos: 5, bytes: 1500 });
  assert.ok(semUsoDe(r)[0].url.endsWith('/etapas-anexos/7-solto.pdf'));
  assert.equal(r.dados.arquivos.length, 7, 'a lista traz todos os arquivos');
  assert.equal(r.dados.arquivos.filter((x) => x.situacao === 'em-uso').length, 5);
});

test('arquivo recente, sem data ou dentro de pasta não entra na lista', async () => {
  const agora = new Date().toISOString();
  banco({ objetos: [arq('1-novo.pdf', 100, agora), { name: '2-sem-data.pdf', id: 'x', metadata: { size: 5 } }, { name: 'pasta', id: null }, arq('3-velho.pdf', 50)] });
  const r = await chamar('GET');
  assert.deepEqual(semUsoDe(r).map((x) => x.nome), ['3-velho.pdf']);
  assert.deepEqual(r.dados.recentes, { arquivos: 2, bytes: 105 });
  assert.deepEqual(r.dados.arquivos.filter((x) => x.situacao === 'recente').map((x) => x.nome).sort(), ['1-novo.pdf', '2-sem-data.pdf']);
  assert.equal(r.dados.pastasIgnoradas, 1);
});

test('tabelas e Storage são lidos por inteiro, página a página', async () => {
  // 2.500 etapas com teto de 1000 por resposta: o arquivo citado só na última
  // página não pode parecer sem uso.
  const etapas = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, doc: i === 2499 ? `${BASE}9-ultima.pdf` : null }));
  const objetos = Array.from({ length: 1200 }, (_, i) => arq(`${String(i).padStart(4, '0')}-solto.pdf`, 1)).concat([arq('9-ultima.pdf', 10)]);
  const estado = banco({ objetos, etapas });
  const r = await chamar('GET');
  assert.equal(r.dados.total.arquivos, 1201);
  assert.equal(r.dados.semUso.arquivos, 1200);
  assert.equal(r.dados.arquivos.find((x) => x.nome === '9-ultima.pdf').situacao, 'em-uso');
  assert.equal(r.dados.linhasConferidas, 2500);
  assert.equal(estado.chamadas.filter((c) => c.caminho === '/rest/v1/etapas').length, 3);
});

test('leitura que falha ou vem incompleta interrompe tudo: nada é listado nem apagado', async () => {
  const objetos = [arq('1-solto.pdf')];
  for (const cenario of [{ falhar: 'etapas' }, { falhar: 'tarefas' }, { falhar: 'casos' }, { falhar: 'storage' }, { contagemErrada: { tabela: 'etapas', total: 99 } }]) {
    const estado = banco({ objetos, etapas: [{ id: 1, doc: null }], ...cenario });
    const lista = await chamar('GET');
    assert.equal(lista.status, 500, JSON.stringify(cenario));
    assert.equal(lista.dados.semUso, undefined);
    assert.equal(lista.dados.arquivos, undefined);
    const exclusao = await chamar('POST', { acao: 'excluir', nomes: ['1-solto.pdf'] });
    assert.equal(exclusao.status, 500);
    assert.equal(estado.apagados.length, 0);
  }
});

test('excluir confere de novo: só sai o que segue sem uso, em lotes', async () => {
  const objetos = Array.from({ length: 230 }, (_, i) => arq(`${i}-solto.pdf`, 10)).concat([arq('em-uso.pdf', 999), arq('novo.pdf', 5, new Date().toISOString())]);
  const estado = banco({ objetos, etapas: [{ id: 1, doc: `${BASE}em-uso.pdf` }] });
  const nomes = objetos.map((o) => o.name).concat(['nao-existe.pdf']);
  const r = await chamar('POST', { acao: 'excluir', nomes });
  assert.equal(r.status, 200);
  assert.equal(r.dados.excluidos, 230);
  assert.equal(r.dados.bytes, 2300);
  assert.deepEqual(r.dados.recusados.sort(), ['em-uso.pdf', 'nao-existe.pdf', 'novo.pdf']);
  assert.deepEqual(estado.objetos.map((o) => o.name).sort(), ['em-uso.pdf', 'novo.pdf']);
  assert.deepEqual(estado.chamadas.filter((c) => c.metodo === 'DELETE').map((c) => c.corpo.prefixes.length), [100, 100, 30]);
});

test('excluir: pedido vazio é recusado e falha do Storage é informada', async () => {
  let estado = banco({ objetos: [arq('1-solto.pdf')] });
  assert.equal((await chamar('POST', { acao: 'excluir', nomes: [] })).status, 400);
  assert.equal((await chamar('POST', { acao: 'outra' })).status, 400);
  assert.equal(estado.apagados.length, 0);
  estado = banco({ objetos: [arq('1-solto.pdf')], falhar: 'delete' });
  const r = await chamar('POST', { acao: 'excluir', nomes: ['1-solto.pdf'] });
  assert.equal(r.status, 502);
  assert.equal(r.dados.excluidos, 0);
  assert.equal(estado.objetos.length, 1);
});

test('Storage que devolve páginas menores do que o pedido: a lista continua completa', async () => {
  const objetos = Array.from({ length: 250 }, (_, i) => arq(`${String(i).padStart(3, '0')}-solto.pdf`, 2));
  banco({ objetos, tetoStorage: 100 });
  const r = await chamar('GET');
  assert.equal(r.dados.total.arquivos, 250);
  assert.equal(r.dados.semUso.arquivos, 250);
});

test('cada arquivo em uso diz onde é usado: caso, etapa ou tarefa', async () => {
  banco({
    objetos: [arq('1-etapa.pdf'), arq('2-tarefa.zip'), arq('3-dois.pdf'), arq('4-solto.pdf'), arq('5-caso.pdf'), arq('6-orfao-de-caso.pdf')],
    casos: [{ id: 10, numero_caso: 48, clube: 'Clube X', observacao: 'ver 5-caso.pdf' }, { id: 11, numero_caso: 60, clube: 'Clube Y' }],
    etapas: [
      { id: 1, caso_id: 10, nome_etapa: 'Parecer Técnico', doc: `${BASE}1-etapa.pdf` },
      { id: 2, caso_id: 11, nome_etapa: 'Acórdão', doc: `${BASE}3-dois.pdf` },
      { id: 3, caso_id: 10, nome_etapa: 'Defesa', doc: `${BASE}3-dois.pdf` },
      { id: 4, caso_id: 999, nome_etapa: 'Ofício', doc: `${BASE}6-orfao-de-caso.pdf` },
    ],
    tarefas: [{ id: 1, etapa_id: 2, anexo_url: `${BASE}2-tarefa.zip` }],
  });
  const r = await chamar('GET');
  const usos = Object.fromEntries(r.dados.arquivos.map((x) => [x.nome, x.usos]));
  assert.deepEqual(usos['1-etapa.pdf'], ['Caso 48 · Clube X › Parecer Técnico']);
  assert.deepEqual(usos['2-tarefa.zip'], ['Caso 60 · Clube Y › Acórdão (tarefa)']);
  assert.deepEqual(usos['3-dois.pdf'], ['Caso 60 · Clube Y › Acórdão', 'Caso 48 · Clube X › Defesa']);
  assert.deepEqual(usos['5-caso.pdf'], ['Caso 48 · Clube X']);
  assert.deepEqual(usos['4-solto.pdf'], []);
  // Etapa cujo caso não existe mais: o arquivo continua contando como em uso.
  assert.deepEqual(usos['6-orfao-de-caso.pdf'], ['Caso não encontrado › Ofício']);
  assert.equal(r.dados.arquivos.find((x) => x.nome === '6-orfao-de-caso.pdf').situacao, 'em-uso');
});
