// Busca global (Ctrl+K / ⌘K): de qualquer painel, encontra caso, etapa ou
// tarefa por número, clube, denunciante, ID da etapa, nome ou texto, e abre
// direto no Fluxograma — etapa e tarefa já com o drawer da etapa aberto.
// Sem digitar nada mostra os casos abertos recentemente e duas ações rápidas.
// É uma camada por cima das telas: nenhum painel muda.

const BUSCA_RECENTES_STORAGE = 'anresf.busca.recentes';
const BUSCA_RECENTES_MAX = 5;
const BUSCA_MAX_POR_GRUPO = 6;

function buscaNormalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// ---------- recentes (por navegador) ----------

function buscaRecentes() {
  try {
    const lista = JSON.parse(localStorage.getItem(BUSCA_RECENTES_STORAGE) || '[]');
    return Array.isArray(lista) ? lista.map(String) : [];
  } catch (e) { return []; }
}

function buscaRegistrarRecente(caso) {
  const chave = String(caso || '').trim();
  if (!chave) return;
  const lista = [chave].concat(buscaRecentes().filter((c) => c !== chave)).slice(0, BUSCA_RECENTES_MAX);
  try { localStorage.setItem(BUSCA_RECENTES_STORAGE, JSON.stringify(lista)); } catch (e) { /* sem storage */ }
}

// ---------- índice ----------

function buscaTituloCaso(caso, rows) {
  const primeira = rows[0] || {};
  const parte = typeof parteCasoFluxograma === 'function'
    ? parteCasoFluxograma(primeira)
    : (primeira.clube || 'Sem clube');
  return `Caso ${caso} · ${parte}`;
}

// Monta a lista de itens pesquisáveis a partir das etapas (dadosFluxograma)
// e das tarefas (dadosTarefas). Cada item tem `busca` (texto normalizado) e
// `titulo`/`sub` para exibição.
function buscaIndexar(etapas, tarefas) {
  const rows = Array.isArray(etapas) ? etapas : [];
  const grupos = groupBy(rows, (row) => numeroCaso(row));
  const casosPorNumero = new Map();
  const itens = [];

  Array.from(grupos.entries()).sort((a, b) => compararCaso(a[0], b[0])).forEach(([caso, linhas]) => {
    const primeira = linhas[0] || {};
    const atual = typeof currentRows === 'function' ? currentRows(linhas) : (linhas[linhas.length - 1] || {});
    const titulo = buscaTituloCaso(caso, linhas);
    const item = {
      tipo: 'caso', caso, titulo,
      sub: [primeira.origem, primeira.serie ? `Série ${primeira.serie}` : '', `${linhas.length} ${linhas.length === 1 ? 'etapa' : 'etapas'}`, atual.etapa ? `Etapa atual: ${atual.etapa}` : ''].filter(Boolean).join(' · '),
      status: atual.statusEtapa || '',
      busca: buscaNormalizar([caso, `caso ${caso}`, primeira.clube, primeira.denunciante, primeira.origem, titulo].filter(Boolean).join(' ')),
    };
    casosPorNumero.set(caso, item);
    itens.push(item);

    linhas.forEach((row) => {
      if (!row.etapa_banco_id) return;
      const id = row.id && !row.semId ? row.id : '';
      itens.push({
        tipo: 'etapa', caso, etapaId: row.etapa_banco_id,
        titulo: [id, row.etapa].filter(Boolean).join(' · ') || 'Etapa',
        sub: [titulo, row.prazoFinal ? `prazo ${row.prazoFinal}` : (row.dataEnvio || row.dataEtapa || '')].filter(Boolean).join(' · '),
        status: row.statusEtapa || '',
        busca: buscaNormalizar([id, row.etapa, row.objeto, row.responsavel, titulo].filter(Boolean).join(' ')),
      });
    });
  });

  (Array.isArray(tarefas) ? tarefas : []).forEach((t) => {
    const finalizada = typeof tarefaFinalizada === 'function' && tarefaFinalizada(t);
    if (finalizada) return; // tarefa concluída não é pendência para achar
    const caso = String(t.numero_caso || '');
    const itemCaso = casosPorNumero.get(caso);
    const prazoBr = typeof isoToBrDate === 'function' ? isoToBrDate(t.data_final) : (t.data_final || '');
    itens.push({
      tipo: 'tarefa', caso, etapaId: t.etapa_id, tarefaId: t.id,
      titulo: t.observacao || 'Tarefa',
      sub: [t.responsavel, prazoBr ? `prazo ${prazoBr}` : '', t.nome_etapa, itemCaso ? itemCaso.titulo : (caso ? `Caso ${caso}` : '')].filter(Boolean).join(' · '),
      status: typeof tarefaSituacaoLabel === 'function' ? tarefaSituacaoLabel(t) : (t.status_tarefa || ''),
      situacao: typeof tarefaSituacao === 'function' ? tarefaSituacao(t) : '',
      busca: buscaNormalizar([t.observacao, t.responsavel, t.nome_etapa, itemCaso ? itemCaso.titulo : caso].filter(Boolean).join(' ')),
    });
  });

  return itens;
}

