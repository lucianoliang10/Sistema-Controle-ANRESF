const assert = require('node:assert/strict');
const test = require('node:test');

// Motor dos indicadores do RSSF. Os dados são fictícios; a conferência com a
// planilha de origem (40 clubes) é feita fora do repositório.
const m = require('../js/indicadores-formulas.js');

const dre = (ano, centro, classificacao, sub, descricao, valor, clube = 'Clube X') => ({ dem: 'DRE', ano, clube, serie: 'A', centro, descricao, classificacao, subclassificacao: sub, valor });
const bp = (ano, sub, descricao, valor, clube = 'Clube X') => ({ dem: 'BP', ano, clube, serie: 'A', centro: '', descricao, classificacao: sub.startsWith('Ativo') ? 'Ativo' : 'Passivo', subclassificacao: sub, valor });
const dmpl = (ano, descricao, coluna, valor, clube = 'Clube X') => ({ dem: 'DMPL', ano, clube, serie: 'A', centro: '', descricao, classificacao: coluna, subclassificacao: '', valor });
const FP = 'Futebol Profissional';

function linhas2025() {
  return [
    // receitas operacionais: 1000 + 200 (base) + 300
    dre(2025, FP, 'Receitas', 'Mídia e publicidade convencional', 'Direitos de transmissão fixos', 1000),
    dre(2025, 'Categorias de Base', 'Receitas', 'Mídia e publicidade convencional', 'Direitos de transmissão fixos', 200),
    dre(2025, FP, 'Receitas', 'Operações Desportivas e Premiações', 'Bilheteria', 300),
    // não entra em A.1.2
    dre(2025, FP, 'Receitas', 'Outras operações', '(+/-) Resultado de Equivalência Patrimonial', 999),
    // financeiras: 50
    dre(2025, 'Resultado Financeiro', 'Receitas', 'Receitas financeiras', '(+) Descontos obtidos', 50),
    dre(2025, 'Resultado Financeiro', 'Receitas', 'Receitas financeiras', '(+) Ajuste a valor justo', 70),
    // transferências: 400 − 100
    dre(2025, FP, 'Receitas', 'Outras operações', 'Vendas de atletas', 400),
    dre(2025, FP, 'Custos', 'Amortização, imparidade e custo de registro', 'Custo com atletas negociados - Vendas', 100),
    // deduções: 30 (arena, com outra caixa) + 20
    dre(2025, FP, 'Custos', 'Outras despesas operacionais', 'Direito de Arena', 30),
    dre(2025, FP, 'Receitas', 'Outras deduções', '(-) Outras deduções', 20),
    // despesas operacionais: 500 (salários FP) + 80 (salários base) + 60 (materiais base)
    dre(2025, FP, 'Custos', 'Benefícios a empregados - Pessoas relevantes', 'Salários, encargos e benefícios a funcionários e prêmios', 500),
    dre(2025, 'Categorias de Base', 'Custos', 'Benefícios a empregados - Pessoas relevantes', 'Salários, encargos e benefícios a funcionários e prêmios', 80),
    dre(2025, 'Categorias de Base', 'Custos', 'Custas das vendas/materiais', 'Materiais', 60),
    // amortização: 150 (FP) + 10 (base: fica fora do investimento relevante)
    dre(2025, FP, 'Custos', 'Amortização, imparidade e custo de registro', 'Amortizações de direitos sobre atletas', 150),
    dre(2025, 'Categorias de Base', 'Custos', 'Amortização, imparidade e custo de registro', 'Amortizações de direitos sobre atletas', 10),
    dre(2025, 'Resultado Financeiro', 'Despesas', 'Despesas financeiras', '(-) IOF', 40),
    // dividendos (negativo na DMPL) e contribuição
    dmpl(2025, 'Dividendos', 'Lucros e prejuízos acumulados', -25),
    dmpl(2025, 'Aumento de capital', 'Capital Social', 90),
    // balanço
    bp(2025, 'Passivo Circulante', 'Empréstimos e Financiamentos – Bancos, Empresas e Pessoas Físicas', 300),
    bp(2025, 'Passivo Circulante', 'Passivo de Arrendamento', 20),
    bp(2025, 'Passivo não Circulante', 'Passivo de arrendamento', 999),
    bp(2025, 'Passivo Circulante', 'Contas a pagar - Clubes (Transferências de atletas)', 100),
    bp(2025, 'Ativo Circulante', 'Caixa e equivalentes de caixa', 70),
    bp(2025, 'Ativo Circulante', 'Partes relacionadas', 55),
    bp(2025, 'Passivo Circulante', 'Partes Relacionadas', 5),
  ];
}

