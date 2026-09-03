// Filtros do painel. Cada campo de lista é multi-seleção: dentro do campo é OU,
// entre campos é E (mesma regra das Sanções e do Controle de IDs).
const prazosFiltros = {
  situacoes: [],     // overdue | today | upcoming | no-date
  responsaveis: [],
  clubes: [],
  origens: [],
  series: [],
  etapas: [],        // nome da etapa, sem o sufixo de ramo
  tipos: [],         // Tarefa | Etapa
  processos: [],     // PSS | PSO | Sem PSS/PSO
  janela: 'todas',   // ver PRAZO_JANELAS
  somenteMinhas: false,
};

const PRAZO_GROUPS = [
  { key: 'overdue', title: 'Vencidas', sub: 'Prazo final menor que hoje', color: 'overdue' },
  { key: 'today', title: 'Vencem hoje', sub: 'Ação imediata', color: 'today' },
  { key: 'upcoming', title: 'À vencer', sub: 'Prazo final maior que hoje', color: 'upcoming' },
  { key: 'no-date', title: 'Sem prazo', sub: 'Responsável definido, sem prazo final', color: 'no-date' },
];

// Janela de prazo: recorte por dias até o prazo final. Registros sem prazo
// ficam de fora de qualquer janela, porque não têm "dias".
const PRAZO_JANELAS = [
  { key: 'todas', label: 'Qualquer prazo', aceita: () => true },
  { key: 'prox7', label: 'Próximos 7 dias', aceita: (d) => d >= 0 && d <= 7 },
  { key: 'prox15', label: 'Próximos 15 dias', aceita: (d) => d >= 0 && d <= 15 },
  { key: 'prox30', label: 'Próximos 30 dias', aceita: (d) => d >= 0 && d <= 30 },
  { key: 'atraso7', label: 'Vencidas há mais de 7 dias', aceita: (d) => d < -7 },
  { key: 'atraso30', label: 'Vencidas há mais de 30 dias', aceita: (d) => d < -30 },
];

const PRAZO_TIPOS = ['Tarefa', 'Etapa'];
const PRAZO_PROCESSOS = ['PSS', 'PSO', 'Sem PSS/PSO'];

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

// Processo (PSS/PSO) lido do nome da etapa, como nas Sanções.
function prazoProcesso(nomeEtapa) {
  const n = normStatus(nomeEtapa);
  if (n.includes('pss')) return 'PSS';
  if (n.includes('pso')) return 'PSO';
  return 'Sem PSS/PSO';
}

// "É minha" reaproveita a regra do painel Início (nome ou e-mail do usuário).
function prazoEhMinha(responsavel) {
  return typeof pendenciaDoUsuario === 'function' ? pendenciaDoUsuario(responsavel) : false;
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
        tipoPrazo: 'Tarefa',
        numeroCasoPrazo: tarefa.numero_caso,
        casoTitulo: prazoTituloCaso(tarefa.numero_caso),
        casoLabel: prazoLabelCaso(tarefa.numero_caso),
        clubePrazo: prazoValor(tarefa.clube, 'Sem clube'),
        origemPrazo: prazoValor(tarefa.origem, 'Sem origem'),
        seriePrazo: serie,
        etapaBasePrazo: nomeEtapa,
        etapaNome: tarefa.ramo ? `${nomeEtapa} · Ramo ${tarefa.ramo}` : nomeEtapa,
        processoPrazo: prazoProcesso(nomeEtapa),
        observacaoPrazo: prazoValor(tarefa.observacao, 'Sem observação'),
        responsavelPrazo: responsavel,
        minhaPrazo: prazoEhMinha(responsavel),
        dataInicialPrazo: prazoValor(isoToBrDate(tarefa.data_inicial)),
        dataFinalPrazo: prazoValor(isoToBrDate(tarefa.data_final)),
        grupoPrazo: prazoGrupoCritico(tarefa),
        diasPrazo: tarefaDiasRestantes(tarefa.data_final),
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
        tipoPrazo: 'Etapa',
        numeroCasoPrazo: numero,
        casoTitulo: prazoTituloCaso(numero),
        casoLabel: prazoLabelCaso(numero),
        clubePrazo: prazoValor(row.clube, 'Sem clube'),
        origemPrazo: prazoValor(row.origem, 'Sem origem'),
        seriePrazo: serie,
        etapaBasePrazo: nomeEtapa,
        etapaNome: row.ramo ? `${nomeEtapa} · Ramo ${row.ramo}` : nomeEtapa,
        processoPrazo: prazoProcesso(nomeEtapa),
        observacaoPrazo: prazoValor(row.objeto || row.observacao, 'Sem observação'),
        responsavelPrazo: responsavel,
        minhaPrazo: prazoEhMinha(responsavel),
        dataInicialPrazo: prazoValor(isoToBrDate(dataInicialIso)),
        dataFinalPrazo: prazoValor(isoToBrDate(dataFinalIso)),
        grupoPrazo: prazoGrupoEtapa(dataFinalIso),
        diasPrazo: tarefaDiasRestantes(dataFinalIso),
      };
    })
    .filter((etapa) => etapa.grupoPrazo);
}

