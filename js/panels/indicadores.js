// Painéis do grupo "Indicadores": os três indicadores do RSSF (Resultado da
// operação, Custo com elenco, Endividamento). O painel "Base de dados" e a
// importação da planilha ficam em indicadores-base.js; as fórmulas e o motor,
// em js/indicadores-formulas.js.
//
// Cada painel mostra o indicador do clube escolhido e, logo abaixo, a
// COMPOSIÇÃO do cálculo: grupo por grupo, rubrica por rubrica, com o valor que
// cada uma trouxe da base. É ali que a fórmula se ajusta:
//   * a chave de cada rubrica liga/desliga a rubrica no cálculo;
//   * "origem" abre as linhas da base que formam o valor, e cada linha pode
//     sair sozinha;
//   * "+ Adicionar rubrica" traz para o grupo uma rubrica da base.
// Os ajustes valem na hora, só na tela de quem mexeu (simulação). "Salvar para
// todos" grava no servidor e passa a valer para todo mundo; "Restaurar padrão"
// volta à fórmula original.

const IND_PAINEIS = { 'ind-base': 'base', 'ind-resultado': 'resultado', 'ind-elenco': 'elenco', 'ind-endividamento': 'endividamento' };
const IND_DEMS = ['BP', 'DRE', 'DMPL', 'DFC'];
const IND_NOME_DEM = { BP: 'Balanço patrimonial', DRE: 'DRE', DMPL: 'DMPL', DFC: 'Fluxo de caixa' };

// Como cada grupo entra na conta final (texto do cabeçalho do grupo).
const IND_PAPEIS = {
  resultado: {
    a12: ['+', 'soma nas receitas relevantes (A.1)'], a13: ['+', 'soma nas receitas relevantes (A.1)'], a14: ['+', 'soma nas receitas relevantes (A.1)'],
    a15: ['−', 'deduz das receitas relevantes (A.1)'],
    a22: ['+', 'soma nas despesas relevantes (A.2)'], a23: ['+', 'soma nas despesas relevantes (A.2)'], a24: ['+', 'soma nas despesas relevantes (A.2)'],
    a25: ['+', 'soma nas despesas relevantes (A.2)'], a26: ['+', 'soma nas despesas relevantes (A.2)'], a27: ['+', 'soma nas despesas relevantes (A.2)'],
    a31: ['+', 'volta para o resultado (custo excluído)'], a34: ['−', 'sai do resultado (receita excluída)'], a6: ['+', 'soma no resultado final'],
  },
  elenco: {
    b1: ['÷', 'numerador: custo com elenco'], b2: ['÷', 'numerador: custo com elenco'], b3: ['÷', 'numerador: custo com elenco'],
    ro: ['÷', 'denominador'], rlt: ['÷', 'denominador, pela média de três exercícios (RLMT)'], contrib: ['÷', 'denominador do indicador ajustado'],
  },
  endividamento: { ogcp: ['+', 'soma nas obrigações líquidas'], ot: ['+', 'soma nas obrigações líquidas'], alcp: ['−', 'deduz das obrigações líquidas'] },
};

const IND_TEXTOS = {
  resultado: { sub: 'Receitas relevantes menos despesas relevantes, com os ajustes de investimentos relevantes (A.3) e contribuições patrimoniais (A.6).', regra: 'Conformidade anual (Art. 51): resultado final maior ou igual a zero.' },
  elenco: { sub: 'Custo com elenco dividido pela receita operacional somada ao resultado líquido médio de transferências (RLMT).', regra: 'Não conformidade quando o custo com elenco ajustado passa de 70%.' },
  endividamento: { sub: 'Obrigações líquidas de curto prazo divididas pelas receitas relevantes.', regra: 'Não conformidade quando o indicador passa de 45%.' },
};

const indUI = {
  carregado: false, promessa: null, erro: '', semTabelas: false,
  lote: null, catalogo: [], perfil: '',
  base: null, clubes: [],
  configSalva: indConfigVazia(), configMeta: null, config: indConfigVazia(), efetiva: indDefinicaoEfetiva(null),
  clube: '', anoElenco: null,
  abertos: new Set(),
  serie: 'todas', ordem: { col: 'nome', dir: 'asc' },
  salvando: false, aviso: null, modal: null,
  // painel Base de dados
  baseDem: 'DRE', baseBusca: '', baseOcultarZeradas: true, basePorClube: new Map(), importacao: null,
};

// ---------- dados ----------

function indDescompactar(resposta) {
  const dic = Array.isArray(resposta.dic) ? resposta.dic : [];
  const clubes = Array.isArray(resposta.clubes) ? resposta.clubes : [];
  return (Array.isArray(resposta.linhas) ? resposta.linhas : []).map((l) => ({
    dem: IND_DEMS[l[0]], ano: l[1], clube: (clubes[l[2]] || [])[0], serie: (clubes[l[2]] || [])[1] || '',
    centro: dic[l[3]] || '', descricao: dic[l[4]] || '', classificacao: dic[l[5]] || '', subclassificacao: dic[l[6]] || '', valor: l[7],
  }));
}

function indPrepararCatalogo(catalogo) {
  return (Array.isArray(catalogo) ? catalogo : []).map((c) => {
    const row = { dem: c.dem, centro: c.centro || '', classificacao: c.classificacao || '', subclassificacao: c.subclassificacao || '', descricao: c.descricao || '' };
    row._k = { descricao: indChave(row.descricao), classificacao: indChave(row.classificacao), subclassificacao: indChave(row.subclassificacao), centro: indChave(row.centro) };
    row._rubrica = indChaveRubrica(row);
    return row;
  });
}

