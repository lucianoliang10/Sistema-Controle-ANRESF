// Prazo de cada etapa: início, prazo final e envio.
//
// Cada etapa tem três datas:
//   * INÍCIO  (coluna data_etapa; nas linhas, `dataEnvio`, nome antigo que a
//     view do banco ainda usa): o dia em que o prazo começa a contar;
//   * PRAZO   (coluna prazo; `prazoFinal`): o último dia para entregar;
//   * ENVIO   (coluna data_envio; `enviadaEm`): o dia em que a etapa foi de
//     fato enviada.
// Com as três dá para dizer se a entrega saiu antes ou depois do prazo e
// quantos dias a etapa consumiu.
//
// Usa prazoEhDiaUtil (js/prazo-calculo.js) para contar dias úteis.

function petMs(valor) {
  if (!valor) return 0;
  const t = String(valor).trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = br ? new Date(+br[3], +br[2] - 1, +br[1]) : (iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : null);
  return d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function petBr(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function petHojeIso(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

// Dias corridos de `a` até `b` (negativo quando b vem antes de a).
function petDias(aMs, bMs) {
  return Math.round((bMs - aMs) / 86400000);
}

// Dias úteis depois de `a` até `b`, contando o dia `b`. É a mesma conta de
// "N dias úteis a partir da data": de sexta até segunda dá 1.
function petDiasUteis(aMs, bMs) {
  if (!aMs || !bMs) return 0;
  if (bMs < aMs) return -petDiasUteis(bMs, aMs);
  const util = typeof prazoEhDiaUtil === 'function' ? prazoEhDiaUtil : (d) => d.getDay() !== 0 && d.getDay() !== 6;
  let n = 0;
  const dia = new Date(aMs);
  const fim = new Date(bMs);
  for (;;) {
    dia.setDate(dia.getDate() + 1);
    if (dia.getTime() > fim.getTime()) break;
    if (util(dia)) n += 1;
  }
  return n;
}

function petPlural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

// Leitura do prazo de uma etapa.
//   tipo: 'antes' | 'no-dia' | 'depois'  → enviada, com prazo para comparar
//         'enviada'                      → enviada, sem prazo cadastrado
//         ''                             → ainda sem data de envio
//   saldo: dias entre o envio e o prazo (positivo = antes do prazo)
//   usados / usadosUteis: do início até o envio
//   concedidos: do início até o prazo
function petSituacao(row) {
  const inicioMs = petMs(row && (row.dataEnvio || row.dataEtapa));
  const prazoMs = petMs(row && row.prazoFinal);
  const envioMs = petMs(row && row.enviadaEm);
  const r = {
    inicioMs, prazoMs, envioMs, tipo: '', classe: '', texto: '', dica: '',
    saldo: null, usados: null, usadosUteis: null, concedidos: inicioMs && prazoMs ? petDias(inicioMs, prazoMs) : null,
  };
  if (!envioMs) return r;
  if (inicioMs) { r.usados = petDias(inicioMs, envioMs); r.usadosUteis = petDiasUteis(inicioMs, envioMs); }
  if (prazoMs) {
    r.saldo = petDias(envioMs, prazoMs);
    if (r.saldo > 0) { r.tipo = 'antes'; r.classe = 'green'; r.texto = `${petPlural(r.saldo, 'dia', 'dias')} antes do prazo`; }
    else if (r.saldo === 0) { r.tipo = 'no-dia'; r.classe = 'green'; r.texto = 'No dia do prazo'; }
    else { r.tipo = 'depois'; r.classe = 'red'; r.texto = `${petPlural(-r.saldo, 'dia', 'dias')} depois do prazo`; }
  } else {
    r.tipo = 'enviada';
    r.classe = 'neutral';
    r.texto = r.usados !== null && r.usados >= 0 ? `Enviada em ${petPlural(r.usados, 'dia', 'dias')}` : 'Enviada';
  }
  const partes = [inicioMs ? `Início ${petBr(inicioMs)}` : '', prazoMs ? `Prazo ${petBr(prazoMs)}` : '', `Envio ${petBr(envioMs)}`].filter(Boolean);
  const uso = r.usados === null || r.usados < 0 ? ''
    : `Usou ${petPlural(r.usados, 'dia corrido', 'dias corridos')}${r.concedidos !== null && r.concedidos >= 0 ? ` de ${r.concedidos}` : ''} (${petPlural(r.usadosUteis, 'dia útil', 'dias úteis')}).`;
  r.dica = [partes.join(' · '), uso].filter(Boolean).join('\n');
  return r;
}

// Selo do prazo para o card e o histórico. '' quando a etapa não tem envio.
function petSeloHtml(row) {
  const s = petSituacao(row);
  if (!s.tipo) return '';
  const e = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<span class="pet-selo ${s.classe}" title="${e(s.dica)}">${e(s.texto)}</span>`;
}

// Incoerências de datas, para avisar no formulário antes de gravar (não
// bloqueiam: há etapa registrada depois do fato).
function petAvisoDatas(inicioIso, prazoIso, envioIso, hojeIso = petHojeIso()) {
  const inicio = petMs(inicioIso); const prazo = petMs(prazoIso); const envio = petMs(envioIso);
  if (envio && inicio && envio < inicio) return 'A data de envio é anterior ao início do prazo. Confira as datas.';
  if (envio && envio > petMs(hojeIso)) return 'A data de envio está no futuro. Confira a data.';
  if (prazo && inicio && prazo < inicio) return 'O prazo final é anterior ao início do prazo. Confira as datas.';
  return '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { petMs, petBr, petHojeIso, petDias, petDiasUteis, petSituacao, petSeloHtml, petAvisoDatas };
}
