const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Regras puras da sanção por categoria; a parte de formulário depende de DOM.
const contexto = {
  console,
  normStatus: (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  esc: (s) => String(s),
};
contexto.tipoBaseEtapa = (nome) => contexto.normStatus(String(nome || '').split(/\s+[-–—]\s+/)[0]);
vm.createContext(contexto);
vm.runInContext(fs.readFileSync('js/sancao-categorias.js', 'utf8'), contexto);
vm.runInContext(fs.readFileSync('js/sugestoes-etapa.js', 'utf8'), contexto);
const c = contexto;
const json = (v) => JSON.parse(JSON.stringify(v));

test('só Auto de Infração, Acórdão e Decisão da Presidência têm sanção', () => {
  assert.equal(c.sancTipoEtapa('Auto de Infração - PSO'), 'proposta');
  assert.equal(c.sancTipoEtapa('Acórdão - PSS'), 'aplicada');
  assert.equal(c.sancTipoEtapa('Acórdão Decisão da Presidência'), 'aplicada');
  assert.equal(c.sancTipoEtapa('Decisão da Presidência'), 'aplicada');
  assert.equal(c.sancTipoEtapa('Decisão Presidência - Despacho'), null);
  assert.equal(c.sancTipoEtapa('Despacho do Relator'), null);
  assert.equal(c.sancTipoEtapa('Parecer Técnico Conclusivo'), null);
  assert.equal(c.sancTipoEtapa('Notificação'), null);
  assert.equal(c.sancTipoEtapa(''), null);
});

test('detalhe: guarda só categorias conhecidas e preenchidas; aceita JSON em texto', () => {
  assert.deepEqual(json(c.sancDetalheLimpo({ transicao: ' Transferban ', empregados: '', outra: 'x', geral: 'Advertência' })),
    { transicao: 'Transferban', geral: 'Advertência' });
  assert.deepEqual(json(c.sancDetalheLimpo('{"poder_publico":"Exclusão PARF-B"}')), { poder_publico: 'Exclusão PARF-B' });
  assert.equal(c.sancDetalheLimpo({ transicao: '  ' }), null);
  assert.equal(c.sancDetalheLimpo('não é json'), null);
  assert.equal(c.sancDetalheLimpo(null), null);
  assert.equal(c.sancDetalheLimpo(['x']), null);
});

test('resumo: Geral primeiro, cada sanção uma vez, sem a numeração (i)/(ii)', () => {
  assert.equal(c.sancResumoDetalhe({
    transicao: 'Advertência + Transferban',
    clubes_nacionais: 'Transferban + Multa 100k',
    poder_publico: '(ii) Exclusão PARF-B',
    geral: 'Advertência',
  }), 'Advertência + Transferban + Multa 100k + Exclusão PARF-B');
  assert.equal(c.sancResumoDetalhe({ geral: 'Arquivamento' }), 'Arquivamento');
  assert.equal(c.sancResumoDetalhe({}), '');
  assert.equal(c.sancResumoDetalhe(null), '');
});

test('linhas para exibir seguem a ordem das categorias, com Geral por último', () => {
  const linhas = json(c.sancLinhasDetalhe({ geral: 'Advertência', poder_publico: 'Exclusão PARF-B', transicao: 'Transferban' }));
  assert.deepEqual(linhas.map((l) => [l.curto, l.valor]), [['Transição', 'Transferban'], ['Poder público', 'Exclusão PARF-B'], ['Geral', 'Advertência']]);
});

test('sugestões por categoria: primeiro o histórico da categoria, depois as sanções avulsas do mesmo tipo de etapa', () => {
  const rows = [
    { etapa: 'Auto de Infração - PSO', sancaoDetalhe: { transicao: 'Transferban', geral: 'Advertência' } },
    { etapa: 'Auto de Infração - PSS', sancaoDetalhe: { transicao: 'Transferban' } },
    { etapa: 'Auto de Infração - PSO', sancaoDetalhe: { transicao: 'Multa 20k' } },
    { etapa: 'Auto de Infração - PSO', sancao: 'Advertência + (i) Exclusão PARF-B + (ii) Exclusão PARF-B' },
    { etapa: 'Acórdão - PSO', sancao: 'Advertência + Transferban prospectivo' },
    { etapa: 'Parecer Técnico Conclusivo', sancao: 'Recomenda multa' },
  ];
  assert.deepEqual(Array.from(c.sancSugestoesCategoria(rows, 'Auto de Infração - PSO', 'transicao')),
    ['Transferban', 'Multa 20k', 'Advertência', 'Exclusão PARF-B']);
  // No acórdão só entram acórdãos.
  assert.deepEqual(Array.from(c.sancSugestoesCategoria(rows, 'Acórdão - PSS', 'poder_publico')),
    ['Advertência', 'Transferban prospectivo']);
});

test('referência do acórdão: o auto do mesmo caso e processo, o mais recente', () => {
  const rows = [
    { caso_banco_id: 7, etapa: 'Auto de Infração - PSS', dataEnvio: '01/03/2026', sancao: 'Advertência', etapa_banco_id: 1 },
    { caso_banco_id: 7, etapa: 'Auto de Infração - PSO', dataEnvio: '01/02/2026', sancaoDetalhe: { transicao: 'Transferban' }, sancao: 'Transferban', etapa_banco_id: 2 },
    { caso_banco_id: 7, etapa: 'Auto de Infração - PSO', dataEnvio: '15/02/2026', sancaoDetalhe: { transicao: 'Multa 20k' }, sancao: 'Multa 20k', etapa_banco_id: 3 },
    { caso_banco_id: 8, etapa: 'Auto de Infração - PSO', dataEnvio: '20/02/2026', sancao: 'Advertência', etapa_banco_id: 4 },
    { caso_banco_id: 7, etapa: 'Auto de Infração - PSO', dataEnvio: '20/02/2026', sancao: '', etapa_banco_id: 5 },
  ];
  assert.equal(c.sancAutoDeReferencia(rows, '7', 'Acórdão - PSO').etapa_banco_id, 3);
  assert.equal(c.sancAutoDeReferencia(rows, 7, 'Acórdão - PSS').etapa_banco_id, 1);
  assert.equal(c.sancAutoDeReferencia(rows, 7, 'Acórdão').etapa_banco_id, 1, 'sem PSS/PSO no nome: o auto mais recente do caso');
  assert.equal(c.sancAutoDeReferencia(rows, 9, 'Acórdão - PSO'), null);
  assert.equal(c.sancAutoDeReferencia(rows, '', 'Acórdão - PSO'), null);
});

test('card: por categoria quando há detalhe; texto antigo quando não há', () => {
  const html = c.sancaoHtmlEtapa({ sancao: 'Advertência + Transferban', sancaoDetalhe: { transicao: 'Transferban', geral: 'Advertência' } });
  assert.match(html, /sancao-cat/);
  assert.match(html, /Transição<\/span><strong>Transferban/);
  assert.equal(c.sancaoHtmlEtapa({ sancao: 'Advertência' }), '<p class="sancao">Advertência</p>');
  assert.equal(c.sancaoHtmlEtapa({ sancao: 'Advertência' }, 'hist-sancao'), '<span class="hist-sancao">Advertência</span>');
  assert.equal(c.sancaoHtmlEtapa({ sancao: '' }), '');
});

test('sugestão em campo com várias sanções: vale o pedaço depois do último "+"', () => {
  assert.equal(c.sugestoesUltimaParte('Advertência + Transf'), 'Transf');
  assert.equal(c.sugestoesUltimaParte('Advertência +'), '');
  assert.equal(c.sugestoesUltimaParte('Multa'), 'Multa');
  assert.equal(c.sugestoesTrocarUltimaParte('Advertência + Transf', 'Transferban'), 'Advertência + Transferban');
  assert.equal(c.sugestoesTrocarUltimaParte('Advertência +', 'Multa 20k'), 'Advertência + Multa 20k');
  assert.equal(c.sugestoesTrocarUltimaParte('Transf', 'Transferban'), 'Transferban');
  const rows = [{ etapa: 'Auto de Infração - PSO', sancaoDetalhe: { empregados: 'Transferban' } }, { etapa: 'Auto de Infração - PSO', objeto: 'Lavratura' }];
  assert.deepEqual(Array.from(c.sugestoesDoCampo(rows, 'Auto de Infração - PSO', 'sancao:empregados')), ['Transferban']);
  assert.deepEqual(Array.from(c.sugestoesDoCampo(rows, 'Auto de Infração - PSO', 'objeto')), ['Lavratura']);
});

test('modo do bloco pela origem do caso', () => {
  assert.equal(c.sancModoOrigem('Solvência'), 'categorias');
  assert.equal(c.sancModoOrigem('Monitoramento'), 'categorias');
  assert.equal(c.sancModoOrigem('Denúncia'), 'periodo');
  assert.equal(c.sancModoOrigem('DF'), 'livre');
  assert.equal(c.sancModoOrigem('Evento de Insolvência'), 'livre');
  assert.equal(c.sancModoOrigem(''), 'livre');
  assert.equal(c.sancModoOrigem('Omissão'), 'unico');
  assert.deepEqual(Array.from(c.sancCategoriasDoModo('unico')).map((x) => x.chave), ['omissao']);
  assert.deepEqual(json(c.sancDetalheLimpo({ omissao: 'Advertência + Multa 20k' })), { omissao: 'Advertência + Multa 20k' });
  assert.equal(c.sancResumoDetalhe({ omissao: 'Advertência + Multa 20k' }), 'Advertência + Multa 20k');
  assert.deepEqual(json(c.sancLinhasDetalhe({ omissao: 'Multa 20k' })).map((l) => [l.curto, l.valor]), [['Omissão', 'Multa 20k']]);
  assert.deepEqual(Array.from(c.sancCategoriasDoModo('periodo')).map((x) => x.chave), ['transitorio', 'plena', 'geral']);
  assert.deepEqual(Array.from(c.sancCategoriasDoModo('categorias')).map((x) => x.chave), ['transicao', 'empregados', 'clubes_nacionais', 'clubes_estrangeiros', 'poder_publico', 'geral']);
  assert.equal(c.sancCategoriasDoModo('livre').length, 0);
});

test('detalhe de denúncia e linhas livres: limpeza, resumo e exibição', () => {
  assert.deepEqual(json(c.sancDetalheLimpo({ transitorio: 'Advertência', plena: ' ', geral: '' })), { transitorio: 'Advertência' });
  const livre = { livre: [{ motivo: 'Atraso na entrega', sancao: 'Multa 20k' }, { motivo: '', sancao: '' }, { motivo: 'Sem auditoria', sancao: 'Advertência + Multa 20k' }], geral: 'Advertência' };
  assert.deepEqual(json(c.sancDetalheLimpo(livre)), { geral: 'Advertência', livre: [{ motivo: 'Atraso na entrega', sancao: 'Multa 20k' }, { motivo: 'Sem auditoria', sancao: 'Advertência + Multa 20k' }] });
  assert.equal(c.sancDetalheLimpo({ livre: [{ motivo: ' ', sancao: '' }] }), null);
  assert.equal(c.sancResumoDetalhe(livre), 'Advertência + Multa 20k');
  assert.deepEqual(json(c.sancLinhasDetalhe(livre)).map((l) => [l.curto, l.valor]),
    [['Atraso na entrega', 'Multa 20k'], ['Sem auditoria', 'Advertência + Multa 20k'], ['Geral', 'Advertência']]);
  assert.deepEqual(json(c.sancLinhasDetalhe({ plena: 'Transferban', transitorio: 'Advertência' })).map((l) => l.curto), ['Período transitório', 'Aplicação plena']);
  assert.match(c.sancaoHtmlEtapa({ sancaoDetalhe: livre }), /Atraso na entrega<\/span><strong>Multa 20k/);
});

test('sugestões: motivos das linhas livres e sanções avulsas para a linha livre', () => {
  const rows = [
    { etapa: 'Auto de Infração - PSS', sancaoDetalhe: { livre: [{ motivo: 'Atraso na entrega', sancao: 'Multa 20k' }] } },
    { etapa: 'Auto de Infração - PSS', sancaoDetalhe: { livre: [{ motivo: 'Atraso na entrega', sancao: 'Multa 40k' }, { motivo: 'Parecer com ressalva', sancao: 'Advertência' }] } },
    { etapa: 'Auto de Infração - PSO', sancao: 'Advertência + Transferban' },
    { etapa: 'Acórdão - PSS', sancaoDetalhe: { livre: [{ motivo: 'Outro', sancao: 'Arquivamento' }] } },
  ];
  assert.deepEqual(Array.from(c.sancSugestoesCategoria(rows, 'Auto de Infração - PSS', 'motivo')), ['Atraso na entrega', 'Parecer com ressalva']);
  assert.deepEqual(Array.from(c.sancSugestoesCategoria(rows, 'Auto de Infração - PSS', 'livre')), ['Advertência', 'Multa 20k', 'Multa 40k', 'Transferban']);
  assert.deepEqual(Array.from(c.sancSugestoesCategoria(rows, 'Acórdão - PSS', 'motivo')), ['Outro']);
});
