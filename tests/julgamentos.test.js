const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Painel Julgamentos: em que rota/pendência cada caso cai.
const contexto = {
  console,
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navItems: [],
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  isFinalizada: (row) => String(row.statusEtapa || '').toLowerCase() === 'finalizado',
  compararCaso: (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }),
  esc: (s) => String(s),
  dadosFluxograma: [],
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/panels/operacional.js', 'utf8'), contexto);
const { julgamentoDoCaso } = contexto;

const caso = (rows) => ({ caso: '53', clube: 'América MG', serie: 'B', origem: 'Denúncia', rows });
const etapa = (nome, status, extra = {}) => ({ etapa: nome, statusEtapa: status, dataEnvio: '01/09/2026', ...extra });

test('parecer conclusivo ainda em elaboração, com prazo vencido, NÃO entra no julgamento', () => {
  // Casos 53/54: parecer "Pendente ANRESF" com prazo já passado.
  const c = caso([
    etapa('Auto de Infração', 'Finalizado'),
    etapa('Parecer Técnico Conclusivo', 'Pendente ANRESF', { prazoFinal: '15/09/2026', responsavel: 'Eduardo Serrano', objeto: 'Elaboração de Parecer Técnico Conclusivo' }),
  ]);
  assert.equal(julgamentoDoCaso(c), null);
});

test('parecer em elaboração sem prazo também fica de fora', () => {
  assert.equal(julgamentoDoCaso(caso([etapa('Parecer Técnico Conclusivo', 'Aguardando etapa anterior')])), null);
});

test('parecer FINALIZADO e sem despacho segue para a Decisão da Presidência', () => {
  const j = julgamentoDoCaso(caso([etapa('Parecer Técnico Conclusivo', 'Finalizado', { responsavel: 'Eduardo Serrano', objeto: 'Parecer' })]));
  assert.equal(j.rota, 'Parecer Conclusivo → Presidência');
  assert.equal(j.situacaoLabel, 'Agendar Decisão da Presidência');
  assert.equal(j.relator, 'Eduardo Serrano');
});

test('parecer finalizado + acórdão da Presidência pendente: aguardando julgamento', () => {
  const j = julgamentoDoCaso(caso([
    etapa('Parecer Técnico Conclusivo', 'Finalizado'),
    etapa('Acórdão - Decisão da Presidência', 'Pendente ANRESF', { dataEnvio: '20/10/2026' }),
  ]));
  assert.equal(j.situacaoLabel, 'Aguardando julgamento');
  assert.equal(j.dataJulgamento, '20/10/2026');
});

test('rota do Despacho do Relator não muda: aberto com relator = "Com o relator"', () => {
  const j = julgamentoDoCaso(caso([
    etapa('Parecer Técnico Conclusivo', 'Pendente ANRESF', { prazoFinal: '15/09/2026' }),
    etapa('Despacho do Relator', 'Pendente ANRESF', { responsavel: 'Vantuil Gonçalves' }),
  ]));
  assert.equal(j.rota, 'Despacho do Relator');
  assert.equal(j.situacaoLabel, 'Com o relator');
});

test('acórdão finalizado sai da fila', () => {
  assert.equal(julgamentoDoCaso(caso([etapa('Despacho do Relator', 'Finalizado'), etapa('Acórdão - PSO', 'Finalizado', { sancao: 'Advertência' })])), null);
});
