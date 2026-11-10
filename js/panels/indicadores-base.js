// Painel "Base de dados" do grupo Indicadores: o que cada clube informou nas
// demonstrações financeiras (BP, DRE, DMPL, DFC), um clube por vez, com os
// exercícios lado a lado e a indicação de ONDE cada rubrica entra nos cálculos.
// Também é aqui que a planilha consolidada é importada (só administradores).
//
// Depende de indicadores.js (estado indUI, carga e peças comuns), do motor em
// indicadores-formulas.js e do leitor de planilha em xlsx-leitor.js.

const IND_LOTE_ENVIO = 2000; // linhas por requisição na importação

// ---------- dados do clube ----------

async function indCarregarBaseDoClube(clube) {
  if (!clube || indUI.basePorClube.has(clube)) return;
  indUI.basePorClube.set(clube, { estado: 'carregando' });
  try {
    const resposta = await fetch(`/api/indicadores?clube=${encodeURIComponent(clube)}`);
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok || !dados) throw new Error((dados && dados.erro) || 'Não foi possível carregar a base do clube.');
    indUI.basePorClube.set(clube, { estado: 'ok', linhas: Array.isArray(dados.linhas) ? dados.linhas : [] });
  } catch (erro) {
    indUI.basePorClube.set(clube, { estado: 'erro', erro: erro.message });
  }
  if (indPainelAtivoId() === 'ind-base' && indUI.clube === clube) indRenderBase();
}

// Junta as linhas de uma demonstração por rubrica, com um valor por exercício,
// na ordem do modelo que o clube preencheu.
function indRubricasDaBase(linhas, dem) {
  const mapa = new Map();
  linhas.filter((l) => l.dem === dem).forEach((l) => {
    const chave = indChaveRubrica(l);
    if (!mapa.has(chave)) mapa.set(chave, { chave, row: l, valores: {}, ordem: Infinity, anoOrdem: -1 });
    const r = mapa.get(chave);
    r.valores[l.ano] = (r.valores[l.ano] === undefined || r.valores[l.ano] === null) ? l.valor : r.valores[l.ano] + (Number(l.valor) || 0);
    // A posição vale a do exercício mais recente em que a rubrica aparece.
    if (l.ano > r.anoOrdem && Number.isFinite(Number(l.ordem))) { r.anoOrdem = l.ano; r.ordem = Number(l.ordem); }
  });
  return Array.from(mapa.values()).sort((a, b) => (b.anoOrdem - a.anoOrdem) || (a.ordem - b.ordem));
}

function indGrupoDaRubrica(row) {
  if (row.dem === 'DRE') return [row.centro, row.classificacao, row.subclassificacao].filter(Boolean).join(' › ');
  if (row.dem === 'DMPL') return row.classificacao || 'Sem coluna';
  return [row.classificacao, row.subclassificacao].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' › ');
}