// Filtra por termo (todas as palavras precisam aparecer) e agrupa por tipo,
// limitando cada grupo. Número exato de caso vem primeiro.
function buscaFiltrar(itens, termo) {
  const palavras = buscaNormalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return { casos: [], etapas: [], tarefas: [] };
  const casa = (item) => palavras.every((p) => item.busca.includes(p));
  const peso = (item) => {
    if (item.tipo === 'caso' && palavras.length === 1 && item.caso === palavras[0]) return 0;
    if (buscaNormalizar(item.titulo).startsWith(palavras[0])) return 1;
    return 2;
  };
  const porTipo = (tipo) => itens.filter((i) => i.tipo === tipo && casa(i))
    .sort((a, b) => peso(a) - peso(b))
    .slice(0, BUSCA_MAX_POR_GRUPO);
  return { casos: porTipo('caso'), etapas: porTipo('etapa'), tarefas: porTipo('tarefa') };
}

// Escapa o texto e envolve as ocorrências das palavras em <mark>, sem acento
// nem caixa. Funciona caractere a caractere para o destaque cair no texto
// original (com acento) e não na versão normalizada.
function buscaDestacar(texto, termo) {
  const original = String(texto || '');
  const palavras = buscaNormalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return esc(original);
  // mapa: posição no texto normalizado -> posição no original
  const mapa = [];
  let norm = '';
  Array.from(original).forEach((ch, i) => {
    const n = buscaNormalizar(ch);
    for (let k = 0; k < n.length; k += 1) { mapa.push(i); norm += n[k]; }
    if (n.length === 0) { /* acento solto: some */ }
  });
  const marcar = new Array(Array.from(original).length).fill(false);
  palavras.forEach((p) => {
    let pos = norm.indexOf(p);
    while (pos !== -1) {
      for (let k = pos; k < pos + p.length; k += 1) marcar[mapa[k]] = true;
      pos = norm.indexOf(p, pos + p.length);
    }
  });
  let html = '';
  let aberto = false;
  Array.from(original).forEach((ch, i) => {
    if (marcar[i] && !aberto) { html += '<mark>'; aberto = true; }
    if (!marcar[i] && aberto) { html += '</mark>'; aberto = false; }
    html += esc(ch);
  });
  if (aberto) html += '</mark>';
  return html;
}

// ---------- interface ----------

let buscaAberta = false;
let buscaItens = [];
let buscaLinhas = []; // itens na ordem em que aparecem (para ↑↓)
let buscaSelecionado = 0;

function buscaPillClasse(item) {
  if (item.tipo === 'tarefa') {
    return { overdue: 'p-red', today: 'p-red', soon7: 'p-gold', ok: 'p-green', 'no-date': 'p-neutral' }[item.situacao] || 'p-gold';
  }
  const n = buscaNormalizar(item.status);
  if (n === 'finalizado') return 'p-green';
  if (n.includes('clube')) return 'p-orange';
  if (n.includes('anresf')) return 'p-blue';
  if (n.includes('aguardando')) return 'p-neutral';
  return 'p-gold';
}

function buscaIconeItem(item) {
  if (item.tipo === 'acao') return item.acao === 'nova-etapa' ? '＋' : '⌂';
  return { caso: '◇', etapa: '#', tarefa: '✓' }[item.tipo] || '•';
}

function buscaRenderItem(item, indice, termo, dica) {
  const sel = indice === buscaSelecionado;
  return `<div class="gb-item${sel ? ' sel' : ''}" data-indice="${indice}" role="option" aria-selected="${sel}">`
    + `<span class="gb-ico ${esc(item.tipo)}">${esc(buscaIconeItem(item))}</span>`
    + `<div class="gb-t"><strong>${buscaDestacar(item.titulo, termo)}</strong><span>${buscaDestacar(item.sub, termo)}</span></div>`
    + `<div class="gb-r">${item.status ? `<span class="gb-pill ${buscaPillClasse(item)}">${esc(item.status)}</span>` : ''}${item.tecla ? `<span class="gb-kbd">${esc(item.tecla)}</span>` : ''}${sel && dica ? `<span class="gb-enter">↵ ${esc(dica)}</span>` : ''}</div>`
    + '</div>';
}

