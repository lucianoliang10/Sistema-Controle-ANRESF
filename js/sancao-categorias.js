// Sanção por categoria. Só existe nas etapas que decidem ou propõem sanção:
//   * Auto de Infração → sanção PROPOSTA;
//   * Acórdão e Decisão da Presidência → sanção APLICADA.
//
// O formato das linhas depende da ORIGEM do caso (sancModoOrigem):
//   * 'categorias' (Solvência, Monitoramento): uma linha por categoria de dívida
//     (transição, empregados, clubes nacionais, clubes estrangeiros, poder
//     público) + Geral;
//   * 'periodo' (Denúncia): o atraso é do período transitório ou da aplicação
//     plena → duas linhas + Geral;
//   * 'livre' (DF, Evento de Insolvência e origens não previstas): linhas
//     "motivo → sanção" que o usuário adiciona à vontade.
//
// Cada etapa guarda:
//   * sancao_detalhe (jsonb no banco, sancaoDetalhe na linha do fluxograma):
//     { <chave da categoria>: 'texto', ..., livre: [{ motivo, sancao }, ...] },
//     só com o que foi preenchido;
//   * sancao (texto): o RESUMO, cada sanção uma vez ("Advertência +
//     Transferban + Exclusão PARF-B"). É o texto que Sanções, Julgamentos e
//     Panorama já leem, então esses painéis seguem funcionando como antes.
// Etapa antiga só tem o texto: ao editar, ele aparece na linha "Geral" (ou na
// primeira linha livre).

const SANC_CATEGORIAS_DIVIDA = [
  { chave: 'transicao', rotulo: 'Dívida em transição', curto: 'Transição' },
  { chave: 'empregados', rotulo: 'Dívida com empregados', curto: 'Empregados' },
  { chave: 'clubes_nacionais', rotulo: 'Dívida com clubes nacionais', curto: 'Clubes nacionais' },
  { chave: 'clubes_estrangeiros', rotulo: 'Dívida com clubes estrangeiros', curto: 'Clubes estrangeiros' },
  { chave: 'poder_publico', rotulo: 'Dívida com poder público', curto: 'Poder público' },
];
const SANC_CATEGORIAS_PERIODO = [
  { chave: 'transitorio', rotulo: 'Atraso no período transitório', curto: 'Período transitório' },
  { chave: 'plena', rotulo: 'Atraso na aplicação plena', curto: 'Aplicação plena' },
];
const SANC_GERAL = { chave: 'geral', rotulo: 'Geral (processo todo)', curto: 'Geral' };
const SANC_MODOS = {
  categorias: { rotulo: 'por categoria de dívida', categorias: [...SANC_CATEGORIAS_DIVIDA, SANC_GERAL] },
  periodo: { rotulo: 'por período da infração', categorias: [...SANC_CATEGORIAS_PERIODO, SANC_GERAL] },
  livre: { rotulo: 'por motivo', categorias: [] },
};
// Todas as chaves fixas conhecidas, para exibir qualquer etapa seja qual for a origem.
const SANC_CATEGORIAS = [...SANC_CATEGORIAS_DIVIDA, ...SANC_CATEGORIAS_PERIODO, SANC_GERAL];
const SANC_CHAVES = SANC_CATEGORIAS.map((c) => c.chave);
const SANC_LIVRE_MIN = 2;

// Modo do bloco pela origem do caso.
function sancModoOrigem(origem) {
  const n = normStatus(origem);
  if (n.includes('denuncia')) return 'periodo';
  if (n.includes('insolv')) return 'livre'; // "Evento de Insolvência" também contém "solv"
  if (n.includes('solv') || n.includes('monitor')) return 'categorias';
  return 'livre'; // DF e o que mais aparecer
}

function sancCategoriasDoModo(modo) {
  return (SANC_MODOS[modo] || SANC_MODOS.livre).categorias;
}

