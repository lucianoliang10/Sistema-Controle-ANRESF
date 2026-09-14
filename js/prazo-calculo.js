// Cálculo de prazo: além de digitar a data final, dá para informar um número
// de dias e o campo é preenchido a partir da data inicial — em dias corridos
// ou em dias úteis.
//
// Dias úteis exclui sábados, domingos e FERIADOS NACIONAIS. Carnaval, quarta-
// feira de cinzas e Corpus Christi são ponto facultativo, não feriado
// nacional, e por isso NÃO entram na conta — se a Agência decidir considerá-los,
// basta acrescentá-los em prazoFeriadosMoveis.

// Feriados nacionais de data fixa (Lei 662/1949, Lei 6.802/1980, Lei
// 10.607/2002 e Lei 14.759/2023, que tornou 20/11 feriado nacional).
const PRAZO_FERIADOS_FIXOS = [
  [1, 1],   // Confraternização Universal
  [4, 21],  // Tiradentes
  [5, 1],   // Dia do Trabalho
  [9, 7],   // Independência
  [10, 12], // Nossa Senhora Aparecida
  [11, 2],  // Finados
  [11, 15], // Proclamação da República
  [11, 20], // Consciência Negra
  [12, 25], // Natal
];

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
function prazoPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

// Sexta-feira Santa é o único feriado nacional de data móvel.
function prazoFeriadosMoveis(ano) {
  const pascoa = prazoPascoa(ano);
  return [new Date(ano, pascoa.getMonth(), pascoa.getDate() - 2)];
}

const prazoFeriadosCache = new Map();

// Conjunto de 'MM-DD' dos feriados nacionais do ano.
function prazoFeriadosDoAno(ano) {
  if (prazoFeriadosCache.has(ano)) return prazoFeriadosCache.get(ano);
  const chave = (mes, dia) => `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const set = new Set(PRAZO_FERIADOS_FIXOS.map(([mes, dia]) => chave(mes, dia)));
  prazoFeriadosMoveis(ano).forEach((d) => set.add(chave(d.getMonth() + 1, d.getDate())));
  prazoFeriadosCache.set(ano, set);
  return set;
}

function prazoEhFeriadoNacional(data) {
  const chave = `${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  return prazoFeriadosDoAno(data.getFullYear()).has(chave);
}

function prazoEhDiaUtil(data) {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !prazoEhFeriadoNacional(data);
}

// Os campos são <input type="date">, então o valor é sempre 'AAAA-MM-DD'.
function prazoDeIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(d.getTime()) ? d : null;
}

function prazoParaIso(data) {
  if (!data) return '';
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function prazoParaBr(iso) {
  const d = prazoDeIso(iso);
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
}

// Quantidade de dias válida: inteiro não negativo. Campo vazio devolve NaN —
// Number('') seria 0, e aí um campo em branco viraria "a própria data base".
function prazoNumeroDias(dias) {
  if (dias === '' || dias === null || dias === undefined) return NaN;
  const n = Number(dias);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.trunc(n);
}

// N dias corridos após a data base, literalmente — sem prorrogar quando cai em
// fim de semana ou feriado.
function prazoSomarDiasCorridos(iso, dias) {
  const base = prazoDeIso(iso);
  const n = prazoNumeroDias(dias);
  if (!base || Number.isNaN(n)) return '';
  return prazoParaIso(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n));
}

// N dias úteis após a data base. O dia da base nunca conta: a contagem começa
// no dia seguinte, e só dias úteis são contados. Zero devolve a própria base.
function prazoSomarDiasUteis(iso, dias) {
  const base = prazoDeIso(iso);
  const n = prazoNumeroDias(dias);
  if (!base || Number.isNaN(n)) return '';
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let faltam = n;
  if (faltam <= 0) return prazoParaIso(d);
  while (faltam > 0) {
    d.setDate(d.getDate() + 1);
    if (prazoEhDiaUtil(d)) faltam -= 1;
  }
  return prazoParaIso(d);
}

