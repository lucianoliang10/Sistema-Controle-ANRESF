// Atualização automática dos dados entre usuários.
// Re-busca etapas + tarefas quando o usuário volta para a aba/janela e a cada
// ~30s enquanto o sistema está visível; se algo mudou, re-renderiza o painel
// ativo. NÃO atualiza se houver edição em andamento (modal/drawer aberto,
// campo em foco ou menu de filtro aberto), para não apagar formulários nem
// fechar menus. Só frontend — usa o fetch autenticado (js/auth.js).
(function () {
  const INTERVALO_MS = 30000;
  let ultimaAssinatura = '';
  let atualizando = false;

  function painelAtivoId() {
    return document.querySelector('.panel.active-panel')?.id || '';
  }

  function reRenderPainelAtivo() {
    const id = painelAtivoId();
    if (id === 'inicio' && typeof renderInicio === 'function') return renderInicio();
    if (id === 'fluxograma' && typeof renderizarFluxograma === 'function') return renderizarFluxograma();
    if (id === 'macro' && typeof renderMacro === 'function') return renderMacro();
    if (id === 'prazos' && typeof renderPrazos === 'function') return renderPrazos();
    if (id === 'panorama' && typeof renderPanorama === 'function') return renderPanorama();
    if (['dossie', 'sancoes', 'julgamentos', 'ids'].includes(id) && typeof renderOperationalPanel === 'function') {
      return renderOperationalPanel(id);
    }
  }

  // Não mexe na tela enquanto o usuário está editando/interagindo.
  function edicaoEmAndamento() {
    const auth = document.querySelector('#auth-overlay');
    if (auth && !auth.hasAttribute('hidden')) return true; // tela de login
    if (document.querySelector('.modal-backdrop:not([hidden])')) return true; // modais (etapa/caso/tarefa)
    if (document.querySelector('#modal-tarefa')) return true; // modal de tarefa (montado dinamicamente)
    const drawer = document.querySelector('#drawer-etapa');
    if (drawer && drawer.getAttribute('aria-hidden') === 'false') return true; // drawer de etapa
    if (document.querySelector('.op-multi[open]')) return true; // menu de filtro múltiplo aberto
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return true; // digitando
    return false;
  }

  // Assinatura leve dos dados: muda sempre que algo relevante é alterado.
  function assinatura(etapas, tarefas) {
    const e = (Array.isArray(etapas) ? etapas : []).map(r =>
      `${r.etapa_banco_id}:${r.statusEtapa}:${r.etapa}:${r.id}:${r.prazoFinal}:${r.dataEnvio}:${r.responsavel}:${r.turma}:${r.objeto}:${r.sancao}:${r.observacao}:${r.observacaoCaso}`).join('|');
    const t = (Array.isArray(tarefas) ? tarefas : []).map(x =>
      `${x.id}:${x.status_tarefa}:${x.responsavel}:${x.observacao}:${x.conclusao}:${x.data_final}:${x.data_inicial}`).join('|');
    return `${(etapas || []).length},${(tarefas || []).length}#${e}#${t}`;
  }

  // Garante uma linha de base a partir do que JÁ está carregado/exibido, para
  // que a primeira mudança de outro usuário seja detectada corretamente.
  function alinhavarBaseline() {
    if (!ultimaAssinatura && Array.isArray(dadosFluxograma) && dadosFluxograma.length) {
      ultimaAssinatura = assinatura(dadosFluxograma, dadosTarefas);
    }
  }

  async function buscarJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + url + ' -> ' + r.status);
    return r.json();
  }

  async function verificarAtualizacoes() {
    if (atualizando || document.hidden) return;
    const auth = document.querySelector('#auth-overlay');
    if (auth && !auth.hasAttribute('hidden')) return; // não logado
    atualizando = true;
    try {
      alinhavarBaseline();
      const [etapas, tarefas] = await Promise.all([
        buscarJson('/api/etapas').catch(() => null),
        buscarJson('/api/tarefas').catch(() => null),
      ]);
      if (!Array.isArray(etapas)) return; // falha de rede/sessão: não mexe na tela
      const tarefasArr = Array.isArray(tarefas) ? tarefas : dadosTarefas;
      const nova = assinatura(etapas, tarefasArr);
      if (!ultimaAssinatura) { ultimaAssinatura = nova; return; } // primeira captura
      if (nova === ultimaAssinatura) return; // nada mudou
      if (edicaoEmAndamento()) return; // adia: tenta de novo no próximo ciclo (mantém assinatura antiga)
      // Aplica os dados novos e re-renderiza o painel atual.
      dadosFluxograma = etapas;
      DATA = etapas;
      if (Array.isArray(tarefas)) dadosTarefas = tarefas;
      ultimaAssinatura = nova;
      if (typeof atualizarListaResponsaveis === 'function') atualizarListaResponsaveis();
      reRenderPainelAtivo();
    } catch (e) {
      // silencioso — nunca atrapalha o uso
    } finally {
      atualizando = false;
    }
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarAtualizacoes(); });
  window.addEventListener('focus', () => verificarAtualizacoes());
  setTimeout(alinhavarBaseline, 3000);
  setInterval(verificarAtualizacoes, INTERVALO_MS);
})();
