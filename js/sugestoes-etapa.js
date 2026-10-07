// Sugestões para os campos Objeto e Sanção do formulário de etapa, tiradas do
// histórico — mas só de etapas do MESMO TIPO da que está sendo preenchida:
// num Parecer Técnico Conclusivo aparecem textos de outros pareceres; num
// Acórdão, só de outros acórdãos. O tipo é o nome antes do " - " (regra de
// tipoBaseEtapa, a mesma do Controle de IDs), então Acórdão - PSS e
// Acórdão - PSO compartilham sugestões.
//
// O campo Sanção é um <textarea>, que não aceita datalist; por isso a lista é
// desenhada pela gente, logo abaixo do campo, e serve para os dois campos.

const SUGESTOES_ETAPA_MAX = 8;

function sugestoesNormalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// Valores distintos de `campo` ('objeto' | 'sancao') nas etapas do mesmo tipo
// que `nomeEtapa`, os mais usados primeiro. Sem nome de etapa, não há como
// saber o tipo: devolve o histórico inteiro.
function sugestoesPorEtapa(rows, nomeEtapa, campo) {
  const lista = Array.isArray(rows) ? rows : [];
  const tipo = String(nomeEtapa || '').trim() ? tipoBaseEtapa(nomeEtapa) : '';
  const contagem = new Map();
  lista.forEach((row) => {
    if (tipo && tipoBaseEtapa(row.etapa) !== tipo) return;
    const texto = String(row[campo] || '').trim();
    if (!texto) return;
    const chave = sugestoesNormalizar(texto);
    const atual = contagem.get(chave);
    if (atual) atual.n += 1;
    else contagem.set(chave, { texto, n: 1 });
  });
  return Array.from(contagem.values())
    .sort((a, b) => (b.n - a.n) || a.texto.localeCompare(b.texto, 'pt-BR', { sensitivity: 'base' }))
    .map((item) => item.texto);
}

// Filtra pelo que já foi digitado (sem acento, sem caixa); o texto idêntico ao
// digitado não é sugestão.
function filtrarSugestoes(lista, digitado) {
  const termo = sugestoesNormalizar(digitado);
  return (lista || []).filter((texto) => {
    const norm = sugestoesNormalizar(texto);
    return norm !== termo && (!termo || norm.includes(termo));
  });
}

// ---------- interface ----------

function sugestoesRotuloTipo(nomeEtapa) {
  const texto = String(nomeEtapa || '').trim();
  if (!texto) return '';
  return texto.split(/\s+[-–—]\s+/)[0];
}

// Liga a lista de sugestões aos campos data-sugestoes="objeto|sancao" do
// formulário. O nome da etapa vem do campo nome_etapa do mesmo formulário.
// Idempotente: pode ser chamada mais de uma vez para o mesmo formulário.
function ligarSugestoesEtapa(form) {
  if (!form || !form.querySelectorAll) return;
  const campoEtapa = form.querySelector('[name="nome_etapa"]');
  form.querySelectorAll('[data-sugestoes]:not([data-sugestoes-ligado])').forEach((campo) => {
    campo.setAttribute('data-sugestoes-ligado', '1');
    const chave = campo.dataset.sugestoes;
    const caixa = document.createElement('div');
    caixa.className = 'sugestoes-lista';
    caixa.hidden = true;
    campo.insertAdjacentElement('afterend', caixa);

    const esconder = () => { caixa.hidden = true; caixa.innerHTML = ''; };
    const mostrar = () => {
      const rows = typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
      const nomeEtapa = campoEtapa ? campoEtapa.value : '';
      const itens = filtrarSugestoes(sugestoesPorEtapa(rows, nomeEtapa, chave), campo.value).slice(0, SUGESTOES_ETAPA_MAX);
      if (!itens.length) { esconder(); return; }
      const tipo = sugestoesRotuloTipo(nomeEtapa);
      const titulo = tipo ? `Usados em etapas de ${tipo}` : 'Usados em outras etapas';
      caixa.innerHTML = `<div class="sugestoes-titulo">${esc(titulo)}</div>`
        + itens.map((texto) => `<button type="button" class="sugestoes-item" data-valor="${esc(texto)}">${esc(texto)}</button>`).join('');
      caixa.hidden = false;
    };

    campo.addEventListener('focus', mostrar);
    campo.addEventListener('input', mostrar);
    campo.addEventListener('blur', () => setTimeout(esconder, 150));
    campo.addEventListener('keydown', (e) => { if (e.key === 'Escape') esconder(); });
    // Trocar o nome da etapa muda o conjunto; recalcula se a lista estiver aberta.
    campoEtapa?.addEventListener('input', () => { if (!caixa.hidden) mostrar(); });
    // mousedown com preventDefault mantém o foco no campo, então o blur não
    // fecha a lista antes do clique chegar.
    caixa.addEventListener('mousedown', (e) => e.preventDefault());
    caixa.addEventListener('click', (e) => {
      const item = e.target.closest('.sugestoes-item');
      if (!item) return;
      campo.value = item.dataset.valor || '';
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      esconder();
      campo.focus();
    });
  });
}
