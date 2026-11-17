// Painel "Arrecadação" (Administração, só administradores): quanto os
// procedimentos já geraram para a Agência. Os valores vêm das etapas que
// arrecadam (ver js/arrecadacao.js): taxa do PRS, preparo de recurso e ordem
// de cumprimento. Dá para lançar ou corrigir o valor daqui mesmo.

const arcUI = { filtro: 'todos', busca: '', modal: null, salvando: false, aviso: null };
const ARC_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function arcEhAdm() {
  return typeof perfilAtual === 'function' && perfilAtual() === 'adm';
}

function arcRows() {
  return typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
}

function arcData(ms) {
  return ms ? new Date(ms).toLocaleDateString('pt-BR') : '—';
}

function arcMesRotulo(chave) {
  const m = String(chave).match(/^(\d{4})-(\d{2})$/);
  return m ? `${ARC_MESES[+m[2] - 1]}/${m[1]}` : 'Sem data';
}

function arcChave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function arcPlural(n, um, varios) {
  return `${Number(n).toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// Lançamentos visíveis conforme a aba e a busca, do mais recente para o mais antigo.
function arcVisiveis(lancamentos) {
  const termo = arcChave(arcUI.busca);
  return lancamentos.filter((l) => {
    if (arcUI.filtro === 'pendentes' ? !l.semValor : (arcUI.filtro !== 'todos' && l.tipo !== arcUI.filtro)) return false;
    return !termo || arcChave(`${l.clube} caso ${l.caso} ${l.etapa} ${ARR_TIPOS[l.tipo].rotulo} ${l.medidas.join(' ')}`).includes(termo);
  }).sort((a, b) => (b.data - a.data) || String(a.caso).localeCompare(String(b.caso), 'pt-BR', { numeric: true }));
}

function arcKpis(r) {
  const card = (valor, rotulo, sub, cls = '') => `<div class="op-kpi ${cls}"><strong>${esc(valor)}</strong><span>${esc(rotulo)}</span><small>${esc(sub)}</small></div>`;
  const t = r.porTipo;
  const sub = (p, um, varios) => (p.etapas ? `${arcPlural(p.informadas, um, varios)}${p.semValor ? ` · ${p.semValor} sem valor` : ''}${p.naoAdmitidos ? ` · ${arcPlural(p.naoAdmitidos, 'recurso não admitido', 'recursos não admitidos')}` : ''}` : 'nenhuma etapa deste tipo');
  return `<div class="op-kpis arc-kpis">
    ${card(arrFormatar(r.total), 'Total arrecadado', 'taxas, preparos e multas já pagas', 'gold')}
    ${card(arrFormatar(t.prs.arrecadado), 'Taxas do PRS', sub(t.prs, 'taxa recolhida', 'taxas recolhidas'), 'purple')}
    ${card(arrFormatar(t.recurso.arrecadado), 'Preparos de recurso', sub(t.recurso, 'preparo recolhido', 'preparos recolhidos'), 'blue')}
    ${card(arrFormatar(r.medidas.multaPaga), 'Multas pagas', r.medidas.multas ? `de ${arrFormatar(r.medidas.multaAplicada)} em ${arcPlural(r.medidas.multas, 'multa aplicada', 'multas aplicadas')}` : 'nenhuma multa aplicada', 'green')}
    ${card(arrFormatar(r.aReceber), 'A receber', r.aReceber ? 'multas aplicadas e ainda não pagas' : 'nenhuma multa em aberto', r.aReceber ? 'orange' : '')}
  </div>`;
}

// Arrecadação por mês: uma barra por mês, todas na mesma escala.
function arcPorMes(r) {
  if (!r.porMes.length) return '<div class="op-empty">Nenhum valor arrecadado ainda.</div>';
  const max = Math.max(...r.porMes.map((m) => m.total), 1);
  const linhas = r.porMes.map((m) => {
    const partes = ARR_ORDEM_TIPOS.filter((t) => m[t]).map((t) => `${ARR_TIPOS[t].rotulo}: ${arrFormatar(m[t])}`);
    return `<tr title="${esc(`${arcMesRotulo(m.chave)}\n${partes.join('\n')}`)}"><th scope="row">${esc(arcMesRotulo(m.chave))}</th>
      <td class="arc-trilho"><span class="arc-barra" style="width:${Math.max((m.total / max) * 100, 0.8)}%"></span></td>
      <td class="arc-valor">${esc(arrFormatar(m.total))}</td></tr>`;
  }).join('');
  return `<table class="arc-meses"><tbody>${linhas}</tbody></table>`;
}

function arcMedidas(r) {
  const m = r.medidas;
  const item = (valor, rotulo, sub) => `<div class="arc-medida-kpi"><strong>${esc(valor)}</strong><span>${esc(rotulo)}</span><small>${esc(sub)}</small></div>`;
  return `<div class="arc-medidas-grid">
    ${item(m.multas, m.multas === 1 ? 'Multa aplicada' : 'Multas aplicadas', m.multas ? `${arrFormatar(m.multaAplicada)} no total` : 'nenhuma até agora')}
    ${item(m.transferban, 'Transferban', m.transferban === 1 ? 'ordem com transferban' : 'ordens com transferban')}
    ${item(m.pontos, m.pontos === 1 ? 'Ponto deduzido' : 'Pontos deduzidos', 'somando todas as ordens')}
    ${item(m.parfb, m.parfb === 1 ? 'Exclusão do PARF-B' : 'Exclusões do PARF-B', 'por ordem de cumprimento')}
  </div>`;
}

function arcDetalhe(l) {
  if (l.semValor) return '<span class="op-pill orange">Sem valor informado</span>';
  if (l.naoAdmitido) {
    const selo = `<span class="op-pill neutral" title="A Admissão de Recurso é a última etapa de um caso finalizado: o recurso foi recusado.">${esc(ARR_NAO_ADMITIDO)}</span>`;
    return l.dado ? `${selo} <span class="arc-dim">há valor lançado: confira</span>` : `${selo} <span class="arc-dim">sem arrecadação</span>`;
  }
  if (l.tipo !== 'cumprimento') return '<span class="arc-dim">recolhido</span>';
  const pendente = l.aReceber ? ` <span class="op-pill orange" title="Multa aplicada e ainda não paga">a receber ${esc(arrFormatar(l.aReceber))}</span>` : (l.multa ? ' <span class="op-pill green">multa paga</span>' : '');
  return `${esc(l.medidas.join(' + '))}${pendente}`;
}

function arcTabela(lancamentos) {
  const lista = arcVisiveis(lancamentos);
  const total = lista.reduce((s, l) => s + l.arrecadado, 0);
  const linhas = lista.map((l) => `<tr class="${l.semValor ? 'arc-pendente' : (l.naoAdmitido ? 'arc-recusado' : '')}">
      <td class="arc-num">${esc(arcData(l.data))}</td>
      <td class="arc-clube"><b>${esc(l.clube)}</b><span class="arc-sub">Caso ${esc(l.caso)}</span></td>
      <td>${esc(l.etapa)}<span class="arc-sub">${esc(ARR_TIPOS[l.tipo].rotulo)}</span></td>
      <td class="arc-num arc-forte">${!l.dado || (l.tipo === 'cumprimento' && !l.multa) ? '—' : esc(arrFormatar(l.arrecadado))}</td>
      <td class="arc-detalhe">${arcDetalhe(l)}</td>
      <td class="arc-acoes">${l.naoAdmitido && !l.dado ? '' : `<button type="button" class="arc-acao principal" data-arc-lancar="${esc(l.row.etapa_banco_id)}">${l.semValor ? 'Lançar' : 'Editar'}</button>`}<button type="button" class="arc-acao" data-arc-caso="${esc(l.caso)}" title="Abrir o caso no fluxograma">Abrir caso</button></td>
    </tr>`).join('');
  return `<p class="arc-contagem">Mostrando <b>${lista.length}</b> de ${lancamentos.length} etapas · ${esc(arrFormatar(total))} arrecadados na seleção</p>
    <div class="op-table-wrap arc-tabela"><table class="arc-tbl"><thead><tr><th class="arc-num">Data</th><th>Clube</th><th>Etapa</th><th class="arc-num">Arrecadado</th><th>Situação</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="6"><div class="op-empty">Nenhuma etapa com esses filtros.</div></td></tr>'}</tbody></table></div>`;
}

