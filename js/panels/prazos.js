let prazosBusca = '';
let prazosResponsavel = 'todos';
let prazosSerie = 'todas';
let prazosOrdenacao = 'prazo';

const PRAZO_ORDENACOES = [
  { key: 'prazo', label: 'Prazo (mais urgente)' },
  { key: 'caso', label: 'Caso' },
  { key: 'clube', label: 'Clube' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'serie', label: 'Série' },
];

const PRAZO_GROUPS = [
  { key: 'overdue', title: 'Vencidas', sub: 'Prazo final menor que hoje', color: 'overdue' },
  { key: 'today', title: 'Vencem hoje', sub: 'Ação imediata', color: 'today' },
  { key: 'upcoming', title: 'À vencer', sub: 'Prazo final maior que hoje', color: 'upcoming' },
  { key: 'no-date', title: 'Sem prazo', sub: 'Responsável definido, sem prazo final', color: 'no-date' },
];

function prazoValor(valorOriginal, fallback = '—') {
  return valor(valorOriginal, fallback);
}

function prazoTituloCaso(caso) {
  const texto = String(caso || '').trim();
  return /^caso\b/i.test(texto) ? texto : `Caso ${texto || '—'}`;
}

// Mesmo rótulo do caso usado no seletor do Fluxograma
// (ex.: "Caso 19 · SAF Botafogo · Solvência 2026/02/28").
function prazoLabelCaso(numero) {
  const rows = (Array.isArray(dadosFluxograma) ? dadosFluxograma : []).filter((r) => {
    const n = typeof numeroCaso === 'function' ? numeroCaso(r) : (r.casoRaiz || r.numero_caso);
    return String(n) === String(numero);
  });
  if (rows.length && typeof labelCasoFluxograma === 'function') return labelCasoFluxograma(String(numero), rows);
  return prazoTituloCaso(numero);
}

function tarefasCriticas() {
  return (Array.isArray(dadosTarefas) ? dadosTarefas : [])
    .filter((tarefa) => !tarefaFinalizada(tarefa))
    .map((tarefa) => {
      const nomeEtapa = prazoValor(tarefa.nome_etapa, 'Sem etapa');
      const responsavel = prazoValor(tarefa.responsavel, 'Não definido');
      const serie = prazoValor(tarefa.serie, '—');
      return {
        ...tarefa,
        numeroCasoPrazo: tarefa.numero_caso,
        casoTitulo: prazoTituloCaso(tarefa.numero_caso),
        casoLabel: prazoLabelCaso(tarefa.numero_caso),
        clubePrazo: prazoValor(tarefa.clube, 'Sem clube'),
        origemPrazo: prazoValor(tarefa.origem, 'Sem origem'),
        seriePrazo: serie,
        etapaNome: tarefa.ramo ? `${nomeEtapa} · Ramo ${tarefa.ramo}` : nomeEtapa,
        observacaoPrazo: prazoValor(tarefa.observacao, 'Sem observação'),
        responsavelPrazo: responsavel,
        dataInicialPrazo: prazoValor(isoToBrDate(tarefa.data_inicial)),
        dataFinalPrazo: prazoValor(isoToBrDate(tarefa.data_final)),
        grupoPrazo: prazoGrupoCritico(tarefa),
        diasPrazo: tarefaDiasRestantes(tarefa.data_final),
        buscaPrazo: [tarefa.numero_caso, tarefa.clube, tarefa.origem, serie, nomeEtapa, tarefa.observacao, responsavel]
          .join(' ').toLowerCase(),
      };
    })
    .filter((tarefa) => tarefa.grupoPrazo);
}

function prazoGrupoCritico(tarefa) {
  const dias = tarefaDiasRestantes(tarefa.data_final);
  if (!Number.isFinite(dias)) return null;
  if (dias < 0) return 'overdue';
  if (dias === 0) return 'today';
  return 'upcoming';
}

function etapaPendenteAnresfExata(status) {
  // normStatus troca espaços por hífen: "Pendente ANRESF" -> "pendente-anresf".
  return normStatus(status) === 'pendente-anresf';
}

// Como as tarefas, mas etapas sem prazo final entram no grupo "Sem prazo"
// (em vez de serem descartadas) — toda etapa Pendente ANRESF deve aparecer.
function prazoGrupoEtapa(dataFinalIso) {
  const dias = tarefaDiasRestantes(dataFinalIso);
  if (!Number.isFinite(dias)) return 'no-date';
  if (dias < 0) return 'overdue';
  if (dias === 0) return 'today';
  return 'upcoming';
}

