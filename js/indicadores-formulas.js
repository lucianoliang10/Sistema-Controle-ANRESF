// Indicadores do RSSF: definição das fórmulas e motor de cálculo.
//
// Os três indicadores (Anexo A — Resultado da operação; Anexo B — Custo com
// elenco; Anexo C — Endividamento) são calculados sobre a base de dados das
// demonstrações que cada clube preencheu (BP, DRE, DMPL), uma linha por
// rubrica: { dem, ano, clube, serie, centro, descricao, classificacao,
// subclassificacao, valor }.
//
// A fórmula é DECLARATIVA: cada indicador é uma lista de grupos, e cada grupo
// uma lista de rubricas ("itens") que somam ou subtraem. Um item diz de onde
// vem o valor (`fonte` + filtros `onde` / `exceto`), no mesmo espírito do
// SOMASES da planilha de origem. Como a fórmula é dado e não código, ela pode
// ser ajustada pelo site, sem programar (ver indDefinicaoEfetiva):
//   * desligar um item inteiro;
//   * tirar só uma rubrica de dentro de um item (uma linha de origem);
//   * acrescentar uma rubrica da base a um grupo.
// Esses ajustes ficam guardados à parte (config), nunca alteram o padrão.
//
// O que NÃO é configurável é a estrutura: como os totais dos grupos se combinam
// (ex.: Receitas relevantes = A.1.2 + A.1.3 + A.1.4 − A.1.5). Isso vem do
// regulamento e fica nas funções indCalcular*.

// ---------- comparação de textos ----------

// O SOMASES do Excel ignora maiúsculas/minúsculas ("Direito de arena" casa com
// "Direito de Arena"), mas não acentos. Mesma regra aqui, mais espaços sobrando.
function indChave(texto) {
  return String(texto === null || texto === undefined ? '' : texto).replace(/\s+/g, ' ').trim().toLowerCase();
}

