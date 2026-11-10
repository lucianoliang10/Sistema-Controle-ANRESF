const assert = require('node:assert/strict');
const test = require('node:test');

// /api/indicadores com o Supabase simulado: leitura paginada e compacta,
// importação em lotes, troca do lote ativo e permissões por perfil.
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'chave';
const handler = require('../api/indicadores.js');

function banco({ perfil = 'adm', tabelas = true, dados = [], configs = {}, teto = 1000, ajustes = [] } = {}) {
  const estado = { dados: dados.map((d, i) => ({ id: i + 1, ...d })), configs: { ...configs }, chamadas: [], ajustes: ajustes === false ? null : ajustes.map((a, i) => ({ id: i + 1, ...a })) };
  global.fetch = async (url, opcoes = {}) => {
    const u = new URL(String(url));
    const metodo = opcoes.method || 'GET';
    const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
    const h = opcoes.headers || {};
    estado.chamadas.push({ metodo, caminho: u.pathname + u.search, corpo, range: h.Range });
    const resp = (status, payload, cabecalhos = {}) => ({ ok: status < 400, status, json: async () => payload, headers: { get: (k) => cabecalhos[k.toLowerCase()] ?? null } });
    if (u.pathname === '/auth/v1/user') return resp(200, { id: 'u1', email: 'ana@anresf.org.br', user_metadata: { perfil, nome: 'Ana' } });
    if (!tabelas) return resp(404, { code: 'PGRST205', message: "Could not find the table 'public.indicadores_config' in the schema cache" });
    const filtro = (linhas) => linhas.filter((l) => {
      for (const [k, v] of u.searchParams) {
        if (['select', 'order', 'on_conflict'].includes(k)) continue;
        if (v.startsWith('eq.') && String(l[k]) !== v.slice(3)) return false;
        if (v === 'is.null' && l[k] !== null && l[k] !== undefined) return false;
        if (v.startsWith('neq.') && (l[k] === null || String(l[k]) === v.slice(4))) return false;
        if (v.startsWith('in.(') && !v.slice(4, -1).split(',').includes(String(l[k]))) return false;
      }
      return true;
    });
    if (u.pathname === '/rest/v1/indicadores_config') {
      if (metodo === 'GET') return resp(200, Object.entries(estado.configs).map(([chave, c]) => ({ chave, ...c })));
      corpo.forEach((c) => { estado.configs[c.chave] = { valor: c.valor, atualizado_em: c.atualizado_em, atualizado_por: c.atualizado_por }; });
      return resp(201, corpo);
    }
    if (u.pathname === '/rest/v1/indicadores_dados') {
      if (metodo === 'POST') { corpo.forEach((l) => estado.dados.push({ id: estado.dados.length + 1, ...l })); return resp(201, null); }
      if (metodo === 'DELETE') { const fora = new Set(filtro(estado.dados)); estado.dados = estado.dados.filter((l) => !fora.has(l)); return resp(204, null); }
      const todas = filtro(estado.dados);
      const [ini, fim] = (h.Range || `0-${teto - 1}`).split('-').map(Number);
      const pagina = todas.slice(ini, Math.min(fim + 1, ini + teto));
      return resp(200, pagina, { 'content-range': `${ini}-${ini + pagina.length - 1}/${todas.length}` });
    }
    if (u.pathname === '/rest/v1/indicadores_ajustes') {
      if (!estado.ajustes) return resp(404, { code: 'PGRST205', message: "Could not find the table 'public.indicadores_ajustes' in the schema cache" });
      if (metodo === 'POST') {
        const novas = corpo.map((a) => ({ id: estado.ajustes.length + 1, criado_em: '2026-11-10T12:00:00Z', revisado_em: null, revisado_por: null, revogado_em: null, revogado_por: null, ...a }));
        novas.forEach((a) => estado.ajustes.push(a));
        return resp(201, novas);
      }
      if (metodo === 'PATCH') { const alvo = filtro(estado.ajustes); alvo.forEach((a) => Object.assign(a, corpo)); return resp(200, alvo); }
      const todas = filtro(estado.ajustes);
      return resp(200, todas, { 'content-range': `0-${Math.max(todas.length - 1, 0)}/${todas.length}` });
    }
    return resp(404, null);
  };
  return estado;
}

