function linhasDoCasoSelecionado() {
  const grupos = groupBy(dadosFluxograma, (row) => numeroCaso(row));
  const chaves = Array.from(grupos.keys()).sort(compararCaso);

  if (!casoSelecionado || !grupos.has(casoSelecionado)) {
    casoSelecionado = chaves[0] || '';
  }

  return grupos.get(casoSelecionado) || [];
}

function valorFluxo(valorOriginal, fallback = '—') {
  return valor(valorOriginal, fallback);
}

function numeroCasoFluxograma(row = {}) {
  return valorFluxo(row.casoRaiz || row.numero_caso || row.caso_banco_id || row.caso, 'Caso');
}

function tituloCaso(numero) {
  const texto = String(numero || '').trim();
  return /^caso\b/i.test(texto) ? texto : `Caso ${texto || '—'}`;
}

function clubeFluxograma(row = {}) {
  return valorFluxo(row.clube, 'Sem clube');
}

function origemFluxograma(row = {}) {
  return valorFluxo(row.origem, 'Sem origem');
}

function plural(qtd, singular, pluralTexto) {
  return `${qtd} ${qtd === 1 ? singular : pluralTexto}`;
}

function etapasComObservacao(rows) {
  return rows.filter((row) => row.observacao).length;
}

function totalRamificacoes(rows) {
  return Math.max(0, groupBy(rows, (row) => casoDaEtapa(row)).size - 1);
}

