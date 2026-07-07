const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');

const DATA = [
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Abertura',
    ordem: 1,
    id: 'Abertura',
    prazoFinal: '02/07/2026',
    observacao: 'Caso aberto para acompanhamento regulatório.',
    statusEtapa: 'Finalizado',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Diligência',
    ordem: 2,
    id: 'Ofício UT-024/2026',
    prazoFinal: '12/08/2026',
    observacao: 'Aguardando manifestação complementar.',
    statusEtapa: 'Finalizado',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Resposta do Clube',
    ordem: 3,
    id: 'Ofício UT-024/2026',
    prazoFinal: '12/08/2026',
    observacao: 'Aguardando manifestação complementar.',
    statusEtapa: 'Pendente Clube',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Análise UT',
    ordem: 4,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Aguardando manifestação complementar.',
    statusEtapa: 'Pendente',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Relatório',
    ordem: 5,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Aguardando manifestação complementar.',
    statusEtapa: 'Não iniciado',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Decisão',
    ordem: 6,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Aguardando manifestação complementar.',
    statusEtapa: 'Não iniciado',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-001',
    casoRaiz: '1',
    origem: 'ANRESF-001/2026',
    clube: 'Clube Alfa',
    serie: 'Licenciamento',
    statusCaso: 'Em andamento',
    etapa: 'Monitoramento',
    ordem: 7,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Aguardando manifestação complementar.',
    statusEtapa: 'Não iniciado',
    sancao: 'Advertência em avaliação.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Abertura',
    ordem: 1,
    id: 'Abertura',
    prazoFinal: '20/08/2026',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Finalizado',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Diligência',
    ordem: 2,
    id: 'Nota Técnica UT-011/2026',
    prazoFinal: '20/08/2026',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Finalizado',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Resposta do Clube',
    ordem: 3,
    id: 'Nota Técnica UT-011/2026',
    prazoFinal: '20/08/2026',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Finalizado',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Análise UT',
    ordem: 4,
    id: 'Nota Técnica UT-011/2026',
    prazoFinal: '20/08/2026',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Finalizado',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Relatório',
    ordem: 5,
    id: 'Nota Técnica UT-011/2026',
    prazoFinal: '20/08/2026',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Em andamento',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Decisão',
    ordem: 6,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Pendente',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-002',
    casoRaiz: '2',
    origem: 'ANRESF-002/2026',
    clube: 'Clube Beta',
    serie: 'Prestação de contas',
    statusCaso: 'Pendente ANRESF',
    etapa: 'Monitoramento',
    ordem: 7,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Relatório em revisão interna.',
    statusEtapa: 'Não iniciado',
    sancao: 'Multa possível.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Abertura',
    ordem: 1,
    id: 'Abertura',
    prazoFinal: '05/08/2026',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Finalizado',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Diligência',
    ordem: 2,
    id: 'Intimação UT-009/2026',
    prazoFinal: '05/08/2026',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Prazo crítico',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Resposta do Clube',
    ordem: 3,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Pendente',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Análise UT',
    ordem: 4,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Não iniciado',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Relatório',
    ordem: 5,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Não iniciado',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Decisão',
    ordem: 6,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Não iniciado',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
  {
    caso: 'Caso C-003',
    casoRaiz: '3',
    origem: 'ANRESF-003/2026',
    clube: 'Clube Gama',
    serie: 'Cadastro regulatório',
    statusCaso: 'Prazo crítico',
    etapa: 'Monitoramento',
    ordem: 7,
    id: '',
    semId: true,
    prazoFinal: '',
    observacao: 'Prazo crítico para envio de documentos.',
    statusEtapa: 'Não iniciado',
    sancao: 'Exclusão PARF-B em análise preliminar.',
  },
];

let dadosFluxograma = DATA;
let casoSelecionado = '';
let filtroStatus = 'todos';
let termoBusca = '';
let casosDisponiveis = [];
let casoEmEdicao = null;
let etapaEmEdicao = null;

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
  return String(row.casoRaiz || row.caso || row.numero_caso || row.caso_banco_id || 'Caso');
}

function casoDaEtapa(row) {
  return String(row.caso || row.casoRaiz || row.numero_caso || 'Caso');
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
  else classes.push('pendente-anresf');

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
