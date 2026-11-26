// Lista padrão de sanções.
//
// É a lista suspensa dos campos de sanção do formulário de etapa. Quem define
// é a equipe, no painel Administração › Sanções padrão; fica guardada no
// servidor (/api/listas).
//
// Enquanto ninguém salvar uma lista, vale a BASE AUTOMÁTICA: tudo o que já foi
// digitado nos campos de sanção das etapas, do mais usado para o menos usado.
// É dela que a lista começa.
//
// Um item da lista vale também para textos que começam com ele: com "Multa"
// na lista, "Multa de R$ 40.000,00" está dentro do padrão.
//
// Usa as regras de js/sancao-categorias.js (carregado antes).

const sancListaEstado = { carregada: false, carregando: null, salva: null, semTabela: false, erro: '' };

function sancListaChave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Texto de um item como o servidor guarda: aparado, sem "+" (que separa uma
// sanção da outra no campo).
function sancListaTexto(bruto) {
  return String(bruto || '').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Sem repetição, ignorando acento e caixa; fica a primeira grafia.
function sancListaLimpar(itens) {
  const vistos = new Set();
  const limpos = [];
  (itens || []).forEach((bruto) => {
    const texto = sancListaTexto(bruto);
    const chave = sancListaChave(texto);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    limpos.push(texto);
  });
  return limpos;
}

// Cada sanção digitada numa etapa, já separada pelo "+". Uma etapa conta uma
// vez por sanção, mesmo que ela apareça em mais de uma categoria.
function sancListaPartesDaEtapa(row) {
  const det = typeof sancDetalheDaLinha === 'function' ? sancDetalheDaLinha(row) : null;
  const textos = det ? sancTextosDetalhe(det) : [row && row.sancao];
  const vistos = new Set();
  const partes = [];
  textos.forEach((texto) => sancPartesDoTexto(texto).forEach((parte) => {
    const chave = sancListaChave(parte);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    partes.push(parte);
  }));
  return partes;
}

// Base automática: [{ texto, n }], do mais usado para o menos usado. Entre
// grafias do mesmo texto, fica a mais usada.
function sancListaBase(rows) {
  const grupos = new Map(); // chave -> { n, grafias: Map<texto, n> }
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || !row.etapa_banco_id) return;
    sancListaPartesDaEtapa(row).forEach((parte) => {
      const chave = sancListaChave(parte);
      if (!grupos.has(chave)) grupos.set(chave, { n: 0, grafias: new Map() });
      const g = grupos.get(chave);
      g.n += 1;
      g.grafias.set(parte, (g.grafias.get(parte) || 0) + 1);
    });
  });
  return Array.from(grupos.values())
    .map((g) => ({ texto: Array.from(g.grafias.entries()).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'pt-BR'))[0][0], n: g.n }))
    .sort((a, b) => (b.n - a.n) || a.texto.localeCompare(b.texto, 'pt-BR', { sensitivity: 'base' }));
}

// A lista em vigor: a salva, ou a base automática enquanto não houver uma.
function sancListaItens(rows) {
  if (sancListaEstado.salva && sancListaEstado.salva.itens.length) return sancListaEstado.salva.itens.slice();
  return sancListaBase(rows).map((b) => b.texto);
}

// O texto está dentro do padrão? Igual a um item, ou começa com um item
// seguido de mais alguma coisa ("Multa" aceita "Multa de R$ 40.000,00").
function sancListaAceita(parte, itens) {
  const chave = sancListaChave(parte);
  if (!chave) return true;
  return (itens || []).some((item) => { const k = sancListaChave(item); return k && (chave === k || chave.startsWith(`${k} `)); });
}

