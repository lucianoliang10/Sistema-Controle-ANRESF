// Painel "Sanções padrão" (Administração): define a lista suspensa dos campos
// de sanção do formulário de etapa.
//
// A lista começa pela base automática (tudo o que já foi digitado nas etapas,
// do mais usado para o menos usado) e a equipe vai ajustando: renomeia, tira,
// acrescenta e reordena. Ao lado, o painel mostra o que está digitado nas
// etapas e ficou fora da lista, para decidir se entra ou se é erro de grafia.
// Clicar em "N etapas" abre a relação das etapas que usam aquele texto, com o
// atalho para abrir cada uma e corrigir.
// As regras estão em js/sancao-lista.js.

// `aberto`: relação de etapas à mostra, 'item:<chave>' ou 'fora:<chave>'.
const lstUI = { itens: null, origem: '', sujo: false, salvando: false, aviso: null, novo: '', aberto: '' };

function lstRows() {
  return typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
}

function lstPlural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// Cópia de trabalho: parte da lista salva ou, sem ela, da base automática.
function lstIniciar(forcar) {
  if (lstUI.itens && !forcar) return;
  const salva = sancListaEstado.salva;
  lstUI.itens = salva ? salva.itens.slice() : sancListaBase(lstRows()).map((b) => b.texto);
  lstUI.origem = salva ? 'salva' : 'base';
  lstUI.sujo = false;
  lstUI.novo = '';
}

function lstNumeroCaso(row) {
  return String(row.casoRaiz || row.numero_caso || row.caso_banco_id || '');
}

