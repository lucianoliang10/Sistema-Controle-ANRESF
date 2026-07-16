async function carregarDadosTarefas() {
  try {
    const resposta = await fetch('/api/tarefas');
    if (!resposta.ok) throw new Error('Falha ao buscar tarefas.');
    const dados = await resposta.json();
    dadosTarefas = Array.isArray(dados) ? dados : [];
  } catch (erro) {
    console.warn('Não foi possível carregar tarefas.', erro);
    dadosTarefas = [];
  }

  atualizarDrawerSeAberto();
  if (document.querySelector('#prazos')?.classList.contains('active-panel') && typeof renderPrazos === 'function') {
    renderPrazos();
  }
  // Reflete as tarefas no histórico do Fluxograma (sub-linhas por etapa).
  if (typeof renderizarFluxograma === 'function' && Array.isArray(dadosFluxograma) && dadosFluxograma.length > 0) {
    renderizarFluxograma();
  }
}

async function garantirDadosTarefasCarregados() {
  if (Array.isArray(dadosTarefas) && dadosTarefas.length > 0) return;
  await carregarDadosTarefas();
}

async function recarregarTarefas() {
  await carregarDadosTarefas();
}

function tarefaHojeLocal() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

function tarefaParseData(dataIso) {
  if (!dataIso) return null;
  const partes = String(dataIso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!partes) return null;
  return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
}

function tarefaDiasRestantes(dataFinal) {
  const data = tarefaParseData(dataFinal);
  if (!data) return null;
  return Math.round((data.getTime() - tarefaHojeLocal().getTime()) / 86400000);
}

function tarefaFinalizada(tarefa) {
  return normStatus(tarefa.status_tarefa) === 'concluida';
}

function tarefaSituacao(tarefa) {
  if (tarefaFinalizada(tarefa)) return 'concluida';
  const dias = tarefaDiasRestantes(tarefa.data_final);
  if (!Number.isFinite(dias)) return 'no-date';
  if (dias < 0) return 'overdue';
  if (dias === 0) return 'today';
  if (dias <= 3) return 'soon3';
  if (dias <= 7) return 'soon7';
  return 'future';
}

function tarefaSituacaoLabel(tarefa) {
  if (tarefaFinalizada(tarefa)) return 'Concluída';
  const dias = tarefaDiasRestantes(tarefa.data_final);
  if (!Number.isFinite(dias)) return 'sem prazo';
  if (dias < 0) return `${Math.abs(dias)}d em atraso`;
  if (dias === 0) return 'vence hoje';
  return `faltam ${dias}d`;
}

function tarefasDaEtapa(etapaBancoId) {
  return (Array.isArray(dadosTarefas) ? dadosTarefas : [])
    .filter((tarefa) => String(tarefa.etapa_id) === String(etapaBancoId));
}


function tarefaPorId(id) {
  return (Array.isArray(dadosTarefas) ? dadosTarefas : []).find((tarefa) => String(tarefa.id) === String(id));
}

async function enviarAnexoTarefa(fileList) {
  const prep = await prepararArquivoAnexo(fileList, 'anexos-tarefa');
  if (!prep) return {};
  const url = await enviarArquivoParaStorage(prep);
  return { anexo_url: url, anexo_nome: prep.nome };
}

function abrirDrawerEtapa(etapaBancoId) {
  if (!etapaBancoId) return;
  etapaDrawerAberta = String(etapaBancoId);
  const drawer = document.querySelector('#drawer-etapa');
  drawer?.classList.add('aberto');
  drawer?.setAttribute('aria-hidden', 'false');
  renderizarDrawerEtapa();
  garantirDadosTarefasCarregados().then(renderizarDrawerEtapa);
}

function fecharDrawerEtapa() {
  etapaDrawerAberta = null;
  const drawer = document.querySelector('#drawer-etapa');
  drawer?.classList.remove('aberto');
  drawer?.setAttribute('aria-hidden', 'true');
}

function atualizarDrawerSeAberto() {
  if (etapaDrawerAberta) renderizarDrawerEtapa();
}

function mostrarFeedbackDrawer(tipo, texto) {
  const el = document.querySelector('#feedback-nova-tarefa');
  if (!el) return;
  el.className = `drawer-form-feedback ${tipo}`;
  el.textContent = texto || '';
}

