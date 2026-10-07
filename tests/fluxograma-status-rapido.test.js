const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Troca rápida de status (card, histórico, drawer): o select-pill e a ação
// alterarStatusEtapa com "Desfazer". fetch, recarga e mensagens são stubs.
const contexto = {
  console: { ...console, log: () => {} },
  document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  localStorage: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(),
  fetch: () => new Promise(() => {}),
  navItems: [],
  valor: (v, fb = '—') => (v === null || v === undefined || String(v).trim() === '' ? fb : v),
  esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  groupBy: (arr, fn) => arr.reduce((m, x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()),
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }),
  numeroCaso: (row) => String(row.casoRaiz || row.numero_caso || 'Caso'),
  statusPill: (status) => {
    const n = String(status || '').toLowerCase();
    const classe = n === 'finalizado' ? 'green' : n.includes('clube') ? 'orange' : n.includes('anresf') ? 'blue' : n.includes('aguardando') ? 'neutral' : 'gold';
    return `<span class="pill ${classe}">${status || '—'}</span>`;
  },
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/fluxograma.js', 'utf8'), contexto);

test('select-pill: opções padrão, atual selecionada, cor herdada do status', () => {
  const html = contexto.statusPillEditavel({ etapa_banco_id: 7, etapa: 'Defesa', statusEtapa: 'Pendente Clube' });
  assert.match(html, /class="pill pill-select orange"/);
  assert.match(html, /data-status-etapa="7"/);
  assert.match(html, /data-status-anterior="Pendente Clube"/);
  assert.match(html, /<option value="Pendente Clube" selected>/);
  assert.equal((html.match(/<option /g) || []).length, 4);
});

test('status fora do padrão entra como primeira opção, para não sumir', () => {
  const html = contexto.statusPillEditavel({ etapa_banco_id: 7, etapa: 'X', statusEtapa: 'Em diligência' });
  assert.equal((html.match(/<option /g) || []).length, 5);
  assert.match(html, /<option value="Em diligência" selected>/);
});

test('etapa sem id de banco fica com a pill fixa', () => {
  const html = contexto.statusPillEditavel({ etapa: 'X', statusEtapa: 'Finalizado' });
  assert.equal(html.includes('<select'), false);
  assert.match(html, /pill green/);
});

// ---- ação rápida ----
function prepararAcao() {
  const chamadas = { fetch: [], recargas: 0, mensagens: [], renders: 0, drawer: 0, painel: 0 };
  contexto.dadosFluxograma = [{ casoRaiz: '53', etapa_banco_id: 7, etapa: 'Defesa', statusEtapa: 'Pendente Clube' }];
  contexto.casoSelecionado = '53';
  contexto.fetch = async (url, opts) => { chamadas.fetch.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}) }; };
  contexto.recarregarFluxograma = async () => { chamadas.recargas += 1; };
  contexto.renderizarFluxograma = () => { chamadas.renders += 1; };
  contexto.mostrarMensagemFluxograma = (tipo, texto, acao) => chamadas.mensagens.push({ tipo, texto, acao });
  contexto.atualizarDrawerSeAberto = () => { chamadas.drawer += 1; };
  contexto.reRenderPainelAtivo = () => { chamadas.painel += 1; };
  return chamadas;
}

test('troca de status salva só o status, recarrega e oferece Desfazer', async () => {
  const c = prepararAcao();
  await contexto.alterarStatusEtapa(7, 'Finalizado', 'Pendente Clube');
  assert.deepEqual(c.fetch[0], { acao: 'editar', id: 7, status_etapa: 'Finalizado' });
  assert.equal(c.recargas, 1);
  assert.equal(c.drawer, 1, 'drawer aberto é atualizado');
  assert.equal(c.painel, 1, 'painel ativo (Início, Prazos…) é atualizado');
  const msg = c.mensagens[0];
  assert.equal(msg.tipo, 'sucesso');
  assert.match(msg.texto, /"Defesa" agora está Finalizado/);
  assert.equal(msg.acao.rotulo, 'Desfazer');

  // Desfazer volta ao status anterior e não oferece novo Desfazer.
  await msg.acao.aoClicar();
  assert.deepEqual(c.fetch[1], { acao: 'editar', id: 7, status_etapa: 'Pendente Clube' });
  assert.match(c.mensagens[1].texto, /restaurado para Pendente Clube/);
  assert.equal(c.mensagens[1].acao, undefined);
});

test('erro na API: não recarrega, re-renderiza (select volta) e avisa', async () => {
  const c = prepararAcao();
  contexto.fetch = async () => ({ ok: false, status: 500, json: async () => ({ erro: 'Supabase indisponível' }) });
  await contexto.alterarStatusEtapa(7, 'Finalizado', 'Pendente Clube');
  assert.equal(c.recargas, 0);
  assert.equal(c.renders, 1);
  assert.deepEqual(c.mensagens[0], { tipo: 'erro', texto: 'Supabase indisponível', acao: undefined });
});

test('id inválido ou status vazio: nada acontece', async () => {
  const c = prepararAcao();
  await contexto.alterarStatusEtapa('abc', 'Finalizado', 'x');
  await contexto.alterarStatusEtapa(7, '', 'x');
  assert.equal(c.fetch.length, 0);
});

// ---- lembrar o caso ----
test('último caso aberto é lembrado e restaurado quando ainda existe', () => {
  contexto.dadosFluxograma = [{ casoRaiz: '1' }, { casoRaiz: '53' }, { casoRaiz: '80' }];
  contexto.casoSelecionado = '53';
  contexto.linhasDoCasoSelecionado();
  assert.equal(contexto.localStorage.getItem('anresf.fluxograma.caso'), '53');
  contexto.casoSelecionado = '';
  contexto.linhasDoCasoSelecionado();
  assert.equal(contexto.casoSelecionado, '53', 'volta ao caso lembrado, não ao primeiro');
  contexto.localStorage.setItem('anresf.fluxograma.caso', '999');
  contexto.casoSelecionado = '';
  contexto.linhasDoCasoSelecionado();
  assert.equal(contexto.casoSelecionado, '1', 'caso lembrado que não existe mais cai no primeiro');
});
