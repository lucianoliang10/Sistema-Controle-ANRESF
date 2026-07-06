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

function linhasDoCasoSelecionado() {
  const grupos = groupBy(dadosFluxograma, (row) => numeroCaso(row));
  const chaves = Array.from(grupos.keys()).sort(compararCaso);

  if (!casoSelecionado || !grupos.has(casoSelecionado)) {
    casoSelecionado = chaves[0] || '';
  }

  return grupos.get(casoSelecionado) || [];
}

function aplicarFiltros(rows) {
  return rows.filter((row) => {
    const statusOk = filtroStatus === 'todos' || normStatus(row.statusEtapa) === filtroStatus;
    const busca = termoBusca.trim().toLowerCase();

    if (!statusOk) return false;
    if (!busca) return true;

    return [row.etapa, row.objeto, row.observacao, row.id, row.doc]
      .some((campo) => String(campo || '').toLowerCase().includes(busca));
  });
}

function renderToolbar(rows) {
  const casos = Array.from(groupBy(dadosFluxograma, (row) => numeroCaso(row)).keys()).sort(compararCaso);
  const statuses = Array.from(new Set(rows.map((row) => row.statusEtapa).filter(Boolean))).sort();

  return `
    <div class="flux-toolbar toolbar" aria-label="Controles do Fluxograma">
      <select id="flux-caso" aria-label="Selecionar caso">
        ${casos.map((caso) => `<option value="${esc(caso)}" ${caso === casoSelecionado ? 'selected' : ''}>Caso ${esc(caso)}</option>`).join('')}
      </select>
      <select id="flux-status" aria-label="Filtrar por status">
        <option value="todos">Todos os status</option>
        ${statuses.map((status) => `<option value="${esc(normStatus(status))}" ${normStatus(status) === filtroStatus ? 'selected' : ''}>${esc(status)}</option>`).join('')}
      </select>
      <input id="flux-busca" type="search" value="${esc(termoBusca)}" placeholder="Buscar etapa, objeto ou observação" aria-label="Buscar no fluxograma">
      <button type="button" class="btn ghost" id="flux-prev">Anterior</button>
      <button type="button" class="btn ghost" id="flux-next">Próximo</button>
      <button type="button" class="btn" id="flux-print">Imprimir/PDF</button>
    </div>
  `;
}