async function chamar(method, { url = '/api/indicadores', body } = {}) {
  const res = { statusCode: 0, corpo: '', setHeader() {}, end(t) { this.corpo = t; } };
  await handler({ method, url, body, headers: { authorization: 'Bearer token' } }, res);
  return { status: res.statusCode, dados: JSON.parse(res.corpo || 'null') };
}

const linhaBanco = (extra = {}) => ({ lote: 'lote-atual', demonstracao: 'DRE', ano: 2025, clube: 'Clube X', serie: 'A', centro_custo: 'Futebol Profissional', descricao: 'Bilheteria', classificacao: 'Receitas', subclassificacao: 'Operações', valor: 10, ordem: 1, ...extra });
const configLote = { lote_ativo: { valor: { lote: 'lote-atual', total: 3, anos: [2025], clubes: ['Clube X'] } } };

test('sem as tabelas no Supabase: responde vazio, avisando', async () => {
  banco({ tabelas: false });
  const r = await chamar('GET');
  assert.equal(r.status, 200);
  assert.equal(r.dados.semTabelas, true);
  assert.deepEqual(r.dados.linhas, []);
});

test('tabelas criadas e base vazia: sem lote, mas devolve a config salva', async () => {
  banco({ configs: { formulas: { valor: { desativados: ['resultado:a12.bilheteria'] }, atualizado_por: 'Ana', atualizado_em: '2026-11-10T12:00:00Z' } } });
  const r = await chamar('GET');
  assert.equal(r.dados.lote, null);
  assert.deepEqual(r.dados.config.valor.desativados, ['resultado:a12.bilheteria']);
  assert.equal(r.dados.perfil, 'adm');
});

test('leitura para os cálculos: só o lote ativo, sem zeradas nem DFC, paginada e compacta', async () => {
  const dados = [];
  for (let i = 0; i < 25; i += 1) dados.push(linhaBanco({ descricao: `Rubrica ${i % 3}`, valor: i + 1, clube: i % 2 ? 'Clube Y' : 'Clube X', serie: i % 2 ? 'B' : 'A' }));
  dados.push(linhaBanco({ valor: 0 }), linhaBanco({ valor: null }), linhaBanco({ demonstracao: 'DFC', valor: 5 }), linhaBanco({ lote: 'lote-velho', valor: 99 }));
  const estado = banco({ dados, configs: { ...configLote, catalogo: { valor: [{ dem: 'DRE', descricao: 'Bilheteria' }] } }, teto: 10 });
  const r = await chamar('GET');
  assert.equal(r.status, 200);
  assert.equal(r.dados.linhas.length, 25, 'três páginas de 10 juntadas');
  assert.deepEqual(estado.chamadas.filter((c) => c.caminho.includes('indicadores_dados')).map((c) => c.range), ['0-999', '10-19', '20-29']);
  assert.deepEqual(r.dados.clubes, [['Clube X', 'A'], ['Clube Y', 'B']]);
  const [dem, ano, clube, centro, desc, classe, sub, valor] = r.dados.linhas[1];
  assert.deepEqual([dem, ano, clube, valor], [1, 2025, 1, 2]);
  assert.deepEqual([centro, desc, classe, sub].map((i) => r.dados.dic[i]), ['Futebol Profissional', 'Rubrica 1', 'Receitas', 'Operações']);
  assert.equal(r.dados.dic.length, 6, 'cada texto aparece uma vez no dicionário');
  assert.equal(r.dados.catalogo.length, 1);
  assert.equal(r.dados.lote.lote, 'lote-atual');
});

