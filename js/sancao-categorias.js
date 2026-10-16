// Sanção por categoria de dívida. Só existe nas etapas que decidem ou propõem
// sanção:
//   * Auto de Infração → sanção PROPOSTA;
//   * Acórdão e Decisão da Presidência → sanção APLICADA.
//
// Cada etapa guarda:
//   * sancao_detalhe (jsonb no banco, sancaoDetalhe na linha do fluxograma):
//     { transicao, empregados, clubes_nacionais, clubes_estrangeiros,
//       poder_publico, geral }, só com as categorias preenchidas;
//   * sancao (texto): o RESUMO, cada sanção uma vez ("Advertência +
//     Transferban + Exclusão PARF-B"). É o texto que Sanções, Julgamentos e
//     Panorama já leem, então esses painéis seguem funcionando como antes.
// Etapa antiga só tem o texto: ao editar, ele aparece na linha "Geral".

const SANC_CATEGORIAS = [
  { chave: 'transicao', rotulo: 'Dívida em transição', curto: 'Transição' },
  { chave: 'empregados', rotulo: 'Dívida com empregados', curto: 'Empregados' },
  { chave: 'clubes_nacionais', rotulo: 'Dívida com clubes nacionais', curto: 'Clubes nacionais' },
  { chave: 'clubes_estrangeiros', rotulo: 'Dívida com clubes estrangeiros', curto: 'Clubes estrangeiros' },
  { chave: 'poder_publico', rotulo: 'Dívida com poder público', curto: 'Poder público' },
  { chave: 'geral', rotulo: 'Geral (processo todo)', curto: 'Geral' },
];
const SANC_CHAVES = SANC_CATEGORIAS.map((c) => c.chave);
const SANC_SUGESTOES_MAX = 8;

// 'proposta' (auto), 'aplicada' (acórdão/decisão) ou null (etapa sem sanção).
function sancTipoEtapa(nomeEtapa) {
  const n = normStatus(nomeEtapa);
  if (!n || n.includes('despacho')) return null;
  if (n.includes('auto-de-infracao') || n.includes('auto-infracao')) return 'proposta';
  if (n.includes('acordao') || n.includes('decisao-da-presidencia') || n.includes('decisao-presidencia')) return 'aplicada';
  return null;
}

// Aceita objeto ou JSON em texto; devolve só as categorias conhecidas e
// preenchidas, ou null quando não sobra nenhuma.
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

// Resumo para o campo sancao: Geral primeiro (é onde costuma ficar a
// Advertência), depois as categorias, cada sanção uma vez.
function sancResumoDetalhe(detalhe) {
  const det = sancDetalheLimpo(detalhe);
  if (!det) return '';
  const ordem = ['geral', ...SANC_CHAVES.filter((k) => k !== 'geral')];
  const vistos = new Set();
  const partes = [];
  ordem.forEach((k) => sancPartesDoTexto(det[k]).forEach((p) => {
    const chave = normStatus(p);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    partes.push(p);
  }));
  return partes.join(' + ');
}

// Linhas para exibir: [{ chave, rotulo, curto, valor }], na ordem das categorias.
function sancLinhasDetalhe(detalhe) {
  const det = sancDetalheLimpo(detalhe);
  if (!det) return [];
  return SANC_CATEGORIAS.filter((c) => det[c.chave]).map((c) => ({ ...c, valor: det[c.chave] }));
}

// Sugestões do histórico para uma categoria, só de etapas do mesmo tipo
// (tipoBaseEtapa, igual ao Objeto). Primeiro o que já foi usado NESSA categoria;
// depois as sanções avulsas do histórico (inclusive dos textos antigos, partidos
// no "+"), para a lista não nascer vazia. Mais usados primeiro.
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
      somar(daCategoria, det[categoria]);
      Object.values(det).forEach((v) => sancPartesDoTexto(v).forEach((p) => somar(avulsas, p)));
    } else {
      sancPartesDoTexto(row.sancao).forEach((p) => somar(avulsas, p));
    }
  });
  const ordenar = (mapa) => Array.from(mapa.values())
    .sort((a, b) => (b.n - a.n) || a.texto.localeCompare(b.texto, 'pt-BR', { sensitivity: 'base' }))
    .map((i) => i.texto);
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
  const linhas = SANC_CATEGORIAS.map((c) => `
      <label class="sanc-linha${c.chave === 'geral' ? ' sanc-linha-geral' : ''}">
        <span class="sanc-rotulo">${esc(c.rotulo)}</span>
        <span class="sanc-campo">
          <input type="text" name="sanc_${c.chave}" data-sanc-cat="${c.chave}" data-sugestoes="sancao:${c.chave}" data-sugestoes-partes autocomplete="off" placeholder="${c.chave === 'geral' ? 'Ex.: Advertência, Arquivamento' : 'Nenhuma'}">
          <small class="sanc-ref" data-sanc-ref="${c.chave}" hidden></small>
        </span>
      </label>`).join('');
  return `
          <fieldset class="full sanc-bloco" data-sanc-bloco hidden>
            <legend data-sanc-titulo>Sanção</legend>
            <p class="sanc-ajuda">Preencha só as categorias com sanção. Mais de uma sanção na mesma categoria: separe com <b>+</b>. As sugestões vêm do histórico.</p>
            <div class="sanc-ref-auto" data-sanc-ref-auto hidden></div>
            <div class="sanc-linhas">${linhas}</div>
            <p class="sanc-resumo" data-sanc-resumo hidden></p>
          </fieldset>`;
}