function arcAbas(r) {
  const abas = [['todos', 'Todos', r.lancamentos], ...ARR_ORDEM_TIPOS.map((t) => [t, ARR_TIPOS[t].rotulo, r.porTipo[t].etapas]), ['pendentes', 'Sem valor', r.semValor]];
  return `<div class="arc-abas" role="tablist" aria-label="Filtrar lançamentos">${abas.map(([id, rotulo, n]) => `<button type="button" role="tab" aria-selected="${arcUI.filtro === id}" class="${arcUI.filtro === id ? 'ativa' : ''}${id === 'pendentes' && n ? ' alerta' : ''}" data-arc-filtro="${id}">${esc(rotulo)} <b>${n}</b></button>`).join('')}</div>`;
}

// Janela de lançamento: o mesmo bloco de campos do formulário de etapa.
function arcModalHtml() {
  const m = arcUI.modal;
  if (!m) return '';
  const row = arcRows().find((r) => String(r.etapa_banco_id) === String(m.etapaId));
  if (!row) return '';
  return `<div class="ind-modal-fundo" data-arc-fechar><div class="ind-modal arc-modal" role="dialog" aria-modal="true" aria-label="Lançar arrecadação">
    <header><div><span class="op-label">${esc(row.clube || 'Sem clube')} · Caso ${esc(row.casoRaiz || row.numero_caso || '')}</span><h3>${esc(row.etapa)}</h3></div><button type="button" class="ind-fechar" data-arc-fechar aria-label="Fechar">×</button></header>
    <div class="ind-modal-corpo" id="arc-modal-corpo">${arrBlocoHtml()}</div>
    <footer><button type="button" class="op-btn" data-arc-fechar ${arcUI.salvando ? 'disabled' : ''}>Cancelar</button><button type="button" class="op-btn arc-btn-primario" data-arc-salvar ${arcUI.salvando ? 'disabled' : ''}>${arcUI.salvando ? 'Salvando…' : 'Salvar'}</button></footer>
  </div></div>`;
}

