// Painel inicial (Início): as pendências do usuário logado, com os filtros
// do antigo painel Prazos críticos (os dois foram unificados aqui).
// - Analista: vê apenas as pendências cujo Responsável casa com o seu nome/e-mail.
// - Gestor e Administrador: veem TODAS, com filtro por responsável e "Só as minhas".
//
// "Pendência" = tarefa em aberto (não finalizada) + etapa com status
// "Pendente ANRESF". Os dados vêm do motor em js/panels/pendencias.js
// (tarefasCriticas/etapasCriticas) e os filtros são prazosFiltros.

const INICIO_GRUPOS = [
  { key: 'overdue', title: 'Vencidas', sub: 'O prazo final já passou', cls: 'overdue' },
  { key: 'today', title: 'Vencem hoje', sub: 'Ação imediata', cls: 'today' },
  { key: 'upcoming', title: 'À vencer', sub: 'Ainda dentro do prazo', cls: 'upcoming' },
  { key: 'no-date', title: 'Sem prazo', sub: 'Sem prazo final definido', cls: 'no-date' },
];

function inicioNormId(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Uma pendência "é minha" quando o Responsável casa com o meu nome, o meu
// e-mail completo, ou a parte local do e-mail (antes do @).
function pendenciaDoUsuario(responsavel) {
  const alvo = inicioNormId(responsavel);
  if (!alvo || alvo === inicioNormId('Não definido')) return false;
  const nome = inicioNormId(typeof nomeAtual === 'function' ? nomeAtual() : '');
  const email = inicioNormId(typeof emailAtual === 'function' ? emailAtual() : '');
  const local = email.split('@')[0];
  return (nome && alvo === nome) || (email && alvo === email) || (local && alvo === local);
}

function inicioGrupoUrgencia(dataFinalIso) {
  const dias = tarefaDiasRestantes(dataFinalIso);
  if (!Number.isFinite(dias)) return 'no-date';
  if (dias < 0) return 'overdue';
  if (dias === 0) return 'today';
  return 'upcoming';
}

function inicioDiasLabel(dias) {
  if (!Number.isFinite(dias)) return 'Sem prazo';
  if (dias < 0) return `${Math.abs(dias)}d em atraso`;
  if (dias === 0) return 'Vence hoje';
  return `Faltam ${dias}d`;
}

// Junta tarefas em aberto + etapas "Pendente ANRESF" num formato único,
// a partir dos registros do motor (que já trazem série, processo, janela…).
function pendenciasTodas() {
  const registros = (typeof tarefasCriticas === 'function' ? tarefasCriticas() : [])
    .concat(typeof etapasCriticas === 'function' ? etapasCriticas() : []);
  return registros.map((r) => ({
    registro: r,
    tipo: r.tipoPrazo,
    etapaId: r.etapa_id,
    numero: r.numeroCasoPrazo,
    responsavel: r.responsavelPrazo,
    casoLabel: r.casoLabel,
    clube: r.clubePrazo,
    origem: r.origemPrazo,
    serie: r.seriePrazo,
    etapaNome: r.etapaNome,
    detalhe: r.observacaoPrazo === 'Sem observação' ? '' : r.observacaoPrazo,
    dataInicialBr: r.dataInicialPrazo,
    prazoBr: r.dataFinalPrazo,
    grupo: r.grupoPrazo,
    dias: r.diasPrazo,
  }));
}

// Regra pura de filtro (testável isolada). O recorte por papel vem primeiro:
// analista só vê o que é dele; gestor/adm veem tudo e podem filtrar por
// responsável. A origem do caso filtra para qualquer perfil.
function inicioFiltroAceita(p, { gestor, responsavel = 'todos', origem = 'todas', ehMinha }) {
  if (gestor) {
    if (responsavel !== 'todos' && p.responsavel !== responsavel) return false;
  } else if (!ehMinha(p.responsavel)) {
    return false;
  }
  if (origem !== 'todas' && p.origem !== origem) return false;
  return true;
}

// O que o perfil pode ver, antes dos filtros da tela (analista: só o seu).
function pendenciasDoPerfil(todas = pendenciasTodas()) {
  const gestor = typeof ehGestorOuAdmin === 'function' && ehGestorOuAdmin();
  return todas.filter((p) => inicioFiltroAceita(p, { gestor, ehMinha: pendenciaDoUsuario }));
}

function pendenciasVisiveis(todas = pendenciasTodas()) {
  const aceita = typeof prazosFiltrosAceitam === 'function'
    ? (p) => prazosFiltrosAceitam(p.registro, prazosFiltros)
    : () => true;
  return pendenciasDoPerfil(todas).filter(aceita);
}

function agruparPendencias(lista) {
  const grupos = {};
  INICIO_GRUPOS.forEach((g) => { grupos[g.key] = []; });
  lista.forEach((p) => { (grupos[p.grupo] || grupos['no-date']).push(p); });
  const ordenar = (a, b) => {
    const da = Number.isFinite(a.dias) ? a.dias : Number.MAX_SAFE_INTEGER;
    const db = Number.isFinite(b.dias) ? b.dias : Number.MAX_SAFE_INTEGER;
    return da - db;
  };
  Object.keys(grupos).forEach((k) => grupos[k].sort(ordenar));
  return grupos;
}

function inicioRenderHero(total) {
  const gestor = typeof ehGestorOuAdmin === 'function' && ehGestorOuAdmin();
  const nome = (typeof nomeAtual === 'function' && nomeAtual()) || 'usuário';
  const papel = typeof perfilLabel === 'function' ? perfilLabel() : 'Analista';
  const saudacao = gestor
    ? 'Estas são todas as pendências em aberto da equipe.'
    : 'Estas são as suas pendências em aberto.';
  return `
    <section class="inicio-hero">
      <div>
        <p class="inicio-eyebrow">Painel inicial · ${esc(papel)}</p>
        <h2 class="inicio-title">Olá, ${esc(nome)}</h2>
        <p class="inicio-lead">${esc(saudacao)} <strong>${total}</strong> ${total === 1 ? 'pendência' : 'pendências'} no total.</p>
      </div>
    </section>
  `;
}

// KPIs clicáveis: clicar filtra pela situação (clicar de novo desfaz).
function inicioRenderKpis(grupos) {
  const ativas = (typeof prazosFiltros !== 'undefined' && prazosFiltros.situacoes) || [];
  const kpi = (titulo, quantidade, cls) => `
    <button type="button" class="inicio-kpi ${cls}${ativas.includes(cls) ? ' ativo' : ''}" data-inicio-situacao="${cls}" aria-pressed="${ativas.includes(cls)}">
      <span class="inicio-kpi-num">${quantidade}</span>
      <span class="inicio-kpi-label">${esc(titulo)}</span>
    </button>`;
  return `
    <div class="inicio-kpis">
      ${kpi('Vencidas', grupos.overdue.length, 'overdue')}
      ${kpi('Vencem hoje', grupos.today.length, 'today')}
      ${kpi('À vencer', grupos.upcoming.length, 'upcoming')}
      ${kpi('Sem prazo', grupos['no-date'].length, 'no-date')}
    </div>
  `;
}

// Filtros do antigo painel Prazos críticos (multi-seleção, janela, chips).
// As opções vêm do que o perfil pode ver, para não oferecer valor que zera a tela.
function inicioRenderFiltro(doPerfil, totalFiltrado) {
  const gestor = typeof ehGestorOuAdmin === 'function' && ehGestorOuAdmin();
  if (typeof renderPrazosFiltros !== 'function') return '';
  return renderPrazosFiltros(doPerfil.map((p) => p.registro), totalFiltrado, { gestor });
}

function inicioRenderCard(p) {
  const gestor = typeof ehGestorOuAdmin === 'function' && ehGestorOuAdmin();
  const respLinha = gestor
    ? `<span class="inicio-card-resp">Responsável: <strong>${esc(p.responsavel)}</strong></span>`
    : '';

  // A ação (observação/objeto) é o destaque do card: é o que o analista
  // precisa fazer. Se não houver descrição, o nome da etapa vira o título.
  const temAcao = Boolean(p.detalhe);
  const acao = temAcao ? p.detalhe : p.etapaNome;
  // Contexto abaixo: etapa (quando não virou título) e o caso.
  const contexto = [temAcao ? p.etapaNome : null, p.casoLabel].filter(Boolean);

  return `
    <button type="button" class="inicio-card ${p.grupo}" data-etapa-id="${esc(p.etapaId)}" data-numero="${esc(p.numero)}">
      <div class="inicio-card-top">
        <span class="inicio-tag ${p.tipo === 'Etapa' ? 'is-etapa' : 'is-tarefa'}">${esc(p.tipo)}</span>
        <span class="inicio-card-dias ${p.grupo}">${esc(inicioDiasLabel(p.dias))}</span>
      </div>
      <p class="inicio-card-acao">${esc(acao)}</p>
      <div class="inicio-card-ctx">
        ${contexto.map((c, i) => `<span class="${i === 0 ? 'ctx-etapa' : 'ctx-caso'}">${esc(c)}</span>`).join('')}
      </div>
      <div class="inicio-card-foot">
        <span>${esc(p.clube)}${p.serie && p.serie !== '—' ? ` · Série ${esc(p.serie)}` : ''}</span>
        <span class="inicio-card-prazo">Prazo: ${esc(p.prazoBr)}</span>
      </div>
      ${respLinha}
    </button>
  `;
}

function inicioRenderGrupos(grupos) {
  const secoes = INICIO_GRUPOS
    .filter((g) => grupos[g.key].length > 0)
    .map((g) => `
      <section class="inicio-grupo">
        <div class="inicio-grupo-head ${g.cls}">
          <h3>${esc(g.title)} <span class="inicio-grupo-cont">${grupos[g.key].length}</span></h3>
          <span class="inicio-grupo-sub">${esc(g.sub)}</span>
        </div>
        <div class="inicio-grid">${grupos[g.key].map(inicioRenderCard).join('')}</div>
      </section>
    `).join('');
  if (!secoes) {
    return `
      <section class="inicio-vazio">
        <div class="inicio-vazio-emoji">✅</div>
        <h3>Tudo em dia!</h3>
        <p>Você não tem pendências em aberto no momento.</p>
      </section>
    `;
  }
  return secoes;
}

let inicioRenderizando = false;

async function renderInicio() {
  const panel = document.querySelector('#inicio');
  if (!panel) return;

  // Guarda de reentrância: garantir* pode disparar carregarDadosTarefas, que
  // por sua vez chama renderInicio de novo. Sem esta trava, dados vazios
  // (ex.: 401 antes do login) geram um laço infinito de requisições.
  if (inicioRenderizando) return;
  inicioRenderizando = true;
  try {
    if (typeof garantirDadosTarefasCarregados === 'function') await garantirDadosTarefasCarregados();
    if (typeof garantirDadosFluxogramaCarregados === 'function') await garantirDadosFluxogramaCarregados();
  } finally {
    inicioRenderizando = false;
  }

  const todas = pendenciasTodas();
  const doPerfil = pendenciasDoPerfil(todas);
  const visiveis = pendenciasVisiveis(todas);
  // KPIs contam o que o perfil vê, sem os filtros da tela (senão clicar num
  // KPI zeraria os outros).
  const grupos = agruparPendencias(visiveis);
  const gruposKpi = agruparPendencias(doPerfil);

  panel.innerHTML = `
    <div class="inicio-layout">
      ${inicioRenderHero(visiveis.length)}
      ${inicioRenderKpis(gruposKpi)}
      ${inicioRenderFiltro(doPerfil, visiveis.length)}
      ${inicioRenderGrupos(grupos)}
    </div>
  `;

  conectarControlesInicio();
}

function conectarControlesInicio() {
  const f = typeof prazosFiltros !== 'undefined' ? prazosFiltros : null;
  if (f) {
    // KPI = filtro rápido de situação.
    document.querySelectorAll('#inicio [data-inicio-situacao]').forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.dataset.inicioSituacao;
      f.situacoes = f.situacoes.includes(k) ? f.situacoes.filter((x) => x !== k) : f.situacoes.concat(k);
      renderInicio();
    }));
    // Multi-seleção: "Aplicar" lê as caixas marcadas; "Limpar" zera só aquele campo.
    document.querySelectorAll('#inicio [data-prazo-multi]').forEach((det) => {
      const campo = det.dataset.prazoMulti;
      det.querySelector('.op-multi-apply')?.addEventListener('click', () => {
        f[campo] = Array.from(det.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
        renderInicio();
      });
      det.querySelector('.op-multi-clear')?.addEventListener('click', () => { f[campo] = []; renderInicio(); });
    });
    document.querySelector('#prazos-janela')?.addEventListener('change', (event) => { f.janela = event.target.value; renderInicio(); });
    document.querySelector('#prazos-somente-minhas')?.addEventListener('change', (event) => { f.somenteMinhas = event.target.checked; renderInicio(); });
    document.querySelector('#prazos-limpar')?.addEventListener('click', () => { limparFiltrosPrazos(); renderInicio(); });
    document.querySelectorAll('#inicio [data-prazo-chip]').forEach((chip) => chip.addEventListener('click', () => {
      const campo = chip.dataset.prazoChip;
      const v = chip.dataset.prazoChipValor;
      if (campo === 'janela') f.janela = 'todas';
      else if (campo === 'somenteMinhas') f.somenteMinhas = false;
      else if (Array.isArray(f[campo])) f[campo] = f[campo].filter((x) => x !== v);
      renderInicio();
    }));
  }

  document.querySelectorAll('.inicio-card').forEach((card) => {
    card.addEventListener('click', () => {
      const etapaId = card.dataset.etapaId;
      const numero = card.dataset.numero;
      if (numero && typeof casoSelecionado !== 'undefined') casoSelecionado = String(numero);
      if (typeof renderizarFluxograma === 'function') renderizarFluxograma();
      const navFluxograma = document.querySelector('.nav-item[data-panel="fluxograma"]');
      if (navFluxograma && typeof activatePanel === 'function') activatePanel('fluxograma', navFluxograma);
      if (etapaId && typeof abrirDrawerEtapa === 'function') abrirDrawerEtapa(etapaId);
    });
  });
}

navItems.forEach((item) => {
  if (item.dataset.panel !== 'inicio') return;
  item.addEventListener('click', renderInicio);
});

if (document.querySelector('#inicio')?.classList.contains('active-panel')) renderInicio();