const base2025 = () => m.indPrepararBase(linhas2025());
const padrao = () => m.indDefinicaoEfetiva(null);

test('comparação de textos ignora caixa e espaços, mas não acento', () => {
  assert.equal(m.indChave('  Direito   de ARENA '), 'direito de arena');
  assert.notEqual(m.indChave('Estádio'), m.indChave('Estadio'));
});

test('fórmula padrão: chaves únicas e todo item com fonte e filtro', () => {
  const ef = padrao();
  const chaves = new Set();
  m.IND_ORDEM.forEach((id) => ef[id].grupos.forEach((g) => g.itens.forEach((item) => {
    assert.ok(!chaves.has(item.chave), `chave repetida: ${item.chave}`);
    chaves.add(item.chave);
    assert.ok(['BP', 'DRE', 'DMPL'].includes(item.fonte), item.chave);
    assert.ok(Object.keys(item.onde).length > 0, `sem filtro: ${item.chave}`);
    assert.equal(item.ativo, true);
  })));
  assert.equal(ef.resultado.grupos.length, 13);
  assert.equal(ef.elenco.limite, 0.70);
  assert.equal(ef.endividamento.limite, 0.45);
});

test('Anexo A: resultado da operação, ajuste dos investimentos e contribuições', () => {
  const r = m.indCalcularResultado(base2025(), padrao(), 'Clube X', 2025);
  assert.equal(r.grupos.a12.total, 1500);
  assert.equal(r.grupos.a13.total, 50, 'ajuste a valor justo não entra');
  assert.equal(r.grupos.a14.total, 300, 'vendas − custo das vendas');
  assert.equal(r.grupos.a15.total, 50, '"Direito de arena" casa com "Direito de Arena"');
  assert.equal(r.receitas, 1500 + 50 + 300 - 50);
  assert.equal(r.grupos.a22.total, 640);
  assert.equal(r.grupos.a23.total, 160);
  assert.equal(r.grupos.a25.total, 40);
  assert.equal(r.grupos.a27.total, 25, 'dividendo negativo na DMPL vira despesa');
  assert.equal(r.despesas, 640 + 160 + 40 + 25);
  assert.equal(r.resultado, 1800 - 865);
  assert.equal(r.custosExcluidos, 140, 'custos da base, sem a amortização de atletas');
  assert.equal(r.receitasExcluidas, 200);
  assert.equal(r.ajustado, 935 + 140 - 200);
  assert.equal(r.contribuicoes, 90);
  assert.equal(r.valor, 965);
  assert.equal(r.status, 'Resultado positivo');
  assert.equal(r.linhas.find((l) => l.final).valor, 965);
});

test('Anexo A: sem considerar investimentos relevantes, A.3 sai da conta', () => {
  const ef = m.indDefinicaoEfetiva({ parametros: { considerarInvestimentos: false } });
  const r = m.indCalcularResultado(base2025(), ef, 'Clube X', 2025);
  assert.equal(r.custosExcluidos, 0);
  assert.equal(r.receitasExcluidas, 0);
  assert.equal(r.valor, 935 + 90);
});

test('desligar uma rubrica tira o valor dela de todos os totais', () => {
  const ef = m.indDefinicaoEfetiva({ desativados: ['resultado:a12.bilheteria'] });
  const r = m.indCalcularResultado(base2025(), ef, 'Clube X', 2025);
  assert.equal(r.grupos.a12.total, 1200);
  const item = r.grupos.a12.itens.find((i) => i.item.chave === 'resultado:a12.bilheteria');
  assert.equal(item.bruto, 300, 'o valor continua visível');
  assert.equal(item.contribuicao, 0);
  assert.equal(r.valor, 965 - 300);
  // O endividamento usa as mesmas receitas relevantes.
  const e = m.indCalcularEndividamento(base2025(), ef, 'Clube X', 2025);
  assert.equal(e.receitas, 1800 - 300);
});