function arcMontarModal() {
  const el = document.querySelector('#arc-modal');
  if (!el) return;
  el.innerHTML = arcModalHtml();
  const corpo = el.querySelector('#arc-modal-corpo');
  const row = arcUI.modal ? arcRows().find((r) => String(r.etapa_banco_id) === String(arcUI.modal.etapaId)) : null;
  if (!corpo || !row) return;
  ligarBlocoArrecadacao(corpo);
  atualizarBlocoArrecadacao(corpo, row.etapa, row.arrecadacao || null, arrRecursosNaoAdmitidos(arcRows()).has(String(row.etapa_banco_id)));
  const primeiro = corpo.querySelector('input');
  if (primeiro) primeiro.focus();
}

// Aviso e travamento da janela SEM refazer os campos: o que a pessoa marcou e
// digitou fica exatamente como está.
function arcErroNoModal(texto) {
  const corpo = document.querySelector('#arc-modal-corpo');
  if (!corpo) return;
  let el = corpo.querySelector('.ind-aviso.erro');
  if (!texto) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'ind-aviso erro'; el.setAttribute('role', 'alert'); corpo.appendChild(el); }
  el.textContent = texto;
}

function arcTravarModal(travar) {
  arcUI.salvando = travar;
  document.querySelectorAll('#arc-modal footer button, #arc-modal .ind-fechar').forEach((b) => { b.disabled = travar; });
  const salvar = document.querySelector('#arc-modal [data-arc-salvar]');
  if (salvar) salvar.textContent = travar ? 'Salvando…' : 'Salvar';
}