// Uso da lista nas etapas: quantas e QUAIS etapas usam cada item, e o que foi
// digitado fora dela. Cada texto conta no item MAIS ESPECÍFICO que o aceita.
// As etapas vêm como { row, texto }: a linha da etapa e o que foi digitado nela.
function sancListaUso(rows, itens) {
  const lista = sancListaLimpar(itens);
  const chaves = lista.map(sancListaChave);
  const porItem = lista.map(() => 0);
  const etapasPorItem = lista.map(() => []);
  const fora = new Map(); // chave -> { texto, n, casos: Set, etapas: [] }
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || !row.etapa_banco_id) return;
    sancListaPartesDaEtapa(row).forEach((parte) => {
      const chave = sancListaChave(parte);
      let melhor = -1;
      chaves.forEach((k, i) => { if ((chave === k || chave.startsWith(`${k} `)) && (melhor < 0 || k.length > chaves[melhor].length)) melhor = i; });
      if (melhor >= 0) { porItem[melhor] += 1; etapasPorItem[melhor].push({ row, texto: parte }); return; }
      if (!fora.has(chave)) fora.set(chave, { texto: parte, n: 0, casos: new Set(), etapas: [] });
      const f = fora.get(chave);
      f.n += 1;
      f.etapas.push({ row, texto: parte });
      f.casos.add(String(row.casoRaiz || row.numero_caso || row.caso_banco_id || ''));
    });
  });
  return {
    porItem,
    etapasPorItem,
    fora: Array.from(fora.values())
      .map((f) => ({ texto: f.texto, n: f.n, etapas: f.etapas, casos: Array.from(f.casos).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })) }))
      .sort((a, b) => (b.n - a.n) || a.texto.localeCompare(b.texto, 'pt-BR', { sensitivity: 'base' })),
  };
}

// Sanções de um texto de campo que estão fora da lista ("A + B" → cada parte).
function sancListaForaDoPadrao(textos, itens) {
  const vistos = new Set();
  const fora = [];
  (textos || []).forEach((texto) => sancPartesDoTexto(texto).forEach((parte) => {
    const chave = sancListaChave(parte);
    if (!chave || vistos.has(chave) || sancListaAceita(parte, itens)) return;
    vistos.add(chave);
    fora.push(parte);
  }));
  return fora;
}

// ---------- servidor ----------

// Busca a lista salva uma vez; as telas que dependem dela chamam de novo sem custo.
function carregarListaSancoes(forcar) {
  if (sancListaEstado.carregando && !forcar) return sancListaEstado.carregando;
  if (sancListaEstado.carregada && !forcar) return Promise.resolve(sancListaEstado);
  sancListaEstado.carregando = (async () => {
    try {
      const resposta = await fetch('/api/listas');
      const json = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error((json && json.erro) || 'Não foi possível ler a lista padrão de sanções.');
      const s = json && json.sancoes;
      sancListaEstado.salva = s && Array.isArray(s.itens) && s.itens.length ? { itens: sancListaLimpar(s.itens), atualizado_em: s.atualizado_em || null, atualizado_por: s.atualizado_por || null } : null;
      sancListaEstado.semTabela = Boolean(json && json.semTabela);
      sancListaEstado.erro = '';
      sancListaEstado.carregada = true;
    } catch (erro) {
      sancListaEstado.erro = erro.message || 'Não foi possível ler a lista padrão de sanções.';
    } finally {
      sancListaEstado.carregando = null;
    }
    return sancListaEstado;
  })();
  return sancListaEstado.carregando;
}

async function salvarListaSancoes(itens) {
  const resposta = await fetch('/api/listas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvar-sancoes', itens: sancListaLimpar(itens) }) });
  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error((json && json.erro) || 'Não foi possível salvar a lista.');
  const s = json.sancoes;
  sancListaEstado.salva = { itens: sancListaLimpar(s.itens), atualizado_em: s.atualizado_em || null, atualizado_por: s.atualizado_por || null };
  sancListaEstado.semTabela = false;
  sancListaEstado.carregada = true;
  return sancListaEstado.salva;
}

// Com sessão aberta, já deixa a lista pronta para o formulário de etapa.
if (typeof authAutenticado === 'function' && typeof fetch === 'function') {
  try { if (authAutenticado()) carregarListaSancoes(); } catch (erro) { /* sem sessão: a lista é buscada quando for usada */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sancListaChave, sancListaTexto, sancListaLimpar, sancListaBase, sancListaItens, sancListaAceita, sancListaUso, sancListaForaDoPadrao };
}