function sancCampos(form) {
  return Array.from(form?.querySelectorAll('[data-sanc-cat]') || []);
}

function lerDetalheDoForm(form) {
  const obj = {};
  sancCampos(form).forEach((campo) => { obj[campo.dataset.sancCat] = campo.value; });
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

// Mostra/esconde o bloco conforme o nome da etapa, ajusta o título e, no
// acórdão, mostra a sanção proposta no Auto de Infração do caso.
function atualizarBlocoSancao(form) {
  const bloco = form?.querySelector('[data-sanc-bloco]');
  if (!bloco) return;
  const nome = form.nome_etapa?.value || '';
  const tipo = sancTipoEtapa(nome);
  bloco.hidden = !tipo;
  const titulo = bloco.querySelector('[data-sanc-titulo]');
  if (titulo) titulo.textContent = tipo === 'aplicada' ? 'Sanção aplicada' : 'Sanção proposta';

  const refAuto = bloco.querySelector('[data-sanc-ref-auto]');
  const refs = bloco.querySelectorAll('[data-sanc-ref]');
  refs.forEach((r) => { r.hidden = true; r.textContent = ''; });
  if (refAuto) { refAuto.hidden = true; refAuto.innerHTML = ''; }
  if (tipo === 'aplicada' && refAuto) {
    const rows = typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
    const auto = sancAutoDeReferencia(rows, sancCasoBancoIdDoForm(form), nome);
    if (auto) {
      const det = sancDetalheDaLinha(auto);
      const quando = auto.dataEnvio || auto.dataEtapa || '';
      refAuto.innerHTML = `<span>Proposta no ${esc(auto.etapa || 'Auto de Infração')}${quando ? ` (${esc(quando)})` : ''}:</span> <strong>${esc(det ? sancResumoDetalhe(det) : auto.sancao)}</strong>`
        + (det ? ' <button type="button" class="mini-action" data-sanc-copiar>Copiar proposta</button>' : '');
      refAuto.hidden = false;
      if (det) {
        refs.forEach((r) => {
          const v = det[r.dataset.sancRef];
          if (v) { r.textContent = `Proposta: ${v}`; r.hidden = false; }
        });
      }
      bloco.dataset.sancAutoId = String(auto.etapa_banco_id || '');
    }
  }
  atualizarResumoSancao(form);
}

function limparBlocoSancao(form) {
  sancCampos(form).forEach((campo) => { campo.value = ''; });
  atualizarBlocoSancao(form);
}

// Preenche ao editar. Etapa antiga (só texto) vai inteira para "Geral".
function preencherBlocoSancao(form, registro) {
  const det = sancDetalheDaLinha(registro);
  sancCampos(form).forEach((campo) => {
    const k = campo.dataset.sancCat;
    campo.value = det ? (det[k] || '') : (k === 'geral' ? String(registro?.sancao || '').trim() : '');
  });
  atualizarBlocoSancao(form);
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
  atualizarResumoSancao(form);
}

// Liga os eventos do bloco. Idempotente.
function ligarBlocoSancao(form) {
  if (!form || form.dataset.sancLigado) return;
  form.dataset.sancLigado = '1';
  form.addEventListener('input', (e) => {
    if (e.target?.dataset?.sancCat) atualizarResumoSancao(form);
    if (e.target?.name === 'nome_etapa') atualizarBlocoSancao(form);
  });
  form.addEventListener('change', (e) => {
    if (e.target?.name === 'caso_id' || e.target?.name === 'nome_etapa') atualizarBlocoSancao(form);
  });
  form.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-sanc-copiar]')) { e.preventDefault(); copiarPropostaDoAuto(form); }
  });
}
