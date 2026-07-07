let prazosBusca = '';
let prazosResponsavel = 'todos';
let prazosSerie = 'todas';
let prazosCarregando = false;

const PRAZO_GROUPS = [
  { key: 'overdue', title: 'Vencidos', sub: 'Prazo menor que hoje', color: 'overdue' },
  { key: 'today', title: 'Vencem hoje', sub: 'Ação imediata', color: 'today' },
  { key: 'soon3', title: 'Próximos 3 dias', sub: 'Janela de 72 horas', color: 'soon3' },
  { key: 'soon7', title: 'Próximos 7 dias', sub: 'Atenção na semana', color: 'soon7' },
  { key: 'future', title: 'Futuros', sub: 'Prazo acima de 7 dias', color: 'future' },
  { key: 'no-date', title: 'Sem prazo', sub: 'Etapas abertas sem data', color: 'no-date' },
];

function prazoValor(valorOriginal, fallback = '—') {
  return valor(valorOriginal, fallback);
}

function prazoCasoId(row = {}) {
  return String(row.casoRaiz || row.numero_caso || row.caso_banco_id || row.caso || 'Caso');
}

function prazoTituloCaso(caso) {
  const texto = String(caso || '').trim();
  return /^caso\b/i.test(texto) ? texto : `Caso ${texto || '—'}`;
}