test('base de um clube: todas as linhas, com zeradas, nulas e DFC', async () => {
  banco({ dados: [linhaBanco(), linhaBanco({ valor: 0, ordem: 2 }), linhaBanco({ valor: null, ordem: 3 }), linhaBanco({ demonstracao: 'DFC', centro_custo: '', ordem: 1 }), linhaBanco({ clube: 'Clube Y' })], configs: configLote });
  const r = await chamar('GET', { url: '/api/indicadores?clube=Clube%20X' });
  assert.equal(r.dados.linhas.length, 4);
  assert.deepEqual(r.dados.linhas[2], { dem: 'DRE', ano: 2025, clube: 'Clube X', serie: 'A', centro: 'Futebol Profissional', descricao: 'Bilheteria', classificacao: 'Receitas', subclassificacao: 'Operações', valor: null, ordem: 3 });
  assert.equal(r.dados.linhas[3].dem, 'DFC');
});

test('importar: só administrador; linhas conferidas e limpas antes de gravar', async () => {
  banco({ perfil: 'gestor' });
  assert.equal((await chamar('POST', { body: { acao: 'importar', lote: 'lote-novo1', linhas: [{}] } })).status, 403);

  const estado = banco({ perfil: 'adm' });
  const ok = await chamar('POST', { body: { acao: 'importar', lote: 'lote-novo1', linhas: [
    { dem: 'bp', ano: 2025, clube: '  Clube   X ', serie: 'A', centro: '', descricao: 'Caixa', classificacao: 'Ativo', subclassificacao: 'Ativo Circulante', valor: '12.5', ordem: 1, extra: 'ignorado' },
    { dem: 'DMPL', ano: 2025, clube: 'Clube X', descricao: 'Dividendos', valor: null },
  ] } });
  assert.equal(ok.status, 201);
  assert.deepEqual(estado.dados[0], { id: 1, lote: 'lote-novo1', demonstracao: 'BP', ano: 2025, clube: 'Clube X', serie: 'A', centro_custo: '', descricao: 'Caixa', classificacao: 'Ativo', subclassificacao: 'Ativo Circulante', valor: 12.5, ordem: 1 });
  assert.equal(estado.dados[1].valor, null);

  const ruim = await chamar('POST', { body: { acao: 'importar', lote: 'lote-novo1', linhas: [{ dem: 'XYZ', ano: 2025, clube: 'C', descricao: 'd', valor: 1 }] } });
  assert.equal(ruim.status, 400);
  assert.equal((await chamar('POST', { body: { acao: 'importar', lote: 'x', linhas: [{}] } })).status, 400, 'lote inválido');
});

test('ativar: recusa importação incompleta; completa troca o lote e apaga o antigo', async () => {
  const estado = banco({ dados: [linhaBanco({ lote: 'lote-atual' }), linhaBanco({ lote: 'lote-novo1' }), linhaBanco({ lote: 'lote-novo1', valor: 20 })], configs: configLote });
  const incompleta = await chamar('POST', { body: { acao: 'ativar', lote: 'lote-novo1', resumo: { total: 3 } } });
  assert.equal(incompleta.status, 409);
  assert.match(incompleta.dados.erro, /2 de 3/);
  assert.equal(estado.configs.lote_ativo.valor.lote, 'lote-atual', 'a base anterior continua valendo');

  const r = await chamar('POST', { body: { acao: 'ativar', lote: 'lote-novo1', resumo: { total: 2, arquivo: 'base.xlsx', clubes: ['Clube X'], anos: [2025], porDemonstracao: { DRE: 2 } }, catalogo: [{ dem: 'DRE', centro: 'FP', classificacao: 'Receitas', subclassificacao: 'Op', descricao: 'Bilheteria' }, { dem: 'ZZ', descricao: 'x' }] } });
  assert.equal(r.status, 200);
  assert.equal(estado.configs.lote_ativo.valor.lote, 'lote-novo1');
  assert.equal(estado.configs.lote_ativo.valor.importado_por, 'Ana');
  assert.equal(estado.configs.lote_ativo.valor.arquivo, 'base.xlsx');
  assert.equal(estado.configs.catalogo.valor.length, 1, 'entrada inválida do catálogo é descartada');
  assert.deepEqual(estado.dados.map((l) => l.lote), ['lote-novo1', 'lote-novo1']);
});