function dataOrdenavel(valorData) {
  if (!valorData) return 0;
  const texto = String(valorData);
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`).getTime();
  const parsed = new Date(texto).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function prazoFinalMaximo(rows) {
  const prazos = rows
    .map((row) => row.prazoFinal)
    .filter(Boolean)
    .sort((a, b) => dataOrdenavel(b) - dataOrdenavel(a));
  return prazos[0] || '';
}

function tempoDoCaso(rows) {
  const primeiraData = [...rows]
    .map((row) => row.dataEtapa || row.dataEnvio || row.created_at)
    .filter(Boolean)
    .sort((a, b) => dataOrdenavel(a) - dataOrdenavel(b))[0];

  const inicio = dataOrdenavel(primeiraData);
  if (!inicio) return '';

  const dias = Math.max(0, Math.floor((Date.now() - inicio) / 86400000));
  return `${dias} dia${dias === 1 ? '' : 's'}`;
}

function statusCasoFluxo(rows) {
  const informado = rows.find((row) => row.statusCaso)?.statusCaso;
  if (informado) return informado;
  if (rows.length === 0) return '';
  if (rows.every(isFinalizada)) return 'Finalizado';
  return currentRows(rows).statusEtapa || 'Em andamento';
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

function labelCasoFluxograma(caso, rows) {
  const primeira = rows[0] || {};
  const numero = numeroCasoFluxograma(primeira) || caso;
  const clube = clubeFluxograma(primeira);
  const origem = origemFluxograma(primeira);
  const partes = [tituloCaso(numero), clube];

  if (origem) partes.push(origem);

  return partes.join(' · ');
}

function renderToolbar(rows) {
  const gruposCasos = Array.from(groupBy(dadosFluxograma, (row) => numeroCaso(row)).entries())
    .sort(([casoA], [casoB]) => compararCaso(casoA, casoB));
  const statuses = Array.from(new Set(rows.map((row) => row.statusEtapa).filter(Boolean))).sort();

  return `
    <section class="flux-toolbar" aria-label="Filtros do Fluxograma">
      <div class="flux-field case-field">
        <label class="flux-label" for="caseSelect">CASO</label>
        <select id="caseSelect" class="case-selector-select">
          ${gruposCasos.length > 0
            ? gruposCasos.map(([caso, linhas]) => `<option value="${esc(caso)}" ${caso === casoSelecionado ? 'selected' : ''}>${esc(labelCasoFluxograma(caso, linhas))}</option>`).join('')
            : '<option value="">Nenhum caso disponível</option>'}
        </select>
      </div>
      <div class="flux-field status-field">
        <label class="flux-label" for="flux-status">STATUS</label>
        <select id="flux-status">
          <option value="todos">Todos os status</option>
          ${statuses.map((status) => `<option value="${esc(normStatus(status))}" ${normStatus(status) === filtroStatus ? 'selected' : ''}>${esc(status)}</option>`).join('')}
        </select>
      </div>
      <div class="flux-field search-field">
        <label class="flux-label" for="flux-busca">BUSCA</label>
        <input id="flux-busca" type="search" value="${esc(termoBusca)}" placeholder="Buscar etapa, objeto, observação…" aria-label="Buscar no fluxograma">
      </div>
      <div class="toolbar-actions" aria-label="Navegação do caso">
        <button type="button" class="btn ghost" id="flux-prev">← Anterior</button>
        <button type="button" class="btn ghost" id="flux-next">Próximo →</button>
        <button type="button" class="btn" id="flux-print">Imprimir/PDF</button>
      </div>
    </section>
  `;
}

function renderHero(rows) {
  const primeira = rows[0] || {};
  const numero = numeroCasoFluxograma(primeira);
  const clube = clubeFluxograma(primeira);
  const observacoes = etapasComObservacao(rows);
  const ramificacoes = totalRamificacoes(rows);

  return `
    <section class="hero">
      <div>
        <div class="hero-pills">
          ${origemPill(origemFluxograma(primeira))}
          ${seriePill(primeira.serie)}
          ${statusPill(statusCasoFluxo(rows))}
        </div>
        <h2>${esc(tituloCaso(numero))} · ${esc(clube)}</h2>
        <p class="hero-subtitle">${plural(rows.length, 'etapa no total', 'etapas no total')} · ${plural(ramificacoes, 'ramificação', 'ramificações')} · ${plural(observacoes, 'registro com observação', 'registros com observação')}</p>
      </div>
      <div class="hero-actions" aria-label="Ações do caso selecionado">
        <button type="button" class="btn ghost" id="flux-copy">Copiar resumo</button>
        <button type="button" class="btn ghost" id="flux-clear">Limpar filtros</button>
        <button type="button" class="btn" id="flux-new-case">+ Novo caso</button>
        <button type="button" class="btn" id="flux-new-step">+ Nova etapa</button>
        <button type="button" class="btn ghost" id="flux-edit-case" ${registroCasoSelecionado(rows) ? '' : 'disabled'}>Editar caso</button>
      </div>
    </section>
  `;
}

function kpiCard(label, value, color = 'gold') {
  return `
    <div class="kpi mini ${color}">
      <strong class="kpi-value">${esc(value)}</strong>
      <span class="kpi-label">${esc(label)}</span>
      <small class="kpi-sub">Caso selecionado</small>
    </div>
  `;
}

function renderKpis(rows) {
  const observacoes = etapasComObservacao(rows);
  const ramificacoes = totalRamificacoes(rows);
  const finalizadas = rows.filter(isFinalizada).length;
  const pendentesClube = rows.filter((row) => normStatus(row.statusEtapa).includes('clube')).length;
  const pendentesAnresf = rows.filter((row) => normStatus(row.statusEtapa).includes('anresf')).length;

  return `
    <div class="kpis">
      ${kpiCard('Etapas', rows.length, 'gold')}
      ${kpiCard('Finalizadas', finalizadas, 'green')}
      ${kpiCard('Pend. Clube', pendentesClube, 'orange')}
      ${kpiCard('Pend. ANRESF', pendentesAnresf, 'blue')}
      ${kpiCard('Observações', observacoes, 'purple')}
      ${kpiCard('Ramificações', ramificacoes, 'red')}
    </div>
  `;
}

function renderResumo(rows) {
  const primeira = rows[0] || {};
  const atual = currentRows(rows);
  const sancoes = rows.filter((row) => row.sancao).length;

  return `
    <section class="card fluxo-card">
      <div class="card-head"><h3>Resumo operacional</h3><span class="muted">${esc(tituloCaso(numeroCasoFluxograma(primeira)))}</span></div>
      <div class="card-body meta">
        <div class="meta-item"><span>Status do caso</span><strong>${esc(statusCasoFluxo(rows))}</strong></div>
        <div class="meta-item"><span>Etapa atual</span><strong>${esc(valor(atual.etapa))}</strong></div>
        <div class="meta-item"><span>Responsável atual</span><strong>${esc(responsavel(atual.statusEtapa))}</strong></div>
        <div class="meta-item"><span>Tempo do caso</span><strong>${esc(valor(tempoDoCaso(rows)))}</strong></div>
        <div class="meta-item"><span>Data de envio inicial</span><strong>${esc(valor(primeira.dataEnvio || primeira.dataEtapa || primeira.created_at))}</strong></div>
        <div class="meta-item"><span>Prazo final máximo</span><strong>${esc(valor(prazoFinalMaximo(rows)))}</strong></div>
        <div class="meta-item"><span>Sanções preenchidas</span><strong>${esc(sancoes || '—')}</strong></div>
      </div>
    </section>
  `;
}

function renderStep(row, atual, ehOrigemRamificacao, infoRamo) {
  const clicavel = Boolean(row.etapa_banco_id);
  return `
    <article class="${stepClass(row, atual)}${clicavel ? ' step-clickable' : ''}" ${clicavel ? `data-etapa-id="${esc(row.etapa_banco_id)}" role="button" tabindex="0" aria-label="Abrir tarefas da etapa ${esc(valor(row.etapa))}"` : ''}>
      ${infoRamo ? `<div class="branch-tag-row"><span class="pill purple">↳ Ramo ${esc(infoRamo.ramo)}${infoRamo.etapaOrigemNome ? ` · de "${esc(infoRamo.etapaOrigemNome)}"` : ''}</span></div>` : ''}
      <div class="step-top">
        <span class="step-actions">
          ${statusPill(row.statusEtapa)}
          ${row.etapa_banco_id ? `<button type="button" class="mini-action ramificar-step" data-etapa-id="${esc(row.etapa_banco_id)}">Ramificar</button>` : ''}
          ${row.etapa_banco_id ? `<button type="button" class="mini-action edit-step" data-etapa-id="${esc(row.etapa_banco_id)}">Editar</button>` : '<span class="muted small">Sem edição</span>'}
          ${row.etapa_banco_id ? `<button type="button" class="mini-action danger excluir-step" data-etapa-id="${esc(row.etapa_banco_id)}">Excluir</button>` : ''}
        </span>
      </div>
      <h4 class="step-title"><span class="step-id">${esc(documento(row))}</span><span class="step-title-text">${esc(valor(row.etapa))}</span></h4>
      <p class="step-text">${esc(valor(row.objeto, 'Objeto não informado'))}</p>
      <div class="side-list">
        <div class="side-item"><span>Envio</span><strong>${esc(valor(row.dataEnvio || row.dataEtapa))}</strong></div>
        <div class="side-item"><span>Prazo</span><strong>${esc(valor(row.prazoFinal))}</strong></div>
        <div class="side-item"><span>Documento</span><strong class="${row.doc ? 'doc-link' : ''}">${row.doc ? `<a href="${esc(row.doc)}" target="_blank" rel="noopener">Ver anexo</a>` : esc(valor(row.doc))}</strong></div>
      </div>
      ${row.observacao ? `<p class="note">${esc(row.observacao)}</p>` : ''}
      ${row.sancao ? `<p class="sancao">${esc(row.sancao)}</p>` : ''}
      ${ehOrigemRamificacao ? '<span class="branch-flag" title="Esta etapa dá origem a uma ramificação">↘ Ramificação</span>' : ''}
    </article>
  `;
}

function montarGradeFluxo(rows, filtradas) {
  const lanesMap = groupBy(filtradas, (row) => casoDaEtapa(row));
  const casoRaiz = numeroCaso(rows[0] || {});
  const chaves = Array.from(lanesMap.keys());
  const chaveMainLane = lanesMap.has(casoRaiz) ? casoRaiz : (chaves[0] || casoRaiz);

  const posicaoPorId = new Map();
  const ocupacao = [];
  const celulas = [];
  const lanesPosicionadas = new Set();

  function proximaLinhaLivre(linhaMinima, colInicio, colFim) {
    let linha = linhaMinima % 2 === 0 ? linhaMinima + 1 : linhaMinima;
    while (ocupacao.some((o) => o.linha === linha && !(colFim < o.colInicio || colInicio > o.colFim))) {
      linha += 2;
    }
    return linha;
  }

  function posicionarLane(chaveLane, linhaMinima, colunaInicial, infoOrigem) {
    if (lanesPosicionadas.has(chaveLane)) return;
    const etapas = lanesMap.get(chaveLane);
    if (!etapas || etapas.length === 0) return;
    lanesPosicionadas.add(chaveLane);

    const colFim = colunaInicial + (etapas.length - 1) * 2;
    const linha = proximaLinhaLivre(linhaMinima, colunaInicial, colFim);
    ocupacao.push({ linha, colInicio: colunaInicial, colFim });

    etapas.forEach((row, indice) => {
      const coluna = colunaInicial + indice * 2;
      const idEtapa = row.etapa_banco_id ? String(row.etapa_banco_id) : null;
      if (idEtapa) posicaoPorId.set(idEtapa, { linha, coluna });
      celulas.push({ tipo: 'card', linha, coluna, row, infoRamo: indice === 0 ? infoOrigem : null });
      if (indice < etapas.length - 1) {
        celulas.push({ tipo: 'seta', linha, coluna: coluna + 1 });
      }
    });

    etapas.forEach((row) => {
      const idEtapa = row.etapa_banco_id ? String(row.etapa_banco_id) : null;
      if (!idEtapa) return;
      const posOrigem = posicaoPorId.get(idEtapa);
      if (!posOrigem) return;

      chaves
        .filter((chave) => !lanesPosicionadas.has(chave))
        .filter((chave) => String(lanesMap.get(chave)?.[0]?.ramo_origem_id) === idEtapa)
        .forEach((chaveFilha) => {
          celulas.push({ tipo: 'seta-baixo', linha: posOrigem.linha + 1, coluna: posOrigem.coluna });
          const primeiraEtapaFilha = lanesMap.get(chaveFilha)[0];
          posicionarLane(chaveFilha, posOrigem.linha + 2, posOrigem.coluna, {
            ramo: primeiraEtapaFilha.ramo,
            etapaOrigemNome: valor(row.etapa),
          });
        });
    });
  }

  posicionarLane(chaveMainLane, 1, 1, null);

  chaves.forEach((chave) => {
    if (lanesPosicionadas.has(chave)) return;
    const maxLinha = ocupacao.reduce((m, o) => Math.max(m, o.linha), -1);
    const primeiraEtapa = lanesMap.get(chave)[0];
    posicionarLane(chave, maxLinha + 2, 1, primeiraEtapa?.ramo ? { ramo: primeiraEtapa.ramo, etapaOrigemNome: null } : null);
  });

  return celulas;
}

function renderFlow(rows) {
  const filtradas = aplicarFiltros(rows).sort(stageSort);
  const atual = currentRows(rows);

  if (filtradas.length === 0) {
    return '<div class="empty">Nenhuma etapa encontrada para os filtros selecionados.</div>';
  }

  const origensRamificacao = new Set(rows.map((row) => row.ramo_origem_id).filter(Boolean).map(String));
  const celulas = montarGradeFluxo(rows, filtradas);
  const maxCol = celulas.reduce((m, c) => Math.max(m, c.coluna), 1);
  const maxLinha = celulas.reduce((m, c) => Math.max(m, c.linha), 1);
  const templateColunas = Array.from({ length: maxCol }, (_, i) => (i % 2 === 0 ? '372px' : '44px')).join(' ');
  const templateLinhas = Array.from({ length: maxLinha }, (_, i) => (i % 2 === 0 ? 'auto' : '36px')).join(' ');

  const conteudo = celulas.map((celula) => {
    if (celula.tipo === 'card') {
      return `<div class="flow-cell" style="grid-column:${celula.coluna};grid-row:${celula.linha}">${renderStep(celula.row, atual, origensRamificacao.has(String(celula.row.etapa_banco_id)), celula.infoRamo)}</div>`;
    }
    if (celula.tipo === 'seta') {
      return `<span class="arrow" style="grid-column:${celula.coluna};grid-row:${celula.linha}">→</span>`;
    }
    return `<span class="arrow arrow-baixo" style="grid-column:${celula.coluna};grid-row:${celula.linha}">↓</span>`;
  }).join('');

  return `
    <section class="lane fluxo-lane">
      <div class="lane-title">Fluxo do caso · ${esc(tituloCaso(numeroCaso(rows[0] || {})))}</div>
      <div class="flow-grid" style="grid-template-columns:${templateColunas};grid-template-rows:${templateLinhas}">
        ${conteudo}
      </div>
    </section>
  `;
}

function renderHistorico(rows) {
  const filtradas = aplicarFiltros(rows).sort(stageSort);
  const linhas = filtradas.map((row) => `
    <tr>
      <td>${esc(casoDaEtapa(row))}</td>
      <td>${esc(documento(row))}</td>
      <td>${esc(valor(row.etapa))}</td>
      <td>${esc(valor(row.objeto))}</td>
      <td>${esc(valor(row.dataEnvio || row.dataEtapa))}</td>
      <td>${esc(valor(row.prazoFinal))}</td>
      <td>${statusPill(row.statusEtapa)}</td>
      <td>${esc(valor(row.observacao))}</td>
      <td>${esc(valor(row.sancao))}</td>
      <td>
        ${row.etapa_banco_id ? `<button type="button" class="mini-action edit-step" data-etapa-id="${esc(row.etapa_banco_id)}">Editar</button>` : '<span class="muted small">Indisponível</span>'}
        ${row.etapa_banco_id ? `<button type="button" class="mini-action danger excluir-step" data-etapa-id="${esc(row.etapa_banco_id)}">Excluir</button>` : ''}
      </td>
    </tr>
  `).join('');

  return `
    <section class="card fluxo-card">
      <div class="card-head"><h3>Histórico do caso selecionado</h3><span class="muted">${filtradas.length} registros</span></div>
      <div class="card-body table-wrap history-card">
        ${filtradas.length === 0 ? '<div class="empty">Nenhum registro encontrado para os filtros selecionados.</div>' : `
          <table class="tbl">
            <thead>
              <tr><th>Caso</th><th>ID</th><th>Etapa</th><th>Objeto</th><th>Envio</th><th>Prazo</th><th>Status</th><th>Observação</th><th>Sanção</th><th>Ações</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        `}
      </div>
    </section>
  `;
}

function renderizarFluxograma() {
  const panel = document.querySelector('#fluxograma');
  if (!panel) return;

  const rows = linhasDoCasoSelecionado().sort(stageSort);
  const atual = currentRows(rows);

  if (!rows.length) {
    panel.innerHTML = `
      <div class="flux-layout">
        ${renderToolbar(rows)}
        <section class="card fluxo-card">
          <div class="card-body">
            <div class="empty">Nenhum dado do Fluxograma foi encontrado. Tente atualizar a página ou verificar a conexão com a API.</div>
          </div>
        </section>
        <div id="flux-message" class="flux-message" role="status" aria-live="polite"></div>
        ${renderModaisFluxograma()}
      </div>
    `;
    conectarControlesFluxograma();
    return;
  }

  panel.innerHTML = `
    <div class="flux-layout">
      ${renderToolbar(rows)}
      ${renderHero(rows)}
      ${renderKpis(rows)}
      ${renderResumo(rows)}

      <section class="card fluxo-card">
        <div class="card-head">
          <div><h3>Fluxograma do caso</h3><p class="muted">Etapa atual: ${esc(valor(atual.etapa))}</p></div>
          ${statusPill(statusCasoFluxo(rows))}
        </div>
        <div class="card-body flow-wrap">${renderFlow(rows)}</div>
      </section>

      ${renderHistorico(rows)}
      <div id="flux-message" class="flux-message" role="status" aria-live="polite"></div>
      ${renderModaisFluxograma()}
    </div>
  `;

  conectarControlesFluxograma();
}

async function carregarDadosFluxograma() {
  try {
    const resposta = await fetch('/api/etapas');

    if (!resposta.ok) throw new Error('Falha ao buscar dados do Supabase');

    const dados = await resposta.json();

    if (Array.isArray(dados) && dados.length > 0) {
      DATA = dados;
      dadosFluxograma = dados;
      console.log('Dados carregados do Supabase para o Fluxograma');
    } else {
      DATA = [];
      dadosFluxograma = [];
      console.warn('A API do Fluxograma retornou uma lista vazia.');
    }
  } catch (erro) {
    DATA = [];
    dadosFluxograma = [];
    console.warn('Não foi possível carregar dados do Fluxograma.', erro);
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

function renderModaisFluxograma() {
  return `
    <div class="modal-backdrop" id="modal-novo-caso" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-novo-caso">
        <div class="modal-head">
          <div><p class="eyebrow">Fluxograma</p><h3 id="titulo-novo-caso">Incluir novo caso</h3></div>
          <button type="button" class="icon-btn" data-close-modal="caso" aria-label="Fechar">×</button>
        </div>
        <form id="form-novo-caso" class="modal-form">
          <div class="form-grid">
            <label>Número do caso<input type="number" name="numero_caso" min="1" required></label>
            <label>Origem<input type="text" name="origem" placeholder="Ex.: Solvência"></label>
            <label>Clube<input type="text" name="clube" required></label>
            <label>Série<select name="serie"><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="Outra">Outra</option></select></label>
            <label>Status do caso<select name="status_caso" required><option value="Em andamento">Em andamento</option><option value="Finalizado">Finalizado</option></select></label>
          </div>
          <div class="modal-feedback" id="feedback-novo-caso"></div>
          <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal="caso">Cancelar</button><button type="submit" class="btn">Salvar</button></div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" id="modal-nova-etapa" hidden>
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="titulo-nova-etapa">
        <div class="modal-head">
          <div><p class="eyebrow">Fluxograma</p><h3 id="titulo-nova-etapa">Incluir nova etapa</h3></div>
          <button type="button" class="icon-btn" data-close-modal="etapa" aria-label="Fechar">×</button>
        </div>
        <form id="form-nova-etapa" class="modal-form">
          <div class="form-grid two">
            <label>Caso vinculado<select name="caso_id" id="etapa-caso-id" required><option value="">Carregando casos...</option></select></label>
            <label>Nome da etapa<input type="text" name="nome_etapa" required placeholder="Ex.: Diligência"></label>
            <label>Ordem<input type="number" name="ordem" id="etapa-ordem" min="1" required></label>
            <label>ID da etapa<input type="text" name="id_etapa" placeholder="Ex.: 001/2026"></label>
            <label>Data da etapa<input type="date" name="data_etapa"></label>
            <label>Prazo<input type="date" name="prazo"></label>
            <label>Status da etapa<select name="status_etapa" required><option value="Pendente ANRESF">Pendente ANRESF</option><option value="Pendente Clube">Pendente Clube</option><option value="Finalizado">Finalizado</option></select></label>
            <label>Ramifica a partir da etapa<select name="ramo_origem_id" id="etapa-ramo-origem"><option value="">Nenhuma (fluxo principal)</option></select><span class="field-hint">Escolha uma etapa para criar um fluxo paralelo (ramificação) a partir dela.</span></label>
            <label>Nome da ramificação<input type="text" name="ramo" id="etapa-ramo" placeholder="Preenchido automaticamente"><span class="field-hint">Preenchido ao escolher a etapa de origem. Pode personalizar (ex.: "Recurso").</span></label>
            <label class="full">Objeto<textarea name="objeto" rows="3"></textarea></label>
            <label class="full">Observação<textarea name="observacao" rows="3"></textarea></label>
            <label class="full">Sanção<textarea name="sancao" rows="2" placeholder="Deixe em branco se não houver sanção"></textarea></label>
            <label class="full">Anexo (PDF, até 4MB)<input type="file" name="anexo_pdf" accept="application/pdf"></label>
          </div>
          <div class="modal-feedback" id="feedback-nova-etapa"></div>
          <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal="etapa">Cancelar</button><button type="submit" class="btn">Salvar</button></div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" id="modal-editar-caso" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-caso">
        <div class="modal-head">
          <div><p class="eyebrow">Fluxograma</p><h3 id="titulo-editar-caso">Editar caso</h3></div>
          <button type="button" class="icon-btn" data-close-modal="editar-caso" aria-label="Fechar">×</button>
        </div>
        <form id="form-editar-caso" class="modal-form">
          <input type="hidden" name="id">
          <div class="form-grid">
            <label>Número do caso<input type="number" name="numero_caso" min="1" required></label>
            <label>Origem<input type="text" name="origem"></label>
            <label>Clube<input type="text" name="clube" required></label>
            <label>Série<select name="serie"><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="Outra">Outra</option></select></label>
            <label>Status do caso<select name="status_caso" required><option value="Em andamento">Em andamento</option><option value="Finalizado">Finalizado</option></select></label>
          </div>
          <div class="modal-feedback" id="feedback-editar-caso"></div>
          <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal="editar-caso">Cancelar</button><button type="submit" class="btn">Salvar</button></div>
        </form>
      </div>
    </div>

    <div class="modal-backdrop" id="modal-editar-etapa" hidden>
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-etapa">
        <div class="modal-head">
          <div><p class="eyebrow">Fluxograma</p><h3 id="titulo-editar-etapa">Editar etapa</h3></div>
          <button type="button" class="icon-btn" data-close-modal="editar-etapa" aria-label="Fechar">×</button>
        </div>
        <form id="form-editar-etapa" class="modal-form">
          <input type="hidden" name="id">
          <div class="form-grid two">
            <label>Caso vinculado<select name="caso_id" id="editar-etapa-caso-id" required><option value="">Carregando casos...</option></select></label>
            <label>Nome da etapa<input type="text" name="nome_etapa" required></label>
            <label>Ordem<input type="number" name="ordem" min="1" required></label>
            <label>ID da etapa<input type="text" name="id_etapa"></label>
            <label>Data da etapa<input type="date" name="data_etapa"></label>
            <label>Prazo<input type="date" name="prazo"></label>
            <label>Status da etapa<select name="status_etapa" required><option value="Pendente ANRESF">Pendente ANRESF</option><option value="Pendente Clube">Pendente Clube</option><option value="Finalizado">Finalizado</option></select></label>
            <label>Ramifica a partir da etapa<select name="ramo_origem_id" id="editar-etapa-ramo-origem"><option value="">Nenhuma (fluxo principal)</option></select><span class="field-hint">Escolha uma etapa para criar um fluxo paralelo (ramificação) a partir dela.</span></label>
            <label>Nome da ramificação<input type="text" name="ramo" id="editar-etapa-ramo" placeholder="Preenchido automaticamente"><span class="field-hint">Preenchido ao escolher a etapa de origem. Pode personalizar (ex.: "Recurso").</span></label>
            <label class="full">Objeto<textarea name="objeto" rows="3"></textarea></label>
            <label class="full">Observação<textarea name="observacao" rows="3"></textarea></label>
            <label class="full">Sanção<textarea name="sancao" rows="2" placeholder="Deixe em branco se não houver sanção"></textarea></label>
            <label class="full">Anexo (PDF, até 4MB)<input type="file" name="anexo_pdf" accept="application/pdf"><span class="field-hint" id="editar-etapa-anexo-atual"></span></label>
          </div>
          <div class="modal-feedback" id="feedback-editar-etapa"></div>
          <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal="editar-etapa">Cancelar</button><button type="submit" class="btn">Salvar</button></div>
        </form>
      </div>
    </div>
  `;
}

function mostrarFeedbackModal(id, tipo, texto) {
  const el = document.querySelector(id);
  if (!el) return;
  el.className = `modal-feedback ${tipo}`;
  el.textContent = texto || '';
}

function mostrarMensagemFluxograma(tipo, texto) {
  const el = document.querySelector('#flux-message');
  if (!el) return;
  el.className = `flux-message ${tipo}`;
  el.textContent = texto;
  if (texto) setTimeout(() => {
    if (el.textContent === texto) el.textContent = '';
  }, 5000);
}

function abrirModalNovoCaso() {
  const modal = document.querySelector('#modal-novo-caso');
  modal?.removeAttribute('hidden');
  mostrarFeedbackModal('#feedback-novo-caso', '', '');
  document.querySelector('#form-novo-caso input[name="numero_caso"]')?.focus();
}

function fecharModalNovoCaso() {
  document.querySelector('#modal-novo-caso')?.setAttribute('hidden', '');
  document.querySelector('#form-novo-caso')?.reset();
  mostrarFeedbackModal('#feedback-novo-caso', '', '');
}

function casoRaizSelecionadoEmForm(selectId) {
  const select = document.querySelector(selectId);
  return select?.selectedOptions[0]?.dataset.casoRaiz || casoSelecionado;
}

async function abrirModalNovaEtapa(prefill) {
  const modal = document.querySelector('#modal-nova-etapa');
  modal?.removeAttribute('hidden');
  mostrarFeedbackModal('#feedback-nova-etapa', '', '');
  await carregarCasosParaSelectEtapa();

  const selectCaso = document.querySelector('#etapa-caso-id');
  if (prefill?.casoId && selectCaso) selectCaso.value = String(prefill.casoId);

  popularSelectOrigemRamo('#etapa-ramo-origem', casoRaizSelecionadoEmForm('#etapa-caso-id'));

  const selectOrigem = document.querySelector('#etapa-ramo-origem');
  const inputRamo = document.querySelector('#etapa-ramo');
  if (prefill?.ramoOrigemId && selectOrigem) selectOrigem.value = String(prefill.ramoOrigemId);
  if (prefill?.ramoSugerido && inputRamo) inputRamo.value = prefill.ramoSugerido;

  preencherSugestaoOrdemEtapa();
  document.querySelector('#etapa-caso-id')?.focus();
}

function proximoRamoSugerido(casoRaiz) {
  const ramosExistentes = new Set(
    dadosFluxograma
      .filter((row) => numeroCaso(row) === casoRaiz && row.ramo)
      .map((row) => row.ramo)
  );
  let contador = 2;
  while (ramosExistentes.has(String(contador))) contador += 1;
  return String(contador);
}

async function abrirModalNovaEtapaRamificacao(row) {
  const casoRaiz = numeroCaso(row);
  await abrirModalNovaEtapa({
    casoId: row.caso_banco_id,
    ramoOrigemId: row.etapa_banco_id,
    ramoSugerido: proximoRamoSugerido(casoRaiz),
  });
}

function fecharModalNovaEtapa() {
  document.querySelector('#modal-nova-etapa')?.setAttribute('hidden', '');
  document.querySelector('#form-nova-etapa')?.reset();
  mostrarFeedbackModal('#feedback-nova-etapa', '', '');
}

function labelCaso(caso) {
  return caso.label || caso.nome || caso.caso || caso.numero_caso_label || `Caso ${valor(caso.numero_caso || caso.id, '')}${caso.clube ? ` · ${caso.clube}` : ''}`;
}

function casoRaizDoCaso(caso) {
  return String(caso.casoRaiz || caso.caso_raiz || caso.numero_caso || caso.id || '');
}

async function carregarCasosParaSelectEtapa() {
  const select = document.querySelector('#etapa-caso-id');
  if (!select) return;

  try {
    const resposta = await fetch('/api/casos');
    if (!resposta.ok) throw new Error('Falha ao carregar casos.');
    const dados = await resposta.json();
    casosDisponiveis = Array.isArray(dados) ? dados : [];

    if (casosDisponiveis.length === 0) {
      select.innerHTML = '<option value="">Nenhum caso disponível</option>';
      return;
    }

    select.innerHTML = casosDisponiveis.map((caso) => `
      <option value="${esc(caso.id)}" data-caso-raiz="${esc(casoRaizDoCaso(caso))}">${esc(labelCaso(caso))}</option>
    `).join('');

    const casoAtual = casosDisponiveis.find((caso) => casoRaizDoCaso(caso) === casoSelecionado);
    if (casoAtual?.id) select.value = String(casoAtual.id);
  } catch (erro) {
    select.innerHTML = '<option value="">Erro ao carregar casos</option>';
    mostrarFeedbackModal('#feedback-nova-etapa', 'erro', erro.message);
  }
}

function preencherSugestaoOrdemEtapa() {
  const select = document.querySelector('#etapa-caso-id');
  const inputOrdem = document.querySelector('#etapa-ordem');
  const inputRamo = document.querySelector('#etapa-ramo');
  if (!select || !inputOrdem) return;

  const option = select.selectedOptions[0];
  const casoRaiz = option?.dataset.casoRaiz || casoSelecionado;
  const ramo = inputRamo?.value.trim();
  const laneAlvo = ramo ? `${casoRaiz}.${ramo}` : casoRaiz;
  const etapasDaLane = dadosFluxograma.filter((row) => numeroCaso(row) === casoRaiz && casoDaEtapa(row) === laneAlvo);
  const ultimaOrdem = etapasDaLane.reduce((max, row) => Math.max(max, ordemNumero(row)), 0);
  inputOrdem.value = String(ultimaOrdem + 1);
}

function autoPreencherRamo(inputRamoId, selectOrigemId, casoRaizGetter) {
  const inputRamo = document.querySelector(inputRamoId);
  const selectOrigem = document.querySelector(selectOrigemId);
  if (!inputRamo || !selectOrigem) return;

  if (selectOrigem.value && !inputRamo.value.trim()) {
    inputRamo.value = proximoRamoSugerido(casoRaizGetter());
    if (inputRamoId === '#etapa-ramo') preencherSugestaoOrdemEtapa();
  }
}

function popularSelectOrigemRamo(selectId, casoRaiz, etapaIdParaExcluir) {
  const select = document.querySelector(selectId);
  if (!select) return;

  const etapasDoCaso = dadosFluxograma
    .filter((row) => numeroCaso(row) === casoRaiz && String(row.etapa_banco_id) !== String(etapaIdParaExcluir || ''))
    .sort(stageSort);

  const valorAtual = select.value;
  select.innerHTML = `
    <option value="">Nenhuma (fluxo principal)</option>
    ${etapasDoCaso.map((row) => `<option value="${esc(row.etapa_banco_id)}">${esc(casoDaEtapa(row))} · ${esc(valor(row.etapa))}</option>`).join('')}
  `;
  select.value = valorAtual;
}

async function tratarRespostaApi(resposta, mensagemPadrao) {
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalheSupabase = dados?.detalhe;
    const mensagem = (typeof detalheSupabase === 'string' && detalheSupabase)
      || detalheSupabase?.message
      || detalheSupabase?.hint
      || (typeof dados?.erro === 'string' && dados.erro)
      || mensagemPadrao;
    throw new Error(mensagem);
  }
  return dados;
}

async function recarregarFluxograma(casoParaSelecionar) {
  try {
    const resposta = await fetch('/api/etapas');
    if (!resposta.ok) throw new Error('Falha ao recarregar Fluxograma.');
    const dados = await resposta.json();
    DATA = Array.isArray(dados) ? dados : [];
    dadosFluxograma = DATA;
    if (casoParaSelecionar) casoSelecionado = String(casoParaSelecionar);
  } catch (erro) {
    console.warn('Não foi possível recarregar o Fluxograma.', erro);
    if (!Array.isArray(dadosFluxograma)) dadosFluxograma = [];
  }

  renderizarFluxograma();
}

async function salvarNovoCaso(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const numero = Number(form.numero_caso.value);
  const clube = form.clube.value.trim();
  const status = form.status_caso.value;

  if (!numero || !Number.isFinite(numero)) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Número do caso é obrigatório e deve ser numérico.');
  if (!clube) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Clube é obrigatório.');
  if (!status) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Status do caso é obrigatório.');

  try {
    const resposta = await fetch('/api/casos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'criar',
        numero_caso: numero,
        origem: form.origem.value.trim(),
        clube,
        serie: form.serie.value,
        status_caso: status,
      }),
    });
    const dados = await tratarRespostaApi(resposta, 'Erro ao criar caso.');
    const criado = Array.isArray(dados) ? dados[0] : dados;
    fecharModalNovoCaso();
    await carregarCasosParaSelectEtapa();
    await recarregarFluxograma(criado?.numero_caso || numero);
    mostrarMensagemFluxograma('sucesso', 'Caso criado com sucesso.');
  } catch (erro) {
    mostrarFeedbackModal('#feedback-novo-caso', 'erro', erro.message);
  }
}

const TAMANHO_MAXIMO_ANEXO = 4 * 1024 * 1024;

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    leitor.readAsDataURL(arquivo);
  });
}

async function enviarAnexoEtapa(inputArquivo) {
  const arquivo = inputArquivo?.files?.[0];
  if (!arquivo) return null;

  if (arquivo.type !== 'application/pdf') throw new Error('O anexo deve ser um arquivo PDF.');
  if (arquivo.size > TAMANHO_MAXIMO_ANEXO) throw new Error('O anexo deve ter até 4MB.');

  const conteudoBase64 = await lerArquivoComoBase64(arquivo);
  const resposta = await fetch('/api/upload-anexo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome_arquivo: arquivo.name, conteudo_base64: conteudoBase64 }),
  });
  const dados = await tratarRespostaApi(resposta, 'Erro ao enviar anexo.');
  return dados?.url || null;
}

async function salvarNovaEtapa(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const casoId = Number(form.caso_id.value);
  const ordem = Number(form.ordem.value);
  const nomeEtapa = form.nome_etapa.value.trim();
  const statusEtapa = form.status_etapa.value;

  if (!casoId || !Number.isFinite(casoId)) return mostrarFeedbackModal('#feedback-nova-etapa', 'erro', 'Caso vinculado é obrigatório.');
  if (!nomeEtapa) return mostrarFeedbackModal('#feedback-nova-etapa', 'erro', 'Nome da etapa é obrigatório.');
  if (!ordem || !Number.isFinite(ordem)) return mostrarFeedbackModal('#feedback-nova-etapa', 'erro', 'Ordem é obrigatória e deve ser numérica.');
  if (!statusEtapa) return mostrarFeedbackModal('#feedback-nova-etapa', 'erro', 'Status da etapa é obrigatório.');

  try {
    const urlAnexo = await enviarAnexoEtapa(form.anexo_pdf);

    const resposta = await fetch('/api/etapas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'criar',
        caso_id: casoId,
        nome_etapa: nomeEtapa,
        ordem,
        objeto: form.objeto.value.trim(),
        id_etapa: form.id_etapa.value.trim() || null,
        data_etapa: form.data_etapa.value || null,
        prazo: form.prazo.value || null,
        observacao: form.observacao.value.trim(),
        sancao: form.sancao.value.trim() || null,
        doc: urlAnexo,
        ramo: form.ramo.value.trim(),
        ramo_origem_id: form.ramo_origem_id.value ? Number(form.ramo_origem_id.value) : null,
        status_etapa: statusEtapa,
      }),
    });
    await tratarRespostaApi(resposta, 'Erro ao criar etapa.');
    const option = form.caso_id.selectedOptions[0];
    const casoRaiz = option?.dataset.casoRaiz || casoSelecionado;
    fecharModalNovaEtapa();
    await carregarCasosParaSelectEtapa();
    await recarregarFluxograma(casoRaiz);
    mostrarMensagemFluxograma('sucesso', 'Etapa criada com sucesso.');
  } catch (erro) {
    mostrarFeedbackModal('#feedback-nova-etapa', 'erro', erro.message);
  }
}

function registroCasoSelecionado(rows = linhasDoCasoSelecionado()) {
  return rows.find((row) => row.caso_banco_id) || null;
}

function brToIsoDate(valorData) {
  if (!valorData) return '';
  const valorTexto = String(valorData).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(valorTexto)) return valorTexto;
  const partes = valorTexto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!partes) return '';
  const [, dia, mes, ano] = partes;
  return `${ano}-${mes}-${dia}`;
}

function isoToBrDate(valorData) {
  if (!valorData) return '';
  const valorTexto = String(valorData).trim();
  const partes = valorTexto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return '';
  const [, ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

function normalizarSerie(serie) {
  const valorSerie = String(serie || '').trim();
  return ['A', 'B', 'C', 'D'].includes(valorSerie) ? valorSerie : 'Outra';
}

function abrirModalEditarCaso() {
  const rows = linhasDoCasoSelecionado();
  const registro = registroCasoSelecionado(rows);

  if (!registro) {
    mostrarMensagemFluxograma('erro', 'Este caso não possui identificador de banco para edição.');
    return;
  }

  casoEmEdicao = registro;
  const form = document.querySelector('#form-editar-caso');
  if (!form) return;

  form.id.value = registro.caso_banco_id;
  form.numero_caso.value = registro.numero_caso || registro.casoRaiz || '';
  form.origem.value = registro.origem || '';
  form.clube.value = registro.clube || '';
  form.serie.value = normalizarSerie(registro.serie);
  form.status_caso.value = registro.statusCaso || 'Em andamento';
  mostrarFeedbackModal('#feedback-editar-caso', '', '');
  document.querySelector('#modal-editar-caso')?.removeAttribute('hidden');
  form.numero_caso.focus();
}

function fecharModalEditarCaso() {
  document.querySelector('#modal-editar-caso')?.setAttribute('hidden', '');
  document.querySelector('#form-editar-caso')?.reset();
  casoEmEdicao = null;
  mostrarFeedbackModal('#feedback-editar-caso', '', '');
}

function buscarRegistroEtapaPorId(etapaBancoId) {
  return dadosFluxograma.find((row) => String(row.etapa_banco_id) === String(etapaBancoId));
}

async function carregarCasosParaSelectEdicao(casoIdSelecionado) {
  const select = document.querySelector('#editar-etapa-caso-id');
  if (!select) return;

  try {
    if (casosDisponiveis.length === 0) {
      const resposta = await fetch('/api/casos');
      if (!resposta.ok) throw new Error('Falha ao carregar casos.');
      const dados = await resposta.json();
      casosDisponiveis = Array.isArray(dados) ? dados : [];
    }

    if (casosDisponiveis.length === 0) {
      select.innerHTML = '<option value="">Nenhum caso disponível</option>';
      return;
    }

    select.innerHTML = casosDisponiveis.map((caso) => `
      <option value="${esc(caso.id)}" data-caso-raiz="${esc(casoRaizDoCaso(caso))}">${esc(labelCaso(caso))}</option>
    `).join('');

    if (casoIdSelecionado) select.value = String(casoIdSelecionado);
  } catch (erro) {
    select.innerHTML = '<option value="">Erro ao carregar casos</option>';
    mostrarFeedbackModal('#feedback-editar-etapa', 'erro', erro.message);
  }
}

function preencherFormularioEditarEtapa(registro) {
  const form = document.querySelector('#form-editar-etapa');
  if (!form || !registro) return;

  form.id.value = registro.etapa_banco_id || '';
  form.nome_etapa.value = registro.etapa || '';
  form.ordem.value = registro.ordem || '';
  form.objeto.value = registro.objeto || '';
  form.id_etapa.value = registro.semId ? '' : (registro.id || '');
  form.data_etapa.value = brToIsoDate(registro.dataEnvio || registro.data_etapa || '');
  form.prazo.value = brToIsoDate(registro.prazoFinal || registro.prazo || '');
  form.observacao.value = registro.observacao || '';
  form.sancao.value = registro.sancao || '';
  form.ramo.value = registro.ramo || '';
  form.ramo_origem_id.value = registro.ramo_origem_id || '';
  form.status_etapa.value = registro.statusEtapa || 'Pendente ANRESF';

  const hintAnexo = document.querySelector('#editar-etapa-anexo-atual');
  if (hintAnexo) {
    hintAnexo.innerHTML = registro.doc ? `<a href="${esc(registro.doc)}" target="_blank" rel="noopener">Ver anexo atual</a> — envie outro arquivo para substituí-lo.` : 'Nenhum anexo enviado ainda.';
  }
}

async function excluirEtapa(etapaBancoId) {
  const registro = buscarRegistroEtapaPorId(etapaBancoId);
  const nomeEtapa = registro?.etapa || 'esta etapa';

  if (!window.confirm(`Excluir "${nomeEtapa}"? Esta ação não pode ser desfeita.`)) return;

  try {
    const resposta = await fetch('/api/etapas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir', id: Number(etapaBancoId) }),
    });
    await tratarRespostaApi(resposta, 'Erro ao excluir etapa.');
    await recarregarFluxograma(casoSelecionado);
    mostrarMensagemFluxograma('sucesso', 'Etapa excluída com sucesso.');
  } catch (erro) {
    mostrarMensagemFluxograma('erro', erro.message);
  }
}

async function abrirModalEditarEtapa(etapaBancoId) {
  const registro = buscarRegistroEtapaPorId(etapaBancoId);

  if (!registro?.etapa_banco_id) {
    mostrarMensagemFluxograma('erro', 'Esta etapa não possui identificador de banco para edição.');
    return;
  }

  etapaEmEdicao = registro;
  mostrarFeedbackModal('#feedback-editar-etapa', '', '');
  document.querySelector('#modal-editar-etapa')?.removeAttribute('hidden');
  await carregarCasosParaSelectEdicao(registro.caso_banco_id);
  popularSelectOrigemRamo('#editar-etapa-ramo-origem', numeroCaso(registro), registro.etapa_banco_id);
  preencherFormularioEditarEtapa(registro);
  document.querySelector('#form-editar-etapa input[name="nome_etapa"]')?.focus();
}

function fecharModalEditarEtapa() {
  document.querySelector('#modal-editar-etapa')?.setAttribute('hidden', '');
  document.querySelector('#form-editar-etapa')?.reset();
  etapaEmEdicao = null;
  mostrarFeedbackModal('#feedback-editar-etapa', '', '');
}

async function salvarEdicaoCaso(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = Number(form.id.value);
  const numero = Number(form.numero_caso.value);
  const clube = form.clube.value.trim();
  const status = form.status_caso.value;
  const casoAtual = casoSelecionado;

  if (!id || !Number.isFinite(id)) return mostrarFeedbackModal('#feedback-editar-caso', 'erro', 'ID do caso é obrigatório para edição.');
  if (!numero || !Number.isFinite(numero)) return mostrarFeedbackModal('#feedback-editar-caso', 'erro', 'Número do caso é obrigatório e deve ser numérico.');
  if (!clube) return mostrarFeedbackModal('#feedback-editar-caso', 'erro', 'Clube é obrigatório.');
  if (!status) return mostrarFeedbackModal('#feedback-editar-caso', 'erro', 'Status do caso é obrigatório.');

  try {
    const resposta = await fetch('/api/casos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'editar',
        id,
        numero_caso: numero,
        origem: form.origem.value.trim(),
        clube,
        serie: form.serie.value,
        status_caso: status,
      }),
    });
    await tratarRespostaApi(resposta, 'Erro ao editar caso.');
    fecharModalEditarCaso();
    await carregarCasosParaSelectEtapa();
    await recarregarFluxograma(casoAtual || numero);
    mostrarMensagemFluxograma('sucesso', 'Caso atualizado com sucesso.');
  } catch (erro) {
    mostrarFeedbackModal('#feedback-editar-caso', 'erro', erro.message);
  }
}

async function salvarEdicaoEtapa(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = Number(form.id.value);
  const casoId = Number(form.caso_id.value);
  const ordem = Number(form.ordem.value);
  const nomeEtapa = form.nome_etapa.value.trim();
  const statusEtapa = form.status_etapa.value;

  if (!id || !Number.isFinite(id)) return mostrarFeedbackModal('#feedback-editar-etapa', 'erro', 'ID da etapa é obrigatório para edição.');
  if (!casoId || !Number.isFinite(casoId)) return mostrarFeedbackModal('#feedback-editar-etapa', 'erro', 'Caso vinculado é obrigatório.');
  if (!nomeEtapa) return mostrarFeedbackModal('#feedback-editar-etapa', 'erro', 'Nome da etapa é obrigatório.');
  if (!ordem || !Number.isFinite(ordem)) return mostrarFeedbackModal('#feedback-editar-etapa', 'erro', 'Ordem é obrigatória e deve ser numérica.');
  if (!statusEtapa) return mostrarFeedbackModal('#feedback-editar-etapa', 'erro', 'Status da etapa é obrigatório.');

  try {
    const urlAnexo = await enviarAnexoEtapa(form.anexo_pdf);
    const payload = {
      acao: 'editar',
      id,
      caso_id: casoId,
      nome_etapa: nomeEtapa,
      ordem,
      objeto: form.objeto.value.trim(),
      id_etapa: form.id_etapa.value.trim() || null,
      data_etapa: form.data_etapa.value || null,
      prazo: form.prazo.value || null,
      observacao: form.observacao.value.trim(),
      sancao: form.sancao.value.trim() || null,
      ramo: form.ramo.value.trim(),
      ramo_origem_id: form.ramo_origem_id.value ? Number(form.ramo_origem_id.value) : null,
      status_etapa: statusEtapa,
    };
    if (urlAnexo) payload.doc = urlAnexo;

    const resposta = await fetch('/api/etapas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await tratarRespostaApi(resposta, 'Erro ao editar etapa.');
    const option = form.caso_id.selectedOptions[0];
    const casoRaiz = option?.dataset.casoRaiz || casoSelecionado;
    fecharModalEditarEtapa();
    await carregarCasosParaSelectEtapa();
    await recarregarFluxograma(casoRaiz);
    mostrarMensagemFluxograma('sucesso', 'Etapa atualizada com sucesso.');
  } catch (erro) {
    mostrarFeedbackModal('#feedback-editar-etapa', 'erro', erro.message);
  }
}

function conectarControlesFluxograma() {
  const selectCaso = document.querySelector('#caseSelect');
  const selectStatus = document.querySelector('#flux-status');
  const inputBusca = document.querySelector('#flux-busca');
  const btnPrev = document.querySelector('#flux-prev');
  const btnNext = document.querySelector('#flux-next');
  const btnPrint = document.querySelector('#flux-print');
  const btnCopy = document.querySelector('#flux-copy');
  const btnClear = document.querySelector('#flux-clear');
  const btnNewCase = document.querySelector('#flux-new-case');
  const btnNewStep = document.querySelector('#flux-new-step');
  const btnEditCase = document.querySelector('#flux-edit-case');
  const formNovoCaso = document.querySelector('#form-novo-caso');
  const formNovaEtapa = document.querySelector('#form-nova-etapa');
  const selectEtapaCaso = document.querySelector('#etapa-caso-id');
  const selectEtapaRamoOrigem = document.querySelector('#etapa-ramo-origem');
  const inputEtapaRamo = document.querySelector('#etapa-ramo');
  const selectEditarEtapaRamoOrigem = document.querySelector('#editar-etapa-ramo-origem');
  const formEditarCaso = document.querySelector('#form-editar-caso');
  const formEditarEtapa = document.querySelector('#form-editar-etapa');

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

  btnNewCase?.addEventListener('click', abrirModalNovoCaso);
  btnNewStep?.addEventListener('click', abrirModalNovaEtapa);
  btnEditCase?.addEventListener('click', abrirModalEditarCaso);
  formNovoCaso?.addEventListener('submit', salvarNovoCaso);
  formNovaEtapa?.addEventListener('submit', salvarNovaEtapa);
  formEditarCaso?.addEventListener('submit', salvarEdicaoCaso);
  formEditarEtapa?.addEventListener('submit', salvarEdicaoEtapa);
  selectEtapaCaso?.addEventListener('change', () => {
    popularSelectOrigemRamo('#etapa-ramo-origem', casoRaizSelecionadoEmForm('#etapa-caso-id'));
    preencherSugestaoOrdemEtapa();
  });
  selectEtapaRamoOrigem?.addEventListener('change', () => {
    autoPreencherRamo('#etapa-ramo', '#etapa-ramo-origem', () => casoRaizSelecionadoEmForm('#etapa-caso-id'));
  });
  inputEtapaRamo?.addEventListener('input', preencherSugestaoOrdemEtapa);
  selectEditarEtapaRamoOrigem?.addEventListener('change', () => {
    autoPreencherRamo('#editar-etapa-ramo', '#editar-etapa-ramo-origem', () => casoRaizSelecionadoEmForm('#editar-etapa-caso-id'));
  });
  document.querySelectorAll('[data-close-modal="caso"]').forEach((btn) => btn.addEventListener('click', fecharModalNovoCaso));
  document.querySelectorAll('[data-close-modal="etapa"]').forEach((btn) => btn.addEventListener('click', fecharModalNovaEtapa));
  document.querySelectorAll('[data-close-modal="editar-caso"]').forEach((btn) => btn.addEventListener('click', fecharModalEditarCaso));
  document.querySelectorAll('[data-close-modal="editar-etapa"]').forEach((btn) => btn.addEventListener('click', fecharModalEditarEtapa));
  document.querySelectorAll('.edit-step').forEach((btn) => btn.addEventListener('click', () => abrirModalEditarEtapa(btn.dataset.etapaId)));
  document.querySelectorAll('.excluir-step').forEach((btn) => btn.addEventListener('click', () => excluirEtapa(btn.dataset.etapaId)));
  document.querySelectorAll('.ramificar-step').forEach((btn) => btn.addEventListener('click', () => {
    const registro = buscarRegistroEtapaPorId(btn.dataset.etapaId);
    if (registro) abrirModalNovaEtapaRamificacao(registro);
  }));

  document.querySelectorAll('.step-clickable').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      abrirDrawerEtapa(card.dataset.etapaId);
    });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      abrirDrawerEtapa(card.dataset.etapaId);
    });
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

carregarDadosFluxograma();
