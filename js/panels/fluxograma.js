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

function textoNormalizadoFluxo(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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
  const datas = rows
    .map((row) => dataOrdenavel(row.dataEtapa || row.dataEnvio || row.created_at))
    .filter(Boolean);

  if (datas.length === 0) return '';

  const dias = Math.max(0, Math.floor((Math.max(...datas) - Math.min(...datas)) / 86400000));
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
        <div class="hero-actions-row">
          <button type="button" class="btn" id="flux-new-case">+ Novo caso</button>
          <button type="button" class="btn" id="flux-new-step">+ Nova etapa</button>
        </div>
        <div class="hero-actions-row">
          <button type="button" class="btn ghost" id="flux-edit-case" ${registroCasoSelecionado(rows) ? '' : 'disabled'}>Editar caso</button>
          <button type="button" class="btn ghost" id="flux-duplicate-case" ${registroCasoSelecionado(rows) ? '' : 'disabled'}>Duplicar caso</button>
          <button type="button" class="btn ghost danger" id="flux-delete-case" ${registroCasoSelecionado(rows) ? '' : 'disabled'}>Excluir caso</button>
        </div>
        <div class="hero-actions-row">
          <button type="button" class="btn ghost" id="flux-copy">Copiar resumo</button>
          <button type="button" class="btn ghost" id="flux-clear">Limpar filtros</button>
        </div>
      </div>
    </section>
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

// Monta a lista única de eventos (etapas + suas tarefas) ordenada por data de envio.
function eventosDoHistorico(rows) {
  const filtradas = aplicarFiltros(rows);
  const eventos = [];

  filtradas.forEach((row) => {
    const etapaMs = dataOrdenavel(row.dataEnvio || row.dataEtapa) || Number.MAX_SAFE_INTEGER;
    eventos.push({ tipo: 'etapa', ms: etapaMs, etapaRow: row, row });

    const tarefas = typeof tarefasDaEtapa === 'function' ? tarefasDaEtapa(row.etapa_banco_id) : [];
    tarefas.forEach((tarefa) => {
      // Datas de tarefa vêm em ISO (yyyy-mm-dd) do banco; convertidas para o mesmo
      // formato BR das etapas antes de comparar, para que o mesmo dia do calendário
      // sempre produza o mesmo "ms" (senão o fuso horário faz eventos do mesmo dia
      // caírem em instantes diferentes e o desempate por tipo nunca dispara).
      const dataTarefaBr = isoToBrDate(tarefa.data_inicial) || isoToBrDate(tarefa.data_final);
      const tarefaMs = dataOrdenavel(dataTarefaBr) || Number.MAX_SAFE_INTEGER;
      eventos.push({ tipo: 'tarefa', ms: tarefaMs, tarefa, etapaRow: row });
    });
  });

  // Ordenação estritamente por data de envio. Empatando na mesma data, a etapa
  // vem antes das suas tarefas (e cada tarefa fica agrupada logo após a sua etapa).
  return eventos.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms;
    if (a.etapaRow !== b.etapaRow) {
      return (ordemNumero(a.etapaRow) - ordemNumero(b.etapaRow))
        || (Number(a.etapaRow.etapa_banco_id || 0) - Number(b.etapaRow.etapa_banco_id || 0));
    }
    if (a.tipo !== b.tipo) return a.tipo === 'etapa' ? -1 : 1;
    return Number(a.tarefa?.id || 0) - Number(b.tarefa?.id || 0);
  });
}

function tarefaStatusPill(tarefa) {
  const concluida = typeof tarefaFinalizada === 'function' && tarefaFinalizada(tarefa);
  const situacao = !concluida && typeof tarefaSituacaoLabel === 'function' ? tarefaSituacaoLabel(tarefa) : '';
  // Padroniza o rótulo: tarefa concluída também aparece como "Finalizado".
  const rotulo = concluida ? 'Finalizado' : valor(tarefa.status_tarefa, 'Pendente');
  return `<span class="pill ${concluida ? 'green' : 'orange'}">${esc(rotulo)}</span>${situacao ? `<span class="hist-sub">${esc(situacao)}</span>` : ''}`;
}