test('descartar: apaga o lote que falhou, nunca o que está em uso', async () => {
  const estado = banco({ dados: [linhaBanco(), linhaBanco({ lote: 'lote-falho' })], configs: configLote });
  assert.equal((await chamar('POST', { body: { acao: 'descartar', lote: 'lote-atual' } })).status, 409);
  assert.equal((await chamar('POST', { body: { acao: 'descartar', lote: 'lote-falho' } })).status, 200);
  assert.deepEqual(estado.dados.map((l) => l.lote), ['lote-atual']);
});

test('salvar fórmulas: administrador e gestor podem; analista não', async () => {
  const config = { desativados: ['resultado:a12.bilheteria'], parametros: { considerarInvestimentos: false } };
  banco({ perfil: 'analista' });
  assert.equal((await chamar('POST', { body: { acao: 'salvar-config', config } })).status, 403);
  const estado = banco({ perfil: 'gestor' });
  const r = await chamar('POST', { body: { acao: 'salvar-config', config } });
  assert.equal(r.status, 200);
  assert.deepEqual(estado.configs.formulas.valor, config);
  assert.equal(estado.configs.formulas.atualizado_por, 'Ana');
  assert.equal(r.dados.config.atualizado_por, 'Ana');
  assert.equal((await chamar('POST', { body: { acao: 'salvar-config', config: [] } })).status, 400);
  assert.equal((await chamar('POST', { body: { acao: 'outra' } })).status, 400);
});

// ---------- ajustes manuais ----------

const catalogoX = { catalogo: { valor: [
  { dem: 'DRE', centro: 'Futebol Profissional', classificacao: 'Receitas', subclassificacao: 'Operações', descricao: 'Bilheteria' },
  { dem: 'DRE', centro: 'Futebol Profissional', classificacao: 'Receitas', subclassificacao: 'Operações', descricao: 'Patrocínio' },
] } };
const rubricaX = { clube: 'Clube X', ano: 2025, dem: 'DRE', centro: 'Futebol Profissional', classificacao: 'Receitas', subclassificacao: 'Operações', descricao: 'Bilheteria' };

test('ajuste: qualquer perfil lança; o servidor guarda o valor declarado e o autor', async () => {
  const estado = banco({ perfil: 'analista', dados: [linhaBanco({ valor: 10 }), linhaBanco({ valor: 5 }), linhaBanco({ descricao: 'Patrocínio', valor: 99 })], configs: { ...configLote, ...catalogoX } });
  const r = await chamar('POST', { body: { acao: 'ajustar', ...rubricaX, descricao: '  bilheteria ', valor: -4, justificativa: 'Receita de 2026 lançada em 2025', valor_declarado: 777 } });
  assert.equal(r.status, 201);
  assert.equal(r.dados.ajuste.valor, -4);
  assert.equal(r.dados.ajuste.valor_declarado, 15, 'soma das linhas da rubrica, não o que o navegador mandou');
  assert.equal(r.dados.ajuste.descricao, 'Bilheteria', 'grava o nome como está na base');
  assert.equal(r.dados.ajuste.criado_por, 'Ana');
  assert.equal(estado.ajustes.length, 1);

  const lista = await chamar('GET');
  assert.equal(lista.dados.ajustes.length, 1);
  assert.equal(lista.dados.ajustes[0].dem, 'DRE');
  assert.equal(lista.dados.semTabelaAjustes, undefined);
});