function prazoCalcular(iso, dias, modo) {
  return modo === 'corridos' ? prazoSomarDiasCorridos(iso, dias) : prazoSomarDiasUteis(iso, dias);
}

// ---------- interface ----------

const PRAZO_MODOS = [
  ['uteis', 'dias úteis'],
  ['corridos', 'dias corridos'],
];

// Monta o controle ao lado de um campo de data e mantém os dois em sincronia.
// O campo alvo precisa de data-prazo-base com o name do campo de data inicial.
function prazoMontarControle(alvo) {
  const form = alvo.closest('form');
  if (!form) return;
  const base = form.querySelector(`input[name="${alvo.dataset.prazoBase}"]`);
  if (!base) return;

  const wrap = document.createElement('span');
  wrap.className = 'prazo-calc';
  wrap.innerHTML = `
    <input type="number" class="prazo-calc-dias" min="0" step="1" inputmode="numeric" placeholder="nº" aria-label="Calcular prazo por quantidade de dias">
    <select class="prazo-calc-modo" aria-label="Tipo de contagem de dias">
      ${PRAZO_MODOS.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}
    </select>
    <span class="prazo-calc-hint" aria-live="polite"></span>`;
  alvo.insertAdjacentElement('afterend', wrap);

  const campoDias = wrap.querySelector('.prazo-calc-dias');
  const campoModo = wrap.querySelector('.prazo-calc-modo');
  const hint = wrap.querySelector('.prazo-calc-hint');

  const aplicar = () => {
    const dias = campoDias.value.trim();
    if (dias === '') { hint.textContent = ''; return; }
    if (!base.value) { hint.textContent = 'Informe a data inicial primeiro.'; return; }
    const iso = prazoCalcular(base.value, dias, campoModo.value);
    if (!iso) { hint.textContent = ''; return; }
    alvo.value = iso;
    const rotulo = PRAZO_MODOS.find(([v]) => v === campoModo.value)?.[1] || '';
    hint.textContent = `${prazoParaBr(iso)} — ${Math.trunc(Number(dias))} ${rotulo} após ${prazoParaBr(base.value)}`;
  };

  // Editar a data à mão desfaz o cálculo: o número informado deixaria de
  // corresponder à data mostrada. Preencher alvo.value por código não dispara
  // 'change', então este ouvinte só reage a quem edita o campo na tela.
  const limpar = () => { campoDias.value = ''; hint.textContent = ''; };

  campoDias.addEventListener('input', aplicar);
  campoModo.addEventListener('change', aplicar);
  base.addEventListener('change', aplicar);
  alvo.addEventListener('change', limpar);
  // Enter no campo de dias calcula, em vez de enviar o formulário.
  campoDias.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); aplicar(); }
  });
}

// Idempotente: pode ser chamada a cada render, só monta o que ainda não tem.
function ligarCalculoPrazo(raiz) {
  const escopo = (typeof raiz === 'string' ? document.querySelector(raiz) : raiz) || document;
  if (!escopo.querySelectorAll) return;
  escopo.querySelectorAll('input[data-prazo-base]:not([data-prazo-ligado])').forEach((alvo) => {
    alvo.setAttribute('data-prazo-ligado', '1');
    prazoMontarControle(alvo);
  });
}

// Os formulários são remontados por vários painéis (drawer de etapa, modais de
// etapa e de tarefa). Em vez de chamar ligarCalculoPrazo em cada ponto de
// render, observamos o DOM e ligamos o que aparecer — inclusive formulários
// futuros, sem precisar lembrar deste arquivo.
if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
  let agendado = false;
  const agendar = () => {
    if (agendado) return;
    agendado = true;
    const executar = () => { agendado = false; ligarCalculoPrazo(document); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(executar);
    else setTimeout(executar, 0);
  };
  const iniciar = () => {
    ligarCalculoPrazo(document);
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
}
