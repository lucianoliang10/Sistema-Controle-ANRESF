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

function escaparHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ordenarPorOrdem(a, b) {
  return Number(a.ordem ?? 0) - Number(b.ordem ?? 0);
}

function etapaFinalizada(etapa) {
  return String(etapa.statusEtapa ?? '').toLowerCase() === 'finalizado';
}

function obterChaveCaso(registro) {
  return String(registro.casoRaiz || registro.caso || registro.caso_banco_id || registro.numero_caso || 'sem-caso');
}

function agruparPorCaso(dados) {
  const grupos = new Map();

  dados.forEach((registro) => {
    const chave = obterChaveCaso(registro);

    if (!grupos.has(chave)) {
      grupos.set(chave, []);
    }

    grupos.get(chave).push(registro);
  });

  return Array.from(grupos.values()).map((etapas) => etapas.sort(ordenarPorOrdem));
}

function obterEtapaAtual(etapas) {
  const pendentes = etapas.filter((etapa) => !etapaFinalizada(etapa));

  if (pendentes.length > 0) {
    return pendentes.sort(ordenarPorOrdem)[0];
  }

  return etapas[etapas.length - 1];
}

function obterClasseEtapa(etapa, etapaAtual) {
  if (etapaFinalizada(etapa)) return 'done';
  if (etapa === etapaAtual && String(etapa.statusEtapa ?? '').toLowerCase().includes('crítico')) return 'alert';
  if (etapa === etapaAtual) return 'warning';
  if (Number(etapa.ordem ?? 0) > Number(etapaAtual?.ordem ?? 0)) return 'muted';
  return 'pending';
}

function formatarValor(valor, fallback) {
  return valor === null || valor === undefined || valor === '' ? fallback : valor;
}

function formatarDocumento(etapa) {
  if (!etapa || etapa.semId || !etapa.id) return 'Sem ID';
  return etapa.id;
}

function formatarSancao(valor) {
  return formatarValor(valor, 'Sem sanção registrada');
}

function criarCardCaso(etapas) {
  const primeiraEtapa = etapas[0] || {};
  const etapaAtual = obterEtapaAtual(etapas) || primeiraEtapa;
  const passos = etapas
    .map((etapa) => `<span class="step ${obterClasseEtapa(etapa, etapaAtual)}">${escaparHtml(formatarValor(etapa.etapa || etapa.nome_etapa, 'Etapa'))}</span>`)
    .join('');

  return `
    <article class="case-card">
      <div class="case-header">
        <h3>${escaparHtml(formatarValor(primeiraEtapa.caso, `Caso ${formatarValor(primeiraEtapa.casoRaiz || primeiraEtapa.numero_caso, '')}`))}</h3>
        <span class="badge badge-club">${escaparHtml(formatarValor(primeiraEtapa.clube, 'Clube não informado'))}</span>
      </div>
      <p><strong>Processo:</strong> ${escaparHtml(formatarValor(primeiraEtapa.origem, 'Não informado'))}</p>
      <p><strong>Série:</strong> ${escaparHtml(formatarValor(primeiraEtapa.serie, 'Não informada'))} • <strong>Status:</strong> ${escaparHtml(formatarValor(primeiraEtapa.statusCaso, 'Não informado'))}</p>
      <div class="flow-steps">${passos}</div>
      <div class="details-grid">
        <span><b>Prazo:</b> ${escaparHtml(formatarValor(etapaAtual.prazoFinal, 'Sem prazo informado'))}</span>
        <span><b>Documento:</b> ${escaparHtml(formatarDocumento(etapaAtual))}</span>
        <span><b>Observação:</b> ${escaparHtml(formatarValor(etapaAtual.observacao || primeiraEtapa.observacao, 'Sem observação'))}</span>
        <span><b>Sanção:</b> ${escaparHtml(formatarSancao(etapaAtual.sancao || primeiraEtapa.sancao))}</span>
      </div>
    </article>
  `;
}

function renderizarFluxograma(dados) {
  const container = document.querySelector('#fluxograma .case-grid');

  if (!container) return;

  const grupos = agruparPorCaso(dados);
  container.innerHTML = grupos.map(criarCardCaso).join('');
}

async function carregarDadosFluxograma() {
  try {
    const resposta = await fetch('/api/data-fluxograma');

    if (!resposta.ok) throw new Error('Falha ao buscar dados do Supabase');

    const dados = await resposta.json();

    if (Array.isArray(dados) && dados.length > 0) {
      dadosFluxograma = dados;
      console.log('Dados carregados do Supabase para o Fluxograma');
    } else {
      dadosFluxograma = DATA;
      console.log('Usando DATA estático como fallback');
    }
  } catch (erro) {
    dadosFluxograma = DATA;
    console.warn('Usando DATA estático como fallback', erro);
  }

  renderizarFluxograma(dadosFluxograma);
}

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    activatePanel(item.dataset.panel, item);
  });
});

carregarDadosFluxograma();