// Regra pura de aceitação de um registro pelos filtros (testável isolada).
// Lista vazia = "todos". Entre campos é E; dentro de um campo é OU.
function prazosFiltrosAceitam(registro, filtros) {
  const lista = (selecionados, valorRegistro) => !selecionados.length || selecionados.includes(valorRegistro);
  if (!lista(filtros.situacoes || [], registro.grupoPrazo)) return false;
  if (!lista(filtros.responsaveis || [], registro.responsavelPrazo)) return false;
  if (!lista(filtros.clubes || [], registro.clubePrazo)) return false;
  if (!lista(filtros.origens || [], registro.origemPrazo)) return false;
  if (!lista(filtros.series || [], registro.seriePrazo)) return false;
  if (!lista(filtros.etapas || [], registro.etapaBasePrazo)) return false;
  if (!lista(filtros.tipos || [], registro.tipoPrazo)) return false;
  if (!lista(filtros.processos || [], registro.processoPrazo)) return false;
  if (filtros.somenteMinhas && !registro.minhaPrazo) return false;

  const janela = PRAZO_JANELAS.find((j) => j.key === (filtros.janela || 'todas')) || PRAZO_JANELAS[0];
  if (janela.key !== 'todas') {
    if (!Number.isFinite(registro.diasPrazo)) return false;
    if (!janela.aceita(registro.diasPrazo)) return false;
  }
  return true;
}

function filtrarPrazos(registros) {
  return registros.filter((registro) => prazosFiltrosAceitam(registro, prazosFiltros));
}

function prazosFiltrosVazios(filtros = prazosFiltros) {
  return !filtros.situacoes.length && !filtros.responsaveis.length && !filtros.clubes.length
    && !filtros.origens.length && !filtros.series.length && !filtros.etapas.length
    && !filtros.tipos.length && !filtros.processos.length
    && filtros.janela === 'todas' && !filtros.somenteMinhas;
}

function limparFiltrosPrazos() {
  Object.keys(prazosFiltros).forEach((campo) => {
    if (Array.isArray(prazosFiltros[campo])) prazosFiltros[campo] = [];
  });
  prazosFiltros.janela = 'todas';
  prazosFiltros.somenteMinhas = false;
}

