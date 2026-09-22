const assert = require('node:assert/strict');
const test = require('node:test');

// O perfil vem do user_metadata do Supabase Auth, preenchido à mão. Aqui só a
// normalização: qualquer grafia razoável tem de cair num dos três papéis.
const { normalizarPerfil } = require('../api/login.js');

test('administrador, em qualquer grafia usual, vira adm', () => {
  ['adm', 'Admin', 'ADMINISTRADOR', 'administradora', ' adm '].forEach((v) => assert.equal(normalizarPerfil(v), 'adm', v));
});

test('gestor e variações', () => {
  ['gestor', 'Gestora', 'gerente', 'manager'].forEach((v) => assert.equal(normalizarPerfil(v), 'gestor', v));
});

test('"usuário" é o papel comum: analista', () => {
  ['usuário', 'Usuario', 'user', 'comum', 'analista', 'Analista Técnico'].forEach((v) => assert.equal(normalizarPerfil(v), 'analista', v));
});

test('vazio cai em analista; valor desconhecido passa como está, em minúsculas', () => {
  assert.equal(normalizarPerfil(''), 'analista');
  assert.equal(normalizarPerfil(undefined), 'analista');
  assert.equal(normalizarPerfil('Auditor'), 'auditor');
});