// Etapas com status exatamente "Pendente ANRESF" entram no painel no
// mesmo formato das tarefas em aberto, usando o prazo da etapa como data final.
function etapasCriticas() {
  const rows = Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  const toIso = (data) => (typeof brToIsoDate === 'function' ? brToIsoDate(data || '') : (data || '')) || '';
  return rows
    .filter((row) => row.etapa_banco_id && etapaPendenteAnresfExata(row.statusEtapa))
    .map((row) => {
      const dataFinalIso = toIso(row.prazoFinal);
      const dataInicialIso = toIso(row.dataEnvio || row.dataEtapa);
      const nomeEtapa = prazoValor(row.etapa, 'Sem etapa');
      const responsavel = prazoValor(row.responsavel, 'Não definido');
      const serie = prazoValor(row.serie, '—');
      const numero = typeof numeroCaso === 'function' ? numeroCaso(row) : (row.casoRaiz || row.numero_caso);
      return {
        id: row.etapa_banco_id,
        etapa_id: row.etapa_banco_id,
        status_etapa: row.statusEtapa,
        data_final: dataFinalIso,
        numeroCasoPrazo: numero,
        casoTitulo: prazoTituloCaso(numero),
        casoLabel: prazoLabelCaso(numero),
        clubePrazo: prazoValor(row.clube, 'Sem clube'),
        origemPrazo: prazoValor(row.origem, 'Sem origem'),
        seriePrazo: serie,
        etapaNome: row.ramo ? `${nomeEtapa} · Ramo ${row.ramo}` : nomeEtapa,
        observacaoPrazo: prazoValor(row.objeto || row.observacao, 'Sem observação'),
        responsavelPrazo: responsavel,
        dataInicialPrazo: prazoValor(isoToBrDate(dataInicialIso)),
        dataFinalPrazo: prazoValor(isoToBrDate(dataFinalIso)),
        grupoPrazo: prazoGrupoEtapa(dataFinalIso),
        diasPrazo: tarefaDiasRestantes(dataFinalIso),
        buscaPrazo: [numero, row.clube, row.origem, serie, nomeEtapa, row.objeto, row.observacao, responsavel]
          .join(' ').toLowerCase(),
      };
    })
    .filter((etapa) => etapa.grupoPrazo);
}

function filtrarPrazos(registros) {
  const busca = prazosBusca.trim().toLowerCase();
  return registros.filter((registro) => {
    const buscaOk = !busca || registro.buscaPrazo.includes(busca);
    const respOk = prazosResponsavel === 'todos' || registro.responsavelPrazo === prazosResponsavel;
    const serieOk = prazosSerie === 'todas' || registro.seriePrazo === prazosSerie;
    return buscaOk && respOk && serieOk;
  });
}

function compararPrazos(a, b) {
  const da = Number.isFinite(a.diasPrazo) ? a.diasPrazo : Number.MAX_SAFE_INTEGER;
  const db = Number.isFinite(b.diasPrazo) ? b.diasPrazo : Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  return Number(a.id || 0) - Number(b.id || 0);
}

// Comparadores por coluna; empatam sempre pelo prazo (mais urgente primeiro).
const PRAZO_SORTS = {
  prazo: compararPrazos,
  caso: (a, b) => compararCaso(a.numeroCasoPrazo, b.numeroCasoPrazo) || compararPrazos(a, b),
  clube: (a, b) => String(a.clubePrazo).localeCompare(String(b.clubePrazo), 'pt-BR', { sensitivity: 'base' }) || compararPrazos(a, b),
  responsavel: (a, b) => String(a.responsavelPrazo).localeCompare(String(b.responsavelPrazo), 'pt-BR', { sensitivity: 'base' }) || compararPrazos(a, b),
  serie: (a, b) => String(a.seriePrazo).localeCompare(String(b.seriePrazo), 'pt-BR', { numeric: true, sensitivity: 'base' }) || compararPrazos(a, b),
};

