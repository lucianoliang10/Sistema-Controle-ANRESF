// Painel inicial (Início): mostra as pendências do usuário logado.
// - Analista: vê apenas as pendências cujo Responsável casa com o seu nome/e-mail.
// - Gestor e Administrador: veem TODAS as pendências (com filtro por responsável).
//
// "Pendência" = tarefa em aberto (não finalizada) + etapa com status
// "Pendente ANRESF". Reaproveita os dados e helpers já carregados pelos
// demais painéis (dadosTarefas, dadosFluxograma, isoToBrDate, normStatus...).

let inicioResponsavel = 'todos'; // usado só por gestor/adm

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

// Junta tarefas em aberto + etapas "Pendente ANRESF" num formato único.
function pendenciasTodas() {
  const toIso = (data) => (typeof brToIsoDate === 'function' ? brToIsoDate(data || '') : (data || '')) || '';
  const rotuloCaso = (numero) => (typeof prazoLabelCaso === 'function' ? prazoLabelCaso(numero) : `Caso ${numero}`);

  const tarefas = (Array.isArray(dadosTarefas) ? dadosTarefas : [])
    .filter((tarefa) => !tarefaFinalizada(tarefa))
    .map((tarefa) => {
      const nomeEtapa = valor(tarefa.nome_etapa, 'Sem etapa');
      const dataFinalIso = tarefa.data_final || '';
      return {
        tipo: 'Tarefa',
        etapaId: tarefa.etapa_id,
        numero: tarefa.numero_caso,
        responsavel: valor(tarefa.responsavel, 'Não definido'),
        casoLabel: rotuloCaso(tarefa.numero_caso),
        clube: valor(tarefa.clube, 'Sem clube'),
        etapaNome: tarefa.ramo ? `${nomeEtapa} · Ramo ${tarefa.ramo}` : nomeEtapa,
        detalhe: valor(tarefa.observacao, ''),
        prazoBr: valor(isoToBrDate(dataFinalIso)),
        grupo: inicioGrupoUrgencia(dataFinalIso),
        dias: tarefaDiasRestantes(dataFinalIso),
      };
    });

  const etapas = (Array.isArray(dadosFluxograma) ? dadosFluxograma : [])
    .filter((row) => row.etapa_banco_id && normStatus(row.statusEtapa) === 'pendente-anresf')
    .map((row) => {
      const nomeEtapa = valor(row.etapa, 'Sem etapa');
      const dataFinalIso = toIso(row.prazoFinal);
      const numero = typeof numeroCaso === 'function' ? numeroCaso(row) : (row.casoRaiz || row.numero_caso);
      return {
        tipo: 'Etapa',
        etapaId: row.etapa_banco_id,
        numero,
        responsavel: valor(row.responsavel, 'Não definido'),
        casoLabel: rotuloCaso(numero),
        clube: valor(row.clube, 'Sem clube'),
        etapaNome: row.ramo ? `${nomeEtapa} · Ramo ${row.ramo}` : nomeEtapa,
        detalhe: valor(row.objeto || row.observacao, ''),
        prazoBr: valor(isoToBrDate(dataFinalIso)),
        grupo: inicioGrupoUrgencia(dataFinalIso),
        dias: tarefaDiasRestantes(dataFinalIso),
      };
    });

  return tarefas.concat(etapas);
}

// Aplica o recorte por papel: analista só vê o que é dele; gestor/adm veem tudo.
function pendenciasVisiveis() {
  const todas = pendenciasTodas();
  if (typeof ehGestorOuAdmin === 'function' && ehGestorOuAdmin()) {
    if (inicioResponsavel !== 'todos') return todas.filter((p) => p.responsavel === inicioResponsavel);
    return todas;
  }
  return todas.filter((p) => pendenciaDoUsuario(p.responsavel));
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

function inicioRenderKpis(grupos) {
  const kpi = (titulo, quantidade, cls) => `
    <div class="inicio-kpi ${cls}">
      <span class="inicio-kpi-num">${quantidade}</span>
      <span class="inicio-kpi-label">${esc(titulo)}</span>
    </div>`;
  return `
    <div class="inicio-kpis">
      ${kpi('Vencidas', grupos.overdue.length, 'overdue')}
      ${kpi('Vencem hoje', grupos.today.length, 'today')}
      ${kpi('À vencer', grupos.upcoming.length, 'upcoming')}
      ${kpi('Sem prazo', grupos['no-date'].length, 'no-date')}
    </div>
  `;
}

function inicioRenderFiltro(todas) {
  if (!(typeof ehGestorOuAdmin === 'function' && ehGestorOuAdmin())) return '';
  const responsaveis = Array.from(new Set(todas.map((p) => p.responsavel).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  const opcoes = ['todos'].concat(responsaveis)
    .map((r) => `<option value="${esc(r)}" ${inicioResponsavel === r ? 'selected' : ''}>${r === 'todos' ? 'Todos os responsáveis' : esc(r)}</option>`)
    .join('');
  return `
    <div class="inicio-filtro">
      <label class="inicio-field">
        <span class="inicio-field-label">Responsável</span>
        <select id="inicio-responsavel">${opcoes}</select>
      </label>
    </div>
  `;
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
        <span>${esc(p.clube)}</span>
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
  const visiveis = pendenciasVisiveis();
  const grupos = agruparPendencias(visiveis);

  panel.innerHTML = `
    <div class="inicio-layout">
      ${inicioRenderHero(visiveis.length)}
      ${inicioRenderKpis(grupos)}
      ${inicioRenderFiltro(todas)}
      ${inicioRenderGrupos(grupos)}
    </div>
  `;

  conectarControlesInicio();
}

function conectarControlesInicio() {
  document.querySelector('#inicio-responsavel')?.addEventListener('change', (event) => {
    inicioResponsavel = event.target.value;
    renderInicio();
  });

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