function tarefaCard(tarefa) {
  const situacao = tarefaSituacao(tarefa);
  const finalizada = tarefaFinalizada(tarefa);

  return `
    <article class="tarefa-item ${situacao}">
      <div class="tarefa-top">
        <span class="deadline-badge ${situacao}">${esc(tarefaSituacaoLabel(tarefa))}</span>
        <span class="tarefa-actions">
          <button type="button" class="mini-action" data-tarefa-toggle="${esc(tarefa.id)}" data-novo-status="${finalizada ? 'Pendente' : 'Concluída'}">${finalizada ? 'Reabrir' : 'Concluir'}</button>
          ${!finalizada ? `<button type="button" class="mini-action" data-tarefa-editar="${esc(tarefa.id)}">Editar</button>` : ''}
          <button type="button" class="mini-action danger" data-tarefa-excluir="${esc(tarefa.id)}">Excluir</button>
        </span>
      </div>
      <div class="tarefa-datas">
        <div><span>Início</span><strong>${esc(valor(isoToBrDate(tarefa.data_inicial)))}</strong></div>
        <div><span>Prazo final</span><strong>${esc(valor(isoToBrDate(tarefa.data_final)))}</strong></div>
        <div><span>Responsável</span><strong>${esc(valor(tarefa.responsavel))}</strong></div>
      </div>
      ${tarefa.observacao ? `<p class="tarefa-obs"><span>Observação</span>${esc(tarefa.observacao)}</p>` : ''}
      ${tarefa.anexo_url ? `<a class="tarefa-anexo" href="${esc(tarefa.anexo_url)}" target="_blank" rel="noopener">📎 ${esc(tarefa.anexo_nome || 'Abrir anexo')}</a>` : ''}
      ${tarefa.conclusao ? `<p class="tarefa-obs conclusao"><span>Conclusão</span>${esc(tarefa.conclusao)}</p>` : ''}
    </article>
  `;
}

function renderizarDrawerEtapa() {
  const container = document.querySelector('#drawer-etapa-conteudo');
  if (!container || !etapaDrawerAberta) return;

  const registro = typeof buscarRegistroEtapaPorId === 'function' ? buscarRegistroEtapaPorId(etapaDrawerAberta) : null;
  const tarefas = tarefasDaEtapa(etapaDrawerAberta).sort((a, b) => {
    const dataA = tarefaParseData(a.data_final)?.getTime() ?? Infinity;
    const dataB = tarefaParseData(b.data_final)?.getTime() ?? Infinity;
    return dataA - dataB;
  });
  const abertas = tarefas.filter((tarefa) => !tarefaFinalizada(tarefa));
  const finalizadas = tarefas.filter(tarefaFinalizada);

  container.innerHTML = `
    <div class="drawer-head">
      <div>
        <p class="eyebrow">Tarefas da etapa</p>
        <h3 id="drawer-etapa-titulo">${esc(valor(registro?.etapa, 'Etapa'))}</h3>
        <p class="muted">${esc(tituloCaso(numeroCasoFluxograma(registro || {})))} · ${esc(valor(registro?.clube))}</p>
      </div>
      <button type="button" class="icon-btn" id="drawer-etapa-fechar" aria-label="Fechar">×</button>
    </div>

    <form id="form-nova-tarefa" class="drawer-form">
      <div class="drawer-form-grid">
        <label>Data inicial<input type="date" name="data_inicial"></label>
        <label>Data final<input type="date" name="data_final"></label>
        <label class="full">Responsável<input type="text" name="responsavel" required placeholder="Ex.: Clube, ANRESF, fulano..."></label>
        <label class="full">Observação<textarea name="observacao" rows="2"></textarea></label>
        <label class="full">Anexo<input type="file" name="anexo" multiple><span class="drawer-hint">Pode selecionar vários — viram um único .zip.</span></label>
      </div>
      <div class="drawer-form-feedback" id="feedback-nova-tarefa"></div>
      <button type="submit" class="btn">+ Adicionar tarefa</button>
    </form>

    <div class="drawer-section">
      <h4>Em aberto (${abertas.length})</h4>
      <div class="tarefa-list">
        ${abertas.length ? abertas.map(tarefaCard).join('') : '<div class="empty">Nenhuma tarefa em aberto.</div>'}
      </div>
    </div>

    <div class="drawer-section">
      <h4>Finalizadas (${finalizadas.length})</h4>
      <div class="tarefa-list">
        ${finalizadas.length ? finalizadas.map(tarefaCard).join('') : '<div class="empty">Nenhuma tarefa finalizada.</div>'}
      </div>
    </div>
  `;

  conectarControlesDrawerEtapa();
}