function kpiCard(label, value, color = 'gold') {
  return `<div class="kpi mini ${color}"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function renderKpis(rows) {
  const observacoes = rows.filter((row) => row.observacao).length;
  const ramificacoes = Math.max(0, groupBy(rows, (row) => casoDaEtapa(row)).size - 1);
  const finalizadas = rows.filter(isFinalizada).length;
  const pendentesClube = rows.filter((row) => normStatus(row.statusEtapa).includes('clube')).length;
  const pendentesAnresf = rows.filter((row) => normStatus(row.statusEtapa).includes('anresf')).length;

  return `
    <div class="kpis">
      ${kpiCard('Total de etapas', rows.length, 'gold')}
      ${kpiCard('Finalizadas', finalizadas, 'green')}
      ${kpiCard('Pendentes Clube', pendentesClube, 'orange')}
      ${kpiCard('Pendentes ANRESF', pendentesAnresf, 'blue')}
      ${kpiCard('Observações', observacoes, 'purple')}
      ${kpiCard('Ramificações', ramificacoes, 'red')}
    </div>
  `;
}

function renderResumo(rows) {
  const primeira = rows[0] || {};
  const atual = currentRows(rows);

  return `
    <section class="card fluxo-card">
      <div class="card-head"><h3>Resumo operacional</h3><span class="muted">Caso ${esc(valor(casoSelecionado))}</span></div>
      <div class="card-body meta">
        <div class="meta-item"><span>Status do caso</span><strong>${esc(statusCaso(rows))}</strong></div>
        <div class="meta-item"><span>Etapa atual</span><strong>${esc(valor(atual.etapa))}</strong></div>
        <div class="meta-item"><span>Responsável atual</span><strong>${esc(responsavel(atual.statusEtapa))}</strong></div>
        <div class="meta-item"><span>Tempo do caso</span><strong>${esc(valor(primeira.dataEtapa || primeira.dataEnvio || primeira.created_at))}</strong></div>
        <div class="meta-item"><span>Próximo prazo</span><strong>${esc(valor(atual.prazoFinal))}</strong></div>
        <div class="meta-item"><span>Clube</span><strong>${esc(valor(primeira.clube))}</strong></div>
        <div class="meta-item"><span>Origem</span><strong>${esc(valor(primeira.origem))}</strong></div>
        <div class="meta-item"><span>Série</span><strong>${esc(valor(primeira.serie))}</strong></div>
      </div>
    </section>
  `;
}

function renderStep(row, atual) {
  return `
    <article class="${stepClass(row, atual)}">
      <div class="step-top">
        <span class="step-id">${esc(documento(row))}</span>
        ${statusPill(row.statusEtapa)}
      </div>
      <h4 class="step-title">${esc(valor(row.etapa))}</h4>
      <p class="step-text">${esc(valor(row.objeto, 'Objeto não informado'))}</p>
      <div class="side-list">
        <div class="side-item"><span>Data</span><strong>${esc(valor(row.dataEtapa || row.dataEnvio))}</strong></div>
        <div class="side-item"><span>Prazo</span><strong>${esc(valor(row.prazoFinal))}</strong></div>
        <div class="side-item"><span>Entrega</span><strong>${esc(valor(row.dataEntrega))}</strong></div>
        ${row.doc ? `<div class="side-item"><span>Documento</span><strong class="doc-link">${esc(row.doc)}</strong></div>` : ''}
      </div>
      ${row.observacao ? `<p class="note">${esc(row.observacao)}</p>` : ''}
      ${row.sancao ? `<p class="sancao">${esc(row.sancao)}</p>` : ''}
    </article>
  `;
}

function renderFlow(rows) {
  const filtradas = aplicarFiltros(rows).sort(stageSort);
  const lanes = Array.from(groupBy(filtradas, (row) => casoDaEtapa(row)).entries())
    .sort(([casoA], [casoB]) => compararCaso(casoA, casoB));
  const atual = currentRows(rows);

  if (lanes.length === 0) {
    return '<div class="empty">Nenhuma etapa encontrada para os filtros selecionados.</div>';
  }

  return lanes.map(([caso, etapas], index) => `
    <section class="lane fluxo-lane">
      <div class="lane-title">${index === 0 ? 'Fluxo principal' : 'Subprocesso / PSS'} · Caso ${esc(caso)}</div>
      <div class="flow">
        ${etapas.map((row, etapaIndex) => `${renderStep(row, atual)}${etapaIndex < etapas.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('')}
      </div>
    </section>
  `).join('');
}

function renderHistorico(rows) {
  const filtradas = aplicarFiltros(rows).sort(stageSort);

  return `
    <section class="card fluxo-card">
      <div class="card-head"><h3>Histórico do caso selecionado</h3><span class="muted">${filtradas.length} registros</span></div>
      <div class="card-body table-card history-card">
        <table class="tbl">
          <thead>
            <tr><th>Ordem</th><th>Caso</th><th>Etapa</th><th>ID</th><th>Status</th><th>Data</th><th>Prazo</th><th>Entrega</th><th>Objeto</th><th>Observação</th></tr>
          </thead>
          <tbody>
            ${filtradas.map((row) => `
              <tr>
                <td>${esc(valor(row.ordemLabel || row.ordem))}</td>
                <td>${esc(casoDaEtapa(row))}</td>
                <td>${esc(valor(row.etapa))}</td>
                <td>${esc(documento(row))}</td>
                <td>${statusPill(row.statusEtapa)}</td>
                <td>${esc(valor(row.dataEtapa || row.dataEnvio))}</td>
                <td>${esc(valor(row.prazoFinal))}</td>
                <td>${esc(valor(row.dataEntrega))}</td>
                <td>${esc(valor(row.objeto))}</td>
                <td>${esc(valor(row.observacao))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderizarFluxograma() {
  const panel = document.querySelector('#fluxograma');
  if (!panel) return;

  const rows = linhasDoCasoSelecionado().sort(stageSort);
  const primeira = rows[0] || {};
  const atual = currentRows(rows);

  panel.innerHTML = `
    <div class="flux-layout">
      <section class="hero">
        <div>
          <div class="hero-pills">
            ${origemPill(primeira.origem)}
            ${seriePill(primeira.serie)}
            ${statusPill(statusCaso(rows))}
          </div>
          <p class="eyebrow">Painel principal</p>
          <h2>${esc(valor(primeira.caso, `Caso ${casoSelecionado}`))}</h2>
          <p class="hero-subtitle">${esc(valor(primeira.clube))} · ${esc(valor(primeira.origem))} · ${rows.length} etapas</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="btn ghost" id="flux-copy">Copiar resumo</button>
          <button type="button" class="btn ghost" id="flux-clear">Limpar filtros</button>
        </div>
      </section>

      ${renderToolbar(rows)}
      ${renderKpis(rows)}
      ${renderResumo(rows)}

      <section class="card fluxo-card">
        <div class="card-head">
          <div><h3>Fluxograma do caso</h3><p class="muted">Etapa atual: ${esc(valor(atual.etapa))}</p></div>
          ${statusPill(atual.statusEtapa)}
        </div>
        <div class="card-body flow-wrap">${renderFlow(rows)}</div>
      </section>

      ${renderHistorico(rows)}
    </div>
  `;

  conectarControlesFluxograma();
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

  renderizarFluxograma();
}

function moverCaso(direcao) {
  const casos = Array.from(groupBy(dadosFluxograma, (row) => numeroCaso(row)).keys()).sort(compararCaso);
  const atual = casos.indexOf(casoSelecionado);
  const proximo = atual + direcao;

  if (proximo >= 0 && proximo < casos.length) {
    casoSelecionado = casos[proximo];
    renderizarFluxograma();
  }
}

function copiarResumo() {
  const rows = linhasDoCasoSelecionado();
  const primeira = rows[0] || {};
  const atual = currentRows(rows);
  const resumo = `${valor(primeira.caso, `Caso ${casoSelecionado}`)} · ${valor(primeira.clube)} · Etapa atual: ${valor(atual.etapa)} · Prazo: ${valor(atual.prazoFinal)}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(resumo);
  }
}

function conectarControlesFluxograma() {
  const selectCaso = document.querySelector('#flux-caso');
  const selectStatus = document.querySelector('#flux-status');
  const inputBusca = document.querySelector('#flux-busca');
  const btnPrev = document.querySelector('#flux-prev');
  const btnNext = document.querySelector('#flux-next');
  const btnPrint = document.querySelector('#flux-print');
  const btnCopy = document.querySelector('#flux-copy');
  const btnClear = document.querySelector('#flux-clear');

  selectCaso?.addEventListener('change', (event) => {
    casoSelecionado = event.target.value;
    renderizarFluxograma();
  });

  selectStatus?.addEventListener('change', (event) => {
    filtroStatus = event.target.value;
    renderizarFluxograma();
  });

  inputBusca?.addEventListener('input', (event) => {
    termoBusca = event.target.value;
    renderizarFluxograma();
  });

  btnPrev?.addEventListener('click', () => moverCaso(-1));
  btnNext?.addEventListener('click', () => moverCaso(1));
  btnPrint?.addEventListener('click', () => window.print());
  btnCopy?.addEventListener('click', copiarResumo);
  btnClear?.addEventListener('click', () => {
    filtroStatus = 'todos';
    termoBusca = '';
    renderizarFluxograma();
  });
}

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    activatePanel(item.dataset.panel, item);
  });
});

carregarDadosFluxograma();