test('ajuste: recusa sem justificativa, valor zero, DFC, clube ou exercício fora da base e rubrica inexistente', async () => {
  const estado = banco({ dados: [linhaBanco()], configs: { ...configLote, ...catalogoX } });
  const tentar = (extra) => chamar('POST', { body: { acao: 'ajustar', ...rubricaX, valor: 3, justificativa: 'Motivo do ajuste', ...extra } });
  assert.equal((await tentar({ justificativa: '  ' })).status, 400);
  assert.equal((await tentar({ valor: 0 })).status, 400);
  assert.equal((await tentar({ valor: 'abc' })).status, 400);
  assert.equal((await tentar({ dem: 'DFC' })).status, 400);
  assert.equal((await tentar({ clube: 'Outro Clube' })).status, 400);
  assert.equal((await tentar({ ano: 2019 })).status, 400);
  assert.equal((await tentar({ descricao: 'Rubrica que não existe' })).status, 400);
  assert.equal(estado.ajustes.length, 0);
  // Rubrica do modelo que o clube deixou em branco: pode ajustar (declarado = 0).
  const r = await tentar({ descricao: 'Patrocínio' });
  assert.equal(r.status, 201);
  assert.equal(r.dados.ajuste.valor_declarado, 0);
});

test('ajuste: desfazer marca quem e quando, sem apagar; não desfaz duas vezes', async () => {
  const estado = banco({ perfil: 'gestor', dados: [linhaBanco()], configs: configLote, ajustes: [{ ...ajusteBanco(), revogado_em: null }] });
  const r = await chamar('POST', { body: { acao: 'revogar-ajuste', id: 1 } });
  assert.equal(r.status, 200);
  assert.ok(r.dados.ajuste.revogado_em);
  assert.equal(r.dados.ajuste.revogado_por, 'Ana');
  assert.equal(estado.ajustes.length, 1, 'o registro continua no histórico');
  assert.equal((await chamar('POST', { body: { acao: 'revogar-ajuste', id: 1 } })).status, 404);
  assert.equal((await chamar('POST', { body: { acao: 'revogar-ajuste', id: 'x' } })).status, 400);
});

test('ajuste: manter depois de a base mudar atualiza o valor declarado de referência', async () => {
  const estado = banco({ perfil: 'analista', dados: [linhaBanco({ valor: 40 })], configs: configLote, ajustes: [{ ...ajusteBanco(), valor_declarado: 10, revogado_em: null }] });
  const r = await chamar('POST', { body: { acao: 'confirmar-ajuste', id: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.dados.ajuste.valor_declarado, 40);
  assert.equal(r.dados.ajuste.revisado_por, 'Ana');
  assert.equal(estado.ajustes[0].valor, -4, 'o valor do ajuste não muda');
});

test('ajuste: sem a tabela no Supabase, os cálculos seguem e o lançamento avisa', async () => {
  banco({ dados: [linhaBanco()], configs: { ...configLote, ...catalogoX }, ajustes: false });
  const lista = await chamar('GET');
  assert.equal(lista.status, 200);
  assert.equal(lista.dados.linhas.length, 1);
  assert.deepEqual(lista.dados.ajustes, []);
  assert.equal(lista.dados.semTabelaAjustes, true);
  const r = await chamar('POST', { body: { acao: 'ajustar', ...rubricaX, valor: 3, justificativa: 'Motivo do ajuste' } });
  assert.equal(r.status, 409);
  assert.equal(r.dados.semTabelaAjustes, true);
});

function ajusteBanco() {
  return { clube: 'Clube X', ano: 2025, demonstracao: 'DRE', centro_custo: 'Futebol Profissional', descricao: 'Bilheteria', classificacao: 'Receitas', subclassificacao: 'Operações', valor: -4, valor_declarado: 10, justificativa: 'Motivo', criado_em: '2026-11-01T10:00:00Z', criado_por: 'Bia' };
}