function conectarControlesDrawerEtapa() {
  document.querySelector('#drawer-etapa-fechar')?.addEventListener('click', fecharDrawerEtapa);
  document.querySelector('#form-nova-tarefa')?.addEventListener('submit', salvarNovaTarefa);
  document.querySelectorAll('[data-tarefa-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => alternarStatusTarefa(btn.dataset.tarefaToggle, btn.dataset.novoStatus));
  });
  document.querySelectorAll('[data-tarefa-editar]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalEditarTarefa(btn.dataset.tarefaEditar));
  });
  document.querySelectorAll('[data-tarefa-excluir]').forEach((btn) => {
    btn.addEventListener('click', () => excluirTarefaDrawer(btn.dataset.tarefaExcluir));
  });
}

async function salvarNovaTarefa(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const responsavel = form.responsavel.value.trim();

  if (!etapaDrawerAberta) return;
  if (!responsavel) return mostrarFeedbackDrawer('erro', 'Responsável é obrigatório.');

  try {
    const qtdAnexos = form.anexo?.files?.length || 0;
    if (qtdAnexos > 0) mostrarFeedbackDrawer('', `Enviando ${plural(qtdAnexos, 'anexo', 'anexos')}…`);
    const anexo = await enviarAnexoTarefa(form.anexo.files);
    const resposta = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao: 'criar',
        etapa_id: Number(etapaDrawerAberta),
        data_inicial: form.data_inicial.value || null,
        data_final: form.data_final.value || null,
        observacao: form.observacao.value.trim(),
        responsavel,
        ...anexo,
      }),
    });
    await tratarRespostaApi(resposta, 'Erro ao criar tarefa.');
    form.reset();
    await recarregarTarefas();
    mostrarFeedbackDrawer('sucesso', 'Tarefa criada com sucesso.');
  } catch (erro) {
    console.error('Erro ao criar tarefa:', erro);
    mostrarFeedbackDrawer('erro', erro.message || 'Erro ao criar tarefa.');
  }
}

async function alternarStatusTarefa(id, novoStatus) {
  if (novoStatus === 'Concluída') return abrirModalConclusaoTarefa(id);

  try {
    const resposta = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'editar', id: Number(id), status_tarefa: novoStatus, conclusao: null }),
    });
    await tratarRespostaApi(resposta, 'Erro ao atualizar tarefa.');
    await recarregarTarefas();
  } catch (erro) {
    mostrarFeedbackDrawer('erro', erro.message);
  }
}

function fecharModalTarefa() {
  document.querySelector('#modal-tarefa')?.remove();
}

