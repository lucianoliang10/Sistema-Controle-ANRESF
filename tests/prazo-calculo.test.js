const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Só a matemática de datas; a parte de interface depende de DOM e fica de fora.
const contexto = { console };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/prazo-calculo.js', 'utf8'), contexto);

const {
  prazoPascoa, prazoEhFeriadoNacional, prazoEhDiaUtil,
  prazoSomarDiasCorridos, prazoSomarDiasUteis, prazoCalcular, prazoParaBr,
} = contexto;

const dia = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const pascoaIso = (ano) => {
  const d = prazoPascoa(ano);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Páscoa calculada bate com as datas conhecidas', () => {
  assert.equal(pascoaIso(2024), '2024-03-31');
  assert.equal(pascoaIso(2025), '2025-04-20');
  assert.equal(pascoaIso(2026), '2026-04-05');
  assert.equal(pascoaIso(2027), '2027-03-28');
});

test('feriados nacionais fixos e a Sexta-feira Santa', () => {
  ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12',
    '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'].forEach((iso) => {
    assert.equal(prazoEhFeriadoNacional(dia(iso)), true, iso);
  });
  assert.equal(prazoEhFeriadoNacional(dia('2026-04-03')), true, 'Sexta-feira Santa de 2026');
});

test('Carnaval e Corpus Christi são ponto facultativo e contam como dia útil', () => {
  // Páscoa 2026 em 05/04: Carnaval 16 e 17/02, Corpus Christi 04/06.
  assert.equal(prazoEhFeriadoNacional(dia('2026-02-16')), false);
  assert.equal(prazoEhFeriadoNacional(dia('2026-02-17')), false);
  assert.equal(prazoEhFeriadoNacional(dia('2026-06-04')), false);
  assert.equal(prazoEhDiaUtil(dia('2026-02-17')), true, 'terça de Carnaval é dia útil nesta regra');
});

test('fim de semana e feriado não são dia útil', () => {
  assert.equal(prazoEhDiaUtil(dia('2026-09-12')), false, 'sábado');
  assert.equal(prazoEhDiaUtil(dia('2026-09-13')), false, 'domingo');
  assert.equal(prazoEhDiaUtil(dia('2026-09-07')), false, 'Independência, numa segunda');
  assert.equal(prazoEhDiaUtil(dia('2026-09-14')), true, 'segunda comum');
});

test('dias corridos soma literal, sem prorrogar', () => {
  assert.equal(prazoSomarDiasCorridos('2026-08-31', 10), '2026-09-10');
  assert.equal(prazoSomarDiasCorridos('2026-09-11', 1), '2026-09-12', 'cai num sábado e fica no sábado');
  assert.equal(prazoSomarDiasCorridos('2026-12-28', 10), '2027-01-07', 'atravessa o ano');
  assert.equal(prazoSomarDiasCorridos('2026-08-31', 0), '2026-08-31');
});

test('dias úteis pula fim de semana e feriado, sem contar o dia da base', () => {
  // 31/08 é segunda. 01 a 04/09 são 4 úteis; 05 e 06 fim de semana;
  // 07/09 é Independência; o 5º útil cai em 08/09.
  assert.equal(prazoSomarDiasUteis('2026-08-31', 5), '2026-09-08');
  assert.equal(prazoSomarDiasUteis('2026-08-31', 1), '2026-09-01');
  assert.equal(prazoSomarDiasUteis('2026-09-11', 1), '2026-09-14', 'sexta + 1 útil = segunda');
  assert.equal(prazoSomarDiasUteis('2026-08-31', 0), '2026-08-31', 'zero devolve a própria base');
});

test('20 dias úteis a partir da ciência — o prazo do Acórdão 039/2026', () => {
  // Decisão de 21/08/2026 (sexta). 20 dias úteis caem em 21/09/2026,
  // já descontados 07/09 (Independência) e os fins de semana.
  assert.equal(prazoSomarDiasUteis('2026-08-21', 20), '2026-09-21');
});

test('entrada inválida devolve vazio em vez de data errada', () => {
  assert.equal(prazoSomarDiasUteis('', 5), '');
  assert.equal(prazoSomarDiasCorridos('', 5), '');
  assert.equal(prazoSomarDiasUteis('31/08/2026', 5), '', 'só aceita AAAA-MM-DD');
  assert.equal(prazoSomarDiasUteis('2026-08-31', ''), '');
  assert.equal(prazoSomarDiasUteis('2026-08-31', 'abc'), '');
});

test('prazoCalcular escolhe o modo; o padrão é dias úteis', () => {
  assert.equal(prazoCalcular('2026-08-31', 5, 'uteis'), '2026-09-08');
  assert.equal(prazoCalcular('2026-08-31', 5, 'corridos'), '2026-09-05');
  assert.equal(prazoCalcular('2026-08-31', 5), '2026-09-08');
});

test('formatação brasileira para a dica exibida', () => {
  assert.equal(prazoParaBr('2026-09-08'), '08/09/2026');
  assert.equal(prazoParaBr(''), '');
});

test('número negativo é recusado nos dois modos', () => {
  assert.equal(prazoSomarDiasUteis('2026-08-31', -3), '');
  assert.equal(prazoSomarDiasCorridos('2026-08-31', -3), '');
});