function parseDataBR(valorData) {
  if (!valorData) return null;
  const texto = String(valorData).trim();
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const parsed = new Date(texto);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function hojeLocal() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

function getDiasRestantes(registro) {
  const prazo = parseDataBR(registro.prazoFinal);
  if (!prazo) return null;
  return Math.round((prazo.getTime() - hojeLocal().getTime()) / 86400000);
}

function getSituacaoPrazo(registro) {
  const dias = getDiasRestantes(registro);
  if (!Number.isFinite(dias)) return 'no-date';
  if (dias < 0) return 'overdue';
  if (dias === 0) return 'today';
  if (dias <= 3) return 'soon3';
  if (dias <= 7) return 'soon7';
  return 'future';
}

function deadlineClass(registro) {
  return getSituacaoPrazo(registro);
}

function deadlineLabel(registro) {
  const dias = getDiasRestantes(registro);
  if (!Number.isFinite(dias)) return 'sem prazo';
  if (dias < 0) return `${Math.abs(dias)}d em atraso`;
  if (dias === 0) return 'vence hoje';
  return `faltam ${dias}d`;
}

function responsavelPrazo(registro) {
  const status = normStatus(registro.statusEtapa);
  if (status.includes('clube')) return 'Clube';
  if (status.includes('anresf')) return 'ANRESF';
  if (status.includes('finalizado')) return 'Sem pendência';
  return 'Verificar';
}

function isEtapaFinalizada(registro) {
  return isFinalizada(registro);
}

function registrosOperacionais() {
  return (Array.isArray(dadosFluxograma) ? dadosFluxograma : [])
    .filter((row) => !isEtapaFinalizada(row))
    .map((row) => {
      const caso = prazoCasoId(row);
      const responsavel = responsavelPrazo(row);
      const serie = prazoValor(row.serie, '—');
      return {
        ...row,
        casoPrazo: caso,
        casoTitulo: prazoTituloCaso(caso),
        clubePrazo: prazoValor(row.clube, 'Sem clube'),
        origemPrazo: prazoValor(row.origem, 'Sem origem'),
        seriePrazo: serie,
        objetoPrazo: prazoValor(row.objeto, 'Sem objeto informado'),
        idPrazo: documento(row),
        statusPrazo: prazoValor(row.statusEtapa, 'Sem status'),
        responsavelPrazo: responsavel,
        grupoPrazo: getSituacaoPrazo(row),
        diasPrazo: getDiasRestantes(row),
        buscaPrazo: [caso, row.clube, row.origem, row.serie, row.etapa, row.objeto, row.id, row.statusEtapa, responsavel].join(' ').toLowerCase(),
      };
    });
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
  return ordemNumero(a) - ordemNumero(b);
}

function agruparPrazos(registros) {
  const grupos = new Map(PRAZO_GROUPS.map((grupo) => [grupo.key, []]));
  registros.forEach((registro) => grupos.get(registro.grupoPrazo)?.push(registro));
  grupos.forEach((items) => items.sort(compararPrazos));
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
        <p class="hero-subtitle">Classificação automática por vencidos, vencendo hoje, próximos 3 dias, próximos 7 dias e prazos futuros.</p>
      </div>
    </section>
  `;
}

function renderPrazosFiltros(registros) {
  const series = Array.from(new Set(registros.map((registro) => registro.seriePrazo).filter(Boolean))).sort(compararCaso);
  return `
    <section class="op-filter-grid" aria-label="Filtros de prazos críticos">
      <label class="deadline-field"><span class="deadline-label">BUSCA</span><input id="prazos-busca" type="search" value="${esc(prazosBusca)}" placeholder="Buscar por clube, caso, etapa, objeto ou origem"></label>
      <label class="deadline-field"><span class="deadline-label">RESPONSÁVEL</span><select id="prazos-responsavel">
        <option value="todos" ${prazosResponsavel === 'todos' ? 'selected' : ''}>Todos</option>
        <option value="ANRESF" ${prazosResponsavel === 'ANRESF' ? 'selected' : ''}>ANRESF</option>
        <option value="Clube" ${prazosResponsavel === 'Clube' ? 'selected' : ''}>Clube</option>
        <option value="Verificar" ${prazosResponsavel === 'Verificar' ? 'selected' : ''}>Verificar</option>
      </select></label>
      <label class="deadline-field"><span class="deadline-label">SÉRIE</span><select id="prazos-serie">
        <option value="todas" ${prazosSerie === 'todas' ? 'selected' : ''}>Todas</option>
        ${series.map((serie) => `<option value="${esc(serie)}" ${prazosSerie === serie ? 'selected' : ''}>${esc(serie)}</option>`).join('')}
      </select></label>
      <p class="quick-filter-note">Etapas finalizadas ficam fora da visão operacional principal.</p>
    </section>
  `;
}

function deadlineBadge(registro) {
  const classe = deadlineClass(registro);
  return `<span class="deadline-badge ${esc(classe)}">${esc(deadlineLabel(registro))}</span>`;
}

function renderDeadlineRegistro(registro) {
  return `
    <article class="deadline-item" data-prazo-caso="${esc(registro.casoPrazo)}">
      <div class="deadline-top">
        <div>
          <h4 class="deadline-title">${esc(registro.casoTitulo)} · ${esc(registro.etapa || 'Sem etapa')}</h4>
          <p class="deadline-sub">${esc(registro.clubePrazo)} · ${esc(registro.origemPrazo)}</p>
        </div>
        ${deadlineBadge(registro)}
      </div>
      <div class="deadline-meta">
        <div><span>Série</span><strong>${esc(registro.seriePrazo)}</strong></div>
        <div><span>ID</span><strong>${esc(registro.idPrazo)}</strong></div>
        <div><span>Status</span><strong>${esc(registro.statusPrazo)}</strong></div>
        <div><span>Objeto</span><strong>${esc(registro.objetoPrazo)}</strong></div>
        <div><span>Prazo final</span><strong>${esc(prazoValor(registro.prazoFinal))}</strong></div>
        <div><span>Responsável</span><strong>${esc(registro.responsavelPrazo)}</strong></div>
      </div>
    </article>
  `;
}

function renderDeadlineGroups(grupos) {
  const total = Array.from(grupos.values()).reduce((sum, items) => sum + items.length, 0);
  if (total === 0) return '<div class="empty">Nenhuma etapa aberta com prazo identificada.</div>';

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

async function carregarDadosPrazosSeNecessario() {
  if (Array.isArray(dadosFluxograma) && dadosFluxograma.length > 0) return;
  if (prazosCarregando) return;
  prazosCarregando = true;
  try {
    const resposta = await fetch('/api/data-fluxograma');
    if (!resposta.ok) throw new Error('Falha ao buscar dados de prazos.');
    const dados = await resposta.json();
    DATA = Array.isArray(dados) ? dados : [];
    dadosFluxograma = DATA;
  } catch (erro) {
    console.warn('Não foi possível carregar dados de prazos críticos.', erro);
    DATA = [];
    dadosFluxograma = [];
  } finally {
    prazosCarregando = false;
  }
}

async function renderPrazos() {
  const panel = document.querySelector('#prazos');
  if (!panel) return;

  await carregarDadosPrazosSeNecessario();
  const operacionais = registrosOperacionais();
  const filtrados = filtrarPrazos(operacionais);
  const grupos = agruparPrazos(filtrados);

  panel.innerHTML = `
    <div class="prazos-layout">
      ${renderPrazosHero()}
      ${renderDeadlineKpis(grupos)}
      ${renderPrazosFiltros(operacionais)}
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
  document.querySelectorAll('[data-prazo-caso]').forEach((item) => item.addEventListener('click', () => {
    casoSelecionado = item.dataset.prazoCaso || casoSelecionado;
    const navFluxograma = document.querySelector('.nav-item[data-panel="fluxograma"]');
    if (typeof renderizarFluxograma === 'function') renderizarFluxograma();
    if (navFluxograma) activatePanel('fluxograma', navFluxograma);
  }));
}

navItems.forEach((item) => {
  if (item.dataset.panel !== 'prazos') return;
  item.addEventListener('click', renderPrazos);
});

if (document.querySelector('#prazos')?.classList.contains('active-panel')) renderPrazos();
