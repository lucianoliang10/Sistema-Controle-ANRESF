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
