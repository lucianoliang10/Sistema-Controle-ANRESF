const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Nome do usuário: lido do user_metadata em qualquer grafia da chave; sem
// nome no cadastro, derivado do e-mail (para a saudação não virar "usuário").
const { nomeDoMetadado, nomeDoEmail } = require('../api/_usuario-meta.js');
const { montarUsuario } = require('../api/login.js');

test('nome em qualquer grafia da chave', () => {
  assert.equal(nomeDoMetadado({ nome: 'Marina Fernandes' }), 'Marina Fernandes');
  assert.equal(nomeDoMetadado({ Nome: ' Marina Fernandes ' }), 'Marina Fernandes');
  assert.equal(nomeDoMetadado({ full_name: 'Vinicius Borges' }), 'Vinicius Borges');
  assert.equal(nomeDoMetadado({ 'Display Name': 'Luciano Liang' }), 'Luciano Liang');
  assert.equal(nomeDoMetadado({ nome_completo: 'Ana Souza' }), 'Ana Souza');
  assert.equal(nomeDoMetadado({ nome: '', name: 'Fallback' }), 'Fallback', 'valor vazio não conta');
  assert.equal(nomeDoMetadado({ email_verified: true }), '');
  assert.equal(nomeDoMetadado(null), '');
});

test('nome derivado do e-mail', () => {
  assert.equal(nomeDoEmail('marina.fernandes@anresf.org.br'), 'Marina Fernandes');
  assert.equal(nomeDoEmail('JOAO_DA_SILVA2@x.com'), 'Joao da Silva');
  assert.equal(nomeDoEmail('vinicius-borges@x.com'), 'Vinicius Borges');
  assert.equal(nomeDoEmail(''), '');
});

test('login: cadastro sem nome usa o e-mail; com nome, o nome', () => {
  assert.equal(montarUsuario({ id: '1', email: 'marina.fernandes@anresf.org.br', user_metadata: { perfil: 'adm' } }).nome, 'Marina Fernandes');
  const u = montarUsuario({ id: '2', email: 'x@y.com', user_metadata: { Nome: 'Marina Fernandes', perfil: 'adm' } });
  assert.equal(u.nome, 'Marina Fernandes');
  assert.equal(u.perfil, 'adm');
});

test('front: sessão antiga sem nome já mostra o nome tirado do e-mail', () => {
  const store = new Map([['anresf_auth', JSON.stringify({ access_token: 't', usuario: { email: 'marina.fernandes@anresf.org.br', nome: '', perfil: 'adm' } })]]);
  const ctx = {
    console,
    window: { fetch: () => Promise.resolve({ status: 200 }) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    document: { readyState: 'loading', addEventListener: () => {}, querySelector: () => null },
    Headers: class {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/auth.js', 'utf8'), ctx);
  assert.equal(ctx.nomeAtual(), 'Marina Fernandes');
  store.set('anresf_auth', JSON.stringify({ access_token: 't', usuario: { email: 'm@x.com', nome: 'Marina F.', perfil: 'adm' } }));
  assert.equal(ctx.nomeAtual(), 'Marina F.', 'nome cadastrado tem prioridade');
});