// 'proposta' (auto), 'aplicada' (acórdão/decisão) ou null (etapa sem sanção).
function sancTipoEtapa(nomeEtapa) {
  const n = normStatus(nomeEtapa);
  if (!n || n.includes('despacho')) return null;
  if (n.includes('auto-de-infracao') || n.includes('auto-infracao')) return 'proposta';
  if (n.includes('acordao') || n.includes('decisao-da-presidencia') || n.includes('decisao-presidencia')) return 'aplicada';
  return null;
}

// Aceita objeto ou JSON em texto; devolve só as chaves conhecidas e
// preenchidas (e as linhas livres com motivo ou sanção), ou null se vazio.
function sancDetalheLimpo(valor) {
  let obj = valor;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const limpo = {};
  SANC_CHAVES.forEach((k) => {
    const v = String(obj[k] ?? '').trim();
    if (v) limpo[k] = v;
  });
  if (Array.isArray(obj.livre)) {
    const livre = obj.livre.map((l) => ({ motivo: String(l?.motivo ?? '').trim(), sancao: String(l?.sancao ?? '').trim() }))
      .filter((l) => l.motivo || l.sancao);
    if (livre.length) limpo.livre = livre;
  }
  return Object.keys(limpo).length ? limpo : null;
}

function sancDetalheDaLinha(row) {
  return sancDetalheLimpo(row?.sancaoDetalhe ?? row?.sancao_detalhe);
}

// "(i) Exclusão PARF-B" → "Exclusão PARF-B": a numeração dos textos antigos
// marcava a categoria; agora a categoria tem campo próprio.
function sancParteLimpa(parte) {
  return String(parte || '').trim().replace(/^\(\s*[ivxlc]+\s*\)\s*/i, '').trim();
}

function sancPartesDoTexto(texto) {
  return String(texto || '').split('+').map(sancParteLimpa).filter(Boolean);
}

// Textos de sanção do detalhe, na ordem de exibição: Geral primeiro (é onde
// costuma ficar a Advertência), depois as categorias fixas, depois as livres.
function sancTextosDetalhe(det) {
  if (!det) return [];
  const fixas = ['geral', ...SANC_CHAVES.filter((k) => k !== 'geral')].map((k) => det[k]).filter(Boolean);
  return [...fixas, ...(det.livre || []).map((l) => l.sancao)];
}

// Resumo para o campo sancao: cada sanção uma vez.
function sancResumoDetalhe(detalhe) {
  const det = sancDetalheLimpo(detalhe);
  if (!det) return '';
  const vistos = new Set();
  const partes = [];
  sancTextosDetalhe(det).forEach((texto) => sancPartesDoTexto(texto).forEach((p) => {
    const chave = normStatus(p);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    partes.push(p);
  }));
  return partes.join(' + ');
}

// Linhas para exibir: [{ chave, rotulo, curto, valor }]. Categorias fixas na
// ordem conhecida (Geral por último), depois as linhas livres com o motivo
// como rótulo.
function sancLinhasDetalhe(detalhe) {
  const det = sancDetalheLimpo(detalhe);
  if (!det) return [];
  const fixas = SANC_CATEGORIAS.filter((c) => c.chave !== 'geral' && det[c.chave]).map((c) => ({ ...c, valor: det[c.chave] }));
  const livres = (det.livre || []).map((l, i) => ({ chave: `livre:${i}`, rotulo: l.motivo || 'Sem motivo', curto: l.motivo || 'Sem motivo', valor: l.sancao || '—' }));
  const geral = det.geral ? [{ ...SANC_GERAL, valor: det.geral }] : [];
  return [...fixas, ...livres, ...geral];
}