function agruparPrazos(registros) {
  const grupos = new Map(PRAZO_GROUPS.map((grupo) => [grupo.key, []]));
  registros.forEach((registro) => grupos.get(registro.grupoPrazo)?.push(registro));
  const ordenar = PRAZO_SORTS[prazosOrdenacao] || PRAZO_SORTS.prazo;
  grupos.forEach((items) => items.sort(ordenar));
  return grupos;
}

function prazoKpiCard(grupo, total) {
  return `
    <div class="kpi ${grupo.color}">
      <strong class="kpi-value">${esc(total)}</strong>
      <span class="kpi-label">${esc(grupo.title)}</span>
      <small class="kpi-sub">${esc(grupo.sub)}</small>
    </div>
  `;
}

function renderDeadlineKpis(grupos) {
  return `<div class="kpis">${PRAZO_GROUPS.map((grupo) => prazoKpiCard(grupo, grupos.get(grupo.key)?.length || 0)).join('')}</div>`;
}

function renderPrazosHero() {
  return `
    <section class="hero">
      <div>
        <span class="pill orange">Prazos críticos</span>
        <h2>Painel de prazos críticos</h2>
        <p class="hero-subtitle">Tarefas em aberto e toda etapa com status "Pendente ANRESF", agrupadas pelo prazo final: vencidas, vencem hoje, à vencer e sem prazo.</p>
      </div>
    </section>
  `;
}