test('tirar só uma linha de origem de dentro de um item', () => {
  const base = base2025();
  const alvo = linhas2025().find((l) => l.centro === 'Categorias de Base' && l.descricao === 'Direitos de transmissão fixos');
  const ef = m.indDefinicaoEfetiva({ excluidas: { 'resultado:a12.direitos-de-transmissao-fixos': [m.indChaveRubrica(alvo)] } });
  const r = m.indCalcularResultado(base, ef, 'Clube X', 2025);
  assert.equal(r.grupos.a12.total, 1300);
  const item = r.grupos.a12.itens[0];
  assert.deepEqual(item.partes.map((p) => [p.row.centro, p.valor, p.excluida]), [[FP, 1000, false], ['Categorias de Base', 200, true]]);
});

test('acrescentar uma rubrica da base a um grupo, somando ou subtraindo', () => {
  const add = (sinal) => ({ adicionados: [{ indicador: 'resultado', grupo: 'a13', id: 'x1', rotulo: 'Ajuste a valor justo', fonte: 'DRE', sinal, onde: { descricao: ['(+) Ajuste a valor justo'] } }] });
  const base = base2025();
  assert.equal(m.indCalcularResultado(base, m.indDefinicaoEfetiva(add(1)), 'Clube X', 2025).grupos.a13.total, 120);
  assert.equal(m.indCalcularResultado(base, m.indDefinicaoEfetiva(add(-1)), 'Clube X', 2025).grupos.a13.total, -20);
  const item = m.indDefinicaoEfetiva(add(1)).resultado.grupos.find((g) => g.id === 'a13').itens.at(-1);
  assert.equal(item.adicionado, true);
  assert.equal(item.chave, 'resultado:a13.x1');
});

test('Anexo C: obrigações líquidas sobre receitas relevantes', () => {
  const e = m.indCalcularEndividamento(base2025(), padrao(), 'Clube X', 2025);
  assert.equal(e.grupos.ogcp.total, 325, 'empréstimos + arrendamento do circulante + partes relacionadas do passivo');
  assert.equal(e.grupos.ot.total, 100);
  assert.equal(e.grupos.alcp.total, 70);
  assert.equal(e.obrigacoes, 355);
  assert.equal(e.receitas, 1800);
  assert.ok(Math.abs(e.valor - 355 / 1800) < 1e-12);
  assert.equal(e.status, 'Em conformidade');
  const apertado = m.indPrepararBase(linhas2025().concat([bp(2025, 'Passivo Circulante', 'Fornecedores vencidos a mais de 90 dias', 600)]));
  assert.equal(m.indCalcularEndividamento(apertado, padrao(), 'Clube X', 2025).status, 'Não conformidade');
});

test('Anexo B: custo com elenco, RLMT de três exercícios e versão ajustada', () => {
  const venda = (ano, valor) => dre(ano, FP, 'Receitas', 'Outras operações', 'Vendas de atletas', valor);
  const base = m.indPrepararBase(linhas2025().concat([venda(2024, 700), venda(2023, 100)]));
  const b = m.indCalcularElenco(base, padrao(), 'Clube X', 2025);
  assert.equal(b.grupos.b1.total, 500, 'só Futebol Profissional');
  assert.equal(b.grupos.b2.total, 150);
  assert.equal(b.numerador, 650);
  assert.equal(b.receitaOperacional, 1500);
  assert.deepEqual(b.anosRlt.map((a) => [a.ano, a.calculo.total]), [[2025, 300], [2024, 700], [2023, 100]]);
  assert.ok(Math.abs(b.rlmt - 1100 / 3) < 1e-9);
  assert.equal(b.rlmtIncompleto, false);
  assert.ok(Math.abs(b.indice - 650 / (1500 + 1100 / 3)) < 1e-12);
  assert.ok(Math.abs(b.valor - 650 / (1500 + 1100 / 3 + 90)) < 1e-12);
  assert.equal(b.status, 'Em conformidade');
});

test('Anexo B: sem os três exercícios na base, a média usa os que existem e avisa', () => {
  const b = m.indCalcularElenco(base2025(), padrao(), 'Clube X', 2025);
  assert.equal(b.rlmt, 300);
  assert.equal(b.rlmtIncompleto, true);
  assert.deepEqual(b.anosSemBase, [2024, 2023]);
  // Ano que existe na base (informado de fora), mesmo sem valor para o clube, conta como zero.
  const comAnos = m.indPrepararBase(linhas2025(), [2023, 2024, 2025]);
  const c = m.indCalcularElenco(comAnos, padrao(), 'Clube X', 2025);
  assert.equal(c.rlmt, 100);
  assert.equal(c.rlmtIncompleto, false);
});