function buscaAcoesRapidas() {
  const casoAtual = typeof casoSelecionado !== 'undefined' && casoSelecionado ? String(casoSelecionado) : '';
  const rows = casoAtual ? (Array.isArray(dadosFluxograma) ? dadosFluxograma : []).filter((r) => numeroCaso(r) === casoAtual) : [];
  const acoes = [];
  if (casoAtual && rows.length) {
    acoes.push({ tipo: 'acao', acao: 'nova-etapa', titulo: 'Nova etapa no caso aberto', sub: buscaTituloCaso(casoAtual, rows), tecla: 'N', busca: '' });
  }
  acoes.push({ tipo: 'acao', acao: 'inicio', titulo: 'Minhas pendências', sub: 'Ir para o Início', tecla: 'I', busca: '' });
  return acoes;
}

function buscaRenderCorpo(termo) {
  const corpo = document.querySelector('#busca-global .gb-body');
  if (!corpo) return;
  buscaLinhas = [];
  const secao = (titulo, lista, dica) => {
    if (!lista.length) return '';
    const inicio = buscaLinhas.length;
    buscaLinhas.push(...lista);
    return `<div class="gb-sec">${esc(titulo)}</div>` + lista.map((item, i) => buscaRenderItem(item, inicio + i, termo, dica)).join('');
  };

  let html = '';
  if (!buscaNormalizar(termo)) {
    const recentes = buscaRecentes().map((caso) => buscaItens.find((i) => i.tipo === 'caso' && i.caso === caso)).filter(Boolean);
    html += secao('Recentes', recentes, 'abrir');
    html += secao('Ações rápidas', buscaAcoesRapidas(), '');
    if (!recentes.length) html = `<div class="gb-vazio">Digite para buscar por caso, clube, denunciante, ID da etapa ou tarefa.</div>` + html;
  } else {
    const r = buscaFiltrar(buscaItens, termo);
    html += secao(`Casos · ${r.casos.length}`, r.casos, 'abrir no Fluxograma');
    html += secao(`Etapas · ${r.etapas.length}`, r.etapas, 'abrir a etapa');
    html += secao(`Tarefas · ${r.tarefas.length}`, r.tarefas, 'abrir a tarefa');
    if (!buscaLinhas.length) html = `<div class="gb-vazio">Nada encontrado para “${esc(termo)}”.</div>`;
  }
  if (buscaSelecionado >= buscaLinhas.length) buscaSelecionado = 0;
  corpo.innerHTML = html;
  corpo.querySelector('.gb-item.sel')?.scrollIntoView({ block: 'nearest' });
}

function buscaIrParaFluxograma(caso) {
  if (typeof casoSelecionado !== 'undefined' && caso) casoSelecionado = String(caso);
  if (typeof renderizarFluxograma === 'function') renderizarFluxograma();
  const nav = document.querySelector('.nav-item[data-panel="fluxograma"]');
  if (nav && typeof activatePanel === 'function') activatePanel('fluxograma', nav);
}

function buscaAbrirItem(item) {
  if (!item) return;
  fecharBuscaGlobal();
  if (item.tipo === 'acao') {
    if (item.acao === 'inicio') {
      const nav = document.querySelector('.nav-item[data-panel="inicio"]');
      if (nav && typeof activatePanel === 'function') activatePanel('inicio', nav);
      if (typeof renderInicio === 'function') renderInicio();
    } else if (item.acao === 'nova-etapa') {
      buscaIrParaFluxograma(casoSelecionado);
      if (typeof abrirModalNovaEtapa === 'function') abrirModalNovaEtapa();
    }
    return;
  }
  buscaRegistrarRecente(item.caso);
  buscaIrParaFluxograma(item.caso);
  if ((item.tipo === 'etapa' || item.tipo === 'tarefa') && item.etapaId && typeof abrirDrawerEtapa === 'function') {
    abrirDrawerEtapa(item.etapaId);
  }
}