async function arcSalvar() {
  const m = arcUI.modal;
  const corpo = document.querySelector('#arc-modal-corpo');
  if (!m || !corpo || arcUI.salvando) return;
  const erro = arrErroDoBloco(corpo);
  if (erro) return arcErroNoModal(erro);
  const dado = lerBlocoArrecadacao(corpo);
  arcErroNoModal('');
  arcTravarModal(true);
  try {
    const resposta = await fetch('/api/etapas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'editar', id: Number(m.etapaId), arrecadacao: dado }) });
    const json = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new Error((json && json.erro) || 'Não foi possível salvar a arrecadação.');
    const row = arcRows().find((r) => String(r.etapa_banco_id) === String(m.etapaId));
    if (row) row.arrecadacao = dado;
    arcUI.aviso = { tipo: 'ok', texto: dado ? `Arrecadação salva em ${row ? row.etapa : 'etapa'} (${row ? row.clube : ''}).` : 'Arrecadação removida da etapa.' };
    arcUI.modal = null;
    arcUI.salvando = false;
    arcRender();
  } catch (e) {
    arcTravarModal(false);
    arcErroNoModal(e.message || 'Não foi possível salvar a arrecadação.');
  }
}

function arcExportar(lancamentos, r) {
  const linhas = [['Data', 'Clube', 'Caso', 'Etapa', 'Tipo', 'Arrecadado (R$)', 'Multa aplicada (R$)', 'A receber (R$)', 'Medidas', 'Situação']];
  arcVisiveis(lancamentos).forEach((l) => linhas.push([arcData(l.data), l.clube, String(l.caso), l.etapa, ARR_TIPOS[l.tipo].rotulo, l.dado ? String(l.arrecadado) : '', l.multa ? String(l.multa) : '', l.aReceber ? String(l.aReceber) : '', l.medidas.join(' + '), l.naoAdmitido ? ARR_NAO_ADMITIDO : (l.semValor ? 'Sem valor informado' : 'Informado')]));
  const meses = [['Mês', 'Total (R$)', ...ARR_ORDEM_TIPOS.map((t) => `${ARR_TIPOS[t].rotulo} (R$)`)]];
  r.porMes.forEach((m) => meses.push([arcMesRotulo(m.chave), String(m.total), ...ARR_ORDEM_TIPOS.map((t) => String(m[t]))]));
  baixarArquivo(montarXlsx([{ nome: 'Lançamentos', linhas }, { nome: 'Por mês', linhas: meses }]), `arrecadacao-${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function arcRender() {
  const painel = document.querySelector('#arrecadacao');
  if (!painel) return;
  const topo = (acoes = '') => `<section class="op-hero"><div><span class="op-pill">Administração</span><h2>Arrecadação</h2><p>Quanto os procedimentos já geraram: taxas do Plano de Recuperação e Sustentabilidade, preparos de recurso e multas de ordens de cumprimento.</p></div><div class="op-actions">${acoes}</div></section>`;
  if (!arcEhAdm()) { painel.innerHTML = `<div class="op-layout">${topo()}<section class="op-card"><div class="op-card-body"><div class="op-empty">Só administradores podem ver a arrecadação.</div></div></section></div>`; return; }
  const lancamentos = arrLancamentos(arcRows());
  const r = arrResumo(lancamentos);
  const aviso = arcUI.aviso ? `<div class="ind-aviso ${arcUI.aviso.tipo === 'erro' ? 'erro' : 'ok'}" role="status">${esc(arcUI.aviso.texto)}</div>` : '';
  const pendencia = r.semValor ? `<div class="arc-pendencia"><span><b>${r.semValor}</b> ${r.semValor === 1 ? 'etapa que arrecada ainda está' : 'etapas que arrecadam ainda estão'} sem valor informado. Enquanto isso, ${r.semValor === 1 ? 'ela não entra' : 'elas não entram'} nos totais.</span><button type="button" data-arc-filtro="pendentes">Ver e lançar</button></div>` : '';
  painel.innerHTML = `<div class="op-layout">
    ${topo('<button type="button" class="op-btn" data-arc-exportar>Exportar Excel</button>')}
    ${aviso}
    ${arcKpis(r)}
    ${pendencia}
    <div class="arc-grid">
      <section class="op-card"><div class="op-card-head"><div><h3>Arrecadação por mês</h3><p class="op-muted">Pela data da etapa. Passe o mouse para ver a divisão por tipo.</p></div></div><div class="op-card-body">${arcPorMes(r)}</div></section>
      <section class="op-card"><div class="op-card-head"><div><h3>Ordens de cumprimento</h3><p class="op-muted">${r.medidas.ordens ? `O que foi aplicado em ${arcPlural(r.medidas.ordens, 'ordem informada', 'ordens informadas')}.` : 'Nenhuma ordem de cumprimento com medidas informadas.'}</p></div></div><div class="op-card-body">${arcMedidas(r)}</div></section>
    </div>
    <section class="op-card"><div class="op-card-head"><div><h3>Lançamentos</h3><p class="op-muted">Uma linha por etapa que arrecada. “Lançar” e “Editar” abrem os campos daquela etapa; o mesmo campo existe no formulário da etapa, no Fluxograma.</p></div></div>
      <div class="arc-filtros">${arcAbas(r)}<label class="arc-busca"><span class="op-label">Busca</span><input type="search" data-arc-busca value="${esc(arcUI.busca)}" placeholder="Clube, caso ou etapa"></label></div>
      <div id="arc-lista">${arcTabela(lancamentos)}</div>
    </section>
    <div id="arc-modal"></div>
  </div>`;
  if (arcUI.modal) arcMontarModal();
  if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel('arrecadacao');
}

async function renderArrecadacao() {
  arcRender();
  if (!arcEhAdm()) return;
  if (typeof opLoad === 'function') await opLoad();
  arcRender();
}

(() => {
  const painel = document.querySelector('#arrecadacao');
  if (!painel) return;
  const fechar = () => { if (arcUI.salvando) return; arcUI.modal = null; const el = document.querySelector('#arc-modal'); if (el) el.innerHTML = ''; };
  painel.addEventListener('click', (event) => {
    const alvo = (seletor) => event.target.closest(seletor);
    if (alvo('[data-arc-salvar]')) return arcSalvar();
    const fundo = alvo('[data-arc-fechar]');
    if (fundo) { if (event.target === fundo) fechar(); return; }
    const filtro = alvo('[data-arc-filtro]');
    if (filtro) { arcUI.filtro = filtro.dataset.arcFiltro; arcUI.aviso = null; return arcRender(); }
    const lancar = alvo('[data-arc-lancar]');
    if (lancar) { arcUI.modal = { etapaId: lancar.dataset.arcLancar }; return arcMontarModal(); }
    const caso = alvo('[data-arc-caso]');
    if (caso) { if (typeof opGoCaso === 'function') opGoCaso(caso.dataset.arcCaso); return; }
    if (alvo('[data-arc-exportar]')) { const l = arrLancamentos(arcRows()); arcExportar(l, arrResumo(l)); }
  });
  // Mexeu nos campos da janela: o aviso de erro anterior já não vale.
  ['input', 'change'].forEach((tipo) => painel.addEventListener(tipo, (event) => { if (event.target.closest('#arc-modal-corpo')) arcErroNoModal(''); }));
  painel.addEventListener('input', (event) => {
    if (event.target.dataset.arcBusca === undefined) return;
    arcUI.busca = event.target.value;
    // Só a lista é refeita, para o campo de busca não perder o foco.
    const lista = document.querySelector('#arc-lista');
    if (lista) lista.innerHTML = arcTabela(arrLancamentos(arcRows()));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && arcUI.modal && painel.classList.contains('active-panel')) fechar();
  });
  navItems.forEach((item) => { if (item.dataset.panel === 'arrecadacao') item.addEventListener('click', renderArrecadacao); });
  if (painel.classList.contains('active-panel')) renderArrecadacao();
})();