test('clube sem dados no exercício: "Sem dados", nunca divisão por zero', () => {
  const base = m.indPrepararBase(linhas2025(), [2024, 2025]);
  const e = m.indCalcularEndividamento(base, padrao(), 'Clube X', 2024);
  assert.equal(e.valor, null);
  assert.equal(e.conforme, null);
  assert.equal(e.status, 'Sem dados');
  assert.equal(m.indCalcularResultado(base, padrao(), 'Clube X', 2024).status, 'Sem dados');
});

test('rastreio: onde uma linha da base entra, e itens sem rubrica na base', () => {
  const ef = padrao();
  const base = base2025();
  const transmissao = base.porChave.get('DRE|Clube X|2025')[0];
  const usos = m.indUsosDaLinha(transmissao, ef).map((u) => `${u.indicador}:${u.grupo}`);
  assert.deepEqual(usos, ['resultado:a12', 'elenco:ro']);
  const equivalencia = base.porChave.get('DRE|Clube X|2025').find((l) => l.descricao.includes('Equivalência'));
  assert.deepEqual(m.indUsosDaLinha(equivalencia, ef), [], 'o nome na base tem "(+/-)" na frente: não casa com o item do Anexo B');
  const catalogo = m.indCatalogoDe(linhas2025());
  const itens = ef.resultado.grupos.find((g) => g.id === 'a15').itens;
  assert.equal(m.indItemTemRubrica(itens.find((i) => i.rotulo === 'Direito de arena'), catalogo), true);
  assert.equal(m.indItemTemRubrica(itens.find((i) => i.rotulo.startsWith('Repasse')), catalogo), false);
  const desligada = m.indDefinicaoEfetiva({ desativados: ['resultado:a12.direitos-de-transmissao-fixos'] });
  assert.deepEqual(m.indUsosDaLinha(transmissao, desligada).map((u) => u.ativa), [false, true]);
});

test('config: lixo vira config vazia; resumo conta os ajustes por indicador', () => {
  assert.deepEqual(m.indNormalizarConfig('x'), m.indConfigVazia());
  assert.equal(m.indConfigAlterada(null), false);
  assert.equal(m.indConfigAlterada({ parametros: { considerarInvestimentos: true } }), false);
  assert.equal(m.indConfigAlterada({ parametros: { considerarInvestimentos: false } }), true);
  const c = m.indNormalizarConfig({
    desativados: ['resultado:a12.bilheteria', 'resultado:a12.bilheteria', 'endividamento:ot.x'],
    excluidas: { 'elenco:ro.premiacoes': ['a', 'a', 'b'], vazio: [] },
    adicionados: [{ indicador: 'elenco', grupo: 'ro', id: 'x', rotulo: 'R', fonte: 'XYZ', sinal: -1, onde: { descricao: ['R', ''], outro: ['z'] } }, { indicador: 'nao-existe', grupo: 'g', id: 'y', onde: {} }],
  });
  assert.deepEqual(c.desativados, ['resultado:a12.bilheteria', 'endividamento:ot.x']);
  assert.deepEqual(c.excluidas, { 'elenco:ro.premiacoes': ['a', 'b'] });
  assert.deepEqual(c.adicionados, [{ indicador: 'elenco', grupo: 'ro', id: 'x', rotulo: 'R', fonte: 'DRE', sinal: -1, onde: { descricao: ['R'] } }]);
  assert.deepEqual(m.indResumoConfig(c), {
    resultado: { desativados: 1, excluidas: 0, adicionados: 0 },
    elenco: { desativados: 0, excluidas: 2, adicionados: 1 },
    endividamento: { desativados: 1, excluidas: 0, adicionados: 0 },
  });
});

test('formatação de valores e percentuais', () => {
  assert.equal(m.indFormatarValor(1234567), '1.234.567');
  assert.equal(m.indFormatarValor(-1234.5), '−1.234,5');
  assert.equal(m.indFormatarValor(null), '—');
  assert.equal(m.indFormatarPercentual(0.4923), '49,2%');
  assert.equal(m.indFormatarPercentual(null), '—');
});