function buscaMontarOverlay() {
  if (document.querySelector('#busca-global')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="gb-overlay" id="busca-global" hidden>
      <div class="gb" role="dialog" aria-modal="true" aria-label="Busca global">
        <div class="gb-head">
          <span class="ico" aria-hidden="true">⌕</span>
          <input id="busca-global-input" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar caso, clube, denunciante, ID da etapa, tarefa…" aria-label="Buscar" role="combobox" aria-expanded="true" aria-controls="busca-global-lista">
          <span class="gb-kbd">Esc</span>
        </div>
        <div class="gb-body" id="busca-global-lista" role="listbox"></div>
        <div class="gb-foot"><span><b>↑↓</b> navegar · <b>↵</b> abrir · <b>Tab</b> próxima seção · <b>Esc</b> fechar</span><span>Também acha por <b>número</b> (53), <b>ID</b> (002/2026) e <b>clube</b></span></div>
      </div>
    </div>`);
  const overlay = document.querySelector('#busca-global');
  const input = overlay.querySelector('#busca-global-input');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharBuscaGlobal(); });
  input.addEventListener('input', () => { buscaSelecionado = 0; buscaRenderCorpo(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!buscaLinhas.length) return;
      buscaSelecionado = (buscaSelecionado + (e.key === 'ArrowDown' ? 1 : -1) + buscaLinhas.length) % buscaLinhas.length;
      buscaRenderCorpo(input.value);
    } else if (e.key === 'Tab') {
      // pula para o primeiro item da próxima seção (ou volta ao começo)
      e.preventDefault();
      if (!buscaLinhas.length) return;
      const tipoAtual = buscaLinhas[buscaSelecionado]?.tipo;
      const proximo = buscaLinhas.findIndex((item, i) => i > buscaSelecionado && item.tipo !== tipoAtual);
      buscaSelecionado = proximo === -1 ? 0 : proximo;
      buscaRenderCorpo(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      buscaAbrirItem(buscaLinhas[buscaSelecionado]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fecharBuscaGlobal();
    } else if (!input.value && (e.key === 'n' || e.key === 'N' || e.key === 'i' || e.key === 'I')) {
      // teclas das ações rápidas, só com o campo vazio
      const acao = buscaLinhas.find((item) => item.tipo === 'acao' && item.tecla.toLowerCase() === e.key.toLowerCase());
      if (acao) { e.preventDefault(); buscaAbrirItem(acao); }
    }
  });
  overlay.querySelector('.gb-body').addEventListener('click', (e) => {
    const el = e.target.closest('.gb-item');
    if (el) buscaAbrirItem(buscaLinhas[Number(el.dataset.indice)]);
  });
  overlay.querySelector('.gb-body').addEventListener('mousemove', (e) => {
    const el = e.target.closest('.gb-item');
    if (!el || Number(el.dataset.indice) === buscaSelecionado) return;
    buscaSelecionado = Number(el.dataset.indice);
    overlay.querySelectorAll('.gb-item').forEach((n) => n.classList.toggle('sel', Number(n.dataset.indice) === buscaSelecionado));
  });
}

async function abrirBuscaGlobal() {
  if (typeof authAutenticado === 'function' && !authAutenticado()) return;
  buscaMontarOverlay();
  const overlay = document.querySelector('#busca-global');
  const input = overlay.querySelector('#busca-global-input');
  buscaAberta = true;
  overlay.hidden = false;
  input.value = '';
  buscaSelecionado = 0;
  buscaItens = buscaIndexar(typeof dadosFluxograma !== 'undefined' ? dadosFluxograma : [], typeof dadosTarefas !== 'undefined' ? dadosTarefas : []);
  buscaRenderCorpo('');
  input.focus();
  // Tarefas podem ainda não ter sido carregadas (só carregam ao abrir um drawer).
  if (typeof garantirDadosTarefasCarregados === 'function') {
    try {
      await garantirDadosTarefasCarregados();
      if (buscaAberta) {
        buscaItens = buscaIndexar(dadosFluxograma, dadosTarefas);
        buscaRenderCorpo(input.value);
      }
    } catch (e) { /* segue sem tarefas */ }
  }
}

function fecharBuscaGlobal() {
  const overlay = document.querySelector('#busca-global');
  if (overlay) overlay.hidden = true;
  buscaAberta = false;
}

function alternarBuscaGlobal() {
  if (buscaAberta) fecharBuscaGlobal();
  else abrirBuscaGlobal();
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      alternarBuscaGlobal();
    }
  });
  document.querySelector('#busca-global-abrir')?.addEventListener('click', () => abrirBuscaGlobal());
}