function renderizarModalTarefa({ titulo, botao, tarefa, modo }) {
  fecharModalTarefa();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tarefa-modal" id="modal-tarefa" role="dialog" aria-modal="true">
      <div class="tarefa-modal-card">
        <button type="button" class="icon-btn tarefa-modal-close" aria-label="Fechar">×</button>
        <h3>${esc(titulo)}</h3>
        <form id="form-modal-tarefa" class="drawer-form-grid">
          ${modo === 'editar' ? `
            <label>Data inicial<input type="date" name="data_inicial" value="${esc(tarefa.data_inicial || '')}"></label>
            <label>Data final<input type="date" name="data_final" value="${esc(tarefa.data_final || '')}"></label>
            <label class="full">Responsável<input type="text" name="responsavel" required value="${esc(tarefa.responsavel || '')}"></label>
            <label class="full">Observação<textarea name="observacao" rows="3">${esc(tarefa.observacao || '')}</textarea></label>
            <label class="full">Substituir anexo<input type="file" name="anexo" multiple><span class="drawer-hint">Pode selecionar vários — viram um único .zip.</span></label>
          ` : `
            <label class="full">Conclusão da tarefa<textarea name="conclusao" rows="5" required placeholder="Descreva como a tarefa foi concluída...">${esc(tarefa.conclusao || '')}</textarea></label>
          `}
          <div class="drawer-form-feedback full" id="feedback-modal-tarefa"></div>
          <div class="tarefa-modal-actions full">
            <button type="button" class="mini-action" data-modal-cancelar>Cancelar</button>
            <button type="submit" class="btn">${esc(botao)}</button>
          </div>
        </form>
      </div>
    </div>
  `);
  document.querySelector('#modal-tarefa .tarefa-modal-close')?.addEventListener('click', fecharModalTarefa);
  document.querySelector('#modal-tarefa [data-modal-cancelar]')?.addEventListener('click', fecharModalTarefa);
}

function abrirModalConclusaoTarefa(id) {
  const tarefa = tarefaPorId(id);
  if (!tarefa) return;
  renderizarModalTarefa({ titulo: 'Concluir tarefa', botao: 'Salvar conclusão', tarefa, modo: 'concluir' });
  document.querySelector('#form-modal-tarefa')?.addEventListener('submit', (event) => salvarConclusaoTarefa(event, id));
}

function abrirModalEditarTarefa(id) {
  const tarefa = tarefaPorId(id);
  if (!tarefa || tarefaFinalizada(tarefa)) return;
  renderizarModalTarefa({ titulo: 'Editar tarefa em aberto', botao: 'Salvar alterações', tarefa, modo: 'editar' });
  document.querySelector('#form-modal-tarefa')?.addEventListener('submit', (event) => salvarEdicaoTarefa(event, id));
}

function mostrarFeedbackModalTarefa(tipo, texto) {
  const el = document.querySelector('#feedback-modal-tarefa');
  if (!el) return;
  el.className = `drawer-form-feedback ${tipo} full`;
  el.textContent = texto || '';
}

async function salvarConclusaoTarefa(event, id) {
  event.preventDefault();
  const conclusao = event.currentTarget.conclusao.value.trim();
  if (!conclusao) return mostrarFeedbackModalTarefa('erro', 'Conclusão é obrigatória.');
  await salvarAlteracaoTarefa({ id, status_tarefa: 'Concluída', conclusao }, 'Erro ao concluir tarefa.');
}

async function salvarEdicaoTarefa(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const responsavel = form.responsavel.value.trim();
  if (!responsavel) return mostrarFeedbackModalTarefa('erro', 'Responsável é obrigatório.');
  const anexo = await enviarAnexoTarefa(form.anexo.files);
  await salvarAlteracaoTarefa({
    id,
    data_inicial: form.data_inicial.value || null,
    data_final: form.data_final.value || null,
    observacao: form.observacao.value.trim(),
    responsavel,
    ...anexo,
  }, 'Erro ao editar tarefa.');
}

async function salvarAlteracaoTarefa(payload, mensagemErro) {
  try {
    const resposta = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'editar', ...payload, id: Number(payload.id) }),
    });
    await tratarRespostaApi(resposta, mensagemErro);
    fecharModalTarefa();
    await recarregarTarefas();
  } catch (erro) {
    mostrarFeedbackModalTarefa('erro', erro.message);
    mostrarFeedbackDrawer('erro', erro.message);
  }
}

async function excluirTarefaDrawer(id) {
  if (!window.confirm('Excluir esta tarefa? Esta ação não pode ser desfeita.')) return;

  try {
    const resposta = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'excluir', id: Number(id) }),
    });
    await tratarRespostaApi(resposta, 'Erro ao excluir tarefa.');
    await recarregarTarefas();
  } catch (erro) {
    mostrarFeedbackDrawer('erro', erro.message);
  }
}

document.querySelector('#drawer-etapa-backdrop')?.addEventListener('click', fecharDrawerEtapa);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.querySelector('#modal-tarefa')) return fecharModalTarefa();
  if (event.key === 'Escape' && etapaDrawerAberta) fecharDrawerEtapa();
});

carregarDadosTarefas();