// Sugestões do histórico para um campo, só de etapas do mesmo tipo
// (tipoBaseEtapa, igual ao Objeto):
//   * categoria fixa: primeiro o que já foi usado NESSA categoria, depois as
//     sanções avulsas (inclusive dos textos antigos, partidos no "+");
//   * 'motivo': os motivos das linhas livres;
//   * 'sancao' (linha livre): as sanções avulsas.
// Mais usados primeiro.
function sancSugestoesCategoria(rows, nomeEtapa, categoria) {
  const lista = Array.isArray(rows) ? rows : [];
  const tipo = String(nomeEtapa || '').trim() ? tipoBaseEtapa(nomeEtapa) : '';
  const daCategoria = new Map();
  const avulsas = new Map();
  const somar = (mapa, texto) => {
    const t = String(texto || '').trim();
    if (!t) return;
    const k = normStatus(t);
    const atual = mapa.get(k);
    if (atual) atual.n += 1; else mapa.set(k, { texto: t, n: 1 });
  };
  lista.forEach((row) => {
    if (!sancTipoEtapa(row.etapa)) return;
    if (tipo && tipoBaseEtapa(row.etapa) !== tipo) return;
    const det = sancDetalheDaLinha(row);
    if (det) {
      if (categoria === 'motivo') (det.livre || []).forEach((l) => somar(daCategoria, l.motivo));
      else if (categoria !== 'livre') somar(daCategoria, det[categoria]);
      sancTextosDetalhe(det).forEach((v) => sancPartesDoTexto(v).forEach((p) => somar(avulsas, p)));
    } else {
      sancPartesDoTexto(row.sancao).forEach((p) => somar(avulsas, p));
    }
  });
  const ordenar = (mapa) => Array.from(mapa.values())
    .sort((a, b) => (b.n - a.n) || a.texto.localeCompare(b.texto, 'pt-BR', { sensitivity: 'base' }))
    .map((i) => i.texto);
  if (categoria === 'motivo') return ordenar(daCategoria);
  const primeiras = ordenar(daCategoria);
  const jaTem = new Set(primeiras.map(normStatus));
  return [...primeiras, ...ordenar(avulsas).filter((t) => !jaTem.has(normStatus(t)))];
}