function renderPrazosFiltros(registros) {
  const series = Array.from(new Set(registros.map((registro) => registro.seriePrazo).filter(Boolean))).sort(compararCaso);
  const responsaveis = Array.from(new Set(registros.map((registro) => registro.responsavelPrazo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return `
    <section class="op-filter-grid" aria-label="Filtros de prazos críticos">
      <label class="deadline-field"><span class="deadline-label">BUSCA</span><input id="prazos-busca" type="search" value="${esc(prazosBusca)}" placeholder="Buscar por clube, caso, etapa, observação ou responsável"></label>
      <label class="deadline-field"><span class="deadline-label">RESPONSÁVEL</span><select id="prazos-responsavel">
        <option value="todos" ${prazosResponsavel === 'todos' ? 'selected' : ''}>Todos</option>
        ${responsaveis.map((responsavel) => `<option value="${esc(responsavel)}" ${prazosResponsavel === responsavel ? 'selected' : ''}>${esc(responsavel)}</option>`).join('')}
      </select></label>
      <label class="deadline-field"><span class="deadline-label">SÉRIE</span><select id="prazos-serie">
        <option value="todas" ${prazosSerie === 'todas' ? 'selected' : ''}>Todas</option>
        ${series.map((serie) => `<option value="${esc(serie)}" ${prazosSerie === serie ? 'selected' : ''}>${esc(serie)}</option>`).join('')}
      </select></label>
      <label class="deadline-field"><span class="deadline-label">ORDENAR POR</span><select id="prazos-ordenacao">
        ${PRAZO_ORDENACOES.map((ordem) => `<option value="${ordem.key}" ${prazosOrdenacao === ordem.key ? 'selected' : ''}>${esc(ordem.label)}</option>`).join('')}
      </select></label>
      <p class="quick-filter-note">Ordena dentro de cada grupo de prazo. Tarefas concluídas e etapas fora de "Pendente ANRESF" ficam fora da visão de prazos críticos.</p>
    </section>
  `;
}

function deadlineBadge(registro) {
  const classe = registro.grupoPrazo;
  const rotulo = tarefaSituacaoLabel(registro);
  return `<span class="deadline-badge ${esc(classe)}">${esc(rotulo)}</span>`;
}

function prazoTituloRegistro(registro) {
  const etapa = prazoValor(registro.etapaNome, '');
  const caso = prazoValor(registro.casoLabel || registro.casoTitulo, '');
  return [etapa, caso].filter(Boolean).join(' · ');
}

function renderDeadlineRegistro(registro) {
  return `
    <article class="deadline-item" data-prazo-caso="${esc(registro.casoTitulo)}" data-prazo-etapa-id="${esc(registro.etapa_id)}">
      <p class="deadline-action"><span>Observação</span><strong>${esc(registro.observacaoPrazo)}</strong></p>
      <div class="deadline-top">
        <div>
          <h4 class="deadline-title">${esc(prazoTituloRegistro(registro))}</h4>
          <p class="deadline-sub"></p>
        </div>
        ${deadlineBadge(registro)}
      </div>
      <div class="deadline-meta">
        <div><span>Data inicial</span><strong>${esc(registro.dataInicialPrazo)}</strong></div>
        <div><span>Prazo final</span><strong>${esc(registro.dataFinalPrazo)}</strong></div>
        <div><span>Responsável</span><strong>${esc(registro.responsavelPrazo)}</strong></div>
        <div><span>Série</span><strong>${esc(registro.seriePrazo)}</strong></div>
        <div><span>Status da etapa</span><strong>${esc(prazoValor(registro.status_etapa))}</strong></div>
      </div>
    </article>
  `;
}

function renderDeadlineGroups(grupos) {
  const total = Array.from(grupos.values()).reduce((sum, items) => sum + items.length, 0);
  if (total === 0) return '<div class="empty">Nenhuma tarefa em aberto ou etapa Pendente ANRESF com prazo identificada.</div>';

  return `
    <div class="op-grid" id="deadlineGroups">
      ${PRAZO_GROUPS.map((grupo) => {
        const registros = grupos.get(grupo.key) || [];
        return `
          <section class="card prazos-card">
            <div class="card-head">
              <div><h3>${esc(grupo.title)}</h3><p class="muted">${esc(grupo.sub)}</p></div>
              <span class="deadline-badge ${esc(grupo.color)}">${esc(registros.length)} registros</span>
            </div>
            <div class="card-body deadline-list">
              ${registros.length ? registros.map(renderDeadlineRegistro).join('') : '<div class="empty">Sem registros neste grupo.</div>'}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
}

async function garantirDadosFluxogramaCarregados() {
  if (Array.isArray(dadosFluxograma) && dadosFluxograma.length > 0) return;
  try {
    const resposta = await fetch('/api/etapas');
    if (!resposta.ok) throw new Error('Falha ao carregar etapas.');
    const dados = await resposta.json();
    DATA = Array.isArray(dados) ? dados : [];
    dadosFluxograma = DATA;
  } catch (erro) {
    console.warn('Não foi possível carregar etapas para os prazos.', erro);
    if (!Array.isArray(dadosFluxograma)) dadosFluxograma = [];
  }
}

async function renderPrazos() {
  const panel = document.querySelector('#prazos');
  if (!panel) return;

  await garantirDadosTarefasCarregados();
  await garantirDadosFluxogramaCarregados();
  const abertas = tarefasCriticas().concat(etapasCriticas());
  const filtrados = filtrarPrazos(abertas);
  const grupos = agruparPrazos(filtrados);

  panel.innerHTML = `
    <div class="prazos-layout">
      ${renderPrazosHero()}
      ${renderDeadlineKpis(grupos)}
      ${renderPrazosFiltros(abertas)}
      ${renderDeadlineGroups(grupos)}
    </div>
  `;

  conectarControlesPrazos();
}

function conectarControlesPrazos() {
  document.querySelector('#prazos-busca')?.addEventListener('input', (event) => {
    prazosBusca = event.target.value;
    renderPrazos();
  });
  document.querySelector('#prazos-responsavel')?.addEventListener('change', (event) => {
    prazosResponsavel = event.target.value;
    renderPrazos();
  });
  document.querySelector('#prazos-serie')?.addEventListener('change', (event) => {
    prazosSerie = event.target.value;
    renderPrazos();
  });
  document.querySelector('#prazos-ordenacao')?.addEventListener('change', (event) => {
    prazosOrdenacao = event.target.value;
    renderPrazos();
  });
  document.querySelectorAll('[data-prazo-caso]').forEach((item) => item.addEventListener('click', () => {
    const etapaId = item.dataset.prazoEtapaId;
    const registroEtapa = etapaId ? buscarRegistroEtapaPorId(etapaId) : null;
    casoSelecionado = registroEtapa ? numeroCaso(registroEtapa) : casoSelecionado;
    const navFluxograma = document.querySelector('.nav-item[data-panel="fluxograma"]');
    if (typeof renderizarFluxograma === 'function') renderizarFluxograma();
    if (navFluxograma) activatePanel('fluxograma', navFluxograma);
    if (etapaId) abrirDrawerEtapa(etapaId);
  }));
}

navItems.forEach((item) => {
  if (item.dataset.panel !== 'prazos') return;
  item.addEventListener('click', renderPrazos);
});

if (document.querySelector('#prazos')?.classList.contains('active-panel')) renderPrazos();
