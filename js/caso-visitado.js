// "Último aberto": marca, em cada painel, a linha ou o cartão em que a pessoa
// clicou para ir ao fluxograma de um caso. Ao voltar para o painel, a marca
// mostra de onde ela saiu.
//
// Vale para qualquer painel, sem mexer em cada um:
//   * um clique dentro de um painel que termina com o Fluxograma aberto grava
//     a marca daquele painel (uma por painel; o clique seguinte substitui);
//   * os painéis são remontados ao abrir e quando os dados atualizam, então a
//     marca é reaplicada sempre que o conteúdo do painel muda;
//   * a marca fica guardada enquanto a aba estiver aberta (sessionStorage).
//
// O item é reencontrado pelo atributo do caso (data-caso e semelhantes) e pela
// posição entre os itens do mesmo caso: com duas linhas do mesmo caso na
// tabela, marca a que foi clicada.
//
// O visual está em style.css (.caso-visitado): fundo azul claro, uma barra à
// esquerda e o texto "último aberto", para não depender só da cor.

const VISITADO_CLASSE = 'caso-visitado';
const VISITADO_STORAGE = 'anresf.caso.visitado';
// Onde fica o caso em cada tipo de item clicável.
const VISITADO_ALVOS = [
  { base: '', atributo: 'data-caso' },          // painéis operacionais, Panorama, Dossiê
  { base: '', atributo: 'data-macro-caso' },    // Processos
  { base: '', atributo: 'data-arc-caso' },      // Arrecadação
  { base: '', atributo: 'data-lst-caso' },      // Sanções padrão
  { base: '.inicio-card', atributo: 'data-numero' }, // Início
];
const visitadoPorPainel = new Map(); // id do painel -> { base, atributo, valor, pos }

function visitadoSeletor(chave) {
  return `${chave.base}[${chave.atributo}="${String(chave.valor).replace(/["\\]/g, '\\$&')}"]`;
}

// Entre os itens do mesmo caso, o da posição clicada; se a lista encolheu, o primeiro.
function visitadoLocalizar(lista, pos) {
  return lista[pos] || lista[0] || null;
}

// Quem recebe a marca: a linha da tabela, o item da lista ou o cartão. Um
// botão dentro de uma linha marca a linha inteira.
function visitadoContainer(el) {
  if (!el) return null;
  if (el.matches('tr, li, article, .inicio-card')) return el;
  return el.closest('tr, li, article') || el;
}

function visitadoChave(painel, alvo) {
  const def = VISITADO_ALVOS.find((d) => alvo.matches(`${d.base}[${d.atributo}]`));
  if (!def) return null;
  const chave = { base: def.base, atributo: def.atributo, valor: alvo.getAttribute(def.atributo) || '' };
  if (!chave.valor) return null;
  chave.pos = Math.max(Array.from(painel.querySelectorAll(visitadoSeletor(chave))).indexOf(alvo), 0);
  return chave;
}

function visitadoAplicar(painel) {
  const chave = visitadoPorPainel.get(painel.id);
  const marcado = chave ? visitadoContainer(visitadoLocalizar(Array.from(painel.querySelectorAll(visitadoSeletor(chave))), chave.pos)) : null;
  painel.querySelectorAll(`.${VISITADO_CLASSE}`).forEach((el) => {
    if (el === marcado) return;
    el.classList.remove(VISITADO_CLASSE);
    el.removeAttribute('aria-current');
  });
  if (marcado && !marcado.classList.contains(VISITADO_CLASSE)) {
    marcado.classList.add(VISITADO_CLASSE);
    marcado.setAttribute('aria-current', 'true');
  }
}

function visitadoGuardar() {
  try { sessionStorage.setItem(VISITADO_STORAGE, JSON.stringify(Array.from(visitadoPorPainel.entries()))); } catch (erro) { /* sem armazenamento: a marca vale só até recarregar */ }
}

function visitadoLer() {
  try {
    const lido = JSON.parse(sessionStorage.getItem(VISITADO_STORAGE) || '[]');
    (Array.isArray(lido) ? lido : []).forEach(([id, chave]) => {
      if (typeof id === 'string' && chave && VISITADO_ALVOS.some((d) => d.base === chave.base && d.atributo === chave.atributo) && typeof chave.valor === 'string') {
        visitadoPorPainel.set(id, { base: chave.base, atributo: chave.atributo, valor: chave.valor, pos: Number(chave.pos) || 0 });
      }
    });
  } catch (erro) { /* dado inválido: começa sem marcas */ }
}

(() => {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  visitadoLer();
  const seletorAlvos = VISITADO_ALVOS.map((d) => `${d.base}[${d.atributo}]`).join(',');

  // Na fase de captura, antes de o painel reagir ao clique: guarda qual item
  // foi clicado. Se ao fim do clique o Fluxograma estiver aberto, a marca vale.
  document.addEventListener('click', (event) => {
    const origem = event.target && typeof event.target.closest === 'function' ? event.target : null;
    if (!origem) return;
    const painel = origem.closest('.panel');
    if (!painel || painel.id === 'fluxograma') return;
    const alvo = origem.closest(seletorAlvos);
    if (!alvo || !painel.contains(alvo)) return;
    const chave = visitadoChave(painel, alvo);
    if (!chave) return;
    setTimeout(() => {
      const ativo = document.querySelector('.panel.active-panel');
      if (!ativo || ativo.id !== 'fluxograma') return;
      visitadoPorPainel.set(painel.id, chave);
      visitadoGuardar();
      visitadoAplicar(painel);
    }, 0);
  }, true);

  // Reaplica a marca quando o painel é remontado.
  if (typeof MutationObserver !== 'function') return;
  const pendentes = new Set();
  const agendar = (painel) => {
    if (!visitadoPorPainel.has(painel.id)) return;
    if (!pendentes.size) requestAnimationFrame(() => { const lista = Array.from(pendentes); pendentes.clear(); lista.forEach(visitadoAplicar); });
    pendentes.add(painel);
  };
  document.querySelectorAll('.panel').forEach((painel) => {
    if (painel.id === 'fluxograma') return;
    new MutationObserver(() => agendar(painel)).observe(painel, { childList: true, subtree: true });
    agendar(painel);
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { visitadoSeletor, visitadoLocalizar };
}