function linhaHistoricoEtapa(evento) {
  const row = evento.row;
  const temDoc = row.doc && /^https?:\/\//i.test(row.doc);
  const editavel = !!row.etapa_banco_id;
  const finalizada = /finaliz/i.test(String(row.statusEtapa || ''));
  return `
    <tr class="hist-row hist-etapa${editavel ? ' hist-clickable' : ''}"${editavel ? ` data-etapa-id="${esc(row.etapa_banco_id)}"` : ''}>
      <td class="hist-data">${esc(valor(row.dataEnvio || row.dataEtapa))}</td>
      <td class="hist-registro">
        <div class="hist-linha1"><span class="hist-badge">${esc(documento(row))}</span><strong>${esc(valor(row.etapa))}</strong></div>
        <span class="hist-caso">Caso ${esc(casoDaEtapa(row))}</span>
      </td>
      <td class="hist-detalhes">
        <p>${esc(valor(row.objeto))}</p>
        ${row.observacao ? `<p class="hist-sub">${esc(row.observacao)}</p>` : ''}
        ${row.sancao ? `<span class="hist-sancao">${esc(row.sancao)}</span>` : ''}
        ${temDoc ? `<a class="hist-anexo" href="${esc(row.doc)}" target="_blank" rel="noopener">📎 Ver anexo</a>` : ''}
      </td>
      <td class="hist-prazo">${esc(valor(row.prazoFinal))}</td>
      <td>${statusPill(row.statusEtapa)}</td>
      <td class="hist-acoes"><span class="hist-acoes-in">
        ${editavel ? `<button type="button" class="mini-action edit-step" data-etapa-id="${esc(row.etapa_banco_id)}">Editar</button>` : '<span class="muted small">Indisponível</span>'}
        ${editavel && !finalizada ? `<button type="button" class="mini-action finalizar-step" data-etapa-id="${esc(row.etapa_banco_id)}">Finalizar</button>` : ''}
        ${editavel ? `<button type="button" class="mini-action danger excluir-step" data-etapa-id="${esc(row.etapa_banco_id)}">Excluir</button>` : ''}
      </span></td>
    </tr>
  `;
}

function etapaEhPendenteAnresf(status) {
  return normStatus(status).includes('anresf');
}


function linhaHistoricoTarefa(evento) {
  const tarefa = evento.tarefa;
  const finalizada = typeof tarefaFinalizada === 'function' && tarefaFinalizada(tarefa);
  const etapaDrawerId = tarefa.etapa_id || evento.etapaRow.etapa_banco_id;
  return `
    <tr class="hist-row hist-tarefa hist-clickable" data-drawer-etapa-id="${esc(etapaDrawerId)}">
      <td class="hist-data">${esc(valor(isoToBrDate(tarefa.data_inicial)))}</td>
      <td class="hist-registro">
        <div class="hist-linha1"><span class="hist-badge tarefa">Tarefa</span><strong>${esc(valor(tarefa.responsavel, 'Sem responsável'))}</strong></div>
        <span class="hist-caso">de ${esc(valor(evento.etapaRow.etapa, 'etapa'))}</span>
      </td>
      <td class="hist-detalhes">
        <p>${esc(valor(tarefa.observacao))}</p>
        ${tarefa.conclusao ? `<p class="hist-sub">Conclusão: ${esc(tarefa.conclusao)}</p>` : ''}
        ${tarefa.anexo_url ? `<a class="hist-anexo" href="${esc(tarefa.anexo_url)}" target="_blank" rel="noopener">📎 Ver anexo</a>` : ''}
      </td>
      <td class="hist-prazo">${esc(valor(isoToBrDate(tarefa.data_final)))}</td>
      <td>${tarefaStatusPill(tarefa)}</td>
      <td class="hist-acoes"><span class="hist-acoes-in">
        ${finalizada ? '' : `<button type="button" class="mini-action edit-tarefa-hist" data-tarefa-id="${esc(tarefa.id)}">Editar</button>`}
        ${finalizada ? '' : `<button type="button" class="mini-action finalizar-tarefa-hist" data-tarefa-id="${esc(tarefa.id)}">Finalizar</button>`}
        <button type="button" class="mini-action danger excluir-tarefa-hist" data-tarefa-id="${esc(tarefa.id)}">Excluir</button>
      </span></td>
    </tr>
  `;
}

