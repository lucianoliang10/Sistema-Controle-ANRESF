const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
};

vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);

function registro(id, clube = 'Clube') {
  return {
    id,
    caso: '1',
    tipo: 'Parecer Técnico',
    obs: 'Sem inconsistência',
    row: { clube, origem: 'Monitoramento' },
  };
}

test('separa vários termos por vírgula, ponto e vírgula ou quebra de linha', () => {
  const termos = contexto.idsTermosBusca('001/2026, 014/2026; Botafogo\nParecer');
  assert.deepEqual(Array.from(termos), ['001/2026', '014/2026', 'botafogo', 'parecer']);
});

test('aceita um registro quando ele corresponde a qualquer termo informado', () => {
  const termos = contexto.idsTermosBusca('001/2026, 014/2026');
  assert.equal(contexto.idsCorrespondeBusca(registro('014/2026'), termos), true);
  assert.equal(contexto.idsCorrespondeBusca(registro('099/2026'), termos), false);
});

test('mantém busca por outros campos e aceita busca vazia', () => {
  assert.equal(contexto.idsCorrespondeBusca(registro('099/2026', 'SAF Botafogo'), ['botafogo']), true);
  assert.equal(contexto.idsCorrespondeBusca(registro('099/2026'), []), true);
});

// ---- coluna "Caso" com o título completo e as colunas retiradas ----

test('busca também encontra pelo denunciante', () => {
  const r = registro('083/2026', 'América MG');
  r.row.origem = 'Denúncia';
  r.row.denunciante = 'Atleta Yarlen';
  assert.equal(contexto.idsCorrespondeBusca(r, ['yarlen']), true);
  assert.equal(contexto.idsCorrespondeBusca(registro('083/2026', 'América MG'), ['yarlen']), false);
});

test('coluna Caso traz o título com as partes; sem a regra do Fluxograma, só o clube', () => {
  const row = { clube: 'América MG', origem: 'Denúncia', denunciante: 'Atleta Yarlen' };
  // operacional.js carregado sozinho: não há parteCasoFluxograma no contexto.
  assert.equal(contexto.opCasoTituloCompleto('83', row), 'Caso 83 · América MG');
  contexto.parteCasoFluxograma = (r) => `${r.denunciante} x ${r.clube}`;
  try {
    assert.equal(contexto.opCasoTituloCompleto('83', row), 'Caso 83 · Atleta Yarlen x América MG');
  } finally {
    delete contexto.parteCasoFluxograma;
  }
  assert.equal(contexto.opCasoTituloCompleto('5', {}), 'Caso 5 · Sem clube');
});

test('tabela de IDs não tem mais Tipo, Processo principal e Subprocesso', () => {
  const labels = Array.from(vm.runInContext('IDS_COLUNAS', contexto), (c) => c.label);
  assert.deepEqual(labels, ['ID', 'Clube', 'Caso', 'Origem', 'Etapa', 'Status', 'Observação', 'Ações']);
  // Uma ordenação antiga guardada no estado não quebra: cai no valor neutro.
  const x = registro('001/2026');
  assert.deepEqual({ ...contexto.idsValorOrdenacao(x, 'principal') }, { s: '' });
  assert.deepEqual({ ...contexto.idsValorOrdenacao(x, 'sub') }, { s: '' });
  assert.deepEqual({ ...contexto.idsValorOrdenacao(x, 'tipo') }, { s: '' });
});
