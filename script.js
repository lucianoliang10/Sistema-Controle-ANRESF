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
  'Acórdão - PSO',
  'Acórdão - PSS',
  'Auto de Infração - PSO',
  'Auto de Infração - PSS',
  'Decisão da Presidência - PSS',
  'Denúncia',
  'Denúncia Recebida',
  'Despacho do Relator',
  'Diligência',
  'Nota de Admissibilidade',
  'Parecer Técnico',
  'Parecer Técnico Conclusivo',
  'Pedido de Reconsideração',
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

  const tituloEl = document.querySelector('.topbar-title');
  const rotulo = selectedItem?.querySelector('span:last-child')?.textContent?.trim();
  if (tituloEl && rotulo) tituloEl.textContent = rotulo;
}

function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Imprime SOMENTE um elemento (a tabela/área de dados do painel), não a página
// inteira. Usa a técnica de visibilidade via @media print: marca o alvo com a
// classe .print-target e o body com .printing; o CSS esconde tudo o resto e
// posiciona só o alvo. Restaura o estado ao terminar a impressão.
function imprimirSomente(alvo) {
  if (!alvo) { window.print(); return; }
  document.querySelectorAll('.print-target').forEach((el) => el.classList.remove('print-target'));
  alvo.classList.add('print-target');
  document.body.classList.add('printing');
  const restaurar = () => {
    document.body.classList.remove('printing');
    alvo.classList.remove('print-target');
    window.removeEventListener('afterprint', restaurar);
  };
  window.addEventListener('afterprint', restaurar);
  // fallback caso o afterprint não dispare (alguns navegadores)
  setTimeout(restaurar, 60000);
  window.print();
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

// Tipo-base da etapa para fins de UNICIDADE DE ID. Ignora a marca de processo
// (PSS/PSO) em qualquer posi\u00e7\u00e3o do nome e em formas pontuadas (P.S.S./P.S.O.),
// de modo que "Ac\u00f3rd\u00e3o - PSS" e "Ac\u00f3rd\u00e3o - PSO" (e todos os pares que s\u00f3
// diferem pelo processo) sejam o MESMO tipo e n\u00e3o possam repetir o ID.
// Fun\u00e7\u00e3o \u00fanica compartilhada por todos os pain\u00e9is (Controle de IDs, sugest\u00e3o
// de ID no Fluxograma, etc.) para garantir comportamento id\u00eantico.
function tipoBaseEtapa(nomeEtapa) {
  return normStatus(nomeEtapa)
    .replace(/-?p-?s-?[so]\b/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  else if (status.includes('aguardando')) classes.push('sem-status');
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
  else if (normalizado.includes('aguardando')) classe = 'neutral';
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

// --- Sugestão de "Responsável": lista de usuários (dropdown) + escrita livre ---
// Os inputs de responsável usam list="lista-responsaveis" (datalist nativo),
// que combina uma lista suspensa com digitação livre.
let _usuariosSistema = null;

async function carregarUsuariosSistema() {
  if (Array.isArray(_usuariosSistema)) return _usuariosSistema;
  try {
    const resposta = await fetch('/api/usuarios');
    _usuariosSistema = resposta.ok ? await resposta.json() : [];
  } catch (erro) {
    _usuariosSistema = [];
  }
  if (!Array.isArray(_usuariosSistema)) _usuariosSistema = [];
  return _usuariosSistema;
}

function atualizarListaResponsaveis() {
  const datalist = document.querySelector('#lista-responsaveis');
  if (!datalist) return;
  const nomes = new Set();
  (Array.isArray(_usuariosSistema) ? _usuariosSistema : []).forEach((u) => { if (u && u.nome) nomes.add(u.nome); });
  // Também os responsáveis já usados nos dados (etapas e tarefas).
  (Array.isArray(dadosTarefas) ? dadosTarefas : []).forEach((t) => { if (t.responsavel) nomes.add(t.responsavel); });
  (Array.isArray(dadosFluxograma) ? dadosFluxograma : []).forEach((r) => { if (r.responsavel) nomes.add(r.responsavel); });
  datalist.innerHTML = Array.from(nomes)
    .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
    .map((n) => `<option value="${esc(n)}"></option>`)
    .join('');
}

carregarUsuariosSistema().then(atualizarListaResponsaveis);

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