// Relação das etapas que usam um texto: caso, etapa, o que foi digitado e o
// atalho para abrir a etapa. Em ordem de caso e, dentro dele, de etapa.
function lstEtapasHtml(etapas) {
  const ordenadas = etapas.slice().sort((a, b) => compararCaso(lstNumeroCaso(a.row), lstNumeroCaso(b.row)) || ((Number(a.row.ordem) || 0) - (Number(b.row.ordem) || 0)));
  const linhas = ordenadas.map(({ row, texto }) => {
    const caso = lstNumeroCaso(row);
    const nome = typeof opParteCaso === 'function' ? opParteCaso(row) : (row.clube || '');
    const campo = String(row.sancao || '').trim();
    // Com mais de uma sanção no campo, mostra o campo inteiro para dar contexto.
    const inteiro = campo && sancListaChave(campo) !== sancListaChave(texto) ? `<span>no campo: ${esc(campo)}</span>` : '';
    return `<tr>
        <td><b>Caso ${esc(caso)}</b><span>${esc(nome)}</span></td>
        <td>${esc(row.etapa || '')}<span>${esc(row.dataEnvio || 'sem data')}</span></td>
        <td class="lst-digitado">${esc(texto)}${inteiro}</td>
        <td class="lst-acao"><button type="button" class="op-btn" data-lst-etapa="${esc(row.etapa_banco_id)}" data-lst-caso="${esc(caso)}" title="Abrir esta etapa para ver ou corrigir a sanção">Abrir etapa</button></td>
      </tr>`;
  }).join('');
  return `<div class="lst-etapas"><table class="lst-etapas-tbl"><thead><tr><th>Caso</th><th>Etapa</th><th>Texto digitado</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// O selo "N etapas" vira botão quando há etapas para mostrar.
function lstUsoHtml(alvo, n, aberto) {
  if (!n) return '<span class="lst-uso zero" title="Nenhuma etapa usa esta sanção">sem uso</span>';
  return `<button type="button" class="lst-uso${aberto ? ' aberto' : ''}" data-lst-ver="${esc(alvo)}" aria-expanded="${aberto}" title="${aberto ? 'Fechar a relação de etapas' : 'Ver quais etapas usam este texto'}">${lstPlural(n, 'etapa', 'etapas')} <i aria-hidden="true">${aberto ? '▴' : '▾'}</i></button>`;
}

function lstItemHtml(texto, i, total, etapas) {
  const alvo = `item:${sancListaChave(texto)}`;
  const aberto = etapas.length > 0 && lstUI.aberto === alvo;
  return `<li class="lst-item${aberto ? ' aberto' : ''}" data-lst-item="${i}">
      <span class="lst-pos">${i + 1}</span>
      <input type="text" class="lst-texto" data-lst-texto="${i}" value="${esc(texto)}" maxlength="80" aria-label="Sanção ${i + 1}">
      ${lstUsoHtml(alvo, etapas.length, aberto)}
      <span class="lst-botoes">
        <button type="button" data-lst-subir="${i}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${esc(texto)}">↑</button>
        <button type="button" data-lst-descer="${i}" ${i === total - 1 ? 'disabled' : ''} title="Descer" aria-label="Descer ${esc(texto)}">↓</button>
        <button type="button" class="lst-remover" data-lst-remover="${i}" title="Tirar da lista" aria-label="Tirar ${esc(texto)} da lista">×</button>
      </span>
      ${aberto ? lstEtapasHtml(etapas) : ''}
    </li>`;
}

function lstRender() {
  const painel = document.querySelector('#listas');
  if (!painel) return;
  const topo = (acoes = '') => `<section class="op-hero"><div><span class="op-pill">Administração</span><h2>Sanções padrão</h2><p>A lista suspensa dos campos de sanção das etapas. Defina aqui as sanções que a equipe usa, para todo mundo escrever igual.</p></div><div class="op-actions">${acoes}</div></section>`;
  const vazio = (texto) => `<div class="op-layout">${topo()}<section class="op-card"><div class="op-card-body"><div class="op-empty">${texto}</div></div></section></div>`;
  if (!sancListaEstado.carregada) {
    painel.innerHTML = vazio(sancListaEstado.erro ? `${esc(sancListaEstado.erro)} <button type="button" class="op-btn" data-lst-acao="recarregar">Tentar de novo</button>` : 'Carregando a lista padrão de sanções...');
    return;
  }
  lstIniciar(false);
  const itens = lstUI.itens;
  const uso = sancListaUso(lstRows(), itens);
  // sancListaUso trabalha sobre a lista sem repetição; a tela mostra a cópia
  // de trabalho como está, então casa os usos pelo texto.
  const limpos = sancListaLimpar(itens);
  const etapasDe = (texto) => { const i = limpos.findIndex((l) => sancListaChave(l) === sancListaChave(texto)); return i >= 0 ? uso.etapasPorItem[i] : []; };
  const salva = sancListaEstado.salva;
  const quando = salva && salva.atualizado_em ? new Date(salva.atualizado_em) : null;
  const situacao = lstUI.sujo
    ? '<span class="op-pill orange">Alterações não salvas</span>'
    : (salva ? `<span class="lst-dim">Salva${quando && Number.isFinite(quando.getTime()) ? ` em ${quando.toLocaleDateString('pt-BR')}` : ''}${salva.atualizado_por ? ` por ${esc(salva.atualizado_por)}` : ''}</span>` : '<span class="op-pill orange">Ainda não salva</span>');
  const acoes = `${situacao}<button type="button" class="op-btn" data-lst-acao="descartar" ${lstUI.sujo && !lstUI.salvando ? '' : 'disabled'}>Descartar alterações</button><button type="button" class="op-btn lst-btn-primario" data-lst-acao="salvar" ${(lstUI.sujo || !salva) && itens.length && !lstUI.salvando ? '' : 'disabled'}>${lstUI.salvando ? 'Salvando…' : 'Salvar lista'}</button>`;
  const aviso = lstUI.aviso ? `<div class="ind-aviso ${lstUI.aviso.tipo === 'erro' ? 'erro' : 'ok'}" role="status">${esc(lstUI.aviso.texto)}</div>` : '';
  const semTabela = sancListaEstado.semTabela ? '<div class="ind-aviso erro" role="alert">Falta criar a tabela <b>indicadores_config</b> no Supabase. Sem ela a lista não pode ser salva; a lista suspensa segue com as sanções já usadas nas etapas.</div>' : '';
  const inicial = !salva ? `<div class="lst-inicial"><b>Esta é a base inicial.</b> Ela foi montada com ${lstPlural(itens.length, 'texto que já foi digitado', 'textos que já foram digitados')} nos campos de sanção das etapas, do mais usado para o menos usado. Junte as grafias repetidas, tire o que não é padrão e clique em <b>Salvar lista</b>. Até lá, a lista suspensa das etapas mostra esta base.</div>` : '';
  const fora = uso.fora;
  const linhasFora = fora.map((f) => {
    const alvo = `fora:${sancListaChave(f.texto)}`;
    const aberto = lstUI.aberto === alvo;
    return `<tr${aberto ? ' class="aberto"' : ''}>
      <td><b>${esc(f.texto)}</b></td>
      <td class="lst-num">${lstUsoHtml(alvo, f.etapas.length, aberto)}</td>
      <td class="lst-casos">${esc(f.casos.slice(0, 6).map((c) => `Caso ${c}`).join(', '))}${f.casos.length > 6 ? ` e mais ${f.casos.length - 6}` : ''}</td>
      <td class="lst-acao"><button type="button" class="op-btn" data-lst-incluir="${esc(f.texto)}">Incluir na lista</button></td>
    </tr>${aberto ? `<tr class="lst-det"><td colspan="4">${lstEtapasHtml(f.etapas)}</td></tr>` : ''}`;
  }).join('');
  painel.innerHTML = `<div class="op-layout">
    ${topo(acoes)}
    ${aviso}${semTabela}${inicial}
    <div class="lst-grid">
      <section class="op-card">
        <div class="op-card-head"><div><h3>Lista padrão</h3><p class="op-muted">${lstPlural(itens.length, 'sanção', 'sanções')}, na ordem em que aparecem na lista suspensa.</p></div></div>
        <div class="op-card-body">
          <ol class="lst-lista">${itens.map((texto, i) => lstItemHtml(texto, i, itens.length, etapasDe(texto))).join('') || '<li class="op-empty">A lista está vazia. Acrescente a primeira sanção abaixo.</li>'}</ol>
          <form class="lst-novo" data-lst-novo><input type="text" data-lst-novo-texto maxlength="80" placeholder="Nova sanção. Ex.: Advertência" value="${esc(lstUI.novo)}" aria-label="Nova sanção"><button type="submit" class="op-btn">Acrescentar</button></form>
          <p class="lst-ajuda">Clique em <b>N etapas</b> para ver quais etapas usam aquela sanção e abrir cada uma. Um item vale também para textos que começam com ele: com <b>Multa</b> na lista, "Multa de R$ 40.000,00" está dentro do padrão. No campo da etapa continua valendo o <b>+</b> para mais de uma sanção.</p>
        </div>
      </section>
      <section class="op-card">
        <div class="op-card-head"><div><h3>Digitado nas etapas e fora da lista</h3><p class="op-muted">${fora.length ? `${lstPlural(fora.length, 'texto', 'textos')} que a lista acima não cobre.` : 'Tudo o que foi digitado nas etapas está coberto pela lista.'}</p></div></div>
        <div class="op-card-body">${fora.length ? `<div class="lst-tabela"><table class="lst-tbl"><thead><tr><th>Texto</th><th class="lst-num">Uso</th><th>Onde</th><th></th></tr></thead><tbody>${linhasFora}</tbody></table></div>
          <p class="lst-ajuda">Se for uma sanção válida, inclua na lista. Se for só uma grafia diferente, clique em <b>N etapas</b>, abra a etapa e corrija o texto.</p>` : '<div class="op-empty">Nada fora da lista.</div>'}</div>
      </section>
    </div>
  </div>`;
  if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel('listas');
}

function lstMarcarSujo() {
  lstUI.sujo = true;
  lstUI.aviso = null;
}

async function lstSalvar() {
  if (lstUI.salvando) return;
  const itens = sancListaLimpar(lstUI.itens);
  if (!itens.length) { lstUI.aviso = { tipo: 'erro', texto: 'A lista precisa ter pelo menos uma sanção.' }; return lstRender(); }
  lstUI.salvando = true;
  lstUI.aviso = null;
  lstRender();
  try {
    const repetidos = lstUI.itens.filter((t) => sancListaTexto(t)).length - itens.length;
    await salvarListaSancoes(itens);
    lstUI.salvando = false;
    lstIniciar(true);
    lstUI.aviso = { tipo: 'ok', texto: `Lista salva com ${lstPlural(itens.length, 'sanção', 'sanções')}.${repetidos > 0 ? ` ${lstPlural(repetidos, 'item repetido foi unido', 'itens repetidos foram unidos')}.` : ''} Ela já vale na lista suspensa das etapas.` };
  } catch (erro) {
    lstUI.salvando = false;
    lstUI.aviso = { tipo: 'erro', texto: erro.message || 'Não foi possível salvar a lista.' };
  }
  lstRender();
}

async function renderListas() {
  lstRender();
  await Promise.all([carregarListaSancoes(), typeof opLoad === 'function' ? opLoad() : null]);
  lstRender();
}

(() => {
  const painel = document.querySelector('#listas');
  if (!painel) return;

  painel.addEventListener('click', (event) => {
    const alvo = event.target.closest('button');
    if (!alvo) return;
    const d = alvo.dataset;
    if (d.lstAcao === 'recarregar') { carregarListaSancoes(true).then(lstRender); return; }
    if (d.lstAcao === 'salvar') { lstSalvar(); return; }
    if (d.lstAcao === 'descartar') { lstIniciar(true); lstUI.aviso = null; lstRender(); return; }
    // Abre ou fecha a relação de etapas de um texto.
    if (d.lstVer !== undefined) {
      lstUI.aberto = lstUI.aberto === d.lstVer ? '' : d.lstVer;
      lstRender();
      Array.from(painel.querySelectorAll('[data-lst-ver]')).find((b) => b.dataset.lstVer === d.lstVer)?.focus();
      return;
    }
    // Vai para o caso e abre a etapa em edição, para ver ou corrigir a sanção.
    if (d.lstEtapa !== undefined) {
      if (typeof opGoCaso === 'function') opGoCaso(d.lstCaso);
      if (typeof abrirModalEditarEtapa === 'function') abrirModalEditarEtapa(d.lstEtapa);
      return;
    }
    if (!lstUI.itens) return;
    const mover = (i, para) => { const [item] = lstUI.itens.splice(i, 1); lstUI.itens.splice(para, 0, item); lstMarcarSujo(); lstRender(); painel.querySelector(`[data-lst-texto="${para}"]`)?.focus(); };
    if (d.lstSubir !== undefined) return mover(Number(d.lstSubir), Number(d.lstSubir) - 1);
    if (d.lstDescer !== undefined) return mover(Number(d.lstDescer), Number(d.lstDescer) + 1);
    if (d.lstRemover !== undefined) { lstUI.itens.splice(Number(d.lstRemover), 1); lstMarcarSujo(); lstRender(); return; }
    if (d.lstIncluir !== undefined) { lstUI.itens.push(d.lstIncluir); lstMarcarSujo(); lstRender(); }
  });

  // Digitar num item não refaz a tela (o cursor ficaria perdido); os usos são
  // recontados quando o campo perde o foco.
  painel.addEventListener('input', (event) => {
    const t = event.target;
    if (t.dataset.lstTexto !== undefined && lstUI.itens) {
      lstUI.itens[Number(t.dataset.lstTexto)] = t.value;
      if (!lstUI.sujo) { lstMarcarSujo(); const salvar = painel.querySelector('[data-lst-acao="salvar"]'); const descartar = painel.querySelector('[data-lst-acao="descartar"]'); if (salvar) salvar.disabled = false; if (descartar) descartar.disabled = false; }
    }
    if (t.dataset.lstNovoTexto !== undefined) lstUI.novo = t.value;
  });
  painel.addEventListener('change', (event) => {
    if (event.target.dataset.lstTexto === undefined || !lstUI.itens) return;
    // Item apagado até ficar vazio sai da lista.
    lstUI.itens = lstUI.itens.map(sancListaTexto).filter(Boolean);
    lstRender();
  });
  painel.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-lst-novo]')) return;
    event.preventDefault();
    const texto = sancListaTexto(lstUI.novo);
    if (!texto || !lstUI.itens) return;
    if (lstUI.itens.some((t) => sancListaChave(t) === sancListaChave(texto))) { lstUI.aviso = { tipo: 'erro', texto: `"${texto}" já está na lista.` }; lstRender(); return; }
    lstUI.itens.push(texto);
    lstUI.novo = '';
    lstMarcarSujo();
    lstRender();
    painel.querySelector('[data-lst-novo-texto]')?.focus();
  });

  navItems.forEach((item) => { if (item.dataset.panel === 'listas') item.addEventListener('click', renderListas); });
  if (painel.classList.contains('active-panel')) renderListas();
})();