// Etiquetas "entra em": um chip por indicador/grupo que usa a rubrica.
function indChipsUso(row) {
  const usos = indUsosDaLinha(row, indUI.efetiva);
  const vistos = new Set();
  return usos.filter((u) => { const k = `${u.indicador}:${u.grupo}:${u.ativa}:${u.sinal}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((u) => `<button type="button" class="ind-chip uso${u.ativa ? '' : ' fora'}" data-ind-acao="ir-uso" data-painel="ind-${esc(u.indicador)}" data-grupo="${esc(u.grupo)}" title="${esc(`${u.anexo} · ${u.grupoRotulo} — ${u.item.rotulo}${u.ativa ? '' : ' (fora do cálculo)'}`)}">${u.sinal === -1 ? '− ' : ''}${esc(u.ref || u.anexo)}</button>`)
    .join('');
}

function indHtmlTabelaBase() {
  const dados = indUI.basePorClube.get(indUI.clube);
  if (!dados || dados.estado === 'carregando') return '<div class="op-empty">Carregando o que o clube informou…</div>';
  if (dados.estado === 'erro') return `<div class="op-empty">${esc(dados.erro)} <button type="button" class="op-btn" data-ind-acao="recarregar-clube">Tentar de novo</button></div>`;
  const anos = indUI.base.anos;
  const termo = indChave(indUI.baseBusca);
  const todas = indRubricasDaBase(dados.linhas, indUI.baseDem);
  const doClube = indAjustesDoClube(indUI.clube);
  const ajustesDe = (chave) => doClube.filter((s) => s.rubrica === chave);
  const podeAjustar = IND_DEMS_AJUSTE.includes(indUI.baseDem);
  const visiveis = todas.filter((r) => {
    if (indUI.baseOcultarZeradas && !anos.some((a) => Number(r.valores[a])) && !ajustesDe(r.chave).length) return false;
    if (termo && !indChave([indGrupoDaRubrica(r.row), r.row.descricao].join(' ')).includes(termo)) return false;
    return true;
  });
  if (!todas.length) return `<div class="op-empty">O clube não tem ${esc(IND_NOME_DEM[indUI.baseDem])} na base.</div>`;
  const linhas = [];
  let grupoAtual = null;
  visiveis.forEach((r) => {
    const grupo = indGrupoDaRubrica(r.row);
    if (grupo !== grupoAtual) { linhas.push(`<tr class="ind-secao"><td colspan="${anos.length + 3}">${esc(grupo)}</td></tr>`); grupoAtual = grupo; }
    const ajustes = ajustesDe(r.chave);
    linhas.push(`<tr><td class="ind-rotulo"><span class="ind-nome">${esc(r.row.descricao)}</span>${ajustes.some((s) => s.situacao === 'aplicado') ? '<span class="ind-chip ajuste">ajustado</span>' : ''}</td>${anos.map((a) => `<td class="ind-val">${indNum(r.valores[a] ?? null)}</td>`).join('')}<td class="ind-usos">${indChipsUso(r.row)}</td><td class="ind-acoes">${podeAjustar ? `<button type="button" class="ind-link" data-ind-acao="ajustar" data-rubrica="${esc(r.chave)}" data-ano="${esc(anos[anos.length - 1])}" title="Somar ou tirar um valor desta linha, com justificativa">ajustar</button>` : ''}</td></tr>${indHtmlAjustesDaLinha(ajustes, anos, r.valores, false, true)}`);
  });
  const corpo = linhas.length ? linhas.join('') : `<tr><td colspan="${anos.length + 3}"><div class="op-empty">Nenhuma rubrica com esses filtros.</div></td></tr>`;
  return `<p class="ind-rodape ind-contagem">Mostrando <b>${visiveis.length}</b> de ${todas.length} rubricas de ${esc(IND_NOME_DEM[indUI.baseDem])}.${indUI.baseOcultarZeradas ? ' Rubricas zeradas nos três exercícios estão ocultas.' : ''}</p>
    <div class="op-table-wrap"><table class="ind-tbl ind-tbl-base"><thead><tr><th>Rubrica</th>${anos.map((a) => `<th class="ind-val">${esc(a)}</th>`).join('')}<th>Entra em</th><th></th></tr></thead><tbody>${corpo}</tbody></table></div>`;
}

// Histórico dos ajustes do clube, inclusive os que foram desfeitos.
function indHtmlHistoricoAjustes() {
  const lista = indUI.situacoes.filter((s) => s.ajuste.clube === indUI.clube).slice().reverse();
  if (!lista.length) return '';
  const linhas = lista.map((s) => {
    const a = s.ajuste;
    const ativo = s.situacao !== 'revogado';
    return `<tr class="${s.situacao === 'aplicado' ? '' : 'ind-ajuste fora'}">
      <td>${esc(a.ano)}</td>
      <td class="ind-rotulo"><span class="ind-origem-fonte">${esc(a.dem)}</span><span class="ind-nome">${esc(indRotuloRubrica(s.linha))}</span></td>
      <td class="ind-val">${indNumSinal(a.valor)}</td>
      <td class="ind-just">${esc(a.justificativa)}<small class="ind-nota">${esc(indTextoAutoria(a))}</small></td>
      <td><span class="op-pill ${s.situacao === 'aplicado' ? 'green' : (s.situacao === 'revisar' ? 'orange' : 'neutral')}">${s.situacao === 'aplicado' ? 'Aplicado' : (s.situacao === 'revisar' ? 'A revisar' : 'Desfeito')}</span>${ativo ? '' : `<small class="ind-nota">${esc(indSituacaoTexto(s))}</small>`}</td>
      <td class="ind-acoes">${s.situacao === 'revisar' ? `<button type="button" class="ind-link" data-ind-acao="manter-ajuste" data-id="${esc(a.id)}">manter</button>` : ''}${ativo ? `<button type="button" class="ind-link perigo" data-ind-acao="desfazer-ajuste" data-id="${esc(a.id)}">desfazer</button>` : ''}</td>
    </tr>`;
  }).join('');
  return `<section class="op-card ind-card-ajustes"><div class="op-card-head"><div><h3>Ajustes da ANRESF neste clube</h3><p class="op-muted">Correções lançadas sobre o que o clube declarou, com a justificativa de cada uma. O valor declarado não é alterado; ajustes desfeitos ficam no histórico.</p></div></div>
    <div class="op-table-wrap"><table class="ind-tbl ind-tbl-ajustes"><thead><tr><th>Exercício</th><th>Linha ajustada</th><th class="ind-val">Ajuste</th><th>Justificativa</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></section>`;
}

function indHtmlLote() {
  const l = indUI.lote;
  if (!l) return '';
  const por = l.porDemonstracao || {};
  const anos = (l.anos || []).slice().sort((a, b) => a - b);
  return `<section class="ind-lote"><div><span class="op-label">Base em uso</span>
      <p><b>${esc(Number(l.total || 0).toLocaleString('pt-BR'))}</b> linhas · <b>${esc((l.clubes || []).length)}</b> clubes · exercícios <b>${esc(anos.length > 1 ? `${anos[0]} a ${anos[anos.length - 1]}` : (anos[0] || '—'))}</b>
      <span class="ind-dim"> — ${IND_DEMS.map((d) => `${esc(d)} ${esc(Number(por[d] || 0).toLocaleString('pt-BR'))}`).join(' · ')}</span></p>
      <p class="ind-dim">Importada${l.importado_por ? ` por ${esc(l.importado_por)}` : ''}${l.importado_em ? ` em ${esc(indDataHora(l.importado_em))}` : ''}${l.arquivo ? ` · arquivo ${esc(l.arquivo)}` : ''}.</p></div></section>`;
}

function indRenderBase() {
  const painel = document.querySelector('#ind-base');
  if (!painel) return;
  const botaoImportar = indPodeImportar() && indUI.carregado && !indUI.semTabelas && !indUI.erro
    ? '<button type="button" class="op-btn ind-btn-primario" data-ind-acao="importar">Importar planilha</button>' : '';
  if (!indTemBase()) {
    painel.innerHTML = indEstadoVazio('Base de dados', botaoImportar) + indHtmlImportacao();
    return;
  }
  indCarregarBaseDoClube(indUI.clube);
  painel.innerHTML = `<div class="op-layout">
    <section class="op-hero"><div><span class="op-pill">Indicadores</span><h2>Base de dados</h2><p>O que cada clube informou nas demonstrações financeiras. É desta base que saem os três indicadores; a coluna “Entra em” mostra em quais cálculos cada rubrica é usada.</p></div>
      <div class="op-actions">${botaoImportar}<button type="button" class="op-btn" data-ind-acao="exportar-base">Exportar Excel</button><button type="button" class="op-btn" data-ind-acao="imprimir">Imprimir/PDF</button></div></section>
    ${indHtmlLote()}
    ${indAviso()}
    <div class="op-filter-grid ind-filtros">
      ${indSelectClube()}
      <div class="op-field wide"><span class="op-label">Demonstração</span><div class="ind-abas" role="tablist">${IND_DEMS.map((d) => `<button type="button" role="tab" aria-selected="${indUI.baseDem === d}" class="${indUI.baseDem === d ? 'ativa' : ''}" data-ind-acao="dem" data-dem="${d}">${esc(IND_NOME_DEM[d])}</button>`).join('')}</div></div>
      <label class="op-field"><span class="op-label">Busca</span><input type="search" data-ind-campo="busca-base" value="${esc(indUI.baseBusca)}" placeholder="Nome da rubrica"></label>
      <label class="op-field ind-check"><span class="op-label">Zeradas</span><span class="ind-check-linha"><input type="checkbox" data-ind-campo="ocultar-zeradas" ${indUI.baseOcultarZeradas ? 'checked' : ''}><span>Ocultar</span></span></label>
    </div>
    <section class="op-card"><div class="op-card-body" id="ind-base-tabela">${indHtmlTabelaBase()}</div></section>
    ${indHtmlHistoricoAjustes()}
    <p class="ind-rodape">Valores na unidade informada por cada clube (há clubes em R$ e clubes em R$ mil). “—” é campo que o clube deixou em branco. “ajustar” soma ou tira um valor de uma linha, com justificativa, sem alterar o que o clube declarou. Nos chips de “Entra em”, o sinal “−” indica rubrica que subtrai; chip riscado é rubrica que está fora do cálculo na fórmula em uso.</p>
    ${indHtmlImportacao()}
    ${indHtmlModalAjuste()}
  </div>`;
  if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel('ind-base');
}

function indExportarBase() {
  const dados = indUI.basePorClube.get(indUI.clube);
  if (!dados || dados.estado !== 'ok') return;
  const anos = indUI.base.anos;
  const abas = IND_DEMS.map((dem) => {
    const linhas = [['Centro de custo', 'Classificação', 'Subclassificação', 'Descrição', ...anos.map(String), 'Entra em']];
    indRubricasDaBase(dados.linhas, dem).forEach((r) => {
      const usos = indUsosDaLinha(r.row, indUI.efetiva).map((u) => `${u.anexo} ${u.ref}${u.ativa ? '' : ' (fora)'}`);
      linhas.push([r.row.centro, r.row.classificacao, r.row.subclassificacao, r.row.descricao, ...anos.map((a) => (r.valores[a] === null || r.valores[a] === undefined ? '' : String(r.valores[a]))), Array.from(new Set(usos)).join('; ')]);
    });
    return { nome: dem, linhas };
  });
  abas.push({ nome: 'Ajustes', linhas: indLinhasExportacaoAjustes(indUI.clube) });
  const slug = String(indUI.clube).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  baixarArquivo(montarXlsx(abas), `base-indicadores-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------- importação da planilha ----------

function indHtmlImportacao() {
  const imp = indUI.importacao;
  if (!imp) return '';
  let corpo;
  let rodape = '<button type="button" class="op-btn" data-ind-acao="fechar-importacao">Fechar</button>';
  if (imp.etapa === 'escolher' || imp.etapa === 'lendo') {
    corpo = `<p>Escolha a planilha consolidada das demonstrações (.xlsx), com as abas <code>BP_Consolidado</code>, <code>DRE_Consolidado</code>, <code>DMPL_Consolidado</code> e <code>DFC_Consolidado</code>. A planilha é lida aqui no navegador; você confere o resumo antes de gravar.</p>
      <label class="op-field"><span class="op-label">Arquivo</span><input type="file" accept=".xlsx" data-ind-campo="arquivo-importacao" ${imp.etapa === 'lendo' ? 'disabled' : ''}></label>
      ${imp.etapa === 'lendo' ? '<p class="ind-dim">Lendo a planilha…</p>' : ''}
      ${imp.erro ? `<div class="ind-aviso erro">${esc(imp.erro)}</div>` : ''}`;
  } else if (imp.etapa === 'conferir') {
    const r = imp.resumo;
    const atual = indUI.lote ? `<p class="ind-dim">A base em uso tem ${esc(Number(indUI.lote.total || 0).toLocaleString('pt-BR'))} linhas, ${esc((indUI.lote.clubes || []).length)} clubes e os exercícios ${esc((indUI.lote.anos || []).join(', '))}. Ela será <b>substituída por inteiro</b>.</p>` : '';
    corpo = `<p><b>${esc(imp.arquivo)}</b></p>
      <div class="ind-conferencia">
        <div><strong>${esc(r.total.toLocaleString('pt-BR'))}</strong><span>linhas</span></div>
        <div><strong>${esc(r.clubes.length)}</strong><span>clubes</span></div>
        <div><strong>${esc(r.anos.length > 2 && r.anos[r.anos.length - 1] - r.anos[0] === r.anos.length - 1 ? `${r.anos[0]} a ${r.anos[r.anos.length - 1]}` : r.anos.join(', '))}</strong><span>exercícios</span></div>
      </div>
      <p class="ind-dim">${IND_DEMS.map((d) => `${esc(IND_NOME_DEM[d])}: ${esc(Number(r.porDemonstracao[d] || 0).toLocaleString('pt-BR'))}`).join(' · ')}</p>
      ${r.abasAusentes.length ? `<div class="ind-aviso alerta">Abas que não vieram na planilha: ${esc(r.abasAusentes.join(', '))}. Essas demonstrações ficarão vazias.</div>` : ''}
      ${atual}
      <p class="ind-dim">As fórmulas e os ajustes já salvos não mudam com a importação.</p>`;
    rodape = '<button type="button" class="op-btn" data-ind-acao="fechar-importacao">Cancelar</button><button type="button" class="op-btn ind-btn-primario" data-ind-acao="confirmar-importacao">Importar e substituir a base</button>';
  } else if (imp.etapa === 'enviando') {
    const pct = imp.total ? Math.round((imp.enviadas / imp.total) * 100) : 0;
    corpo = `<p>Gravando a base… <b>${esc(imp.enviadas.toLocaleString('pt-BR'))}</b> de ${esc(imp.total.toLocaleString('pt-BR'))} linhas.</p>
      <div class="ind-progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <p class="ind-dim">Não feche esta página. A base atual continua valendo até a nova terminar de gravar.</p>`;
    rodape = '';
  } else if (imp.etapa === 'feito') {
    corpo = `<div class="ind-aviso ok">Base importada: ${esc(imp.total.toLocaleString('pt-BR'))} linhas. Os indicadores já estão calculados com os dados novos.</div>`;
  } else {
    corpo = `<div class="ind-aviso erro">${esc(imp.erro || 'A importação falhou.')}</div><p class="ind-dim">A base anterior não foi alterada.</p>`;
    rodape = '<button type="button" class="op-btn" data-ind-acao="fechar-importacao">Fechar</button><button type="button" class="op-btn ind-btn-primario" data-ind-acao="importar">Tentar de novo</button>';
  }
  return `<div class="ind-modal-fundo"><div class="ind-modal" role="dialog" aria-modal="true" aria-label="Importar planilha">
    <header><div><span class="op-label">Base de dados</span><h3>Importar planilha consolidada</h3></div>${imp.etapa === 'enviando' ? '' : '<button type="button" class="ind-fechar" data-ind-acao="fechar-importacao" aria-label="Fechar">×</button>'}</header>
    <div class="ind-modal-corpo">${corpo}</div><footer>${rodape}</footer></div></div>`;
}

async function indLerArquivoImportacao(arquivo) {
  if (!arquivo) return;
  indUI.importacao = { etapa: 'lendo', arquivo: arquivo.name };
  indRenderBase();
  try {
    const { linhas, resumo } = await lerPlanilhaConsolidada(await arquivo.arrayBuffer());
    indUI.importacao = { etapa: 'conferir', arquivo: arquivo.name, linhas, resumo };
  } catch (erro) {
    indUI.importacao = { etapa: 'escolher', erro: erro.message || 'Não foi possível ler a planilha.' };
  }
  indRenderBase();
}

async function indPostar(corpo) {
  const resposta = await fetch('/api/indicadores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error((dados && dados.erro) || 'Erro ao gravar no servidor.');
  return dados;
}

// Envia a planilha em lotes com um identificador novo e só troca a base em uso
// no fim. Se algo falhar, pede ao servidor para apagar o que já tinha gravado.
async function indConfirmarImportacao() {
  const imp = indUI.importacao;
  if (!imp || imp.etapa !== 'conferir') return;
  const { linhas, resumo, arquivo } = imp;
  const lote = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  indUI.importacao = { etapa: 'enviando', arquivo, total: linhas.length, enviadas: 0 };
  indRenderBase();
  try {
    for (let i = 0; i < linhas.length; i += IND_LOTE_ENVIO) {
      await indPostar({ acao: 'importar', lote, linhas: linhas.slice(i, i + IND_LOTE_ENVIO) });
      indUI.importacao.enviadas = Math.min(linhas.length, i + IND_LOTE_ENVIO);
      indRenderBase();
    }
    await indPostar({ acao: 'ativar', lote, resumo: { ...resumo, arquivo }, catalogo: indCatalogoDe(linhas) });
    indUI.basePorClube.clear();
    await indCarregar(true);
    indUI.importacao = { etapa: 'feito', arquivo, total: linhas.length };
  } catch (erro) {
    indPostar({ acao: 'descartar', lote }).catch(() => {});
    indUI.importacao = { etapa: 'erro', arquivo, erro: erro.message };
  }
  indRenderBase();
}

// ---------- eventos ----------

function indAoClicarBase(event) {
  const alvo = event.target.closest('[data-ind-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.indAcao;
  if (acao === 'fechar-modal') { if (event.target === alvo && !(indUI.modal && indUI.modal.enviando)) { indUI.modal = null; indRenderBase(); } return; }
  if (indAcaoDeAjuste(acao, alvo)) return;
  if (acao === 'dem') { indUI.baseDem = alvo.dataset.dem; return indRenderBase(); }
  if (acao === 'importar') { indUI.importacao = { etapa: 'escolher' }; return indRenderBase(); }
  if (acao === 'fechar-importacao') { if (!indUI.importacao || indUI.importacao.etapa !== 'enviando') { indUI.importacao = null; indRenderBase(); } return; }
  if (acao === 'confirmar-importacao') return indConfirmarImportacao();
  if (acao === 'recarregar') { indUI.carregado = false; return renderIndicadores('ind-base'); }
  if (acao === 'recarregar-clube') { indUI.basePorClube.delete(indUI.clube); return indRenderBase(); }
  if (acao === 'exportar-base') return indExportarBase();
  if (acao === 'imprimir') return imprimirSomente(document.querySelector('#ind-base .op-layout'));
  if (acao === 'ir-uso') {
    const painelId = alvo.dataset.painel;
    const grupo = alvo.dataset.grupo;
    indIrParaPainel(painelId);
    setTimeout(() => {
      const el = document.querySelector(`#ind-g-${IND_PAINEIS[painelId]}-${grupo}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function indAoMudarBase(event) {
  const el = event.target;
  if (indAoMudarModalAjuste(el)) return;
  const campo = el.dataset.indCampo;
  if (campo === 'clube') { indUI.clube = el.value; return indRenderBase(); }
  if (campo === 'ocultar-zeradas') { indUI.baseOcultarZeradas = el.checked; return indRenderBase(); }
  if (campo === 'arquivo-importacao') return indLerArquivoImportacao(el.files && el.files[0]);
}

function indAoDigitarBase(event) {
  const el = event.target;
  if (indAoDigitarModalAjuste(el)) return;
  if (el.dataset.indCampo !== 'busca-base') return;
  indUI.baseBusca = el.value;
  // Só a tabela é refeita, para o campo de busca não perder o foco.
  const tabela = document.querySelector('#ind-base-tabela');
  if (tabela) tabela.innerHTML = indHtmlTabelaBase();
}

(() => {
  const painel = document.querySelector('#ind-base');
  if (!painel) return;
  painel.addEventListener('click', indAoClicarBase);
  painel.addEventListener('change', indAoMudarBase);
  painel.addEventListener('input', indAoDigitarBase);
})();

// Abrir o sistema direto num painel de Indicadores (ex.: após recarregar).
if (IND_PAINEIS[document.querySelector('.panel.active-panel')?.id]) renderIndicadores(document.querySelector('.panel.active-panel').id);