function indSlug(texto) {
  return indChave(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------- montagem das fórmulas padrão ----------

const IND_CAMPOS_FILTRO = ['descricao', 'classificacao', 'subclassificacao', 'centro'];

// Item que soma uma rubrica da DRE pelo nome (em todos os centros de custo).
function indRubrica(descricao, extra = {}) {
  const { onde = {}, ...resto } = extra;
  return { rotulo: descricao, fonte: 'DRE', onde: { descricao: [descricao], ...onde }, ...resto };
}

function indSecao(secao, itens) {
  return itens.map((item) => ({ ...item, secao }));
}

const IND_FP = ['Futebol Profissional'];
const IND_PC = ['Passivo Circulante'];
const IND_AC = ['Ativo Circulante'];
// A.3.1, §2º: custos de transferência/aquisição de atletas não são investimento relevante.
const IND_SUBS_ATLETAS = ['Amortização, imparidade e custo de registro', 'Registro de atleta', 'Gastos com atletas'];

function indItensInvestimento(centros) {
  return centros.map(([id, centro, ref]) => ({
    id, ref, rotulo: centro, fonte: 'DRE',
    onde: { classificacao: ['Custos'], centro: [centro] },
    exceto: { subclassificacao: IND_SUBS_ATLETAS },
    nota: 'Todos os custos do centro, exceto os de transferência/aquisição de atletas (A.3.1, §2º).',
  }));
}

function indItensReceitaCorrelata(centros) {
  return centros.flatMap(([id, centro]) => [
    {
      id: `${id}-receitas`, rotulo: `${centro} — receitas`, fonte: 'DRE',
      onde: { classificacao: ['Receitas'], centro: [centro] },
      exceto: { subclassificacao: ['Outras deduções'], descricao: ['Vendas de atletas', 'Solidariedade'] },
      nota: 'Receitas do centro, exceto vendas de atletas, solidariedade e deduções.',
    },
    {
      id: `${id}-deducoes`, rotulo: `${centro} — (-) outras deduções`, fonte: 'DRE', sinal: -1,
      onde: { classificacao: ['Receitas'], subclassificacao: ['Outras deduções'], centro: [centro] },
    },
  ]);
}

const IND_CENTROS_INVESTIMENTO = [
  ['base', 'Categorias de Base', 'A.3.1-I'],
  ['feminino', 'Futebol Feminino', 'A.3.1-II'],
  ['olimpicos', 'Esportes Olímpicos', 'A.3.1-VI'],
];

function indContribuicoesPatrimoniais() {
  const dmpl = (descricao, extra = {}) => ({ rotulo: descricao, fonte: 'DMPL', onde: { descricao: [descricao] }, ...extra });
  return [
    dmpl('Aumento de capital'),
    dmpl('Emissão de ações'),
    dmpl('AFAC - Adiantamento para futuro aumento de capital', { nota: 'Válido apenas se irrevogável, no PL e concluído até o encerramento do exercício (A.6.1, §§1º e 3º).' }),
    dmpl('Capital a integralizar', { rotulo: 'Capital a integralizar (valores ainda não recebidos)', nota: 'A.6.1, I: só contam montantes efetivamente recebidos.' }),
    dmpl('Reversão de integralização de capital'),
  ];
}

// Receitas operacionais (A.1.2). Usada no Anexo A e, com um item a mais, como
// denominador do Anexo B (B.2.2).
function indItensReceitaOperacional() {
  return [
    ...indSecao('Mídia e publicidade convencional', [
      indRubrica('Direitos de transmissão fixos', { ref: 'II' }),
      indRubrica('Participação, exposição e performance', { ref: 'IV.a' }),
      indRubrica('Mídias digitais e serviços "on demand"'),
    ]),
    ...indSecao('Licenciamento, patrocínio e publicidade', [
      indRubrica('Licenciamento', { ref: 'III.b' }),
      indRubrica('Royalties', { ref: 'III.b' }),
      indRubrica('Patrocínio', { ref: 'III.a' }),
      indRubrica('Material esportivo', { ref: 'III.b' }),
      indRubrica('Publicidade', { ref: 'III.a' }),
    ]),
    ...indSecao('Operações Desportivas e Premiações', [
      indRubrica('Bilheteria', { ref: 'I.a' }),
      indRubrica('Estádio', { ref: 'I.c' }),
      indRubrica('Sócio torcedor', { ref: 'I.b' }),
      indRubrica('Estacionamento', { ref: 'I.c' }),
    ]),
    ...indSecao('Outras operações', [
      indRubrica('Escolinhas esportivas'),
      indRubrica('Receitas do clube social'),
      indRubrica('Premiações'),
      indRubrica('Locações (eventos)', { ref: 'IV.b' }),
      indRubrica('Solidariedade', { ref: 'IV.c' }),
      indRubrica('Outras receitas', { ref: 'IV.d' }),
    ]),
  ];
}

const IND_PADRAO = {
  resultado: {
    id: 'resultado', anexo: 'Anexo A', titulo: 'Resultado da operação',
    grupos: [
      { id: 'a12', ref: 'A.1.2', rotulo: 'Receitas operacionais', itens: indItensReceitaOperacional(), nota: '"Resultado de Equivalência Patrimonial" não entra: item não previsto em A.1/A.2 (A.5.1, III).' },
      {
        id: 'a13', ref: 'A.1.3', rotulo: 'Receitas financeiras',
        nota: '"(+) Ajuste a valor justo" e "(+) Renegociações de dívidas" não entram (A.5.1, III; A.1.5, IV e V).',
        itens: ['(+) Rendimentos sobre aplicações financeiras', '(+) Atualização monetária', '(+) Descontos obtidos', '(+) Variação cambial ativa', '(+) Outras receitas financeiras'].map((d) => indRubrica(d)),
      },
      {
        id: 'a14', ref: 'A.1.4', rotulo: 'Receitas com transferências de atletas',
        itens: [
          indRubrica('Vendas de atletas'),
          indRubrica('Custo com atletas negociados - Vendas', { sinal: -1, nota: 'Custos diretos da transação deduzidos da receita (A.1.4).' }),
        ],
      },
      {
        id: 'a15', ref: 'A.1.5', rotulo: 'Ajustes e deduções da receita relevante',
        itens: [
          indRubrica('Direito de arena', { ref: 'V.a' }),
          indRubrica('(-) Tributação Específica do Futebol (TEF)', { ref: 'V.a' }),
          indRubrica('(-) Outras deduções'),
          indRubrica('Repasse à associação original - Lei SAF', { ref: 'V.b' }),
          indRubrica('Ajuste a Valor Justo – ANRESF', { ref: 'V.c' }),
          indRubrica('Receita por Redução de Passivos', { ref: 'V.d' }),
          indRubrica('Descontos de Refinanciamento Tributário'),
        ],
      },
      {
        id: 'a22', ref: 'A.2.2', rotulo: 'Despesas operacionais',
        itens: [
          ...indSecao('Custas das vendas/materiais', ['Custos de materiais esportivos', 'Gastos com jogos e competições', 'Serviços médicos', 'Uniformes', 'Água e esgoto - Custos', 'Materiais'].map((d) => indRubrica(d))),
          ...indSecao('Benefícios a empregados - Pessoas relevantes', ['Salários, encargos e benefícios a funcionários e prêmios', 'Direito de imagem'].map((d) => indRubrica(d))),
          ...indSecao('Benefícios a empregados - Demais funcionários', [indRubrica('Salários, encargos e benefícios a funcionários')]),
          ...indSecao('Outras despesas operacionais', ['Arbitragem, federação, confederação e demais custos dos jogos', 'Custos e despesas gerais', 'Depreciação de imobilizado / amortização de outros ativos - Custos', 'Depreciação e amortização - Despesas', 'Outros Custos e Despesas'].map((d) => indRubrica(d))),
        ],
      },
      {
        id: 'a23', ref: 'A.2.3', rotulo: 'Amortização, imparidade e custo de registro',
        itens: ['Amortizações de direitos sobre atletas', 'Mecanismo de Solidariedade', 'Custo com atletas negociados - Empréstimos', 'Custo com atletas negociados - Agentes ou intermediários', 'Intermediações de atletas'].map((d) => indRubrica(d)),
      },
      { id: 'a24', ref: 'A.2.4', rotulo: 'Baixa de registro de atleta', itens: [indRubrica('Baixa do custo de atletas pela venda de direitos intangíveis')] },
      {
        id: 'a25', ref: 'A.2.5', rotulo: 'Despesas financeiras',
        itens: ['(-) Encargos sobre financiamentos', '(-) Encargos sobre tributos', '(-) IOF', '(-) Taxas bancárias', '(-) Variações cambiais passivas', '(-) Despesas de juros arrendamento', '(-) Desconto concedido'].map((d) => indRubrica(d)),
      },
      { id: 'a26', ref: 'A.2.6', rotulo: 'Provisão para devedores duvidosos', itens: [indRubrica('Perdas com crédito de liquidação duvidosa')] },
      {
        id: 'a27', ref: 'A.2.7', rotulo: 'Dividendos',
        itens: [{ id: 'dividendos', rotulo: 'Dividendos a pagar', fonte: 'DMPL', onde: { descricao: ['Dividendos'] }, sinal: -1, nota: 'Na DMPL o dividendo sai negativo; entra aqui como despesa (sinal invertido).' }],
      },
      { id: 'a31', ref: 'A.3.1', rotulo: 'Investimentos relevantes — custos excluídos', itens: indItensInvestimento(IND_CENTROS_INVESTIMENTO) },
      {
        id: 'a34', ref: 'A.3.4', rotulo: 'Receitas correlatas excluídas',
        nota: 'A.3.4 exige excluir as receitas atribuíveis às atividades cujas despesas foram excluídas.',
        itens: indItensReceitaCorrelata(IND_CENTROS_INVESTIMENTO),
      },
      { id: 'a6', ref: 'A.6', rotulo: 'Contribuições patrimoniais', itens: indContribuicoesPatrimoniais() },
    ],
  },

  elenco: {
    id: 'elenco', anexo: 'Anexo B', titulo: 'Custo com elenco', limite: 0.70,
    grupos: [
      {
        id: 'b1', ref: 'B.1.1-I', rotulo: 'Benefícios a empregados - Pessoas relevantes',
        itens: ['Salários, encargos e benefícios a funcionários e prêmios', 'Direito de imagem'].map((d) => indRubrica(d, { onde: { centro: IND_FP } })),
      },
      {
        id: 'b2', ref: 'B.1.1-II', rotulo: 'Amortização e custo do registro',
        itens: ['Amortizações de direitos sobre atletas', 'Mecanismo de Solidariedade', 'Custo com atletas negociados - Empréstimos'].map((d) => indRubrica(d, { onde: { centro: IND_FP } })),
      },
      {
        id: 'b3', ref: 'B.1.1-III', rotulo: 'Custos com agentes/intermediários',
        itens: ['Intermediações de atletas', 'Custo com atletas negociados - Agentes ou intermediários'].map((d) => indRubrica(d, { onde: { centro: IND_FP } })),
      },
      {
        id: 'ro', ref: 'B.2.2', rotulo: 'Receita operacional',
        itens: (() => {
          const itens = indItensReceitaOperacional();
          const i = itens.findIndex((item) => item.rotulo === 'Outras receitas');
          itens.splice(i, 0, indRubrica('Resultado de Equivalência Patrimonial', { secao: 'Outras operações' }));
          return itens;
        })(),
      },
      {
        id: 'rlt', ref: 'B.2.5', rotulo: 'Receita líquida com transferências de atletas (RLT)',
        nota: 'O indicador usa a média da RLT de três exercícios (RLMT): o do cálculo e os dois anteriores.',
        itens: [
          indRubrica('Vendas de atletas'),
          indRubrica('Solidariedade'),
          indRubrica('Mecanismo de Solidariedade', { sinal: -1 }),
          indRubrica('Custo com atletas negociados - Vendas', { sinal: -1 }),
          indRubrica('Baixa do custo de atletas pela venda de direitos intangíveis', { sinal: -1 }),
        ],
      },
      {
        id: 'contrib', ref: 'B.2.3', rotulo: 'Contribuições patrimoniais',
        itens: [
          ...indContribuicoesPatrimoniais().map((item) => ({ ...item, rotulo: item.onde.descricao[0], nota: undefined })),
          { rotulo: 'Doações e perdão de dívidas (waiver)', fonte: 'DMPL', onde: { descricao: ['Doações e perdão de dívidas (waiver)'] } },
          { rotulo: 'Conversão de dívida em capital', fonte: 'DMPL', onde: { descricao: ['Conversão de dívida em capital'] } },
        ],
      },
    ],
  },

  endividamento: {
    id: 'endividamento', anexo: 'Anexo C', titulo: 'Endividamento', limite: 0.45,
    grupos: [
      {
        id: 'ogcp', ref: 'C.1.2-I', rotulo: 'Obrigações gerais de curto prazo (OGCP)',
        itens: [
          { id: 'a', rotulo: '(a) Empréstimos bancários e outros financiamentos', onde: { descricao: ['Empréstimos e Financiamentos – Bancos, Empresas e Pessoas Físicas', 'Passivo de Arrendamento'] } },
          { id: 'b', rotulo: '(b) Contas a pagar a entidades do grupo e outras partes relacionadas', onde: { descricao: ['Partes Relacionadas'] } },
          { id: 'c', rotulo: '(c) Dívidas trabalhistas vencidas ou acordadas', onde: { descricao: ['Obrigações trabalhistas e sociais em atraso', 'Direitos de Imagem em atraso'] } },
          { id: 'd', rotulo: '(d) Tributos vencidos e não parcelados', onde: { descricao: ['Tributos e contribuições sociais em atraso'] } },
          { id: 'e', rotulo: '(e) Tributos parcelados e renegociados (12 meses)', onde: { descricao: ['Parcelamentos: Fiscais, Tributários e Trabalhistas'] } },
          { id: 'f', rotulo: '(f) Acordos cíveis e mecanismos de execução (12 meses)', onde: { descricao: ['Contas a pagar - Passivo da recuperação Judicial'] } },
          { id: 'g', rotulo: '(g) Fornecedores e outros passivos operacionais vencidos há mais de 90 dias', onde: { descricao: ['Fornecedores vencidos a mais de 90 dias'] } },
        ].map((item) => ({ ...item, fonte: 'BP', onde: { ...item.onde, subclassificacao: IND_PC } })),
      },
      {
        id: 'ot', ref: 'C.1.2-II', rotulo: 'Obrigações de transferência (OT)',
        itens: ['Contas a pagar - Clubes (Transferências de atletas)', 'Contas a pagar - Agentes (Transferências de atletas)', 'Contas a pagar - Federações (Transferências de atletas)']
          .map((d) => ({ rotulo: d, fonte: 'BP', onde: { descricao: [d], subclassificacao: IND_PC } })),
      },
      {
        id: 'alcp', ref: 'C.1.2-III', rotulo: 'Ativos líquidos de curto prazo (ALCP)',
        itens: [
          { id: 'caixa', rotulo: '(a) Caixa e equivalentes de caixa', nota: 'Excluir valores bloqueados.', fonte: 'BP', onde: { descricao: ['Caixa e equivalentes de caixa'], subclassificacao: IND_AC } },
          { id: 'aplicacoes', rotulo: '(b) Aplicações financeiras de curto prazo', nota: 'Excluir valores com restrição de uso.', fonte: 'BP', onde: { descricao: ['Títulos e valores imobiliários'], subclassificacao: IND_AC } },
        ],
      },
    ],
  },
};

const IND_ORDEM = ['resultado', 'elenco', 'endividamento'];
const IND_PARAMETROS_PADRAO = { considerarInvestimentos: true };

// ---------- configuração (ajustes sobre o padrão) ----------

function indConfigVazia() {
  return { versao: 1, desativados: [], excluidas: {}, adicionados: [], parametros: {} };
}

// Aceita qualquer coisa vinda do servidor e devolve uma config bem formada.
function indNormalizarConfig(bruta) {
  const c = bruta && typeof bruta === 'object' && !Array.isArray(bruta) ? bruta : {};
  const excluidas = {};
  Object.entries(c.excluidas && typeof c.excluidas === 'object' ? c.excluidas : {}).forEach(([chave, lista]) => {
    const limpa = Array.from(new Set((Array.isArray(lista) ? lista : []).map(String).filter(Boolean)));
    if (limpa.length) excluidas[chave] = limpa;
  });
  const adicionados = (Array.isArray(c.adicionados) ? c.adicionados : [])
    .filter((a) => a && IND_PADRAO[a.indicador] && a.grupo && a.id && a.onde && typeof a.onde === 'object')
    .map((a) => ({
      indicador: a.indicador, grupo: String(a.grupo), id: String(a.id), rotulo: String(a.rotulo || 'Rubrica'),
      fonte: ['BP', 'DRE', 'DMPL', 'DFC'].includes(a.fonte) ? a.fonte : 'DRE',
      sinal: Number(a.sinal) === -1 ? -1 : 1,
      onde: indLimparFiltros(a.onde),
    }));
  return {
    versao: 1,
    desativados: Array.from(new Set((Array.isArray(c.desativados) ? c.desativados : []).map(String).filter(Boolean))),
    excluidas,
    adicionados,
    parametros: c.parametros && typeof c.parametros === 'object' && !Array.isArray(c.parametros) ? { ...c.parametros } : {},
  };
}

function indLimparFiltros(filtros) {
  const limpo = {};
  IND_CAMPOS_FILTRO.forEach((campo) => {
    const valores = (Array.isArray(filtros?.[campo]) ? filtros[campo] : []).map((v) => String(v)).filter((v) => v.trim() !== '');
    if (valores.length) limpo[campo] = valores;
  });
  return limpo;
}

function indConfigAlterada(config) {
  const c = indNormalizarConfig(config);
  return c.desativados.length > 0 || Object.keys(c.excluidas).length > 0 || c.adicionados.length > 0
    || Object.keys(c.parametros).some((k) => c.parametros[k] !== IND_PARAMETROS_PADRAO[k]);
}

// Quantos ajustes a config faz em cada indicador (para o aviso "fórmula personalizada").
function indResumoConfig(config) {
  const c = indNormalizarConfig(config);
  const zero = () => ({ desativados: 0, excluidas: 0, adicionados: 0 });
  const por = { resultado: zero(), elenco: zero(), endividamento: zero() };
  const ind = (chave) => String(chave).split(':')[0];
  c.desativados.forEach((k) => { if (por[ind(k)]) por[ind(k)].desativados += 1; });
  Object.entries(c.excluidas).forEach(([k, lista]) => { if (por[ind(k)]) por[ind(k)].excluidas += lista.length; });
  c.adicionados.forEach((a) => { por[a.indicador].adicionados += 1; });
  return por;
}

function indParametros(config) {
  return { ...IND_PARAMETROS_PADRAO, ...indNormalizarConfig(config).parametros };
}

// Chave de uma linha de origem dentro de um item: identifica a rubrica (sem
// clube nem ano), para "tirar só esta rubrica" valer para todos os clubes.
function indChaveRubrica(row) {
  return [row.dem, row.centro, row.classificacao, row.subclassificacao, row.descricao].map(indChave).join('|');
}

function indPrepararItem(indicadorId, grupoId, item, usados) {
  let id = item.id || indSlug(item.rotulo);
  while (usados.has(id)) id += '-2';
  usados.add(id);
  const onde = {};
  const exceto = {};
  IND_CAMPOS_FILTRO.forEach((campo) => {
    if (Array.isArray(item.onde?.[campo]) && item.onde[campo].length) onde[campo] = new Set(item.onde[campo].map(indChave));
    if (Array.isArray(item.exceto?.[campo]) && item.exceto[campo].length) exceto[campo] = new Set(item.exceto[campo].map(indChave));
  });
  return {
    id, chave: `${indicadorId}:${grupoId}.${id}`,
    rotulo: item.rotulo, ref: item.ref || '', secao: item.secao || '', nota: item.nota || '',
    fonte: item.fonte || 'DRE', sinal: item.sinal === -1 ? -1 : 1,
    onde: item.onde || {}, exceto: item.exceto || {},
    _onde: onde, _exceto: exceto,
    ativo: true, adicionado: false, excluidas: new Set(),
  };
}

// Fórmula em vigor = padrão + ajustes da config. Devolve, por indicador, os
// grupos com os itens já marcados (ativo, adicionado, rubricas excluídas).
function indDefinicaoEfetiva(config) {
  const c = indNormalizarConfig(config);
  const desativados = new Set(c.desativados);
  const efetiva = { parametros: indParametros(c) };
  IND_ORDEM.forEach((indicadorId) => {
    const padrao = IND_PADRAO[indicadorId];
    efetiva[indicadorId] = {
      id: padrao.id, anexo: padrao.anexo, titulo: padrao.titulo, limite: padrao.limite,
      grupos: padrao.grupos.map((grupo) => {
        const usados = new Set();
        const itens = grupo.itens.map((item) => indPrepararItem(indicadorId, grupo.id, item, usados));
        c.adicionados.filter((a) => a.indicador === indicadorId && a.grupo === grupo.id).forEach((a) => {
          const item = indPrepararItem(indicadorId, grupo.id, { id: a.id, rotulo: a.rotulo, fonte: a.fonte, sinal: a.sinal, onde: a.onde }, usados);
          item.adicionado = true;
          itens.push(item);
        });
        itens.forEach((item) => {
          item.ativo = !desativados.has(item.chave);
          item.excluidas = new Set(c.excluidas[item.chave] || []);
        });
        return { id: grupo.id, ref: grupo.ref || '', rotulo: grupo.rotulo, nota: grupo.nota || '', itens };
      }),
    };
  });
  return efetiva;
}

function indGrupo(definicao, grupoId) {
  return definicao.grupos.find((g) => g.id === grupoId);
}

// ---------- base de dados ----------

// Indexa as linhas por demonstração/clube/ano e pré-calcula as chaves de
// comparação. `anos` pode vir de fora (anos que existem na base, mesmo que
// algum clube não tenha valor em um deles).
function indPrepararBase(linhas, anosInformados) {
  const porChave = new Map();
  const clubes = new Map();
  const anos = new Set((Array.isArray(anosInformados) ? anosInformados : []).map(Number).filter(Number.isFinite));
  (Array.isArray(linhas) ? linhas : []).forEach((row) => {
    if (!row || !row.clube) return;
    row._k = {
      descricao: indChave(row.descricao), classificacao: indChave(row.classificacao),
      subclassificacao: indChave(row.subclassificacao), centro: indChave(row.centro),
    };
    row._rubrica = indChaveRubrica(row);
    const chave = `${row.dem}|${row.clube}|${row.ano}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push(row);
    if (!clubes.has(row.clube)) clubes.set(row.clube, row.serie || '');
    anos.add(Number(row.ano));
  });
  return {
    porChave,
    clubes: Array.from(clubes.entries()).map(([nome, serie]) => ({ nome, serie }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    anos: Array.from(anos).sort((a, b) => a - b),
  };
}

function indLinhasDe(base, dem, clube, ano) {
  return base.porChave.get(`${dem}|${clube}|${ano}`) || [];
}

function indItemCasa(item, row) {
  if (row.dem !== item.fonte) return false;
  const k = row._k || { descricao: indChave(row.descricao), classificacao: indChave(row.classificacao), subclassificacao: indChave(row.subclassificacao), centro: indChave(row.centro) };
  for (const campo of IND_CAMPOS_FILTRO) {
    if (item._onde[campo] && !item._onde[campo].has(k[campo])) return false;
    if (item._exceto[campo] && item._exceto[campo].has(k[campo])) return false;
  }
  return true;
}

// Soma um item para um clube/ano. Devolve o valor bruto (como está na base),
// a contribuição para o grupo (com sinal; zero se o item estiver desligado) e
// as linhas de origem, cada uma dizendo se foi excluída pela config.
function indSomarItem(base, item, clube, ano) {
  const partes = [];
  let bruto = 0;
  indLinhasDe(base, item.fonte, clube, ano).forEach((row) => {
    if (!indItemCasa(item, row)) return;
    const excluida = item.excluidas.has(row._rubrica || indChaveRubrica(row));
    const valor = Number(row.valor) || 0;
    partes.push({ row, valor, excluida });
    if (!excluida) bruto += valor;
  });
  return { bruto, contribuicao: item.ativo ? item.sinal * bruto : 0, partes };
}

function indCalcularGrupo(base, grupo, clube, ano) {
  let total = 0;
  const itens = grupo.itens.map((item) => {
    const soma = indSomarItem(base, item, clube, ano);
    total += soma.contribuicao;
    return { item, ...soma };
  });
  return { grupo, total, itens };
}

function indCalcularGrupos(base, definicao, clube, ano) {
  const grupos = {};
  definicao.grupos.forEach((grupo) => { grupos[grupo.id] = indCalcularGrupo(base, grupo, clube, ano); });
  return grupos;
}

// ---------- os três indicadores ----------

function indLinha(chave, rotulo, valor, extra = {}) {
  return { chave, rotulo, valor, ...extra };
}

// Anexo A. Receitas relevantes − Despesas relevantes, ajustado pelos
// investimentos relevantes (A.3) e pelas contribuições patrimoniais (A.6).
function indCalcularResultado(base, efetiva, clube, ano) {
  const g = indCalcularGrupos(base, efetiva.resultado, clube, ano);
  const t = (id) => g[id].total;
  const considerar = efetiva.parametros.considerarInvestimentos !== false;
  const receitas = t('a12') + t('a13') + t('a14') - t('a15');
  const despesas = t('a22') + t('a23') + t('a24') + t('a25') + t('a26') + t('a27');
  const resultado = receitas - despesas;
  const custosExcluidos = considerar ? t('a31') : 0;
  const receitasExcluidas = considerar ? t('a34') : 0;
  const ajustado = resultado + custosExcluidos - receitasExcluidas;
  const contribuicoes = t('a6');
  const final = ajustado + contribuicoes;
  const semDados = !indTemDados(base, clube, ano);
  return {
    indicador: 'resultado', clube, ano, grupos: g, semDados,
    receitas, despesas, resultado, custosExcluidos, receitasExcluidas, ajustado, contribuicoes,
    valor: final,
    conforme: semDados ? null : final >= 0,
    status: semDados ? 'Sem dados' : (final >= 0 ? 'Resultado positivo' : 'Resultado negativo'),
    linhas: [
      indLinha('receitas', 'Receitas relevantes (A.1)', receitas, { formula: 'A.1.2 + A.1.3 + A.1.4 − A.1.5', grupos: ['a12', 'a13', 'a14', 'a15'] }),
      indLinha('despesas', 'Despesas relevantes (A.2)', despesas, { formula: 'A.2.2 + A.2.3 + A.2.4 + A.2.5 + A.2.6 + A.2.7', grupos: ['a22', 'a23', 'a24', 'a25', 'a26', 'a27'] }),
      indLinha('resultado', 'Resultado da operação (Art. 50)', resultado, { formula: 'A.1 − A.2', destaque: true }),
      indLinha('custos-excluidos', '(+) Investimentos relevantes — custos excluídos (A.3.1)', custosExcluidos, { grupos: ['a31'], desligado: !considerar }),
      indLinha('receitas-excluidas', '(−) Receitas correlatas excluídas (A.3.4)', receitasExcluidas, { grupos: ['a34'], desligado: !considerar }),
      indLinha('ajustado', 'Resultado da operação ajustado (após A.3)', ajustado, { formula: 'Resultado + A.3.1 − A.3.4', destaque: true }),
      indLinha('contribuicoes', '(+) Contribuições patrimoniais (A.6)', contribuicoes, { grupos: ['a6'] }),
      indLinha('final', 'Resultado final', final, { formula: 'Resultado ajustado + A.6', destaque: true, final: true }),
    ],
  };
}

// Há alguma linha do clube no ano (em qualquer demonstração)?
function indTemDados(base, clube, ano) {
  return ['DRE', 'BP', 'DMPL'].some((dem) => indLinhasDe(base, dem, clube, ano).length > 0);
}

// Anexo B. Custo com elenco / (Receita operacional + RLMT), e a versão
// ajustada, que soma as contribuições patrimoniais ao denominador.
// RLMT = média da receita líquida de transferências do exercício e dos dois
// anteriores. Se a base não tiver algum desses exercícios, a média usa só os
// que existem e o resultado é marcado como incompleto.
function indCalcularElenco(base, efetiva, clube, ano) {
  const def = efetiva.elenco;
  const g = indCalcularGrupos(base, def, clube, ano);
  const numerador = g.b1.total + g.b2.total + g.b3.total;
  const receitaOperacional = g.ro.total;
  const grupoRlt = indGrupo(def, 'rlt');
  const anosRlt = [ano, ano - 1, ano - 2].map((a) => {
    const naBase = base.anos.includes(a);
    return { ano: a, naBase, calculo: naBase ? indCalcularGrupo(base, grupoRlt, clube, a) : null };
  });
  const comDados = anosRlt.filter((a) => a.naBase);
  const rlmt = comDados.length ? comDados.reduce((s, a) => s + a.calculo.total, 0) / comDados.length : 0;
  const rlmtIncompleto = comDados.length < 3;
  const contribuicoes = g.contrib.total;
  const denominador = receitaOperacional + rlmt;
  const denominadorAjustado = denominador + contribuicoes;
  const indice = denominador ? numerador / denominador : null;
  const ajustado = denominadorAjustado ? numerador / denominadorAjustado : null;
  const semDados = !indTemDados(base, clube, ano) || ajustado === null;
  const conforme = semDados ? null : !(ajustado > def.limite);
  return {
    indicador: 'elenco', clube, ano, grupos: g, anosRlt, semDados,
    numerador, receitaOperacional, rlmt, rlmtIncompleto, anosSemBase: anosRlt.filter((a) => !a.naBase).map((a) => a.ano),
    contribuicoes, indice, valor: ajustado, limite: def.limite, conforme,
    status: semDados ? 'Sem dados' : (conforme ? 'Em conformidade' : 'Não conformidade'),
    linhas: [
      indLinha('numerador', 'Custo com elenco (B.1.1)', numerador, { formula: 'I + II + III', grupos: ['b1', 'b2', 'b3'] }),
      indLinha('ro', 'Receita operacional (B.2.2)', receitaOperacional, { grupos: ['ro'] }),
      indLinha('rlmt', 'Resultado líquido médio de transferências — RLMT (B.2.5)', rlmt, { formula: `média da RLT de ${comDados.map((a) => a.ano).join(', ') || '—'}`, grupos: ['rlt'], aviso: rlmtIncompleto }),
      indLinha('indice', 'Custo com elenco', indice, { formula: 'B.1.1 ÷ (B.2.2 + B.2.5)', percentual: true, destaque: true }),
      indLinha('contribuicoes', 'Contribuições patrimoniais (B.2.3)', contribuicoes, { grupos: ['contrib'] }),
      indLinha('final', 'Custo com elenco ajustado', ajustado, { formula: 'B.1.1 ÷ (B.2.2 + B.2.5 + B.2.3)', percentual: true, destaque: true, final: true }),
    ],
  };
}

// Anexo C. Obrigações líquidas de curto prazo ÷ Receitas relevantes (a mesma
// A.1 do Anexo A, com os ajustes que estiverem em vigor lá).
function indCalcularEndividamento(base, efetiva, clube, ano) {
  const def = efetiva.endividamento;
  const g = indCalcularGrupos(base, def, clube, ano);
  const obrigacoes = g.ogcp.total + g.ot.total - g.alcp.total;
  const receitas = indCalcularResultado(base, efetiva, clube, ano).receitas;
  const indice = receitas ? obrigacoes / receitas : null;
  const semDados = !indTemDados(base, clube, ano) || indice === null;
  const conforme = semDados ? null : !(indice > def.limite);
  return {
    indicador: 'endividamento', clube, ano, grupos: g, semDados,
    obrigacoes, receitas, valor: indice, limite: def.limite, conforme,
    status: semDados ? 'Sem dados' : (conforme ? 'Em conformidade' : 'Não conformidade'),
    linhas: [
      indLinha('ogcp', 'I. Obrigações gerais de curto prazo (OGCP)', g.ogcp.total, { grupos: ['ogcp'] }),
      indLinha('ot', 'II. Obrigações de transferência (OT)', g.ot.total, { grupos: ['ot'] }),
      indLinha('alcp', 'III. Ativos líquidos de curto prazo (ALCP)', g.alcp.total, { grupos: ['alcp'] }),
      indLinha('obrigacoes', 'Obrigações líquidas de curto prazo', obrigacoes, { formula: 'OGCP + OT − ALCP', destaque: true }),
      indLinha('receitas', 'Receitas relevantes (A.1)', receitas, { formula: 'vem do Resultado da operação', origem: 'resultado' }),
      indLinha('final', 'Indicador de endividamento', indice, { formula: 'Obrigações líquidas ÷ Receitas relevantes', percentual: true, destaque: true, final: true }),
    ],
  };
}

function indCalcular(indicadorId, base, efetiva, clube, ano) {
  if (indicadorId === 'resultado') return indCalcularResultado(base, efetiva, clube, ano);
  if (indicadorId === 'elenco') return indCalcularElenco(base, efetiva, clube, ano);
  return indCalcularEndividamento(base, efetiva, clube, ano);
}

// ---------- catálogo de rubricas e rastreio ----------

// Catálogo = rubricas distintas da base (sem clube/ano), na ordem do modelo:
// [{ dem, centro, classificacao, subclassificacao, descricao }].
function indCatalogoDe(linhas) {
  const vistos = new Map();
  (Array.isArray(linhas) ? linhas : []).forEach((row) => {
    const chave = indChaveRubrica(row);
    if (!vistos.has(chave)) {
      vistos.set(chave, { dem: row.dem, centro: row.centro || '', classificacao: row.classificacao || '', subclassificacao: row.subclassificacao || '', descricao: row.descricao || '' });
    }
  });
  return Array.from(vistos.values());
}

// O item aponta para alguma rubrica que existe na base? Itens sem nenhuma
// (ex.: "Repasse à associação original - Lei SAF") somam sempre zero e o
// painel avisa.
function indItemTemRubrica(item, catalogo) {
  return (catalogo || []).some((rubrica) => indItemCasa(item, rubrica));
}

// Onde uma linha da base entra: lista de { indicador, grupo, item } cujos
// filtros casam com ela. `ativa` diz se ela está de fato contando.
function indUsosDaLinha(row, efetiva) {
  const usos = [];
  const rubrica = row._rubrica || indChaveRubrica(row);
  IND_ORDEM.forEach((indicadorId) => {
    efetiva[indicadorId].grupos.forEach((grupo) => {
      grupo.itens.forEach((item) => {
        if (!indItemCasa(item, row)) return;
        usos.push({ indicador: indicadorId, anexo: efetiva[indicadorId].anexo, grupo: grupo.id, ref: grupo.ref, grupoRotulo: grupo.rotulo, item, sinal: item.sinal, ativa: item.ativo && !item.excluidas.has(rubrica) });
      });
    });
  });
  return usos;
}

// ---------- formatação ----------

// Valores vão como o clube informou (a unidade — R$ ou R$ mil — é a de cada
// clube). Inteiros sem casas; quebrados com até duas.
function indFormatarValor(valor) {
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return '—';
  const n = Number(valor);
  const texto = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
  return n < 0 ? `−${texto}` : texto;
}

function indFormatarPercentual(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  const n = Number(valor) * 100;
  const texto = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n < 0 ? '−' : ''}${texto}%`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IND_PADRAO, IND_ORDEM, indChave, indSlug, indConfigVazia, indNormalizarConfig, indConfigAlterada, indResumoConfig,
    indDefinicaoEfetiva, indPrepararBase, indCalcular, indCalcularResultado, indCalcularElenco, indCalcularEndividamento,
    indCatalogoDe, indItemTemRubrica, indUsosDaLinha, indChaveRubrica, indFormatarValor, indFormatarPercentual,
  };
}