async function indCarregar(forcar = false) {
  if (indUI.carregado && !forcar) return;
  if (indUI.promessa && !forcar) return indUI.promessa;
  indUI.promessa = (async () => {
    try {
      const resposta = await fetch('/api/indicadores');
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok || !dados) throw new Error((dados && dados.erro) || 'Não foi possível carregar os indicadores.');
      indUI.erro = '';
      indUI.semTabelas = Boolean(dados.semTabelas);
      indUI.lote = dados.lote || null;
      indUI.perfil = dados.perfil || (typeof perfilAtual === 'function' ? perfilAtual() : '');
      indUI.catalogo = indPrepararCatalogo(dados.catalogo);
      indUI.base = indPrepararBase(indDescompactar(dados), indUI.lote ? indUI.lote.anos : []);
      // Clubes: os que têm valor na base de cálculo + os demais do lote (sem série conhecida).
      const nomes = new Map(indUI.base.clubes.map((c) => [c.nome, c.serie]));
      ((indUI.lote && indUI.lote.clubes) || []).forEach((nome) => { if (!nomes.has(nome)) nomes.set(nome, ''); });
      indUI.clubes = Array.from(nomes.entries()).map(([nome, serie]) => ({ nome, serie }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
      if (!indUI.clubes.some((c) => c.nome === indUI.clube)) indUI.clube = indUI.clubes[0] ? indUI.clubes[0].nome : '';
      if (!indUI.base.anos.includes(indUI.anoElenco)) indUI.anoElenco = indUI.base.anos[indUI.base.anos.length - 1] || null;
      indUI.configSalva = indNormalizarConfig(dados.config ? dados.config.valor : null);
      indUI.configMeta = dados.config ? { em: dados.config.atualizado_em, por: dados.config.atualizado_por } : null;
      // Recarregar não descarta uma simulação em andamento.
      if (!indUI.carregado || !indSujo()) indAplicarConfig(indUI.configSalva);
      indUI.carregado = true;
    } catch (erro) {
      indUI.erro = erro.message || 'Não foi possível carregar os indicadores.';
    } finally {
      indUI.promessa = null;
    }
  })();
  return indUI.promessa;
}

// ---------- configuração em uso ----------

function indAplicarConfig(config) {
  indUI.config = indNormalizarConfig(JSON.parse(JSON.stringify(config || {})));
  indUI.efetiva = indDefinicaoEfetiva(indUI.config);
}

// Forma canônica (listas ordenadas) para comparar duas configs.
function indAssinaturaConfig(config) {
  const c = indNormalizarConfig(config);
  const excluidas = {};
  Object.keys(c.excluidas).sort().forEach((k) => { excluidas[k] = c.excluidas[k].slice().sort(); });
  const parametros = {};
  Object.keys(c.parametros).sort().forEach((k) => { if (c.parametros[k] !== IND_PARAMETROS_PADRAO[k]) parametros[k] = c.parametros[k]; });
  return JSON.stringify({ d: c.desativados.slice().sort(), e: excluidas, a: c.adicionados.slice().sort((x, y) => x.id.localeCompare(y.id)), p: parametros });
}

function indSujo() {
  return indAssinaturaConfig(indUI.config) !== indAssinaturaConfig(indUI.configSalva);
}

function indPodeSalvar() { return indUI.perfil === 'adm' || indUI.perfil === 'gestor'; }
function indPodeImportar() { return indUI.perfil === 'adm'; }

function indMudarConfig(mutar) {
  const c = indNormalizarConfig(indUI.config);
  mutar(c);
  indAplicarConfig(c);
  indUI.aviso = null;
  indRenderAtivo();
}

function indAlternarItem(chave) {
  indMudarConfig((c) => {
    c.desativados = c.desativados.includes(chave) ? c.desativados.filter((k) => k !== chave) : c.desativados.concat([chave]);
  });
}

// Liga ou desliga o grupo inteiro: se houver algum item ligado, desliga todos.
function indAlternarGrupo(indicadorId, grupoId) {
  const grupo = indGrupo(indUI.efetiva[indicadorId], grupoId);
  if (!grupo) return;
  const chaves = grupo.itens.map((i) => i.chave);
  const algumLigado = grupo.itens.some((i) => i.ativo);
  indMudarConfig((c) => {
    const resto = c.desativados.filter((k) => !chaves.includes(k));
    c.desativados = algumLigado ? resto.concat(chaves) : resto;
  });
}

function indAlternarRubrica(chaveItem, rubrica) {
  indMudarConfig((c) => {
    const lista = c.excluidas[chaveItem] || [];
    const nova = lista.includes(rubrica) ? lista.filter((r) => r !== rubrica) : lista.concat([rubrica]);
    if (nova.length) c.excluidas[chaveItem] = nova; else delete c.excluidas[chaveItem];
  });
}

function indRemoverAdicionado(indicadorId, grupoId, id) {
  const chave = `${indicadorId}:${grupoId}.${id}`;
  indMudarConfig((c) => {
    c.adicionados = c.adicionados.filter((a) => !(a.indicador === indicadorId && a.grupo === grupoId && a.id === id));
    c.desativados = c.desativados.filter((k) => k !== chave);
    delete c.excluidas[chave];
  });
}

async function indSalvarConfig() {
  if (!indPodeSalvar() || indUI.salvando) return;
  indUI.salvando = true;
  indRenderAtivo();
  try {
    const config = indNormalizarConfig(indUI.config);
    const resposta = await fetch('/api/indicadores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvar-config', config }) });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new Error((dados && dados.erro) || 'Não foi possível salvar a fórmula.');
    indUI.configSalva = config;
    indUI.configMeta = dados && dados.config ? { em: dados.config.atualizado_em, por: dados.config.atualizado_por } : { em: new Date().toISOString(), por: '' };
    indUI.aviso = { tipo: 'ok', texto: indConfigAlterada(config) ? 'Fórmula salva. Os ajustes passam a valer para todos os usuários.' : 'Fórmula padrão restaurada para todos os usuários.' };
  } catch (erro) {
    indUI.aviso = { tipo: 'erro', texto: erro.message };
  } finally {
    indUI.salvando = false;
    indRenderAtivo();
  }
}

// ---------- pedaços comuns ----------

