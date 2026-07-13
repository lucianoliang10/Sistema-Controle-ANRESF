const navItems = document.querySelectorAll('.nav-item[data-panel]');
const navActions = document.querySelectorAll('.nav-action[data-action]');
const panels = document.querySelectorAll('.panel');

let DATA = [];

let dadosFluxograma = [];
let casoSelecionado = '';
let filtroStatus = 'todos';
let termoBusca = '';
let casosDisponiveis = [];
let casoEmEdicao = null;
let etapaEmEdicao = null;

let dadosTarefas = [];
let etapaDrawerAberta = null;

const ETAPAS_PADRAO = [
  'Denúncia',
  'Diligência',
  'Acompanhamento',
  'Parecer Técnico',
  'Auto de Infração - PSS',
  'Acórdão - PSS',
  'Acórdão Decisão da Presidência - PSS',
  'Auto de Infração - PSO',
  'Parecer Técnico Conclusivo',
  'Acórdão - PSO',
];

function renderDatalistEtapasPadrao(id) {
  const nomesOrdenados = [...ETAPAS_PADRAO].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  return `<datalist id="${id}">${nomesOrdenados.map((nome) => `<option value="${esc(nome)}"></option>`).join('')}</datalist>`;
}

function activatePanel(targetPanelId, selectedItem) {
  navItems.forEach((nav) => {
    const isActive = nav === selectedItem;
    nav.classList.toggle('active', isActive);
    nav.setAttribute('aria-selected', String(isActive));
  });

  panels.forEach((panel) => {
    panel.classList.toggle('active-panel', panel.id === targetPanelId);
  });
}

function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function groupBy(array, callback) {
  return array.reduce((grupos, item) => {
    const chave = callback(item);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
    return grupos;
  }, new Map());
}

function valor(valor, fallback = '—') {
  return valor === null || valor === undefined || valor === '' ? fallback : valor;
}

function numeroCaso(row) {
  return String(row.casoRaiz || row.numero_caso || row.caso_banco_id || row.caso || 'Caso');
}

function casoDaEtapa(row) {
  if (row.ramo) return `${numeroCaso(row)}.${row.ramo}`;
  return numeroCaso(row);
}

function ordemNumero(row) {
  const ordem = Number(row.ordem ?? row.ordemLabel ?? 0);
  return Number.isFinite(ordem) ? ordem : 0;
}

function compararCaso(a, b) {
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function stageSort(a, b) {
  const porCaso = compararCaso(casoDaEtapa(a), casoDaEtapa(b));
  if (porCaso !== 0) return porCaso;
  return ordemNumero(a) - ordemNumero(b);
}

function normStatus(status) {
  const texto = String(status || '').trim().toLowerCase();
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function statusCaso(rows) {
  return valor(rows.find((row) => row.statusCaso)?.statusCaso);
}

function responsavel(status) {
  const normalizado = normStatus(status);
  if (normalizado.includes('clube')) return 'Clube';
  if (normalizado.includes('anresf')) return 'ANRESF';
  if (normalizado.includes('finalizado')) return 'Concluído';
  return 'Unidade Técnica';
}

function isFinalizada(row) {
  return normStatus(row.statusEtapa) === 'finalizado';
}

function currentRows(rows) {
  const ordenadas = [...rows].sort(stageSort);
  const pendente = ordenadas.find((row) => !isFinalizada(row));
  return pendente || ordenadas[ordenadas.length - 1] || {};
}

function stepClass(row, atual) {
  const status = normStatus(row.statusEtapa);
  const classes = ['step'];

  if (status === 'finalizado') classes.push('finalizado');
  else if (status.includes('pendente-clube')) classes.push('pendente-clube');
  else if (status.includes('pendente-anresf')) classes.push('pendente-anresf');
  else if (status.includes('critico') || status.includes('atrasado')) classes.push('critico');
  else if (status) classes.push('pendente-anresf');
  else classes.push('sem-status');

  if (row === atual) classes.push('current');

  return classes.join(' ');
}

function statusPill(status) {
  const normalizado = normStatus(status);
  let classe = 'gold';
  if (normalizado === 'finalizado') classe = 'green';
  else if (normalizado.includes('clube')) classe = 'orange';
  else if (normalizado.includes('anresf') || normalizado.includes('andamento')) classe = 'blue';
  else if (normalizado.includes('critico') || normalizado.includes('atrasado')) classe = 'red';
  else if (!normalizado) classe = 'neutral';
  return `<span class="pill ${classe}">${esc(valor(status))}</span>`;
}

function origemPill(origem) {
  return `<span class="pill blue">${esc(valor(origem, 'Origem —'))}</span>`;
}

function seriePill(serie) {
  return `<span class="pill gold">${esc(valor(serie, 'Série —'))}</span>`;
}

function documento(row) {
  if (!row || row.semId || !row.id) return 'Sem ID';
  return row.id;
}

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    activatePanel(item.dataset.panel, item);
  });
});

navActions.forEach((item) => {
  item.addEventListener('click', () => {
    if (item.dataset.action !== 'clear-filters') return;
    if (typeof filtroStatus !== 'undefined') filtroStatus = 'todos';
    if (typeof termoBusca !== 'undefined') termoBusca = '';
    const activePanelId = document.querySelector('.panel.active-panel')?.id;
    if (typeof clearOperationalFilters === 'function' && ['dossie', 'esteira', 'sancoes', 'ids'].includes(activePanelId)) {
      clearOperationalFilters(activePanelId);
      return;
    }
    if (typeof renderizarFluxograma === 'function') renderizarFluxograma();
  });
});
