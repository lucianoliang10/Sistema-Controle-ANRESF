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
          <button type="button" class="mini-action danger" data-tarefa-excluir="${esc(tarefa.id)}">Excluir</button>
        </span>
      </div>
      <div class="tarefa-datas">
        <div><span>Início</span><strong>${esc(valor(isoToBrDate(tarefa.data_inicial)))}</strong></div>
        <div><span>Prazo final</span><strong>${esc(valor(isoToBrDate(tarefa.data_final)))}</strong></div>
        <div><span>Responsável</span><strong>${esc(valor(tarefa.responsavel))}</strong></div>
      </div>
      ${tarefa.observacao ? `<p class="tarefa-obs">${esc(tarefa.observacao)}</p>` : ''}
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
      }),
    });
    await tratarRespostaApi(resposta, 'Erro ao criar tarefa.');
    await recarregarTarefas();
    mostrarFeedbackDrawer('sucesso', 'Tarefa criada com sucesso.');
  } catch (erro) {
    mostrarFeedbackDrawer('erro', erro.message);
  }
}

async function alternarStatusTarefa(id, novoStatus) {
  try {
    const resposta = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'editar', id: Number(id), status_tarefa: novoStatus }),
    });
    await tratarRespostaApi(resposta, 'Erro ao atualizar tarefa.');
    await recarregarTarefas();
  } catch (erro) {
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
  if (event.key === 'Escape' && etapaDrawerAberta) fecharDrawerEtapa();
});

carregarDadosTarefas();