function indDataHora(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Valor em dinheiro negativo sai em vermelho. Percentual não: no endividamento,
// índice negativo quer dizer que sobram ativos líquidos, o que é bom.
function indNum(valor, percentual = false) {
  const texto = percentual ? indFormatarPercentual(valor) : indFormatarValor(valor);
  const neg = !percentual && Number(valor) < 0 ? ' neg' : '';
  return `<span class="ind-num${neg}">${esc(texto)}</span>`;
}

function indStatusPill(calculo) {
  if (calculo.conforme === null) return '<span class="op-pill neutral">Sem dados</span>';
  return `<span class="op-pill ${calculo.conforme ? 'green' : 'red'}">${esc(calculo.status)}</span>`;
}

function indSelectClube() {
  return `<label class="op-field wide"><span class="op-label">Clube</span><select data-ind-campo="clube">${indUI.clubes.map((c) => `<option value="${esc(c.nome)}" ${c.nome === indUI.clube ? 'selected' : ''}>${esc(c.nome)}${c.serie ? ` · Série ${esc(c.serie)}` : ''}</option>`).join('')}</select></label>`;
}

function indAviso() {
  if (!indUI.aviso) return '';
  return `<div class="ind-aviso ${indUI.aviso.tipo === 'erro' ? 'erro' : 'ok'}" role="status">${esc(indUI.aviso.texto)}</div>`;
}

// Estados em que não há o que calcular: carregando, erro, sem tabelas, base vazia.
function indEstadoVazio(titulo, acoes = '') {
  let corpo;
  if (indUI.erro) corpo = `<div class="op-empty">${esc(indUI.erro)} <button type="button" class="op-btn" data-ind-acao="recarregar">Tentar de novo</button></div>`;
  else if (!indUI.carregado) corpo = '<div class="op-empty">Carregando a base de dados dos indicadores…</div>';
  else if (indUI.semTabelas) corpo = '<div class="op-empty"><strong>Falta criar as tabelas dos indicadores no Supabase.</strong><br>Rode no SQL Editor o comando de criação das tabelas <code>indicadores_dados</code> e <code>indicadores_config</code> e recarregue esta página.</div>';
  else corpo = `<div class="op-empty"><strong>A base de dados dos indicadores está vazia.</strong><br>${indPodeImportar() ? 'Abra o painel <b>Base de dados</b> e use <b>Importar planilha</b> para carregar a planilha consolidada das demonstrações.' : 'Um administrador precisa importar a planilha consolidada no painel Base de dados.'}</div>`;
  return `<div class="op-layout"><section class="op-hero"><div><span class="op-pill">Indicadores</span><h2>${esc(titulo)}</h2></div>${acoes ? `<div class="op-actions">${acoes}</div>` : ''}</section><section class="op-card"><div class="op-card-body">${corpo}</div></section></div>`;
}

function indTemBase() {
  return indUI.carregado && !indUI.erro && !indUI.semTabelas && indUI.lote && indUI.clubes.length > 0;
}

// Barra da fórmula: diz se está no padrão ou personalizada, se há simulação
// não salva, e traz os botões salvar / descartar / restaurar.
function indBarraFormula(indicadorId) {
  const resumo = indResumoConfig(indUI.config);
  const partes = (r) => [
    r.desativados ? `${r.desativados} rubrica${r.desativados === 1 ? '' : 's'} desligada${r.desativados === 1 ? '' : 's'}` : '',
    r.excluidas ? `${r.excluidas} linha${r.excluidas === 1 ? '' : 's'} de origem retirada${r.excluidas === 1 ? '' : 's'}` : '',
    r.adicionados ? `${r.adicionados} rubrica${r.adicionados === 1 ? '' : 's'} adicionada${r.adicionados === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const aqui = partes(resumo[indicadorId]);
  // O endividamento usa as receitas relevantes do Resultado da operação.
  const herdado = indicadorId === 'endividamento' ? partes(resumo.resultado) : [];
  const semInvest = indUI.efetiva.parametros.considerarInvestimentos === false && indicadorId === 'resultado';
  if (semInvest) aqui.push('investimentos relevantes desconsiderados');
  const personalizada = aqui.length > 0 || herdado.length > 0;
  const sujo = indSujo();
  const salvaAlterada = indConfigAlterada(indUI.configSalva);
  const meta = indUI.configMeta && salvaAlterada ? ` · salva por ${esc(indUI.configMeta.por || 'usuário')} em ${esc(indDataHora(indUI.configMeta.em))}` : '';

  let texto;
  if (!personalizada) texto = '<strong>Fórmula padrão.</strong> Use as chaves ao lado de cada rubrica para tirá-la do cálculo ou devolvê-la.';
  else texto = `<strong>Fórmula personalizada:</strong> ${esc(aqui.join(' · ') || 'sem ajustes neste indicador')}${herdado.length ? ` · nas receitas relevantes (Resultado da operação): ${esc(herdado.join(' · '))}` : ''}${sujo ? '' : meta}.`;

  const botoes = [];
  if (sujo) {
    botoes.push(`<button type="button" class="op-btn ind-btn-primario" data-ind-acao="salvar" ${indPodeSalvar() && !indUI.salvando ? '' : 'disabled'} title="${indPodeSalvar() ? 'Grava os ajustes para todos os usuários' : 'Só administradores e gestores podem salvar'}">${indUI.salvando ? 'Salvando…' : 'Salvar para todos'}</button>`);
    botoes.push('<button type="button" class="op-btn" data-ind-acao="descartar">Descartar</button>');
  }
  if (indConfigAlterada(indUI.config)) botoes.push('<button type="button" class="op-btn" data-ind-acao="restaurar" title="Volta à fórmula original (ainda será preciso salvar)">Restaurar padrão</button>');

  const estado = sujo
    ? `<span class="op-pill orange">Simulação não salva</span>${indPodeSalvar() ? '' : '<span class="ind-dim">Você pode simular; só administradores e gestores salvam.</span>'}`
    : `<span class="op-pill ${personalizada ? 'purple' : 'neutral'}">${personalizada ? 'Personalizada' : 'Padrão'}</span>`;
  return `<section class="ind-barra${sujo ? ' suja' : ''}"><div class="ind-barra-texto">${estado}<span>${texto}</span></div><div class="ind-barra-acoes">${botoes.join('')}</div></section>`;
}

// ---------- painel de um indicador ----------

function indColunasDoGrupo(indicadorId, grupoId, calculos) {
  if (indicadorId === 'elenco' && grupoId === 'rlt') {
    return calculos[0].anosRlt.filter((a) => a.naBase).slice().reverse().map((a) => ({ ano: a.ano, calc: a.calculo }));
  }
  return calculos.map((c) => ({ ano: c.ano, calc: c.grupos[grupoId] }));
}

function indRotuloRubrica(row) {
  if (row.dem === 'DRE') return [row.centro, row.descricao].filter(Boolean).join(' · ');
  if (row.dem === 'BP') return [row.subclassificacao, row.descricao].filter(Boolean).join(' · ');
  return [row.descricao, row.classificacao].filter(Boolean).join(' · ');
}

// Linhas de origem de um item: todas as rubricas do catálogo que casam com
// ele (mesmo zeradas para este clube), com o valor de cada exercício.
function indLinhasOrigem(item, indice, colunas) {
  const ordem = [];
  const dados = new Map();
  const garantir = (row) => {
    const k = row._rubrica || indChaveRubrica(row);
    if (!dados.has(k)) { dados.set(k, { row, valores: {} }); ordem.push(k); }
    return dados.get(k);
  };
  indUI.catalogo.forEach((row) => { if (indItemCasa(item, row)) garantir(row); });
  colunas.forEach((col) => {
    col.calc.itens[indice].partes.forEach((parte) => {
      const d = garantir(parte.row);
      d.valores[col.ano] = (d.valores[col.ano] || 0) + parte.valor;
    });
  });
  return ordem.map((k) => ({ rubrica: k, row: dados.get(k).row, valores: dados.get(k).valores, excluida: item.excluidas.has(k) }));
}

function indHtmlItem(indicadorId, grupo, item, indice, colunas) {
  const aberto = indUI.abertos.has(item.chave);
  const semRubrica = indUI.catalogo.length > 0 && !indItemTemRubrica(item, indUI.catalogo);
  const marcas = [
    item.sinal === -1 ? '<span class="ind-chip menos" title="Este valor é subtraído do total do grupo">subtrai</span>' : '',
    item.adicionado ? '<span class="ind-chip add">adicionada</span>' : '',
    item.excluidas.size ? `<span class="ind-chip parcial" title="Linhas de origem retiradas do cálculo">${item.excluidas.size} origem retirada</span>` : '',
    semRubrica ? '<span class="ind-chip alerta" title="Nenhuma rubrica da base tem este nome: o item soma sempre zero">sem rubrica na base</span>' : '',
  ].join('');
  const valores = colunas.map((col) => `<td class="ind-val">${indNum(col.calc.itens[indice].bruto)}</td>`).join('');
  const acoes = item.adicionado
    ? `<button type="button" class="ind-link perigo" data-ind-acao="remover-adicionado" data-grupo="${esc(grupo.id)}" data-id="${esc(item.id)}">remover</button>`
    : '';
  let html = `<tr class="ind-item${item.ativo ? '' : ' desligado'}${aberto ? ' aberto' : ''}">
    <td class="ind-chave"><label class="ind-switch" title="${item.ativo ? 'Tirar do cálculo' : 'Devolver ao cálculo'}"><input type="checkbox" data-ind-acao="toggle-item" data-chave="${esc(item.chave)}" ${item.ativo ? 'checked' : ''} aria-label="${esc(item.rotulo)} entra no cálculo"><span></span></label></td>
    <td class="ind-rotulo">${item.ref ? `<span class="ind-ref">${esc(item.ref)}</span>` : ''}<span class="ind-nome">${esc(item.rotulo)}</span>${marcas}${item.nota ? `<small class="ind-nota">${esc(item.nota)}</small>` : ''}</td>
    ${valores}
    <td class="ind-acoes"><button type="button" class="ind-link" data-ind-acao="abrir-item" data-chave="${esc(item.chave)}" aria-expanded="${aberto}">${aberto ? 'fechar' : 'origem'}</button>${acoes}</td>
  </tr>`;
  if (aberto) {
    const origem = indLinhasOrigem(item, indice, colunas);
    html += origem.length
      ? origem.map((o) => `<tr class="ind-origem${o.excluida ? ' excluida' : ''}">
          <td></td>
          <td class="ind-rotulo"><span class="ind-origem-fonte">${esc(item.fonte)}</span><span class="ind-nome" title="${esc([o.row.classificacao, o.row.subclassificacao].filter(Boolean).join(' › '))}">${esc(indRotuloRubrica(o.row))}</span></td>
          ${colunas.map((col) => `<td class="ind-val">${indNum(o.valores[col.ano] ?? null)}</td>`).join('')}
          <td class="ind-acoes"><button type="button" class="ind-link${o.excluida ? '' : ' perigo'}" data-ind-acao="toggle-rubrica" data-chave="${esc(item.chave)}" data-rubrica="${esc(o.rubrica)}">${o.excluida ? 'devolver' : 'tirar'}</button></td>
        </tr>`).join('')
      : `<tr class="ind-origem"><td></td><td colspan="${colunas.length + 2}" class="ind-dim">Nenhuma rubrica da base corresponde a este item.</td></tr>`;
  }
  return html;
}

function indHtmlGrupo(indicadorId, grupo, calculos) {
  const colunas = indColunasDoGrupo(indicadorId, grupo.id, calculos);
  const papel = (IND_PAPEIS[indicadorId] || {})[grupo.id] || ['', ''];
  const ligados = grupo.itens.filter((i) => i.ativo).length;
  const linhas = [];
  let secaoAtual = null;
  const fecharSecao = () => {
    if (secaoAtual === null || secaoAtual.nome === '') return;
    const subtotais = colunas.map((col) => {
      let s = 0;
      secaoAtual.indices.forEach((i) => { s += col.calc.itens[i].contribuicao; });
      return `<td class="ind-val">${indNum(s)}</td>`;
    }).join('');
    linhas.splice(secaoAtual.posicao, 0, `<tr class="ind-secao"><td></td><td>${esc(secaoAtual.nome)}</td>${subtotais}<td></td></tr>`);
  };
  grupo.itens.forEach((item, i) => {
    if (secaoAtual === null || item.secao !== secaoAtual.nome) {
      fecharSecao();
      secaoAtual = { nome: item.secao, indices: [], posicao: linhas.length };
    }
    secaoAtual.indices.push(i);
    linhas.push(indHtmlItem(indicadorId, grupo, item, i, colunas));
  });
  fecharSecao();
  const totais = colunas.map((col) => `<td class="ind-val">${indNum(col.calc.total)}</td>`).join('');
  return `<section class="op-card ind-grupo" id="ind-g-${esc(indicadorId)}-${esc(grupo.id)}">
    <div class="ind-grupo-head">
      <div><h3><span class="ind-ref">${esc(grupo.ref)}</span>${esc(grupo.rotulo)}</h3><p><span class="ind-papel">${esc(papel[0])}</span>${esc(papel[1])} · ${ligados} de ${grupo.itens.length} rubricas no cálculo</p>${grupo.nota ? `<p class="ind-nota">${esc(grupo.nota)}</p>` : ''}</div>
      <button type="button" class="ind-link" data-ind-acao="toggle-grupo" data-grupo="${esc(grupo.id)}">${ligados ? 'desligar todas' : 'ligar todas'}</button>
    </div>
    <div class="op-table-wrap"><table class="ind-tbl">
      <thead><tr><th class="ind-chave">No cálculo</th><th>Rubrica</th>${colunas.map((col) => `<th class="ind-val">${esc(col.ano)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${linhas.join('')}</tbody>
      <tfoot><tr><td></td><td>Total ${esc(grupo.ref)}</td>${totais}<td></td></tr></tfoot>
    </table></div>
    <div class="ind-grupo-pe"><button type="button" class="ind-link" data-ind-acao="adicionar" data-grupo="${esc(grupo.id)}">+ Adicionar rubrica</button></div>
  </section>`;
}

function indHtmlResumo(indicadorId, calculos) {
  const linhas = calculos[0].linhas.map((linha, i) => {
    const valores = calculos.map((c) => `<td class="ind-val">${indNum(c.linhas[i].valor, linha.percentual)}</td>`).join('');
    const alvo = linha.grupos && linha.grupos.length ? ` data-ind-acao="ir-grupo" data-grupo="${esc(linha.grupos[0])}"` : (linha.origem ? ` data-ind-acao="ir-painel" data-painel="ind-${esc(linha.origem)}"` : '');
    const classes = ['ind-res', linha.destaque ? 'destaque' : '', linha.final ? 'final' : '', linha.desligado ? 'desligado' : '', alvo ? 'clicavel' : ''].filter(Boolean).join(' ');
    return `<tr class="${classes}"${alvo}><td>${esc(linha.rotulo)}${linha.formula ? `<small>${esc(linha.formula)}</small>` : ''}${linha.aviso ? '<span class="ind-chip alerta">média incompleta</span>' : ''}${linha.desligado ? '<span class="ind-chip">desconsiderado</span>' : ''}</td>${valores}</tr>`;
  }).join('');
  const status = `<tr class="ind-res status"><td>Situação</td>${calculos.map((c) => `<td class="ind-val">${indStatusPill(c)}</td>`).join('')}</tr>`;
  return `<section class="op-card"><div class="op-card-head"><div><h3>Resumo do cálculo</h3><p class="op-muted">Como os grupos se combinam. Clique numa linha para ver as rubricas que a formam.</p></div></div>
    <div class="op-table-wrap"><table class="ind-tbl ind-tbl-resumo"><thead><tr><th>Linha</th>${calculos.map((c) => `<th class="ind-val">${esc(c.ano)}</th>`).join('')}</tr></thead><tbody>${linhas}${status}</tbody></table></div></section>`;
}

function indHtmlKpis(indicadorId, calculos) {
  const percentual = indicadorId !== 'resultado';
  if (indicadorId === 'elenco') {
    const c = calculos[0];
    const card = (rotulo, valor, sub, pct, cls = '') => `<div class="op-kpi ${cls}"><strong>${esc(pct ? indFormatarPercentual(valor) : indFormatarValor(valor))}</strong><span>${esc(rotulo)}</span><small>${sub}</small></div>`;
    const cor = c.conforme === null ? '' : (c.conforme ? 'green' : 'red');
    return `<div class="op-kpis ind-kpis">
      ${card(`Custo com elenco ajustado · ${c.ano}`, c.valor, indStatusPill(c), true, cor)}
      ${card('Custo com elenco (sem contribuições)', c.indice, 'limite de 70%', true)}
      ${card('Custo com elenco (numerador)', c.numerador, 'B.1.1: I + II + III', false, 'blue')}
      ${card('Receita operacional + RLMT', c.receitaOperacional + c.rlmt, c.rlmtIncompleto ? `RLMT com ${c.anosRlt.filter((a) => a.naBase).length} de 3 exercícios` : 'RLMT: média de 3 exercícios', false, 'purple')}
    </div>`;
  }
  return `<div class="op-kpis ind-kpis">${calculos.map((c) => {
    const cor = c.conforme === null ? '' : (c.conforme ? 'green' : 'red');
    const sub = indicadorId === 'endividamento' ? 'limite de 45%' : 'resultado final';
    return `<div class="op-kpi ${cor}"><strong>${esc(percentual ? indFormatarPercentual(c.valor) : indFormatarValor(c.valor))}</strong><span>${esc(c.ano)} · ${esc(sub)}</span><small>${indStatusPill(c)}</small></div>`;
  }).join('')}</div>`;
}

// Tabela "Todos os clubes": o indicador de cada clube, com a fórmula em uso.
function indHtmlTodos(indicadorId, anos) {
  const percentual = indicadorId !== 'resultado';
  const linhas = indUI.clubes
    .filter((c) => indUI.serie === 'todas' || c.serie === indUI.serie)
    .map((c) => ({ clube: c, calculos: anos.map((ano) => indCalcular(indicadorId, indUI.base, indUI.efetiva, c.nome, ano)) }));
  const ultimo = anos.length - 1;
  const { col, dir } = indUI.ordem;
  const fator = dir === 'desc' ? -1 : 1;
  linhas.sort((a, b) => {
    if (col === 'nome') return fator * a.clube.nome.localeCompare(b.clube.nome, 'pt-BR', { sensitivity: 'base' });
    const i = anos.indexOf(Number(col));
    const va = i >= 0 ? a.calculos[i].valor : null;
    const vb = i >= 0 ? b.calculos[i].valor : null;
    if (va === null || a.calculos[i].semDados) return 1;
    if (vb === null || b.calculos[i].semDados) return -1;
    return fator * (va - vb);
  });
  const conta = (teste) => linhas.filter((l) => teste(l.calculos[ultimo])).length;
  const bons = conta((c) => c.conforme === true);
  const ruins = conta((c) => c.conforme === false);
  const sem = conta((c) => c.conforme === null);
  const seta = (chave) => (String(col) === String(chave) ? (dir === 'asc' ? ' ↑' : ' ↓') : '');
  const corpo = linhas.map((l) => `<tr data-ind-acao="selecionar-clube" data-clube="${esc(l.clube.nome)}" class="${l.clube.nome === indUI.clube ? 'atual' : ''}">
      <td><strong>${esc(l.clube.nome)}</strong></td><td>${esc(l.clube.serie || '—')}</td>
      ${l.calculos.map((c) => `<td class="ind-val${c.conforme === false ? ' ruim' : ''}">${c.semDados ? '<span class="ind-dim">—</span>' : indNum(c.valor, percentual)}</td>`).join('')}
      <td>${indStatusPill(l.calculos[ultimo])}</td>
    </tr>`).join('');
  const series = Array.from(new Set(indUI.clubes.map((c) => c.serie).filter(Boolean))).sort();
  return `<section class="op-card ind-todos"><div class="op-card-head"><div><h3>Todos os clubes</h3><p class="op-muted">${esc(anos[ultimo])}: <b>${bons}</b> ${indicadorId === 'resultado' ? 'com resultado positivo' : 'em conformidade'} · <b>${ruins}</b> ${indicadorId === 'resultado' ? 'com resultado negativo' : 'em não conformidade'}${sem ? ` · <b>${sem}</b> sem dados` : ''}. Clique num clube para abrir o cálculo dele.</p></div>
      <label class="op-field"><span class="op-label">Série</span><select data-ind-campo="serie"><option value="todas">Todas</option>${series.map((s) => `<option value="${esc(s)}" ${indUI.serie === s ? 'selected' : ''}>Série ${esc(s)}</option>`).join('')}</select></label></div>
    <div class="op-table-wrap"><table class="ind-tbl ind-tbl-todos"><thead><tr><th data-ind-acao="ordenar" data-col="nome">Clube${seta('nome')}</th><th>Série</th>${anos.map((ano) => `<th class="ind-val" data-ind-acao="ordenar" data-col="${esc(ano)}">${esc(ano)}${seta(ano)}</th>`).join('')}<th>Situação em ${esc(anos[ultimo])}</th></tr></thead><tbody>${corpo}</tbody></table></div>
    ${indicadorId === 'resultado' ? '<p class="ind-rodape">Os valores estão na unidade que cada clube informou (há clubes em R$ e clubes em R$ mil), por isso não são comparáveis entre clubes em valor absoluto.</p>' : ''}
  </section>`;
}

function indRenderIndicador(painelId) {
  const indicadorId = IND_PAINEIS[painelId];
  const painel = document.querySelector(`#${painelId}`);
  if (!painel) return;
  const def = indUI.efetiva[indicadorId];
  if (!indTemBase()) { painel.innerHTML = indEstadoVazio(def.titulo); return; }

  const anos = indicadorId === 'elenco' ? [indUI.anoElenco] : indUI.base.anos;
  const calculos = anos.map((ano) => indCalcular(indicadorId, indUI.base, indUI.efetiva, indUI.clube, ano));
  const clube = indUI.clubes.find((c) => c.nome === indUI.clube) || { nome: indUI.clube, serie: '' };

  const filtros = [indSelectClube()];
  if (indicadorId === 'elenco') {
    filtros.push(`<label class="op-field"><span class="op-label">Exercício</span><select data-ind-campo="ano-elenco">${indUI.base.anos.map((a) => `<option value="${a}" ${a === indUI.anoElenco ? 'selected' : ''}>${a}</option>`).join('')}</select></label>`);
  }
  if (indicadorId === 'resultado') {
    filtros.push(`<label class="op-field wide ind-check"><span class="op-label">Investimentos relevantes (A.3)</span><span class="ind-check-linha"><input type="checkbox" data-ind-campo="investimentos" ${indUI.efetiva.parametros.considerarInvestimentos !== false ? 'checked' : ''}><span>Considerar base, feminino e olímpicos como investimento relevante</span></span></label>`);
  }

  const avisos = [];
  if (indicadorId === 'elenco' && calculos[0].rlmtIncompleto) {
    avisos.push(`<div class="ind-aviso alerta">A base não tem ${esc(calculos[0].anosSemBase.join(' nem '))}. A média de transferências (RLMT) de ${esc(indUI.anoElenco)} foi calculada só com ${calculos[0].anosRlt.filter((a) => a.naBase).length} exercício(s), e não com três.</div>`);
  }

  painel.innerHTML = `<div class="op-layout">
    <section class="op-hero"><div><span class="op-pill">${esc(def.anexo)}</span><h2>${esc(def.titulo)}</h2><p>${esc(IND_TEXTOS[indicadorId].sub)} ${esc(IND_TEXTOS[indicadorId].regra)}</p></div>
      <div class="op-actions"><button type="button" class="op-btn" data-ind-acao="exportar">Exportar Excel</button><button type="button" class="op-btn" data-ind-acao="imprimir">Imprimir/PDF</button></div></section>
    <div class="op-filter-grid ind-filtros">${filtros.join('')}<p class="ind-unidade">${esc(clube.nome)}${clube.serie ? ` · Série ${esc(clube.serie)}` : ''}. Valores na unidade informada pelo clube.</p></div>
    ${indAviso()}${avisos.join('')}
    ${indBarraFormula(indicadorId)}
    ${indHtmlKpis(indicadorId, calculos)}
    ${indHtmlResumo(indicadorId, calculos)}
    <div class="ind-titulo-secao"><h3>Composição do cálculo</h3><p>Cada rubrica mostra o valor que veio da base. A chave tira ou devolve a rubrica; “origem” abre as linhas da base que formam o valor.</p></div>
    ${def.grupos.map((grupo) => indHtmlGrupo(indicadorId, grupo, calculos)).join('')}
    ${indHtmlTodos(indicadorId, anos)}
    ${indHtmlModal(indicadorId)}
  </div>`;
  if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel(painelId);
}

// ---------- adicionar rubrica ----------

function indAbrirModalAdicionar(indicadorId, grupoId) {
  const grupo = indGrupo(indUI.efetiva[indicadorId], grupoId);
  if (!grupo) return;
  const contagem = {};
  grupo.itens.forEach((i) => { contagem[i.fonte] = (contagem[i.fonte] || 0) + 1; });
  const dem = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0] || 'DRE';
  indUI.modal = { tipo: 'adicionar', indicador: indicadorId, grupo: grupoId, dem, busca: '', rubrica: '', recorte: '', sinal: 1 };
  indRenderAtivo();
}

// Rubricas do catálogo para o seletor: uma por (classificação, sub, descrição)
// — na DMPL, uma por descrição —, com os recortes possíveis (centro de custo
// na DRE; coluna do patrimônio líquido na DMPL).
function indOpcoesRubrica(dem) {
  const mapa = new Map();
  indUI.catalogo.filter((r) => r.dem === dem).forEach((r) => {
    const chave = dem === 'DMPL' ? r._k.descricao : [r._k.classificacao, r._k.subclassificacao, r._k.descricao].join('|');
    if (!mapa.has(chave)) mapa.set(chave, { chave, descricao: r.descricao, classificacao: dem === 'DMPL' ? '' : r.classificacao, subclassificacao: dem === 'DMPL' ? '' : r.subclassificacao, recortes: [] });
    const recorte = dem === 'DRE' ? r.centro : (dem === 'DMPL' ? r.classificacao : '');
    if (recorte && !mapa.get(chave).recortes.includes(recorte)) mapa.get(chave).recortes.push(recorte);
  });
  return Array.from(mapa.values());
}

function indHtmlModal(indicadorId) {
  const m = indUI.modal;
  if (!m || m.tipo !== 'adicionar' || m.indicador !== indicadorId) return '';
  const grupo = indGrupo(indUI.efetiva[indicadorId], m.grupo);
  const termo = indChave(m.busca);
  const opcoes = indOpcoesRubrica(m.dem).filter((o) => !termo || indChave([o.classificacao, o.subclassificacao, o.descricao].join(' ')).includes(termo));
  const escolhida = indOpcoesRubrica(m.dem).find((o) => o.chave === m.rubrica) || null;
  const rotuloRecorte = m.dem === 'DRE' ? 'Centro de custo' : 'Coluna do patrimônio líquido';
  const todos = m.dem === 'DRE' ? 'Todos os centros de custo' : 'Todas as colunas';
  return `<div class="ind-modal-fundo" data-ind-acao="fechar-modal"><div class="ind-modal" role="dialog" aria-modal="true" aria-label="Adicionar rubrica">
    <header><div><span class="op-label">${esc(grupo.ref)} · ${esc(grupo.rotulo)}</span><h3>Adicionar rubrica ao cálculo</h3></div><button type="button" class="ind-fechar" data-ind-acao="fechar-modal" aria-label="Fechar">×</button></header>
    <div class="ind-modal-corpo">
      <div class="ind-modal-linha">
        <label class="op-field"><span class="op-label">Demonstração</span><select data-ind-modal="dem">${['DRE', 'BP', 'DMPL'].map((d) => `<option value="${d}" ${m.dem === d ? 'selected' : ''}>${esc(IND_NOME_DEM[d])}</option>`).join('')}</select></label>
        <label class="op-field wide"><span class="op-label">Buscar rubrica</span><input type="search" data-ind-modal="busca" value="${esc(m.busca)}" placeholder="Parte do nome da rubrica"></label>
      </div>
      <label class="op-field"><span class="op-label">Rubrica (${opcoes.length})</span><select size="9" data-ind-modal="rubrica" class="ind-lista">${opcoes.map((o) => `<option value="${esc(o.chave)}" ${o.chave === m.rubrica ? 'selected' : ''}>${esc([o.subclassificacao || o.classificacao, o.descricao].filter(Boolean).join(' › '))}</option>`).join('')}</select></label>
      ${indUI.catalogo.length ? '' : '<p class="ind-dim">O catálogo de rubricas vem da importação da planilha. Importe a base para poder adicionar rubricas.</p>'}
      <div class="ind-modal-linha">
        ${escolhida && escolhida.recortes.length ? `<label class="op-field wide"><span class="op-label">${rotuloRecorte}</span><select data-ind-modal="recorte"><option value="">${todos}</option>${escolhida.recortes.map((r) => `<option value="${esc(r)}" ${r === m.recorte ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>` : ''}
        <label class="op-field"><span class="op-label">No total do grupo</span><select data-ind-modal="sinal"><option value="1" ${m.sinal === 1 ? 'selected' : ''}>Soma</option><option value="-1" ${m.sinal === -1 ? 'selected' : ''}>Subtrai</option></select></label>
      </div>
    </div>
    <footer><button type="button" class="op-btn" data-ind-acao="fechar-modal">Cancelar</button><button type="button" class="op-btn ind-btn-primario" data-ind-acao="confirmar-adicionar" ${escolhida ? '' : 'disabled'}>Adicionar</button></footer>
  </div></div>`;
}

function indConfirmarAdicionar() {
  const m = indUI.modal;
  if (!m || m.tipo !== 'adicionar') return;
  const o = indOpcoesRubrica(m.dem).find((x) => x.chave === m.rubrica);
  if (!o) return;
  const onde = { descricao: [o.descricao] };
  if (m.dem !== 'DMPL') {
    if (o.classificacao) onde.classificacao = [o.classificacao];
    if (o.subclassificacao) onde.subclassificacao = [o.subclassificacao];
  }
  if (m.recorte) onde[m.dem === 'DRE' ? 'centro' : 'classificacao'] = [m.recorte];
  const rotulo = m.recorte ? `${o.descricao} (${m.recorte})` : o.descricao;
  const novo = { indicador: m.indicador, grupo: m.grupo, id: `x${Date.now().toString(36)}`, rotulo, fonte: m.dem, sinal: m.sinal, onde };
  indUI.modal = null;
  indMudarConfig((c) => { c.adicionados.push(novo); });
}

// ---------- exportação ----------

function indExportarIndicador(indicadorId) {
  const def = indUI.efetiva[indicadorId];
  const anos = indicadorId === 'elenco' ? [indUI.anoElenco] : indUI.base.anos;
  const calculos = anos.map((ano) => indCalcular(indicadorId, indUI.base, indUI.efetiva, indUI.clube, ano));
  const percentual = indicadorId !== 'resultado';
  const txt = (v, pct) => (v === null || v === undefined ? '' : (pct ? indFormatarPercentual(v) : String(v)));

  const resumo = [['Linha', 'Fórmula', ...anos.map(String)]];
  calculos[0].linhas.forEach((linha, i) => resumo.push([linha.rotulo, linha.formula || '', ...calculos.map((c) => txt(c.linhas[i].valor, linha.percentual))]));
  resumo.push(['Situação', '', ...calculos.map((c) => c.status)]);

  const composicao = [['Grupo', 'Rubrica', 'Operação', 'No cálculo', 'Exercício', 'Valor na base', 'Valor considerado']];
  def.grupos.forEach((grupo) => {
    indColunasDoGrupo(indicadorId, grupo.id, calculos).forEach((col) => {
      grupo.itens.forEach((item, i) => {
        const it = col.calc.itens[i];
        composicao.push([`${grupo.ref} ${grupo.rotulo}`, item.rotulo, item.sinal === -1 ? 'subtrai' : 'soma', item.ativo ? (item.excluidas.size ? 'sim (parcial)' : 'sim') : 'não', String(col.ano), String(it.bruto), String(it.contribuicao)]);
      });
    });
  });

  const todos = [['Clube', 'Série', ...anos.map(String), `Situação em ${anos[anos.length - 1]}`]];
  indUI.clubes.forEach((c) => {
    const cs = anos.map((ano) => indCalcular(indicadorId, indUI.base, indUI.efetiva, c.nome, ano));
    todos.push([c.nome, c.serie, ...cs.map((x) => (x.semDados ? '' : txt(x.valor, percentual))), cs[cs.length - 1].status]);
  });

  const bytes = montarXlsx([
    { nome: 'Resumo', linhas: [[`${def.anexo} · ${def.titulo} · ${indUI.clube}`], ...resumo] },
    { nome: 'Composição', linhas: composicao },
    { nome: 'Todos os clubes', linhas: todos },
  ]);
  const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  baixarArquivo(bytes, `indicador-${indicadorId}-${slug(indUI.clube)}-${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------- eventos ----------

function indPainelAtivoId() {
  const ativo = document.querySelector('.panel.active-panel');
  return ativo && IND_PAINEIS[ativo.id] ? ativo.id : '';
}

function indRender(painelId) {
  if (!IND_PAINEIS[painelId]) return;
  if (painelId === 'ind-base') { if (typeof indRenderBase === 'function') indRenderBase(); return; }
  indRenderIndicador(painelId);
}

function indRenderAtivo() {
  const id = indPainelAtivoId();
  if (id) indRender(id);
}

async function renderIndicadores(painelId) {
  indRender(painelId); // mostra "carregando" na primeira vez
  await indCarregar();
  indRender(painelId);
}

function indIrParaPainel(painelId) {
  const nav = document.querySelector(`.nav-item[data-panel="${painelId}"]`);
  if (nav && typeof activatePanel === 'function') activatePanel(painelId, nav);
  renderIndicadores(painelId);
}

function indAoClicar(event, painelId) {
  const alvo = event.target.closest('[data-ind-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.indAcao;
  const indicadorId = IND_PAINEIS[painelId];
  // Chaves (checkbox) são tratadas no evento "change".
  if (acao === 'toggle-item') return;
  if (acao === 'fechar-modal') { if (event.target === alvo) { indUI.modal = null; indRenderAtivo(); } return; }
  if (acao === 'toggle-grupo') return indAlternarGrupo(indicadorId, alvo.dataset.grupo);
  if (acao === 'abrir-item') {
    const chave = alvo.dataset.chave;
    if (indUI.abertos.has(chave)) indUI.abertos.delete(chave); else indUI.abertos.add(chave);
    return indRenderAtivo();
  }
  if (acao === 'toggle-rubrica') return indAlternarRubrica(alvo.dataset.chave, alvo.dataset.rubrica);
  if (acao === 'remover-adicionado') return indRemoverAdicionado(indicadorId, alvo.dataset.grupo, alvo.dataset.id);
  if (acao === 'adicionar') return indAbrirModalAdicionar(indicadorId, alvo.dataset.grupo);
  if (acao === 'confirmar-adicionar') return indConfirmarAdicionar();
  if (acao === 'salvar') return indSalvarConfig();
  if (acao === 'descartar') { indAplicarConfig(indUI.configSalva); indUI.aviso = null; return indRenderAtivo(); }
  if (acao === 'restaurar') { indAplicarConfig(indConfigVazia()); indUI.aviso = null; return indRenderAtivo(); }
  if (acao === 'recarregar') { indUI.carregado = false; return renderIndicadores(painelId); }
  if (acao === 'imprimir') return imprimirSomente(document.querySelector(`#${painelId} .op-layout`));
  if (acao === 'exportar') return indExportarIndicador(indicadorId);
  if (acao === 'ir-painel') return indIrParaPainel(alvo.dataset.painel);
  if (acao === 'ir-grupo') {
    const el = document.querySelector(`#ind-g-${indicadorId}-${alvo.dataset.grupo}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (acao === 'selecionar-clube') {
    indUI.clube = alvo.dataset.clube;
    indRenderAtivo();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (acao === 'ordenar') {
    const col = alvo.dataset.col;
    indUI.ordem = { col, dir: indUI.ordem.col === col && indUI.ordem.dir === 'asc' ? 'desc' : 'asc' };
    return indRenderAtivo();
  }
}

function indAoMudar(event) {
  const el = event.target;
  if (el.dataset.indAcao === 'toggle-item') return indAlternarItem(el.dataset.chave);
  const campo = el.dataset.indCampo;
  if (campo === 'clube') { indUI.clube = el.value; return indRenderAtivo(); }
  if (campo === 'ano-elenco') { indUI.anoElenco = Number(el.value); return indRenderAtivo(); }
  if (campo === 'serie') { indUI.serie = el.value; return indRenderAtivo(); }
  if (campo === 'investimentos') {
    const marcado = el.checked;
    return indMudarConfig((c) => { if (marcado) delete c.parametros.considerarInvestimentos; else c.parametros.considerarInvestimentos = false; });
  }
  const modal = el.dataset.indModal;
  if (modal && indUI.modal) {
    if (modal === 'dem') { indUI.modal.dem = el.value; indUI.modal.rubrica = ''; indUI.modal.recorte = ''; }
    else if (modal === 'rubrica') { indUI.modal.rubrica = el.value; indUI.modal.recorte = ''; }
    else if (modal === 'recorte') indUI.modal.recorte = el.value;
    else if (modal === 'sinal') indUI.modal.sinal = Number(el.value) === -1 ? -1 : 1;
    else return;
    indRenderAtivo();
  }
}

function indAoDigitar(event) {
  const el = event.target;
  if (el.dataset.indModal === 'busca' && indUI.modal) {
    indUI.modal.busca = el.value;
    const pos = el.selectionStart;
    indRenderAtivo();
    const novo = document.querySelector('.panel.active-panel [data-ind-modal="busca"]');
    if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) { /* campo search */ } }
  }
}

Object.keys(IND_PAINEIS).forEach((painelId) => {
  const painel = document.querySelector(`#${painelId}`);
  if (!painel) return;
  if (painelId !== 'ind-base') {
    painel.addEventListener('click', (event) => indAoClicar(event, painelId));
    painel.addEventListener('change', indAoMudar);
    painel.addEventListener('input', indAoDigitar);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && indUI.modal && indPainelAtivoId()) { indUI.modal = null; indRenderAtivo(); }
});

navItems.forEach((item) => {
  if (!IND_PAINEIS[item.dataset.panel]) return;
  item.addEventListener('click', () => renderIndicadores(item.dataset.panel));
});
