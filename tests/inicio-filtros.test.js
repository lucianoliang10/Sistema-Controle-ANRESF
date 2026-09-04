const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Mínimo de globais para carregar inicio.js e exercitar a regra pura de filtro.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  valor: (v, fb = '—') => (v === null || v === undefined || v === '' ? fb : v),
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  esc: (s) => String(s),
  dadosTarefas: [],
  dadosFluxograma: [],
};

vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/inicio.js', 'utf8'), contexto);

const pendencia = (extra = {}) => ({ responsavel: 'Ana', origem: 'DF 2026', ...extra });
const ehMinha = (r) => r === 'Luciano';

test('analista: só as próprias pendências, e a origem recorta por cima disso', () => {
  const base = { gestor: false, ehMinha };
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Luciano' }), base), true);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Ana' }), base), false);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Luciano', origem: 'Denúncia' }), { ...base, origem: 'DF 2026' }), false);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Luciano', origem: 'DF 2026' }), { ...base, origem: 'DF 2026' }), true);
});

test('gestor: vê tudo; responsável e origem filtram em conjunto (E)', () => {
  const base = { gestor: true, ehMinha };
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Ana' }), base), true);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Ana' }), { ...base, responsavel: 'Luciano' }), false);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Ana', origem: 'Denúncia' }), { ...base, responsavel: 'Ana', origem: 'Denúncia' }), true);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Ana', origem: 'DF 2026' }), { ...base, responsavel: 'Ana', origem: 'Denúncia' }), false);
});

test('"todas" e "todos" não filtram nada', () => {
  const f = { gestor: true, responsavel: 'todos', origem: 'todas', ehMinha };
  assert.equal(contexto.inicioFiltroAceita(pendencia({ origem: 'Sem origem' }), f), true);
  assert.equal(contexto.inicioFiltroAceita(pendencia({ responsavel: 'Não definido' }), f), true);
});

test('pendências carregam a origem do caso (tarefa e etapa)', () => {
  contexto.dadosTarefas = [{ id: 1, etapa_id: 10, numero_caso: 44, clube: 'Sport', origem: 'Denúncia', nome_etapa: 'Acórdão', observacao: 'x', responsavel: 'Ana', data_final: '2026-09-08', status_tarefa: 'Pendente' }];
  contexto.dadosFluxograma = [{ etapa_banco_id: 20, statusEtapa: 'Pendente ANRESF', etapa: 'Despacho do Relator', prazoFinal: '30/09/2026', clube: 'Náutico', responsavel: 'Ana', casoRaiz: '60' }];
  contexto.tarefaFinalizada = (t) => t.status_tarefa === 'Concluída';
  contexto.tarefaDiasRestantes = () => 3;
  contexto.isoToBrDate = (s) => s;
  contexto.brToIsoDate = (s) => s;
  const todas = contexto.pendenciasTodas();
  assert.deepEqual(Array.from(todas, (p) => p.origem), ['Denúncia', 'Sem origem']);
});
