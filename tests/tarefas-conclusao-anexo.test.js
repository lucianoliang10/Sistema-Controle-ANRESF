const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// tarefas.js registra ouvintes e dispara o carregamento ao carregar; aqui o
// DOM é um stub e o fetch nunca resolve. Só o fluxo de concluir com anexo é
// exercitado, com o upload e o salvamento substituídos por stubs.
const contexto = {
  console: { ...console, log: () => {} },
  document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], body: { insertAdjacentHTML: () => {} } },
  window: {},
  fetch: () => new Promise(() => {}),
  plural: (n, s, p) => `${n} ${n === 1 ? s : p}`,
  esc: (s) => String(s),
  valor: (v, fb = '—') => (v === null || v === undefined || String(v).trim() === '' ? fb : v),
  dadosTarefas: [],
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/tarefas.js', 'utf8'), contexto);

const form = ({ files = [], remover = '', conclusao = 'Feito.' } = {}) => {
  const botao = { disabled: false };
  return {
    conclusao: { value: conclusao },
    anexo: { files },
    dataset: { removerAnexo: remover },
    querySelector: () => botao,
    botao,
  };
};

test.beforeEach(() => {
  contexto.enviarAnexoTarefa = async () => ({ anexo_url: 'https://storage/x.zip', anexo_nome: 'x.zip' });
  contexto.feedbacks = [];
  contexto.mostrarFeedbackModalTarefa = (tipo, texto) => contexto.feedbacks.push([tipo, texto]);
  contexto.salvos = [];
  contexto.salvarAlteracaoTarefa = async (payload) => contexto.salvos.push(payload);
});

test('sem arquivo e sem pedido de remoção, o anexo atual fica como está', async () => {
  contexto.enviarAnexoTarefa = async () => { throw new Error('não deveria subir nada'); };
  assert.deepEqual({ ...(await contexto.camposAnexoDoModal(form())) }, {});
});

test('arquivo selecionado sobe para o storage e vira anexo_url/anexo_nome', async () => {
  const campos = await contexto.camposAnexoDoModal(form({ files: [{ name: 'a.pdf' }] }));
  assert.deepEqual({ ...campos }, { anexo_url: 'https://storage/x.zip', anexo_nome: 'x.zip' });
  assert.deepEqual(Array.from(contexto.feedbacks[0]), ['', 'Enviando 1 anexo…']);
});

test('remover sem arquivo novo zera o anexo; com arquivo novo, o novo prevalece', async () => {
  assert.deepEqual({ ...(await contexto.camposAnexoDoModal(form({ remover: '1' }))) }, { anexo_url: null, anexo_nome: null });
  const campos = await contexto.camposAnexoDoModal(form({ remover: '1', files: [{ name: 'a.pdf' }] }));
  assert.equal(campos.anexo_url, 'https://storage/x.zip');
});

test('concluir tarefa envia conclusão + anexo no mesmo salvamento', async () => {
  const f = form({ files: [{ name: 'comprovante.pdf' }], conclusao: '  Relatório enviado.  ' });
  await contexto.salvarConclusaoTarefa({ preventDefault() {}, currentTarget: f }, 42);
  assert.equal(contexto.salvos.length, 1);
  assert.deepEqual({ ...contexto.salvos[0] }, {
    id: 42, status_tarefa: 'Concluída', conclusao: 'Relatório enviado.',
    anexo_url: 'https://storage/x.zip', anexo_nome: 'x.zip',
  });
  assert.equal(f.botao.disabled, false, 'botão reabilitado ao final');
});

test('concluir sem anexo continua funcionando como antes', async () => {
  await contexto.salvarConclusaoTarefa({ preventDefault() {}, currentTarget: form() }, 7);
  assert.deepEqual({ ...contexto.salvos[0] }, { id: 7, status_tarefa: 'Concluída', conclusao: 'Feito.' });
});

test('conclusão vazia é recusada antes de qualquer upload', async () => {
  contexto.enviarAnexoTarefa = async () => { throw new Error('não deveria subir nada'); };
  await contexto.salvarConclusaoTarefa({ preventDefault() {}, currentTarget: form({ files: [{}], conclusao: '   ' }) }, 7);
  assert.equal(contexto.salvos.length, 0);
  assert.deepEqual(Array.from(contexto.feedbacks.at(-1)), ['erro', 'Conclusão é obrigatória.']);
});

test('falha no upload não conclui a tarefa e avisa no modal', async () => {
  contexto.enviarAnexoTarefa = async () => { throw new Error('Arquivo grande demais.'); };
  const f = form({ files: [{ name: 'a.pdf' }] });
  await contexto.salvarConclusaoTarefa({ preventDefault() {}, currentTarget: f }, 7);
  assert.equal(contexto.salvos.length, 0);
  assert.deepEqual(Array.from(contexto.feedbacks.at(-1)), ['erro', 'Arquivo grande demais.']);
  assert.equal(f.botao.disabled, false);
});