// Auto de Infração do mesmo caso que serve de referência para um acórdão:
// prefere o do mesmo processo (PSS/PSO); entre vários, o mais recente.
function sancAutoDeReferencia(rows, casoBancoId, nomeEtapa) {
  if (casoBancoId === undefined || casoBancoId === null || casoBancoId === '') return null;
  const autos = (Array.isArray(rows) ? rows : []).filter((r) => String(r.caso_banco_id) === String(casoBancoId)
    && sancTipoEtapa(r.etapa) === 'proposta' && (sancDetalheDaLinha(r) || String(r.sancao || '').trim()));
  if (!autos.length) return null;
  const proc = (nome) => { const n = normStatus(nome); return n.includes('pss') ? 'PSS' : n.includes('pso') ? 'PSO' : ''; };
  const alvo = proc(nomeEtapa);
  const mesmos = alvo ? autos.filter((r) => proc(r.etapa) === alvo) : [];
  const candidatos = mesmos.length ? mesmos : autos;
  const ms = (r) => { const m = String(r.dataEnvio || r.dataEtapa || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0; };
  return [...candidatos].sort((a, b) => ms(b) - ms(a))[0];
}

// ---------- exibição (card e histórico) ----------

// HTML da sanção de uma etapa: por categoria quando houver detalhe; senão, o
// texto antigo. `classe` escolhe o visual (card ou histórico).
function sancaoHtmlEtapa(row, classe = 'sancao') {
  const linhas = sancLinhasDetalhe(sancDetalheDaLinha(row));
  if (linhas.length) {
    return `<div class="${classe} sancao-cat">${linhas.map((l) => `<span class="sancao-cat-linha"><span>${esc(l.curto)}</span><strong>${esc(l.valor)}</strong></span>`).join('')}</div>`;
  }
  if (!String(row?.sancao || '').trim()) return '';
  return classe === 'sancao' ? `<p class="sancao">${esc(row.sancao)}</p>` : `<span class="${classe}">${esc(row.sancao)}</span>`;
}

// ---------- formulário ----------

function sancBlocoHtml() {
  return `
          <fieldset class="full sanc-bloco" data-sanc-bloco hidden>
            <legend data-sanc-titulo>Sanção</legend>
            <p class="sanc-ajuda" data-sanc-ajuda></p>
            <div class="sanc-ref-auto" data-sanc-ref-auto hidden></div>
            <div class="sanc-linhas" data-sanc-linhas></div>
            <p class="sanc-resumo" data-sanc-resumo hidden></p>
          </fieldset>`;
}

function sancLinhaFixaHtml(c) {
  return `
      <label class="sanc-linha${c.chave === 'geral' ? ' sanc-linha-geral' : ''}">
        <span class="sanc-rotulo">${esc(c.rotulo)}</span>
        <span class="sanc-campo">
          <input type="text" name="sanc_${c.chave}" data-sanc-cat="${c.chave}" data-sugestoes="sancao:${c.chave}" data-sugestoes-partes autocomplete="off" placeholder="${c.chave === 'geral' ? 'Ex.: Advertência, Arquivamento' : 'Nenhuma'}">
          <small class="sanc-ref" data-sanc-ref="${c.chave}" hidden></small>
        </span>
      </label>`;
}

function sancLinhaLivreHtml(i, motivo = '', sancao = '') {
  return `
      <div class="sanc-linha sanc-linha-livre" data-sanc-livre="${i}">
        <span class="sanc-campo">
          <input type="text" data-sanc-livre-motivo data-sugestoes="sancao:motivo" autocomplete="off" placeholder="Motivo (ex.: Atraso na entrega das DFs)" aria-label="Motivo da sanção" value="${esc(motivo)}">
        </span>
        <span class="sanc-campo">
          <input type="text" data-sanc-livre-sancao data-sugestoes="sancao:livre" data-sugestoes-partes autocomplete="off" placeholder="Sanção" aria-label="Sanção" value="${esc(sancao)}">
        </span>
        <button type="button" class="icon-btn sanc-remover" data-sanc-remover title="Remover linha" aria-label="Remover linha">×</button>
      </div>`;
}

function sancLivreRodapeHtml() {
  return `<div class="sanc-livre-acoes"><button type="button" class="mini-action" data-sanc-adicionar>+ Adicionar linha</button></div>`;
}

const SANC_AJUDA = {
  categorias: 'Preencha só as categorias com sanção. Mais de uma sanção na mesma categoria: separe com <b>+</b>. As sugestões vêm do histórico.',
  periodo: 'Caso de Denúncia: informe a sanção conforme o atraso seja do período transitório ou da aplicação plena. Mais de uma: separe com <b>+</b>.',
  livre: 'Uma linha por motivo: o que gerou a sanção à esquerda, a sanção à direita. Adicione quantas linhas precisar.',
};

function sancCampos(form) {
  return Array.from(form?.querySelectorAll('[data-sanc-cat]') || []);
}

function sancLinhasLivres(form) {
  return Array.from(form?.querySelectorAll('[data-sanc-livre]') || []).map((el) => ({
    motivo: el.querySelector('[data-sanc-livre-motivo]')?.value || '',
    sancao: el.querySelector('[data-sanc-livre-sancao]')?.value || '',
  }));
}

function lerDetalheDoForm(form) {
  const obj = {};
  sancCampos(form).forEach((campo) => { obj[campo.dataset.sancCat] = campo.value; });
  obj.livre = sancLinhasLivres(form);
  return sancDetalheLimpo(obj);
}

// { visivel, detalhe, resumo }: o que o submit grava.
function lerBlocoSancao(form) {
  const bloco = form?.querySelector('[data-sanc-bloco]');
  const visivel = !!bloco && !bloco.hidden;
  const detalhe = visivel ? lerDetalheDoForm(form) : null;
  return { visivel, detalhe, resumo: detalhe ? sancResumoDetalhe(detalhe) : '' };
}

function atualizarResumoSancao(form) {
  const el = form?.querySelector('[data-sanc-resumo]');
  if (!el) return;
  const resumo = sancResumoDetalhe(lerDetalheDoForm(form));
  el.hidden = !resumo;
  el.innerHTML = resumo ? `<b>Resumo nos painéis</b> ${esc(resumo)}` : '';
}

function sancCasoBancoIdDoForm(form) {
  return form?.caso_id?.value || '';
}

// Origem do caso escolhido no formulário: pela lista de casos do select ou,
// na falta, pelas etapas já carregadas do caso.
function sancOrigemDoForm(form) {
  const id = sancCasoBancoIdDoForm(form);
  if (!id) return '';
  const casos = typeof casosDisponiveis !== 'undefined' && Array.isArray(casosDisponiveis) ? casosDisponiveis : [];
  const caso = casos.find((c) => String(c.id) === String(id));
  if (caso?.origem) return caso.origem;
  const rows = typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  return rows.find((r) => String(r.caso_banco_id) === String(id) && r.origem)?.origem || '';
}

// (Re)monta as linhas do bloco para o modo, mantendo o que já estava digitado
// nas chaves que continuam existindo. `det` preenche a partir de um registro.
function montarLinhasSancao(form, modo, det) {
  const area = form?.querySelector('[data-sanc-linhas]');
  if (!area) return;
  const atual = det || lerDetalheDoForm(form) || {};
  area.dataset.sancModo = modo;
  const cats = sancCategoriasDoModo(modo);
  let html = cats.map(sancLinhaFixaHtml).join('');
  if (modo === 'livre') {
    const livres = (atual.livre && atual.livre.length) ? atual.livre : [];
    while (livres.length < SANC_LIVRE_MIN) livres.push({ motivo: '', sancao: '' });
    html += livres.map((l, i) => sancLinhaLivreHtml(i, l.motivo, l.sancao)).join('') + sancLivreRodapeHtml();
  }
  area.innerHTML = html;
  cats.forEach((c) => { const campo = area.querySelector(`[data-sanc-cat="${c.chave}"]`); if (campo && atual[c.chave]) campo.value = atual[c.chave]; });
  if (typeof ligarSugestoesEtapa === 'function') ligarSugestoesEtapa(form);
}

function sancAdicionarLinhaLivre(form, motivo = '', sancao = '') {
  const area = form?.querySelector('[data-sanc-linhas]');
  const rodape = area?.querySelector('.sanc-livre-acoes');
  if (!area || !rodape) return;
  const i = area.querySelectorAll('[data-sanc-livre]').length;
  rodape.insertAdjacentHTML('beforebegin', sancLinhaLivreHtml(i, motivo, sancao));
  if (typeof ligarSugestoesEtapa === 'function') ligarSugestoesEtapa(form);
  area.querySelector(`[data-sanc-livre="${i}"] [data-sanc-livre-motivo]`)?.focus();
}

function sancRemoverLinhaLivre(form, botao) {
  const linha = botao.closest('[data-sanc-livre]');
  const area = form?.querySelector('[data-sanc-linhas]');
  if (!linha || !area) return;
  if (area.querySelectorAll('[data-sanc-livre]').length <= 1) {
    linha.querySelectorAll('input').forEach((i) => { i.value = ''; });
  } else {
    linha.remove();
  }
  atualizarResumoSancao(form);
}

// Mostra/esconde o bloco conforme o nome da etapa, monta as linhas conforme a
// origem do caso e, no acórdão, mostra a sanção proposta no Auto de Infração.
function atualizarBlocoSancao(form, det) {
  const bloco = form?.querySelector('[data-sanc-bloco]');
  if (!bloco) return;
  const nome = form.nome_etapa?.value || '';
  const tipo = sancTipoEtapa(nome);
  bloco.hidden = !tipo;
  const origem = sancOrigemDoForm(form);
  const modo = sancModoOrigem(origem);
  const area = bloco.querySelector('[data-sanc-linhas]');
  if (det !== undefined || area?.dataset.sancModo !== modo) montarLinhasSancao(form, modo, det || undefined);

  const titulo = bloco.querySelector('[data-sanc-titulo]');
  if (titulo) titulo.textContent = `${tipo === 'aplicada' ? 'Sanção aplicada' : 'Sanção proposta'} · ${SANC_MODOS[modo].rotulo}${origem ? ` (${origem})` : ''}`;
  const ajuda = bloco.querySelector('[data-sanc-ajuda]');
  if (ajuda) ajuda.innerHTML = SANC_AJUDA[modo];

  const refAuto = bloco.querySelector('[data-sanc-ref-auto]');
  const refs = bloco.querySelectorAll('[data-sanc-ref]');
  refs.forEach((r) => { r.hidden = true; r.textContent = ''; });
  if (refAuto) { refAuto.hidden = true; refAuto.innerHTML = ''; }
  if (tipo === 'aplicada' && refAuto) {
    const rows = typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
    const auto = sancAutoDeReferencia(rows, sancCasoBancoIdDoForm(form), nome);
    if (auto) {
      const detAuto = sancDetalheDaLinha(auto);
      const quando = auto.dataEnvio || auto.dataEtapa || '';
      refAuto.innerHTML = `<span>Proposta no ${esc(auto.etapa || 'Auto de Infração')}${quando ? ` (${esc(quando)})` : ''}:</span> <strong>${esc(detAuto ? sancResumoDetalhe(detAuto) : auto.sancao)}</strong>`
        + (detAuto ? ' <button type="button" class="mini-action" data-sanc-copiar>Copiar proposta</button>' : '');
      refAuto.hidden = false;
      if (detAuto) {
        refs.forEach((r) => {
          const v = detAuto[r.dataset.sancRef];
          if (v) { r.textContent = `Proposta: ${v}`; r.hidden = false; }
        });
      }
    }
  }
  atualizarResumoSancao(form);
}

function limparBlocoSancao(form) {
  atualizarBlocoSancao(form, {});
}

// Preenche ao editar. Etapa antiga (só texto) vai inteira para "Geral" ou,
// no modo livre, para a sanção da primeira linha.
function preencherBlocoSancao(form, registro) {
  let det = sancDetalheDaLinha(registro);
  const texto = String(registro?.sancao || '').trim();
  if (!det && texto) {
    det = sancModoOrigem(sancOrigemDoForm(form)) === 'livre' ? { livre: [{ motivo: '', sancao: texto }] } : { geral: texto };
  }
  atualizarBlocoSancao(form, det || {});
}

function copiarPropostaDoAuto(form) {
  const rows = typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  const auto = sancAutoDeReferencia(rows, sancCasoBancoIdDoForm(form), form.nome_etapa?.value || '');
  const det = sancDetalheDaLinha(auto);
  if (!det) return;
  // Só preenche o que está vazio: não apaga o que já foi digitado.
  sancCampos(form).forEach((campo) => {
    if (!campo.value.trim() && det[campo.dataset.sancCat]) campo.value = det[campo.dataset.sancCat];
  });
  if (det.livre && form.querySelector('[data-sanc-linhas]')?.dataset.sancModo === 'livre') {
    const existentes = sancLinhasLivres(form).filter((l) => l.motivo || l.sancao);
    if (!existentes.length) montarLinhasSancao(form, 'livre', { livre: det.livre });
    else det.livre.forEach((l) => { if (!existentes.some((e) => normStatus(e.motivo) === normStatus(l.motivo))) sancAdicionarLinhaLivre(form, l.motivo, l.sancao); });
  }
  atualizarResumoSancao(form);
}

// Liga os eventos do bloco. Idempotente.
function ligarBlocoSancao(form) {
  if (!form || form.dataset.sancLigado) return;
  form.dataset.sancLigado = '1';
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t?.dataset && ('sancCat' in t.dataset || 'sancLivreMotivo' in t.dataset || 'sancLivreSancao' in t.dataset)) atualizarResumoSancao(form);
    if (t?.name === 'nome_etapa') atualizarBlocoSancao(form);
  });
  form.addEventListener('change', (e) => {
    if (e.target?.name === 'caso_id' || e.target?.name === 'nome_etapa') atualizarBlocoSancao(form);
  });
  form.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-sanc-copiar]')) { e.preventDefault(); copiarPropostaDoAuto(form); }
    else if (e.target?.closest?.('[data-sanc-adicionar]')) { e.preventDefault(); sancAdicionarLinhaLivre(form); }
    else if (e.target?.closest?.('[data-sanc-remover]')) { e.preventDefault(); sancRemoverLinhaLivre(form, e.target.closest('[data-sanc-remover]')); }
  });
}