function renderHistorico(rows) {
  const eventos = eventosDoHistorico(rows);
  const linhas = eventos
    .map((evento) => (evento.tipo === 'etapa' ? linhaHistoricoEtapa(evento) : linhaHistoricoTarefa(evento)))
    .join('');

  return `
    <section class="card fluxo-card">
      <div class="card-head"><h3>Histórico do caso selecionado</h3><span class="muted">${eventos.length} registros · por data de envio</span></div>
      <div class="card-body table-wrap history-card">
        ${eventos.length === 0 ? '<div class="empty">Nenhum registro encontrado para os filtros selecionados.</div>' : `
          <table class="tbl hist-tbl">
            <thead>
              <tr><th>Data</th><th>Registro</th><th>Detalhes</th><th>Prazo</th><th>Status</th><th>Ações</th></tr>
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
            <label>Origem<input type="text" name="origem" list="lista-origens-casos" autocomplete="off" placeholder="Ex.: Denúncia, Solvência"></label>
            <label>Clube<input type="text" name="clube" required list="lista-clubes-casos" autocomplete="off"><span class="field-hint">Escolha uma sugestão ou digite um clube livremente.</span></label>
            <label id="novo-caso-denunciante-wrap" hidden>Denunciante<input type="text" name="denunciante" list="lista-clubes-casos" autocomplete="off" placeholder="Clube denunciante"><span class="field-hint">Preencha quando a origem do caso for Denúncia.</span></label>
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
            <label>Nome da etapa<input type="text" name="nome_etapa" required list="lista-etapas-padrao" autocomplete="off" placeholder="Selecione ou digite o nome da etapa"><span class="field-hint">Use os nomes padronizados (Auto de Infração/Acórdão - PSS ou PSO) para alimentar o painel de Sanções, ou digite um nome livre.</span></label>
            <label>Ordem<input type="number" name="ordem" id="etapa-ordem" min="1" required></label>
            <label>ID da etapa<input type="text" name="id_etapa" placeholder="Ex.: 001/2026"></label>
            <label>Data da etapa<input type="date" name="data_etapa"></label>
            <label>Prazo<input type="date" name="prazo"></label>
            <label>Status da etapa<select name="status_etapa" required><option value="Pendente ANRESF">Pendente ANRESF</option><option value="Pendente Clube">Pendente Clube</option><option value="Aguardando etapa anterior">Aguardando etapa anterior</option><option value="Finalizado">Finalizado</option></select></label>
            <label id="etapa-responsavel-wrap" class="field-under-status" hidden>Responsável<input type="text" name="responsavel" placeholder="Informe o responsável para constar em Prazos críticos"><span class="field-hint">Etapas Pendente ANRESF com responsável aparecem no painel Prazos críticos.</span></label>
            <label id="etapa-turma-wrap" hidden>Turma de julgamento<input type="text" name="turma" placeholder="Ex.: Turma 01"><span class="field-hint">Informe a Turma responsável pela decisão do acórdão.</span></label>
            <label>Ramifica a partir da etapa<select name="ramo_origem_id" id="etapa-ramo-origem"><option value="">Nenhuma (fluxo principal)</option></select><span class="field-hint">Escolha uma etapa para criar um fluxo paralelo (ramificação) a partir dela.</span></label>
            <label>Nome da ramificação<input type="text" name="ramo" id="etapa-ramo" placeholder="Preenchido automaticamente"><span class="field-hint">Preenchido ao escolher a etapa de origem. Pode personalizar (ex.: "Recurso").</span></label>
            <label class="full">Objeto<textarea name="objeto" rows="3"></textarea></label>
            <label class="full">Observação<textarea name="observacao" rows="3"></textarea></label>
            <label class="full">Sanção<textarea name="sancao" rows="2" placeholder="Deixe em branco se não houver sanção"></textarea></label>
            <label class="full">Anexo (PDF)<input type="file" name="anexo_pdf" accept="application/pdf" multiple><span class="field-hint">Pode selecionar vários PDFs — eles viram um único .zip para download.</span></label>
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
            <label>Nome da etapa<input type="text" name="nome_etapa" required list="lista-etapas-padrao" autocomplete="off"><span class="field-hint">Use os nomes padronizados (Auto de Infração/Acórdão - PSS ou PSO) para alimentar o painel de Sanções, ou digite um nome livre.</span></label>
            <label>Ordem<input type="number" name="ordem" min="1" required></label>
            <label>ID da etapa<input type="text" name="id_etapa"></label>
            <label>Data da etapa<input type="date" name="data_etapa"></label>
            <label>Prazo<input type="date" name="prazo"></label>
            <label>Status da etapa<select name="status_etapa" required><option value="Pendente ANRESF">Pendente ANRESF</option><option value="Pendente Clube">Pendente Clube</option><option value="Aguardando etapa anterior">Aguardando etapa anterior</option><option value="Finalizado">Finalizado</option></select></label>
            <label id="editar-etapa-responsavel-wrap" class="field-under-status" hidden>Responsável<input type="text" name="responsavel" placeholder="Informe o responsável para constar em Prazos críticos"><span class="field-hint">Etapas Pendente ANRESF com responsável aparecem no painel Prazos críticos.</span></label>
            <label id="editar-etapa-turma-wrap" hidden>Turma de julgamento<input type="text" name="turma" placeholder="Ex.: Turma 01"><span class="field-hint">Informe a Turma responsável pela decisão do acórdão.</span></label>
            <label>Ramifica a partir da etapa<select name="ramo_origem_id" id="editar-etapa-ramo-origem"><option value="">Nenhuma (fluxo principal)</option></select><span class="field-hint">Escolha uma etapa para criar um fluxo paralelo (ramificação) a partir dela.</span></label>
            <label>Nome da ramificação<input type="text" name="ramo" id="editar-etapa-ramo" placeholder="Preenchido automaticamente"><span class="field-hint">Preenchido ao escolher a etapa de origem. Pode personalizar (ex.: "Recurso").</span></label>
            <label class="full">Objeto<textarea name="objeto" rows="3"></textarea></label>
            <label class="full">Observação<textarea name="observacao" rows="3"></textarea></label>
            <label class="full">Sanção<textarea name="sancao" rows="2" placeholder="Deixe em branco se não houver sanção"></textarea></label>
            <label class="full">Anexo (PDF)<input type="file" name="anexo_pdf" accept="application/pdf" multiple><span class="field-hint">Pode selecionar vários PDFs — eles viram um único .zip para download.</span><span class="field-hint" id="editar-etapa-anexo-atual"></span></label>
          </div>
          <div class="modal-feedback" id="feedback-editar-etapa"></div>
          <div class="modal-actions"><button type="button" class="btn ghost" data-close-modal="editar-etapa">Cancelar</button><button type="submit" class="btn">Salvar</button></div>
        </form>
      </div>
    </div>

    ${renderDatalistOrigens('lista-origens-casos')}
    ${renderDatalistClubes('lista-clubes-casos')}
    ${renderDatalistEtapasPadrao('lista-etapas-padrao')}
  `;
}


function origensDisponiveisFluxograma() {
  const origens = ['Denúncia'];
  (Array.isArray(dadosFluxograma) ? dadosFluxograma : []).forEach((row) => {
    if (row.origem) origens.push(row.origem);
  });
  (Array.isArray(casosDisponiveis) ? casosDisponiveis : []).forEach((caso) => {
    if (caso.origem) origens.push(caso.origem);
  });
  return Array.from(new Set(origens.map((origem) => String(origem).trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function renderDatalistOrigens(id) {
  return `<datalist id="${esc(id)}">${origensDisponiveisFluxograma().map((origem) => `<option value="${esc(origem)}"></option>`).join('')}</datalist>`;
}

function atualizarDatalistOrigensNovoCaso() {
  const datalist = document.querySelector('#lista-origens-casos');
  if (!datalist) return;
  datalist.innerHTML = origensDisponiveisFluxograma().map((origem) => `<option value="${esc(origem)}"></option>`).join('');
}

function clubesDisponiveisFluxograma() {
  const clubes = [];
  (Array.isArray(dadosFluxograma) ? dadosFluxograma : []).forEach((row) => {
    if (row.clube) clubes.push(row.clube);
  });
  (Array.isArray(casosDisponiveis) ? casosDisponiveis : []).forEach((caso) => {
    if (caso.clube) clubes.push(caso.clube);
  });
  return Array.from(new Set(clubes.map((clube) => String(clube).trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function renderDatalistClubes(id) {
  return `<datalist id="${esc(id)}">${clubesDisponiveisFluxograma().map((clube) => `<option value="${esc(clube)}"></option>`).join('')}</datalist>`;
}

function atualizarDatalistClubesNovoCaso() {
  const datalist = document.querySelector('#lista-clubes-casos');
  if (!datalist) return;
  datalist.innerHTML = clubesDisponiveisFluxograma().map((clube) => `<option value="${esc(clube)}"></option>`).join('');
}

function proximoNumeroCasoDisponivel() {
  const numeros = [];
  (Array.isArray(casosDisponiveis) ? casosDisponiveis : []).forEach((caso) => {
    const numero = Number(caso.numero_caso || caso.casoRaiz || caso.caso_raiz);
    if (Number.isFinite(numero)) numeros.push(numero);
  });
  (Array.isArray(dadosFluxograma) ? dadosFluxograma : []).forEach((row) => {
    const numero = Number(row.numero_caso || row.casoRaiz || numeroCaso(row));
    if (Number.isFinite(numero)) numeros.push(numero);
  });
  if (numeros.length === 0) return '';
  return String(Math.max(...numeros) + 1);
}

function casoEhDenuncia(origem) {
  return textoNormalizadoFluxo(origem) === 'denuncia';
}

function atualizarCampoDenuncianteNovoCaso() {
  const form = document.querySelector('#form-novo-caso');
  const wrap = document.querySelector('#novo-caso-denunciante-wrap');
  if (!form || !wrap) return;
  const mostrar = casoEhDenuncia(form.origem.value);
  wrap.hidden = !mostrar;
  if (!mostrar && form.denunciante) form.denunciante.value = '';
}

async function prepararFormularioNovoCaso() {
  const form = document.querySelector('#form-novo-caso');
  if (!form) return;

  try {
    await carregarCasosParaSelectEtapa();
  } catch (erro) {
    console.warn('Não foi possível carregar casos para sugerir o número do novo caso.', erro);
  }

  atualizarDatalistOrigensNovoCaso();
  atualizarDatalistClubesNovoCaso();
  form.numero_caso.value = proximoNumeroCasoDisponivel();
  atualizarCampoDenuncianteNovoCaso();
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

async function abrirModalNovoCaso() {
  const modal = document.querySelector('#modal-novo-caso');
  modal?.removeAttribute('hidden');
  mostrarFeedbackModal('#feedback-novo-caso', '', '');
  await prepararFormularioNovoCaso();
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
  atualizarCampoTurma('#form-nova-etapa', '#etapa-turma-wrap');
  atualizarCampoResponsavelEtapa('#form-nova-etapa', '#etapa-responsavel-wrap');
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

// Próximo ID sugerido para uma etapa: sequência por TIPO de etapa e por ANO,
// no formato NNN/AAAA (ex.: 001/2026). Quando o ano vira, recomeça em 001.
function proximoIdEtapa(nomeEtapa) {
  const nome = String(nomeEtapa || '').trim().toLowerCase();
  if (!nome) return '';
  const ano = new Date().getFullYear();
  const rows = Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  let maior = 0;
  rows.forEach((row) => {
    if (String(row.etapa || '').trim().toLowerCase() !== nome) return;
    if (row.semId || !row.id) return;
    const m = String(row.id).match(/^\s*(\d+)\s*\/\s*(\d{4})\s*$/);
    if (!m || Number(m[2]) !== ano) return;
    maior = Math.max(maior, Number(m[1]));
  });
  return `${String(maior + 1).padStart(3, '0')}/${ano}`;
}

// Preenche o ID sugerido no formulário de nova etapa quando o nome é escolhido.
// Não sobrescreve um ID que o usuário tenha digitado manualmente.
function preencherSugestaoIdEtapa() {
  const form = document.querySelector('#form-nova-etapa');
  const inputId = form?.id_etapa;
  const nome = form?.nome_etapa?.value;
  if (!inputId || !nome) return;
  if (inputId.value.trim() && inputId.dataset.sugerido !== '1') return;
  const sugestao = proximoIdEtapa(nome);
  inputId.value = sugestao;
  inputId.dataset.sugerido = sugestao ? '1' : '';
}

function etapaEhAcordao(nomeEtapa) {
  return normStatus(nomeEtapa).includes('acordao');
}

function atualizarCampoTurma(formId, wrapId) {
  const form = document.querySelector(formId);
  const wrap = document.querySelector(wrapId);
  if (!form || !wrap) return;

  const mostrar = etapaEhAcordao(form.nome_etapa.value);
  wrap.hidden = !mostrar;
  if (!mostrar) form.turma.value = '';
}

function atualizarCampoResponsavelEtapa(formId, wrapId) {
  const form = document.querySelector(formId);
  const wrap = document.querySelector(wrapId);
  if (!form || !wrap) return;

  const mostrar = etapaEhPendenteAnresf(form.status_etapa.value);
  wrap.hidden = !mostrar;
  if (!mostrar && form.responsavel) form.responsavel.value = '';
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
  const origem = form.origem.value.trim();
  const denunciante = casoEhDenuncia(origem) ? form.denunciante.value.trim() : '';

  if (!numero || !Number.isFinite(numero)) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Número do caso é obrigatório e deve ser numérico.');
  if (!clube) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Clube é obrigatório.');
  if (casoEhDenuncia(origem) && !denunciante) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Denunciante é obrigatório para casos de Denúncia.');
  if (!status) return mostrarFeedbackModal('#feedback-novo-caso', 'erro', 'Status do caso é obrigatório.');

  try {
    const payload = {
      acao: 'criar',
      numero_caso: numero,
      origem,
      clube,
      serie: form.serie.value,
      status_caso: status,
    };
    if (casoEhDenuncia(origem)) payload.denunciante = denunciante;

    const resposta = await fetch('/api/casos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

async function enviarAnexoEtapa(inputArquivo) {
  const arquivos = Array.from(inputArquivo?.files || []);
  if (arquivos.length === 0) return null;

  if (arquivos.some((arquivo) => arquivo.type !== 'application/pdf')) {
    throw new Error('Todos os anexos devem ser arquivos PDF.');
  }

  const prep = await prepararArquivoAnexo(arquivos, 'documentos-etapa');
  return enviarArquivoParaStorage(prep);
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
    const qtdAnexos = form.anexo_pdf?.files?.length || 0;
    if (qtdAnexos > 0) mostrarFeedbackModal('#feedback-nova-etapa', '', `Enviando ${plural(qtdAnexos, 'anexo', 'anexos')}…`);
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
        turma: etapaEhAcordao(nomeEtapa) ? form.turma.value.trim() || null : null,
        responsavel: etapaEhPendenteAnresf(statusEtapa) ? form.responsavel.value.trim() || null : null,
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
    console.error('Erro ao criar etapa:', erro);
    mostrarFeedbackModal('#feedback-nova-etapa', 'erro', erro.message || 'Erro ao criar etapa.');
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

async function duplicarCasoSelecionado() {
  const rows = linhasDoCasoSelecionado();
  const registro = registroCasoSelecionado(rows);
  if (!registro) {
    mostrarMensagemFluxograma('erro', 'Este caso não possui identificador de banco para duplicação.');
    return;
  }

  const numeroOriginal = registro.numero_caso || registro.casoRaiz || '';
  if (!window.confirm(`Duplicar o caso ${numeroOriginal} (${registro.clube || ''})?\n\nSerá criado um novo caso com todas as etapas e tarefas copiadas.`)) return;

  const botao = document.querySelector('#flux-duplicate-case');
  const textoOriginal = botao ? botao.textContent : '';
  if (botao) { botao.disabled = true; botao.textContent = 'Duplicando…'; }

  try {
    const resposta = await fetch('/api/casos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'duplicar', id: Number(registro.caso_banco_id) }),
    });
    const dados = await tratarRespostaApi(resposta, 'Erro ao duplicar o caso.');

    await carregarCasosParaSelectEtapa();
    await recarregarFluxograma(dados?.numero_caso);
    mostrarMensagemFluxograma('sucesso', `Caso duplicado como nº ${dados?.numero_caso} · ${plural(dados?.etapas || 0, 'etapa', 'etapas')} e ${plural(dados?.tarefas || 0, 'tarefa', 'tarefas')} copiadas.`);
  } catch (erro) {
    console.error('Erro ao duplicar caso:', erro);
    mostrarMensagemFluxograma('erro', erro.message || 'Erro ao duplicar o caso.');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = textoOriginal; }
  }
}

async function excluirCasoSelecionado() {
  const rows = linhasDoCasoSelecionado();
  const registro = registroCasoSelecionado(rows);
  if (!registro) {
    mostrarMensagemFluxograma('erro', 'Este caso não possui identificador de banco para exclusão.');
    return;
  }

  const numeroOriginal = registro.numero_caso || registro.casoRaiz || '';
  const qtdEtapas = rows.filter((row) => row.etapa_banco_id).length;
  if (!window.confirm(`Excluir o caso ${numeroOriginal} (${registro.clube || ''})?\n\nSerão apagadas ${plural(qtdEtapas, 'etapa', 'etapas')} e todas as suas tarefas. Esta ação não pode ser desfeita.`)) return;

  const botao = document.querySelector('#flux-delete-case');
  const textoOriginal = botao ? botao.textContent : '';
  if (botao) { botao.disabled = true; botao.textContent = 'Excluindo…'; }

  try {
    const resposta = await fetch('/api/casos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir', id: Number(registro.caso_banco_id) }),
    });
    await tratarRespostaApi(resposta, 'Erro ao excluir o caso.');

    casoSelecionado = '';
    await carregarCasosParaSelectEtapa();
    await recarregarFluxograma();
    mostrarMensagemFluxograma('sucesso', `Caso ${numeroOriginal} excluído.`);
  } catch (erro) {
    console.error('Erro ao excluir caso:', erro);
    mostrarMensagemFluxograma('erro', erro.message || 'Erro ao excluir o caso.');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = textoOriginal; }
  }
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
  form.turma.value = registro.turma || '';
  form.ramo.value = registro.ramo || '';
  form.ramo_origem_id.value = registro.ramo_origem_id || '';
  form.status_etapa.value = registro.statusEtapa || 'Pendente ANRESF';
  form.responsavel.value = registro.responsavel || '';
  atualizarCampoTurma('#form-editar-etapa', '#editar-etapa-turma-wrap');
  atualizarCampoResponsavelEtapa('#form-editar-etapa', '#editar-etapa-responsavel-wrap');

  form.dataset.docAtual = registro.doc || '';
  form.dataset.removerAnexo = '';
  atualizarHintAnexoEtapa();
}

// Mostra o anexo atual da etapa em edição, com opção de remover / desfazer.
function atualizarHintAnexoEtapa() {
  const hint = document.querySelector('#editar-etapa-anexo-atual');
  const form = document.querySelector('#form-editar-etapa');
  if (!hint || !form) return;
  const doc = form.dataset.docAtual || '';
  if (!doc) { hint.innerHTML = 'Nenhum anexo enviado ainda.'; return; }
  if (form.dataset.removerAnexo === '1') {
    hint.innerHTML = 'Anexo será removido ao salvar. <button type="button" class="link-btn" data-desfazer-anexo>Desfazer</button>';
  } else {
    hint.innerHTML = `<a href="${esc(doc)}" target="_blank" rel="noopener">Ver anexo atual</a> — envie outro para substituir ou <button type="button" class="link-btn danger" data-remover-anexo>✕ remover</button>.`;
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

async function finalizarEtapa(etapaBancoId) {
  const id = Number(etapaBancoId);
  if (!id || !Number.isFinite(id)) return;
  const registro = buscarRegistroEtapaPorId(etapaBancoId);
  const nomeEtapa = registro?.etapa || 'esta etapa';

  if (!window.confirm(`Finalizar "${nomeEtapa}"? O status passará para "Finalizado".`)) return;

  try {
    const resposta = await fetch('/api/etapas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'editar', id, status_etapa: 'Finalizado' }),
    });
    await tratarRespostaApi(resposta, 'Erro ao finalizar etapa.');
    await recarregarFluxograma(casoSelecionado);
    mostrarMensagemFluxograma('sucesso', 'Etapa finalizada.');
  } catch (erro) {
    console.error('Erro ao finalizar etapa:', erro);
    mostrarMensagemFluxograma('erro', erro.message || 'Erro ao finalizar etapa.');
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
    const qtdAnexos = form.anexo_pdf?.files?.length || 0;
    if (qtdAnexos > 0) mostrarFeedbackModal('#feedback-editar-etapa', '', `Enviando ${plural(qtdAnexos, 'anexo', 'anexos')}…`);
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
      turma: etapaEhAcordao(nomeEtapa) ? form.turma.value.trim() || null : null,
      responsavel: etapaEhPendenteAnresf(statusEtapa) ? form.responsavel.value.trim() || null : null,
      ramo: form.ramo.value.trim(),
      ramo_origem_id: form.ramo_origem_id.value ? Number(form.ramo_origem_id.value) : null,
      status_etapa: statusEtapa,
    };
    if (urlAnexo) payload.doc = urlAnexo;
    else if (form.dataset.removerAnexo === '1') payload.doc = null;

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
    console.error('Erro ao editar etapa:', erro);
    mostrarFeedbackModal('#feedback-editar-etapa', 'erro', erro.message || 'Erro ao editar etapa.');
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
  const btnDuplicateCase = document.querySelector('#flux-duplicate-case');
  const btnDeleteCase = document.querySelector('#flux-delete-case');
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
  btnDuplicateCase?.addEventListener('click', duplicarCasoSelecionado);
  btnDeleteCase?.addEventListener('click', excluirCasoSelecionado);
  formNovoCaso?.addEventListener('submit', salvarNovoCaso);
  formNovoCaso?.origem?.addEventListener('input', atualizarCampoDenuncianteNovoCaso);
  formNovoCaso?.origem?.addEventListener('change', atualizarCampoDenuncianteNovoCaso);
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
  formNovaEtapa?.nome_etapa?.addEventListener('input', () => { atualizarCampoTurma('#form-nova-etapa', '#etapa-turma-wrap'); preencherSugestaoIdEtapa(); });
  formNovaEtapa?.status_etapa?.addEventListener('change', () => atualizarCampoResponsavelEtapa('#form-nova-etapa', '#etapa-responsavel-wrap'));
  formNovaEtapa?.id_etapa?.addEventListener('input', (event) => { event.target.dataset.sugerido = ''; });
  formEditarEtapa?.nome_etapa?.addEventListener('input', () => atualizarCampoTurma('#form-editar-etapa', '#editar-etapa-turma-wrap'));
  formEditarEtapa?.status_etapa?.addEventListener('change', () => atualizarCampoResponsavelEtapa('#form-editar-etapa', '#editar-etapa-responsavel-wrap'));
  document.querySelector('#editar-etapa-anexo-atual')?.addEventListener('click', (event) => {
    const form = document.querySelector('#form-editar-etapa');
    if (!form) return;
    if (event.target.closest('[data-remover-anexo]')) { form.dataset.removerAnexo = '1'; atualizarHintAnexoEtapa(); }
    else if (event.target.closest('[data-desfazer-anexo]')) { form.dataset.removerAnexo = ''; atualizarHintAnexoEtapa(); }
  });
  selectEditarEtapaRamoOrigem?.addEventListener('change', () => {
    autoPreencherRamo('#editar-etapa-ramo', '#editar-etapa-ramo-origem', () => casoRaizSelecionadoEmForm('#editar-etapa-caso-id'));
  });
  document.querySelectorAll('[data-close-modal="caso"]').forEach((btn) => btn.addEventListener('click', fecharModalNovoCaso));
  document.querySelectorAll('[data-close-modal="etapa"]').forEach((btn) => btn.addEventListener('click', fecharModalNovaEtapa));
  document.querySelectorAll('[data-close-modal="editar-caso"]').forEach((btn) => btn.addEventListener('click', fecharModalEditarCaso));
  document.querySelectorAll('[data-close-modal="editar-etapa"]').forEach((btn) => btn.addEventListener('click', fecharModalEditarEtapa));
  document.querySelectorAll('.edit-step').forEach((btn) => btn.addEventListener('click', () => abrirModalEditarEtapa(btn.dataset.etapaId)));
  document.querySelectorAll('.excluir-step').forEach((btn) => btn.addEventListener('click', () => excluirEtapa(btn.dataset.etapaId)));

  document.querySelectorAll('.abrir-tarefas').forEach((btn) => btn.addEventListener('click', () => {
    if (typeof abrirDrawerEtapa === 'function') abrirDrawerEtapa(btn.dataset.etapaId);
  }));

  // Ações do histórico: etapa (Finalizar) e tarefa (Editar/Finalizar/Excluir).
  document.querySelectorAll('.finalizar-step').forEach((btn) => btn.addEventListener('click', () => finalizarEtapa(btn.dataset.etapaId)));
  document.querySelectorAll('.edit-tarefa-hist').forEach((btn) => btn.addEventListener('click', () => {
    if (typeof abrirModalEditarTarefa === 'function') abrirModalEditarTarefa(Number(btn.dataset.tarefaId));
  }));
  document.querySelectorAll('.finalizar-tarefa-hist').forEach((btn) => btn.addEventListener('click', () => {
    if (typeof abrirModalConclusaoTarefa === 'function') abrirModalConclusaoTarefa(Number(btn.dataset.tarefaId));
  }));
  document.querySelectorAll('.excluir-tarefa-hist').forEach((btn) => btn.addEventListener('click', () => {
    if (typeof excluirTarefaDrawer === 'function') excluirTarefaDrawer(Number(btn.dataset.tarefaId));
  }));


  // Linha do histórico clicável: etapa abre a edição; tarefa abre o drawer
  // lateral da etapa em que ela está (com a tarefa listada lá dentro).
  document.querySelectorAll('.hist-row.hist-clickable').forEach((linha) => {
    linha.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      if (linha.dataset.drawerEtapaId && typeof abrirDrawerEtapa === 'function') abrirDrawerEtapa(linha.dataset.drawerEtapaId);
      else if (linha.dataset.etapaId) abrirModalEditarEtapa(linha.dataset.etapaId);
    });
  });

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