// Mesma ordenação do painel Início: dentro de cada grupo, o mais urgente
// primeiro (menos dias até o prazo); empate pelo id para ficar estável.
function compararPrazos(a, b) {
  const da = Number.isFinite(a.diasPrazo) ? a.diasPrazo : Number.MAX_SAFE_INTEGER;
  const db = Number.isFinite(b.diasPrazo) ? b.diasPrazo : Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  return Number(a.id || 0) - Number(b.id || 0);
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
        <p class="hero-subtitle">Tarefas em aberto e toda etapa com status "Pendente ANRESF", agrupadas pelo prazo final: vencidas, vencem hoje, à vencer e sem prazo.</p>
      </div>
    </section>
  `;
}

// Menu de seleção múltipla (mesma estética das Sanções e do Controle de IDs).
function prazoMultiSelect(campo, opcoes, selecionados, rotuloTodos) {
  const rotuloDe = (v) => opcoes.find(([valorOpcao]) => valorOpcao === v)?.[1] || v;
  const resumo = selecionados.length === 0 ? rotuloTodos
    : selecionados.length === 1 ? rotuloDe(selecionados[0])
      : `${selecionados.length} selecionados`;
  return `<details class="op-multi" data-prazo-multi="${esc(campo)}"><summary>${esc(resumo)}</summary><div class="op-multi-menu">${opcoes.map(([v, label]) => `<label><input type="checkbox" value="${esc(v)}" ${selecionados.includes(v) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}<div class="op-multi-actions"><button type="button" class="op-multi-clear">Limpar</button><button type="button" class="op-multi-apply">Aplicar</button></div></div></details>`;
}

function prazoOpcoesDe(registros, campo, ordenar) {
  const valores = Array.from(new Set(registros.map((r) => r[campo]).filter(Boolean)));
  valores.sort(ordenar || ((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' })));
  return valores.map((v) => [v, v]);
}

// Chips dos filtros ativos, cada um com o seu "×" para remover só aquele valor.
function renderPrazosChips(filtros = prazosFiltros) {
  const chips = [];
  const rotuloGrupo = (k) => PRAZO_GROUPS.find((g) => g.key === k)?.title || k;
  const add = (campo, v, label) => chips.push(`<button type="button" class="prazos-chip" data-prazo-chip="${esc(campo)}" data-prazo-chip-valor="${esc(v)}" aria-label="Remover filtro ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`);
  filtros.situacoes.forEach((v) => add('situacoes', v, rotuloGrupo(v)));
  filtros.tipos.forEach((v) => add('tipos', v, v));
  filtros.processos.forEach((v) => add('processos', v, v));
  filtros.responsaveis.forEach((v) => add('responsaveis', v, v));
  filtros.clubes.forEach((v) => add('clubes', v, v));
  filtros.origens.forEach((v) => add('origens', v, v));
  filtros.series.forEach((v) => add('series', v, `Série ${v}`));
  filtros.etapas.forEach((v) => add('etapas', v, v));
  if (filtros.janela !== 'todas') add('janela', filtros.janela, PRAZO_JANELAS.find((j) => j.key === filtros.janela)?.label || filtros.janela);
  if (filtros.somenteMinhas) add('somenteMinhas', '1', 'Só as minhas');
  return chips.join('');
}

function renderPrazosFiltros(registros, totalFiltrado) {
  const f = prazosFiltros;
  const situacaoOpts = PRAZO_GROUPS.map((g) => [g.key, g.title]);
  const tipoOpts = PRAZO_TIPOS.map((t) => [t, t]);
  const processoOpts = PRAZO_PROCESSOS.map((p) => [p, p]);
  const responsavelOpts = prazoOpcoesDe(registros, 'responsavelPrazo');
  const clubeOpts = prazoOpcoesDe(registros, 'clubePrazo');
  const origemOpts = prazoOpcoesDe(registros, 'origemPrazo');
  const serieOpts = prazoOpcoesDe(registros, 'seriePrazo', compararCaso);
  const etapaOpts = prazoOpcoesDe(registros, 'etapaBasePrazo');
  const campo = (rotulo, conteudo) => `<div class="deadline-field"><span class="deadline-label">${esc(rotulo)}</span>${conteudo}</div>`;
  const chips = renderPrazosChips(f);

  return `
    <section class="op-filter-grid" aria-label="Filtros de prazos críticos">
      ${campo('Situação', prazoMultiSelect('situacoes', situacaoOpts, f.situacoes, 'Todas'))}
      ${campo('Responsável', prazoMultiSelect('responsaveis', responsavelOpts, f.responsaveis, 'Todos'))}
      ${campo('Clube', prazoMultiSelect('clubes', clubeOpts, f.clubes, 'Todos'))}
      ${campo('Origem', prazoMultiSelect('origens', origemOpts, f.origens, 'Todas'))}
      ${campo('Série', prazoMultiSelect('series', serieOpts, f.series, 'Todas'))}
      ${campo('Etapa', prazoMultiSelect('etapas', etapaOpts, f.etapas, 'Todas'))}
      ${campo('Tipo', prazoMultiSelect('tipos', tipoOpts, f.tipos, 'Tarefas e etapas'))}
      ${campo('Processo', prazoMultiSelect('processos', processoOpts, f.processos, 'Todos'))}
      ${campo('Janela de prazo', `<select id="prazos-janela">${PRAZO_JANELAS.map((j) => `<option value="${j.key}" ${f.janela === j.key ? 'selected' : ''}>${esc(j.label)}</option>`).join('')}</select>`)}
      <label class="deadline-field prazos-toggle"><span class="deadline-label">Minhas pendências</span><span class="prazos-toggle-box"><input id="prazos-somente-minhas" type="checkbox" ${f.somenteMinhas ? 'checked' : ''}><span>Só as minhas</span></span></label>
      <div class="prazos-filtros-foot">
        <div class="prazos-chips">${chips || '<span class="quick-filter-note">Nenhum filtro ativo.</span>'}</div>
        <div class="prazos-filtros-resumo">
          <span class="quick-filter-note"><strong>${esc(totalFiltrado)}</strong> de ${esc(registros.length)} registros</span>
          ${prazosFiltrosVazios(f) ? '' : '<button type="button" class="prazos-limpar" id="prazos-limpar">Limpar filtros</button>'}
        </div>
      </div>
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
          <p class="deadline-sub"><span class="prazos-tipo ${registro.tipoPrazo === 'Etapa' ? 'is-etapa' : 'is-tarefa'}">${esc(registro.tipoPrazo)}</span>${registro.origemPrazo && registro.origemPrazo !== 'Sem origem' ? ` · ${esc(registro.origemPrazo)}` : ''}</p>
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

// Grupos empilhados na vertical, na ordem do painel Início (Vencidas, Vencem
// hoje, À vencer, Sem prazo); grupos vazios não aparecem.
function renderDeadlineGroups(grupos) {
  const total = Array.from(grupos.values()).reduce((sum, items) => sum + items.length, 0);
  if (total === 0) return '<div class="empty">Nenhuma tarefa em aberto ou etapa Pendente ANRESF com prazo identificada para os filtros escolhidos.</div>';

  return `
    <div class="prazos-grupos" id="deadlineGroups">
      ${PRAZO_GROUPS
        .filter((grupo) => (grupos.get(grupo.key) || []).length > 0)
        .map((grupo) => {
          const registros = grupos.get(grupo.key);
          return `
            <section class="prazos-grupo">
              <div class="prazos-grupo-head ${esc(grupo.color)}">
                <h3>${esc(grupo.title)} <span class="prazos-grupo-cont">${esc(registros.length)}</span></h3>
                <span class="prazos-grupo-sub">${esc(grupo.sub)}</span>
              </div>
              <div class="prazos-grid">${registros.map(renderDeadlineRegistro).join('')}</div>
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
      ${renderPrazosFiltros(abertas, filtrados.length)}
      ${renderDeadlineGroups(grupos)}
    </div>
  `;

  conectarControlesPrazos();
}

function conectarControlesPrazos() {
  // Multi-seleção: "Aplicar" lê as caixas marcadas; "Limpar" zera só aquele campo.
  document.querySelectorAll('#prazos [data-prazo-multi]').forEach((det) => {
    const campo = det.dataset.prazoMulti;
    det.querySelector('.op-multi-apply')?.addEventListener('click', () => {
      prazosFiltros[campo] = Array.from(det.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
      renderPrazos();
    });
    det.querySelector('.op-multi-clear')?.addEventListener('click', () => {
      prazosFiltros[campo] = [];
      renderPrazos();
    });
  });
  document.querySelector('#prazos-janela')?.addEventListener('change', (event) => {
    prazosFiltros.janela = event.target.value;
    renderPrazos();
  });
  document.querySelector('#prazos-somente-minhas')?.addEventListener('change', (event) => {
    prazosFiltros.somenteMinhas = event.target.checked;
    renderPrazos();
  });
  document.querySelector('#prazos-limpar')?.addEventListener('click', () => {
    limparFiltrosPrazos();
    renderPrazos();
  });
  document.querySelectorAll('#prazos [data-prazo-chip]').forEach((chip) => chip.addEventListener('click', () => {
    const campo = chip.dataset.prazoChip;
    const v = chip.dataset.prazoChipValor;
    if (campo === 'janela') prazosFiltros.janela = 'todas';
    else if (campo === 'somenteMinhas') prazosFiltros.somenteMinhas = false;
    else if (Array.isArray(prazosFiltros[campo])) prazosFiltros[campo] = prazosFiltros[campo].filter((x) => x !== v);
    renderPrazos();
  }));
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
