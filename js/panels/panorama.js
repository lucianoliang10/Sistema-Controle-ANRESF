// Painel Panorama: visão geral do trabalho da Agência até um mês de corte —
// casos, autos de infração, decisões (acórdãos) e sanções. Reaproveita as
// regras de Sanções (operacional.js): ehAutoInfracao, ehAcordao,
// processosSancionadoresDoCaso, sancPartesEfetivas, sancTurmaLabel.
//
// Corte temporal: a data de cada etapa é dataEnvio (ou dataEtapa). Uma etapa
// conta "até o mês X" quando a sua data é anterior ou igual ao fim de X.
// Etapas SEM data entram sempre — o painel informa quantas são.
//
// Caso finalizado: quem manda é o STATUS DO CASO, e a data da última etapa diz
// em que período ele se encerrou. Ver panCasoFinalizado.

// "Dados até" começa no mês de hoje (aaaa-mm), recalculado a cada abertura.
function panCortePadrao() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
let panCorte = panCortePadrao();
// Card aberto no detalhe do rodapé: { dim, val }. null = nenhum.
let panDrill = null;

const PAN_MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// dd/mm/yyyy ou ISO -> ms; 0 quando não há data válida.
function panMs(v) {
  if (!v) return 0;
  const t = String(v).trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const d = br ? new Date(+br[3], +br[2] - 1, +br[1]) : new Date(t);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function panDataEtapa(row) {
  return row.dataEnvio || row.dataEtapa || '';
}

// 'YYYY-MM' a partir de ms (partes locais, sem passar por UTC), ou '' sem data.
function panMesChaveDeMs(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function panMesChave(data) {
  return panMesChaveDeMs(panMs(data));
}

function panMesLabel(chave) {
  const m = String(chave || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return chave || '—';
  return `${PAN_MESES_ABREV[+m[2] - 1] || m[2]}/${m[1]}`;
}

// Último instante do mês 'YYYY-MM'. Corte inválido -> Infinity (sem corte).
function panFimDoMes(chave) {
  const m = String(chave || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY;
  return new Date(+m[1], +m[2], 0, 23, 59, 59, 999).getTime();
}

// Regra pura do corte (testável): sem data entra; com data, só até o fim do mês.
function panDentroDoCorte(row, corte) {
  const ms = panMs(panDataEtapa(row));
  if (!ms) return true;
  return ms <= panFimDoMes(corte);
}

function panRows() {
  return Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
}

function panNumeroCaso(row) {
  return String(row.casoRaiz || row.numero_caso || row.caso_banco_id || row.caso || '');
}

function panMaisFrequente(rows, campo, fb) {
  const m = new Map();
  rows.forEach((r) => { if (r[campo]) m.set(r[campo], (m.get(r[campo]) || 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || fb;
}

// ms -> dd/mm/aaaa (partes locais), '' quando não há data.
function panDataBrDeMs(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// O status do caso prevalece, como no painel Processos: etapas todas
// finalizadas não encerram um caso que o cadastro diz estar em andamento.
function panStatusCasoFinalizado(lista) {
  if (typeof casoIndeferido === 'function' && casoIndeferido(lista)) return true; // indeferimento encerra o caso
  const informado = lista.find((r) => r.statusCaso)?.statusCaso;
  return normStatus(informado).includes('finalizado');
}

// Data em que o caso se encerrou = data da sua ÚLTIMA etapa, olhando TODAS as
// etapas do caso, inclusive as posteriores ao corte. É o que impede um caso
// com atividade em setembro de aparecer como finalizado no corte de agosto.
function panUltimaEtapaPorCaso(rowsTodas) {
  const m = new Map();
  rowsTodas.forEach((row) => {
    const n = panNumeroCaso(row);
    if (!n) return;
    const ms = panMs(panDataEtapa(row));
    if (ms > (m.get(n) || 0)) m.set(n, ms);
  });
  return m;
}

// Finalizado = o status do caso diz que sim E a última etapa já aconteceu até
// o corte. Caso sem nenhuma etapa datada: vale só o status, porque não há
// como situá-lo no tempo.
function panCasoFinalizado(lista, ultimaMs, fimCorte) {
  if (!panStatusCasoFinalizado(lista)) return false;
  if (!ultimaMs) return true;
  return ultimaMs <= fimCorte;
}

// Casos a partir das etapas já cortadas. `ultimas` traz, por caso, a data da
// última etapa considerando também o que está fora do corte.
function panCasos(rows, ultimas, fimCorte) {
  const grupos = new Map();
  rows.forEach((row) => {
    const n = panNumeroCaso(row);
    if (!n) return;
    if (!grupos.has(n)) grupos.set(n, []);
    grupos.get(n).push(row);
  });
  return Array.from(grupos.entries()).map(([caso, lista]) => {
    const datas = lista.map((r) => panMs(panDataEtapa(r))).filter(Boolean);
    const ultimaMs = ultimas.get(caso) || 0;
    return {
      caso, rows: lista,
      clube: panMaisFrequente(lista, 'clube', 'Sem clube'),
      origem: panMaisFrequente(lista, 'origem', 'Sem origem'),
      serie: panMaisFrequente(lista, 'serie', '—'),
      statusCaso: lista.find((r) => r.statusCaso)?.statusCaso || '',
      inicio: datas.length ? Math.min(...datas) : 0,
      ultima: ultimaMs,
      finalizado: panCasoFinalizado(lista, ultimaMs, fimCorte),
    };
  });
}

function panProcesso(nomeEtapa) {
  const n = normStatus(nomeEtapa);
  if (n.includes('pss')) return 'PSS';
  if (n.includes('pso')) return 'PSO';
  return 'Sem PSS/PSO';
}

function panContagem(items, keyFn) {
  const m = new Map();
  items.forEach((it) => { const k = keyFn(it) || '—'; m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => (b[1] - a[1]) || compararCaso(a[0], b[0]));
}

// Turma da decisão: campo turma; senão "Presidência" pelo nome; senão "Sem turma".
function panTurma(row) {
  if (row.turma) return row.turma;
  if (normStatus(row.etapa).includes('presidencia')) return 'Presidência';
  return 'Sem turma';
}

// Resumo completo até o corte. Tudo que o painel exibe sai daqui.
function panResumo(rowsTodas, corte) {
  const fimCorte = panFimDoMes(corte);
  const rows = rowsTodas.filter((r) => panDentroDoCorte(r, corte));
  const semData = rows.filter((r) => !panMs(panDataEtapa(r))).length;
  const casos = panCasos(rows, panUltimaEtapaPorCaso(rowsTodas), fimCorte);

  const autos = rows.filter((r) => ehAutoInfracao(r.etapa));
  const decisoesTodas = rows.filter((r) => !ehAutoInfracao(r.etapa) && ehAcordao(r.etapa, r.sancao));
  const decisoes = decisoesTodas.filter(isFinalizada);
  const decisoesPendentes = decisoesTodas.filter((r) => !isFinalizada(r));

  const processos = casos.flatMap((c) => processosSancionadoresDoCaso(c));
  const aplicadas = processos.filter((p) => p.situacao === 'aplicada');

  // Sanções por tipo: cada parte do "+" conta uma vez.
  const sancoesTipo = new Map();
  aplicadas.forEach((p) => sancPartesEfetivas(p.sancaoAplicada).forEach((s) => sancoesTipo.set(s, (sancoesTipo.get(s) || 0) + 1)));

  // Linha do tempo mensal.
  const meses = new Map();
  const mes = (chave) => { if (!meses.has(chave)) meses.set(chave, { chave, casos: 0, autos: 0, decisoes: 0, sancoes: 0 }); return meses.get(chave); };
  casos.forEach((c) => { if (c.inicio) mes(panMesChaveDeMs(c.inicio)).casos += 1; });
  autos.forEach((r) => { const k = panMesChave(panDataEtapa(r)); if (k) mes(k).autos += 1; });
  decisoes.forEach((r) => { const k = panMesChave(panDataEtapa(r)); if (k) mes(k).decisoes += 1; });
  aplicadas.forEach((p) => { const k = panMesChave(panDataEtapa(p.acordao || {})); if (k) mes(k).sancoes += 1; });
  const linhaTempo = Array.from(meses.values()).sort((a, b) => a.chave.localeCompare(b.chave));

  return {
    corte, semData,
    casos: { total: casos.length, finalizados: casos.filter((c) => c.finalizado).length, emAndamento: casos.filter((c) => !c.finalizado).length },
    autos: autos.length,
    decisoes: decisoes.length,
    decisoesPendentes: decisoesPendentes.length,
    sancoesAplicadas: aplicadas.length,
    clubes: new Set(casos.map((c) => c.clube).filter((c) => c && c !== 'Sem clube')).size,
    desfechos: panContagem(processos, (p) => p.situacaoLabel),
    porOrigem: panContagem(casos, (c) => c.origem),
    porSerie: panContagem(casos, (c) => c.serie),
    porProcesso: panContagem(autos, (r) => panProcesso(r.etapa)),
    porTurma: panContagem(decisoes, panTurma),
    sancoesPorTipo: Array.from(sancoesTipo.entries()).sort((a, b) => (b[1] - a[1]) || compararCaso(a[0], b[0])),
    porClube: panContagem(processos, (p) => p.clube).slice(0, 12),
    linhaTempo,
    // Listas cruas por trás de cada número — o detalhe do rodapé sai daqui,
    // então o que a tabela mostra é exatamente o que o card contou.
    listaCasos: casos,
    listaAutos: autos,
    listaDecisoes: decisoes,
    listaPendentes: decisoesPendentes,
    listaProcessos: processos,
    listaAplicadas: aplicadas,
  };
}

// ---------- detalhe (card clicado) ----------

function panPorClube(casos) {
  const m = new Map();
  casos.forEach((c) => {
    const k = c.clube || 'Sem clube';
    if (!m.has(k)) m.set(k, { clube: k, casos: 0, series: new Set() });
    const e = m.get(k);
    e.casos += 1;
    if (c.serie && c.serie !== '—') e.series.add(c.serie);
  });
  return Array.from(m.values())
    .map((e) => ({ clube: e.clube, casos: e.casos, series: Array.from(e.series).sort(compararCaso).join(', ') || '—' }))
    .sort((a, b) => (b.casos - a.casos) || compararCaso(a.clube, b.clube));
}

// Quais registros compõem o número do card clicado. Função pura: recebe o
// resumo e o recorte, devolve { titulo, tipo, itens }. O tipo define as colunas.
function panDetalhe(r, drill) {
  if (!drill || !drill.dim) return null;
  const { dim, val } = drill;
  const noMes = (rows, chave) => rows.filter((row) => panMesChave(panDataEtapa(row)) === chave);
  const caso = (titulo, itens) => ({ titulo, tipo: 'caso', itens });
  const etapa = (titulo, itens) => ({ titulo, tipo: 'etapa', itens });
  const proc = (titulo, itens) => ({ titulo, tipo: 'processo', itens });

  switch (dim) {
    case 'casos': return caso('Casos', r.listaCasos);
    case 'autos': return etapa('Autos de infração', r.listaAutos);
    case 'decisoes': return etapa('Decisões proferidas', r.listaDecisoes);
    case 'pendentes': return etapa('Decisões aguardando', r.listaPendentes);
    case 'sancoes': return proc('Processos com sanção aplicada', r.listaAplicadas);
    case 'clubes': return { titulo: 'Clubes alcançados', tipo: 'clube', itens: panPorClube(r.listaCasos) };
    case 'desfecho': return proc(`Processos · ${val}`, r.listaProcessos.filter((p) => p.situacaoLabel === val));
    case 'sancaoTipo': return proc(`Sanção aplicada · ${val}`, r.listaAplicadas.filter((p) => sancPartesEfetivas(p.sancaoAplicada).includes(val)));
    case 'turma': return etapa(`Decisões · ${val}`, r.listaDecisoes.filter((row) => panTurma(row) === val));
    case 'origem': return caso(`Casos de origem · ${val}`, r.listaCasos.filter((c) => c.origem === val));
    case 'serie': return caso(`Casos da série ${val}`, r.listaCasos.filter((c) => c.serie === val));
    case 'processoAuto': return etapa(`Autos · ${val}`, r.listaAutos.filter((row) => panProcesso(row.etapa) === val));
    case 'clube': return proc(`Processos · ${val}`, r.listaProcessos.filter((p) => p.clube === val));
    case 'mes-autos': return etapa(`Autos em ${panMesLabel(val)}`, noMes(r.listaAutos, val));
    case 'mes-decisoes': return etapa(`Decisões em ${panMesLabel(val)}`, noMes(r.listaDecisoes, val));
    case 'mes-casos': return caso(`Casos iniciados em ${panMesLabel(val)}`, r.listaCasos.filter((c) => panMesChaveDeMs(c.inicio) === val));
    case 'mes-sancoes': return proc(`Sanções aplicadas em ${panMesLabel(val)}`, r.listaAplicadas.filter((p) => panMesChave(panDataEtapa(p.acordao || {})) === val));
    default: return null;
  }
}

// ---------- render ----------

function panAtivo(dim, val) {
  return panDrill && panDrill.dim === dim && String(panDrill.val ?? '') === String(val ?? '') ? ' ativo' : '';
}

function panBar(label, value, max, cor, dim, val) {
  // Largura mínima só para valores positivos: zero fica sem preenchimento.
  const w = value > 0 && max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  const alvo = val === undefined ? label : val;
  return `<button type="button" class="pan-bar ${esc(cor)}${panAtivo(dim, alvo)}" data-pan-dim="${esc(dim)}" data-pan-val="${esc(alvo)}" title="${esc(label)}: ${value} — clique para ver os registros">
    <span class="pan-bar-label">${esc(label)}</span>
    <span class="pan-bar-track"><span class="pan-bar-fill" style="width:${w}%"></span></span>
    <span class="pan-bar-num">${value}</span>
  </button>`;
}

// entries: [rótulo, valor, valorDoRecorte?]. O 3º item existe quando o rótulo
// exibido difere da chave usada no recorte (ex.: "ago/2026" -> "2026-08").
function panCard(titulo, sub, entries, cor, dim) {
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);
  const corpo = entries.length
    ? entries.map(([label, value, val]) => panBar(label, value, max, cor, dim, val)).join('')
    : '<div class="op-empty">Sem dados até este mês.</div>';
  return `<section class="op-card pan-card"><div class="op-card-head"><div><h3>${esc(titulo)}</h3>${sub ? `<p class="op-muted">${esc(sub)}</p>` : ''}</div></div><div class="op-card-body pan-bars">${corpo}</div></section>`;
}

// Linha do tempo: um cartão por medida (um eixo cada), mesmo conjunto de meses.
function panCardMensal(titulo, linhaTempo, campo, cor) {
  const entries = linhaTempo.map((m) => [panMesLabel(m.chave), m[campo], m.chave]);
  return panCard(titulo, 'Por mês', entries, cor, `mes-${campo}`);
}

function panFiltros(resumo, opcoesRecorte) {
  const nota = resumo.semData
    ? `${resumo.semData} ${resumo.semData === 1 ? 'etapa sem data foi incluída' : 'etapas sem data foram incluídas'} na contagem, por não ser possível situá-las no tempo.`
    : 'Todas as etapas contadas têm data.';
  return `<section class="pan-filtros" aria-label="Filtros do panorama">
    <label class="pan-field"><span class="pan-label">Dados até</span><input id="pan-corte" type="month" value="${esc(panCorte)}" max="2099-12"></label>
    <label class="pan-field pan-field-recorte"><span class="pan-label">Recorte</span><select id="pan-recorte">
      <option value="todos"${panRecorte === 'todos' ? ' selected' : ''}>Todos os casos</option>
      ${(opcoesRecorte || []).map(([k, l, n]) => `<option value="${esc(k)}"${panRecorte === k ? ' selected' : ''}>${esc(l)} (${n} ${n === 1 ? 'caso' : 'casos'})</option>`).join('')}
    </select></label>
    <p class="pan-note">${esc(nota)} Clique em qualquer número ou barra para ver os registros que o compõem.</p>
  </section>`;
}

function panKpi(label, value, cls, sub, dim) {
  return `<button type="button" class="op-kpi op-kpi-btn ${esc(cls)}${panAtivo(dim, '')}" data-pan-dim="${esc(dim)}" data-pan-val=""><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(sub)}</small></button>`;
}

function panKpis(r) {
  return `<div class="op-kpis pan-kpis">
    ${panKpi('Casos', r.casos.total, '', `${r.casos.emAndamento} em andamento · ${r.casos.finalizados} finalizados`, 'casos')}
    ${panKpi('Autos de infração', r.autos, 'orange', 'lavrados', 'autos')}
    ${panKpi('Decisões', r.decisoes, 'blue', r.decisoesPendentes ? `${r.decisoesPendentes} aguardando` : 'acórdãos proferidos', 'decisoes')}
    ${panKpi('Sanções aplicadas', r.sancoesAplicadas, 'green', 'processos com sanção', 'sancoes')}
    ${panKpi('Clubes alcançados', r.clubes, 'purple', 'com pelo menos um caso', 'clubes')}
  </div>`;
}

function panTabelaMeses(linhaTempo) {
  if (!linhaTempo.length) return '';
  const total = linhaTempo.reduce((acc, m) => ({ casos: acc.casos + m.casos, autos: acc.autos + m.autos, decisoes: acc.decisoes + m.decisoes, sancoes: acc.sancoes + m.sancoes }), { casos: 0, autos: 0, decisoes: 0, sancoes: 0 });
  const cel = (chave, campo, valor) => `<td class="pan-num"><button type="button" class="pan-cel${panAtivo(`mes-${campo}`, chave)}" data-pan-dim="mes-${campo}" data-pan-val="${esc(chave)}">${valor}</button></td>`;
  const linhas = linhaTempo.map((m) => `<tr><td>${esc(panMesLabel(m.chave))}</td>${cel(m.chave, 'casos', m.casos)}${cel(m.chave, 'autos', m.autos)}${cel(m.chave, 'decisoes', m.decisoes)}${cel(m.chave, 'sancoes', m.sancoes)}</tr>`).join('');
  return `<section class="op-card"><div class="op-card-head"><div><h3>Mês a mês</h3><p class="op-muted">Casos pela primeira etapa; autos, decisões e sanções pela data da etapa.</p></div></div>
    <div class="op-table-wrap"><table class="op-tbl pan-tbl"><thead><tr><th>Mês</th><th>Casos iniciados</th><th>Autos</th><th>Decisões</th><th>Sanções aplicadas</th></tr></thead>
    <tbody>${linhas}<tr class="pan-total"><td>Total</td><td class="pan-num">${total.casos}</td><td class="pan-num">${total.autos}</td><td class="pan-num">${total.decisoes}</td><td class="pan-num">${total.sancoes}</td></tr></tbody></table></div></section>`;
}

const PAN_COLUNAS = {
  caso: ['Caso', 'Clube', 'Origem', 'Série', 'Situação', 'Última etapa', 'Etapas'],
  etapa: ['Caso', 'Clube', 'Etapa', 'Data', 'Status', 'Sanção'],
  processo: ['Caso', 'Clube', 'Processo', 'Situação', 'Sanção', 'Turma'],
  clube: ['Clube', 'Casos', 'Séries'],
};

function panLinhaDetalhe(tipo, it) {
  const td = (v) => `<td>${esc(v === null || v === undefined || v === '' ? '—' : v)}</td>`;
  if (tipo === 'caso') {
    return `<tr data-caso="${esc(it.caso)}">${td(`Caso ${it.caso}`)}${td(it.clube)}${td(it.origem)}${td(it.serie)}${td(it.finalizado ? 'Finalizado' : ({ julgado: 'Julgado', 'em-fase-de-recurso': 'Em fase de recurso' }[normStatus(it.statusCaso)] || 'Em andamento'))}${td(panDataBrDeMs(it.ultima))}${td(it.rows.length)}</tr>`;
  }
  if (tipo === 'etapa') {
    const n = panNumeroCaso(it);
    return `<tr data-caso="${esc(n)}">${td(`Caso ${n}`)}${td(it.clube)}${td(it.etapa)}${td(panDataEtapa(it))}${td(it.statusEtapa)}${td(it.sancao)}</tr>`;
  }
  if (tipo === 'processo') {
    const sancao = sancPartesEfetivas(it.sancaoAplicada).join(' + ') || it.sancaoAplicada || '';
    return `<tr data-caso="${esc(it.caso)}">${td(`Caso ${it.caso}`)}${td(it.clube)}${td(it.processoLabel || it.processo)}${td(it.situacaoLabel)}${td(sancao)}${td(sancTurmaLabel(it))}</tr>`;
  }
  return `<tr>${td(it.clube)}${td(it.casos)}${td(it.series)}</tr>`;
}

function panSecaoDetalhe(det) {
  if (!det) return '';
  const cols = PAN_COLUNAS[det.tipo] || [];
  const corpo = det.itens.length
    ? det.itens.map((it) => panLinhaDetalhe(det.tipo, it)).join('')
    : `<tr><td colspan="${cols.length}"><div class="op-empty">Nenhum registro.</div></td></tr>`;
  const dica = det.tipo === 'clube' ? '' : ' · clique numa linha para abrir o caso no Fluxograma';
  return `<section class="op-card pan-detalhe" id="pan-detalhe" tabindex="-1">
    <div class="op-card-head">
      <div><h3>${esc(det.titulo)}</h3><p class="op-muted">${det.itens.length} ${det.itens.length === 1 ? 'registro' : 'registros'}${dica}</p></div>
      <button type="button" class="op-btn" data-pan-fechar>Fechar detalhe</button>
    </div>
    <div class="op-table-wrap"><table class="op-tbl pan-tbl-detalhe"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table></div>
  </section>`;
}

// ---------- recorte por origem/período e retrato ----------
// O recorte separa os casos pela origem e, quando houver, pelo período do caso
// ("Solvência · 30/06/2026", "Denúncia · 2026"). Com um recorte escolhido, o
// painel inteiro passa a contar só aqueles casos e ganha o "retrato": cartões
// do recorte e uma tabela por clube, separada por série, com a situação de cada
// processo sancionador e as sanções por tipo.

let panRecorte = 'todos';

// "2026/06/30" ou "2026-06-30" -> "30/06/2026"; outros formatos ficam como vieram.
function panPeriodoLabel(periodo) {
  const t = String(periodo || '').trim();
  const m = t.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

function panRecorteChave(row) {
  return `${(row.origem || '').trim() || 'Sem origem'}|${String(row.periodo || '').trim()}`;
}

function panRecorteLabel(chave) {
  const [origem, periodo] = String(chave || '').split('|');
  return periodo ? `${origem} · ${panPeriodoLabel(periodo)}` : origem;
}

// [chave, rótulo, nº de casos], do recorte com mais casos para o com menos.
function panOpcoesRecorte(rows) {
  const casos = new Map();
  rows.forEach((row) => {
    const n = panNumeroCaso(row);
    if (!n) return;
    const k = panRecorteChave(row);
    if (!casos.has(k)) casos.set(k, new Set());
    casos.get(k).add(n);
  });
  return Array.from(casos.entries())
    .map(([k, set]) => [k, panRecorteLabel(k), set.size])
    .sort((a, b) => (b[2] - a[2]) || compararCaso(a[1], b[1]));
}

function panFiltrarRecorte(rows, chave) {
  if (!chave || chave === 'todos') return rows;
  return rows.filter((row) => panRecorteChave(row) === chave);
}

// Tipos de sanção do texto do acórdão: { ADV, TB, M, PB } com o texto da parte
// (vai no title da célula) e ARQ quando a decisão foi de arquivamento.
const PAN_TIPOS_SANCAO = [
  ['ADV', 'Advertência', (n) => n.includes('advert')],
  ['TB', 'Transferban', (n) => n.includes('transferban')],
  ['M', 'Multa', (n) => n.includes('multa')],
  ['PB', 'Exclusão do PARF-B', (n) => n.includes('parf')],
];
function panSancaoCodigos(texto) {
  const out = {};
  sancPartes(texto).forEach((parte) => {
    const n = normStatus(parte);
    if (n.includes('arquiv')) { out.ARQ = parte; return; }
    const tipo = PAN_TIPOS_SANCAO.find(([, , ok]) => ok(n));
    if (tipo) out[tipo[0]] = out[tipo[0]] ? `${out[tipo[0]]} + ${parte}` : parte;
  });
  return out;
}

function panDataCurta(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Nome exibido: "Denunciante x Clube" nas denúncias (mesma regra do Fluxograma).
function panNomeClube(caso) {
  const row = (caso && caso.rows && caso.rows[0]) || {};
  if (typeof parteCasoFluxograma === 'function') {
    const comDenunciante = caso.rows.find((r) => r.denunciante) || row;
    return parteCasoFluxograma({ ...comDenunciante, clube: caso.clube });
  }
  return caso.clube;
}

// Uma linha por processo sancionador do recorte. hojeMs separa "em pauta"
// (acórdão pendente com data de hoje em diante) de "aguardando decisão".
// Etapa pendente mais antiga do caso, quando ela ainda é de instrução (antes da
// distribuição, da relatoria e do julgamento). null se não houver.
function panEtapaInstrucaoPendente(caso) {
  const pendentes = (caso.rows || []).filter((r) => !isFinalizada(r))
    .sort((a, b) => (panMs(panDataEtapa(a)) || Infinity) - (panMs(panDataEtapa(b)) || Infinity));
  const pend = pendentes[0];
  if (!pend || ehAcordao(pend.etapa, pend.sancao) || ehDespachoDistribuicao(pend.etapa) || ehDespachoRelator(pend.etapa)) return null;
  return pend;
}

function panEtapaPendenteLabel(row) {
  return ehParecerConclusivo(row.etapa) ? 'Parecer técnico pendente' : `${String(row.etapa || 'Etapa').trim()} pendente`;
}

// Caso do recorte que ainda não tem processo sancionador (ex.: denúncia em
// admissibilidade ou aguardando o parecer técnico): entra no retrato também.
function panLinhaCasoSemProcesso(caso) {
  const base = { caso: caso.caso, clube: panNomeClube(caso), serie: caso.serie || '—', processo: '', dataMs: 0, turma: '', codigos: {} };
  if (caso.finalizado) {
    const ultimaMs = Math.max(0, ...caso.rows.map((r) => panMs(panDataEtapa(r))).filter(Boolean));
    return { ...base, situacao: 'julgado', situacaoLabel: `Encerrado${ultimaMs ? ` em ${panDataCurta(ultimaMs)}` : ''}`, dataMs: ultimaMs };
  }
  const pend = panEtapaInstrucaoPendente(caso);
  return { ...base, situacao: 'instrucao', situacaoLabel: pend ? panEtapaPendenteLabel(pend) : 'Em instrução' };
}

function panRetrato(r, hojeMs) {
  const casosPorNumero = new Map(r.listaCasos.map((c) => [c.caso, c]));
  const linhas = r.listaProcessos.map((p) => {
    const caso = casosPorNumero.get(p.caso) || { rows: [], clube: p.clube };
    const dataAcordaoMs = p.acordao ? panMs(panDataEtapa(p.acordao)) : 0;
    const julgado = p.situacao === 'aplicada' || p.situacao === 'sem-sancao-final';
    let situacao; let situacaoLabel;
    if (julgado) {
      situacao = 'julgado';
      const arquivado = !!panSancaoCodigos(p.sancaoAplicada || p.acordao?.sancao).ARQ;
      situacaoLabel = `${arquivado ? 'Arquivado' : 'Julgado'}${dataAcordaoMs ? ` em ${panDataCurta(dataAcordaoMs)}` : ''}${p.reconsideracaoEmJulgamento ? ' · reconsideração' : p.recursoEmJulgamento ? ' · recurso' : ''}`;
    } else if (p.decisaoPendente && dataAcordaoMs && dataAcordaoMs >= hojeMs) {
      situacao = 'pauta'; situacaoLabel = `Em pauta em ${panDataCurta(dataAcordaoMs)}`;
    } else if (panEtapaInstrucaoPendente(caso)) {
      // Acórdão já cadastrado, mas uma etapa anterior (ex.: parecer) segue pendente.
      situacao = 'instrucao'; situacaoLabel = panEtapaPendenteLabel(panEtapaInstrucaoPendente(caso));
    } else if (p.decisaoPendente) {
      situacao = 'andamento'; situacaoLabel = 'Aguardando decisão';
    } else {
      const j = typeof julgamentoDoCaso === 'function' ? julgamentoDoCaso(caso) : null;
      situacao = 'andamento'; situacaoLabel = j ? j.situacaoLabel : 'Aguardando julgamento';
    }
    // Turma só quando o acórdão já está em curso: com o parecer ainda pendente
    // (acórdão "Aguardando etapa anterior", caso em instrução) a turma cadastrada
    // antecipadamente não é mostrada.
    const acordaoAguardando = !!p.acordao && !isFinalizada(p.acordao) && normStatus(p.acordao.statusEtapa).includes('aguardando');
    const turmaBruta = p.acordao?.turma || (julgado ? sancTurmaLabel(p) : '');
    const turma = (situacao === 'instrucao' || acordaoAguardando) ? '' : turmaBruta;
    return {
      caso: p.caso, clube: panNomeClube(caso), serie: p.serie || caso.serie || '—', processo: p.processo,
      situacao, situacaoLabel, dataMs: dataAcordaoMs, turma: turma === 'Sem turma' ? '' : turma,
      codigos: julgado ? panSancaoCodigos(p.sancaoAplicada || p.acordao?.sancao) : {},
      sancaoTexto: julgado ? (p.sancaoAplicada || p.acordao?.sancao || '') : '',
      sancaoDetalhe: julgado && typeof sancDetalheDaLinha === 'function' ? sancDetalheDaLinha(p.acordao) : null,
    };
  });
  const comProcesso = new Set(r.listaProcessos.map((p) => p.caso));
  const semProcesso = r.listaCasos.filter((c) => !comProcesso.has(c.caso)).map(panLinhaCasoSemProcesso);
  linhas.push(...semProcesso);
  // Mais grave primeiro (TB, M, PB), depois julgados, em pauta, em andamento e em instrução.
  const peso = (l) => (l.codigos.TB ? 4 : 0) + (l.codigos.M ? 2 : 0) + (l.codigos.PB ? 1 : 0);
  const ordemSit = { julgado: 0, pauta: 1, andamento: 2, instrucao: 3 };
  linhas.sort((a, b) => (peso(b) - peso(a)) || (ordemSit[a.situacao] - ordemSit[b.situacao]) || compararCaso(a.clube, b.clube));

  const contar = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const julgados = linhas.filter((l) => l.situacao === 'julgado');
  const pauta = linhas.filter((l) => l.situacao === 'pauta');
  const andamento = linhas.filter((l) => l.situacao === 'andamento' || l.situacao === 'instrucao');
  const comSancao = julgados.filter((l) => l.codigos.ADV || l.codigos.TB || l.codigos.M || l.codigos.PB);
  return {
    linhas,
    total: linhas.length,
    casos: new Set(linhas.map((l) => l.caso)).size,
    semProcesso: semProcesso.length,
    porSerie: contar(linhas, (l) => l.serie),
    porProcesso: contar(linhas.filter((l) => l.processo), (l) => l.processo),
    julgados: julgados.length,
    datasJulgamento: Array.from(new Set(julgados.map((l) => l.dataMs).filter(Boolean))).sort((a, b) => a - b),
    turmasJulgados: contar(julgados.filter((l) => l.turma), (l) => l.turma),
    pauta: pauta.length,
    datasPauta: Array.from(new Set(pauta.map((l) => l.dataMs))).sort((a, b) => a - b),
    turmasPauta: contar(pauta.filter((l) => l.turma), (l) => l.turma),
    andamento: andamento.length,
    andamentoPorSituacao: contar(andamento, (l) => (l.situacao === 'instrucao' ? 'em instrução' : l.situacaoLabel)),
    comSancao: comSancao.length,
    porTipo: Object.fromEntries(['TB', 'M', 'PB', 'ADV'].map((k) => [k, julgados.filter((l) => l.codigos[k]).length])),
  };
}

// ---------- retrato: apresentação ----------

function panListaContagem(mapa, sufixo = '') {
  return Array.from(mapa.entries()).sort((a, b) => compararCaso(a[0], b[0])).map(([k, v]) => `${v}${sufixo} ${k}`).join(' · ');
}

function panRetratoKpis(rt, chave = '') {
  const processo = rt.porProcesso.size === 1 ? Array.from(rt.porProcesso.keys())[0] : 'Processos';
  const rotuloProc = processo === 'Sem PSS/PSO' ? 'Processos' : processo;
  const series = Array.from(rt.porSerie.entries()).sort((a, b) => compararCaso(a[0], b[0]))
    .map(([s, n]) => (s && s !== '—' ? `${n} da Série ${s}` : `${n} sem série`)).join(' · ');
  const procs = new Map(Array.from(rt.porProcesso.entries()).map(([k, v]) => [k === 'Sem PSS/PSO' ? 'sem PSO/PSS' : k, v]));
  const subProc = rt.porProcesso.size > 1 ? `${series} · ${panListaContagem(procs)}` : series;
  // Recorte com casos ainda sem processo (ex.: denúncias em instrução): o
  // primeiro cartão conta casos, e os PSO/PSS já instaurados vão no detalhe.
  const ehDenuncia = normStatus(String(chave).split('|')[0]).startsWith('denuncia');
  const instaurados = new Map(Array.from(rt.porProcesso.entries()).filter(([k]) => k !== 'Sem PSS/PSO'));
  const card1 = rt.semProcesso
    ? [rt.casos, ehDenuncia ? 'Denúncias recebidas' : 'Casos no recorte',
      [series, instaurados.size ? `${panListaContagem(instaurados)} instaurado${Array.from(instaurados.values()).reduce((a, b) => a + b, 0) === 1 ? '' : 's'}` : 'nenhum PSO/PSS instaurado'].filter(Boolean).join(' · ')]
    : [rt.total, `${rotuloProc} instaurados`, subProc];
  const datasJ = rt.datasJulgamento;
  const quando = datasJ.length === 0 ? '' : datasJ.length <= 2 ? `acórdãos de ${datasJ.map(panDataCurta).join(' e ')}` : `de ${panDataCurta(datasJ[0])} a ${panDataCurta(datasJ[datasJ.length - 1])}`;
  const turmasJ = rt.turmasJulgados.size ? Array.from(rt.turmasJulgados.keys()).sort(compararCaso).join(', ') : '';
  const subJ = [quando, turmasJ].filter(Boolean).join(' · ') || 'nenhum acórdão finalizado';
  let kpi3;
  if (rt.pauta) {
    const umaData = rt.datasPauta.length === 1;
    const subPauta = [rt.turmasPauta.size ? panListaContagem(rt.turmasPauta, '') .replace(/(\d+) /g, '$1 na ') : '', rt.andamento ? `+ ${rt.andamento} em andamento` : ''].filter(Boolean).join(' · ');
    kpi3 = [rt.pauta, umaData ? `Em pauta em ${panDataCurta(rt.datasPauta[0])}` : 'Em pauta', subPauta || (umaData ? '' : `próxima em ${panDataCurta(rt.datasPauta[0])}`)];
  } else {
    kpi3 = [rt.andamento, 'Em andamento', panListaContagem(rt.andamentoPorSituacao) || 'nenhum processo pendente'];
  }
  const graves = [['TB', 'com Transferban'], ['M', 'com multa'], ['PB', 'com exclusão do PARF-B']]
    .filter(([k]) => rt.porTipo[k]).map(([k, t]) => `${rt.porTipo[k]} ${t}`).join(' · ');
  const subS = graves || (rt.comSancao ? 'somente advertências' : 'nenhuma sanção aplicada');
  const card = (v, l, s) => `<div class="pan-rt-kpi"><strong>${esc(v)}</strong><span>${esc(l)}</span><small>${esc(s)}</small></div>`;
  return `<div class="pan-rt-kpis">
    ${card(card1[0], card1[1], card1[2])}
    ${card(rt.julgados, 'Já julgados', subJ)}
    ${card(kpi3[0], kpi3[1], kpi3[2])}
    ${card(rt.comSancao, 'Com sanção aplicada', subS)}
  </div>`;
}

// Colunas de sanção do retrato: as categorias do bloco de sanção do acórdão
// para a origem do recorte (sancao-categorias.js). Solvência/Monitoramento →
// categorias de dívida; Denúncia → período transitório / aplicação plena;
// Omissão → uma coluna; DF, Evento de Insolvência e demais → uma coluna "Sanção".
function panColunasSancao(origem) {
  const modo = typeof sancModoOrigem === 'function' ? sancModoOrigem(origem) : 'livre';
  const cats = typeof sancCategoriasDoModo === 'function' ? Array.from(sancCategoriasDoModo(modo)) : [];
  if (modo === 'livre' || !cats.length) return { modo: 'livre', colunas: [{ chave: 'livre', rotulo: 'Sanção', curto: 'Sanção' }] };
  const curtos = { transitorio: 'Transitório', plena: 'Apl. plena', clubes_nacionais: 'Clubes nac.', clubes_estrangeiros: 'Clubes estr.', poder_publico: 'Poder públ.' };
  return { modo, colunas: cats.map((c) => ({ ...c, curto: curtos[c.chave] || c.curto })) };
}

// Valor de uma multa escrito de qualquer jeito ("Multa 100k", "R$ 150.000,00",
// "20 mil", "1,5 milhão") → forma curta em milhares ("100k", "150k", "20k",
// "1500k"). Sem número, devolve ''.
function panValorMulta(parte) {
  const t = String(parte || '').replace(/R\$/i, ' ');
  const m = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(k\b|mil\b|milh[õo]es?\b|milh[ãa]o\b)?/i);
  if (!m) return '';
  const inteiro = Number(m[1].replace(/\./g, ''));
  const decimal = m[2] ? Number(`0.${m[2]}`) : 0;
  const unidade = (m[3] || '').toLowerCase();
  let valor = inteiro + decimal;
  if (unidade === 'k' || unidade === 'mil') valor *= 1000;
  else if (unidade.startsWith('milh')) valor *= 1000000;
  const mil = valor / 1000;
  if (valor < 1000) return String(valor); // "Multa 500" (pouco provável; mostra como está)
  return `${Number.isInteger(mil) ? mil : String(mil).replace('.', ',')}k`;
}

// Texto de sanção → forma curta para a célula: "ADV + TB*" (códigos conhecidos),
// multa com o valor ("M 100k", "20k/dia"), "ARQ" para arquivamento; o que não
// é reconhecido entra abreviado.
function panSancaoCurta(texto) {
  const partes = sancPartes(texto);
  if (!partes.length) return '';
  return partes.map((parte) => {
    const n = normStatus(parte);
    const sup = /prospect|condicion/i.test(parte) ? '*' : '';
    if (n.includes('arquiv')) return 'ARQ';
    if (n.startsWith('sem-sancao')) return 'Sem sanção';
    if (/por-dia|diaria|ao-dia/.test(n)) { const v = panValorMulta(parte); return (v ? `${v}/dia` : 'M/dia') + sup; }
    const tipo = PAN_TIPOS_SANCAO.find(([, , ok]) => ok(n));
    if (tipo && tipo[0] === 'M') { const v = panValorMulta(parte); return `M${v ? ` ${v}` : ''}${sup}`; }
    if (tipo) return `${tipo[0]}${sup}`;
    return (parte.length > 16 ? `${parte.slice(0, 15)}…` : parte) + sup;
  }).join(' + ');
}

// Valor da coluna `col` para a linha: do detalhe por categoria quando houver;
// etapa antiga (só texto) cai na coluna Geral ou, sem Geral, na coluna única.
function panValorColunaSancao(l, col, colunas) {
  const det = l.sancaoDetalhe;
  if (det) {
    if (col.chave === 'livre') return [...(det.livre || []).map((x) => (x.motivo ? `${x.motivo}: ${x.sancao}` : x.sancao)), det.geral || ''].filter(Boolean).join(' + ');
    return det[col.chave] || '';
  }
  const unica = colunas.length === 1 ? colunas[0] : colunas.find((c) => c.chave === 'geral');
  return unica && unica.chave === col.chave ? (l.sancaoTexto || '') : '';
}

function panRetratoCelula(texto) {
  if (!texto) return '<td class="pan-rt-cod vazio">—</td>';
  const curto = panSancaoCurta(texto);
  const grave = /TB|\bM\b|PB|\/dia/.test(curto.replace(/\*/g, ''));
  return `<td class="pan-rt-cod${grave ? ' grave' : ''}" title="${esc(texto)}">${esc(curto).replace(/\*/g, '<sup>*</sup>')}</td>`;
}

function panRetratoTabela(titulo, linhas, colunas) {
  if (!linhas.length) return '';
  const corpo = linhas.map((l) => `<tr data-caso="${esc(l.caso)}" class="pan-rt-${esc(l.situacao)}">
      <td class="pan-rt-clube">${esc(l.clube)}${l.processo && l.processo !== 'PSO' && l.processo !== 'Sem PSS/PSO' ? ` <span class="pan-rt-proc">${esc(l.processo)}</span>` : ''}</td>
      <td class="pan-rt-sit">${esc(l.situacaoLabel)}</td>
      ${colunas.map((col) => panRetratoCelula(panValorColunaSancao(l, col, colunas))).join('')}
      <td class="pan-rt-turma">${esc(l.turma || '—')}</td>
    </tr>`).join('');
  return `<section class="op-card pan-rt-tabela"><div class="op-table-wrap"><table class="op-tbl">
    <thead><tr><th>${esc(titulo)}</th><th>Situação</th>${colunas.map((col) => `<th title="${esc(col.rotulo)}">${esc(col.curto)}</th>`).join('')}<th>Turma</th></tr></thead>
    <tbody>${corpo}</tbody></table></div></section>`;
}

function panRetratoSecao(r, chave, hojeMs) {
  const rt = panRetrato(r, hojeMs);
  const titulo = rt.semProcesso
    ? `${panRecorteLabel(chave)}: ${rt.casos} ${rt.casos === 1 ? 'caso' : 'casos'}`
    : `${panRecorteLabel(chave)}: ${rt.total} ${rt.total === 1 ? 'processo sancionador' : 'processos sancionadores'}`;
  const porSerie = new Map();
  rt.linhas.forEach((l) => { const s = l.serie && l.serie !== '—' ? `Clube · Série ${l.serie}` : 'Clube · sem série'; if (!porSerie.has(s)) porSerie.set(s, []); porSerie.get(s).push(l); });
  const { colunas } = panColunasSancao(String(chave).split('|')[0]);
  const tabelas = Array.from(porSerie.entries()).sort((a, b) => compararCaso(a[0], b[0])).map(([t, ls]) => panRetratoTabela(t, ls, colunas)).join('');
  return `<section class="pan-retrato${colunas.length > 1 ? ' pan-rt-larga' : ''}" aria-label="Retrato do recorte">
    <div class="pan-rt-head"><span class="pan-label">Retrato do recorte · dados até ${esc(panMesLabel(panCorte))}</span><h3>${esc(titulo)}</h3></div>
    ${rt.total ? panRetratoKpis(rt, chave) : ''}
    ${rt.total ? `<div class="pan-rt-tabelas">${tabelas}</div>` : '<div class="op-empty">Nenhum caso neste recorte até o mês escolhido.</div>'}
    ${rt.total ? `<p class="pan-rt-legenda"><b>Legenda</b> colunas = categorias de sanção da origem do recorte · ADV advertência · TB transferban · M multa (com o valor) · 20k/dia multa diária · PB exclusão do PARF-B · ARQ arquivado · <sup>*</sup> prospectivo/condicionado · passe o mouse para o texto completo · linhas em destaque: em pauta${rt.linhas.some((l) => l.situacao === 'instrucao') ? ' · situação em itálico: caso ainda em instrução' : ''} · clique numa linha para abrir o caso.</p>` : ''}
  </section>`;
}

// ---------- tempo dos casos ----------
// Quanto tempo cada caso leva: da PRIMEIRA à ÚLTIMA data das ETAPAS do caso.
// As tarefas não entram na conta. O tempo médio usa os casos CONCLUÍDOS:
// os finalizados e os julgados. No caso "Julgado" os trâmites da Agência já
// terminaram; ele só segue aberto enquanto a Unidade Técnica acompanha a
// regularização do clube. Os demais (em andamento, em fase de recurso) entram
// à parte, contados até a data de referência (hoje, ou o fim do mês de corte
// quando ele já passou).
//
// Não contam: o prazo da etapa (é uma data-limite, não um fato do caso) e a
// data de cadastro do registro no sistema. Datas depois da data de referência
// também ficam de fora.

const PAN_DIA_MS = 24 * 60 * 60 * 1000;
const PAN_DATAS_ETAPA = ['dataEnvio', 'dataEtapa', 'dataEntrega', 'dataDecisao'];
const PAN_TEMPO_LINHAS = 25; // casos mostrados antes do "ver todos"

// 'tipo':    por tipo de caso: até a decisão, depois dela e o caso inteiro,
//            com o tempo de cada fase (js/panels/panorama-prazos.js).
// 'acordao': processos iguais, da primeira etapa ao acórdão, por rito
//            (js/panels/panorama-ritos.js).
// 'caso':    o caso inteiro, da primeira à última etapa.
let panTempoModo = 'tipo';
let panTempoVisao = 'finalizados'; // 'finalizados' | 'todos'
let panTempoOrdem = 'maior';       // 'maior' | 'menor' | 'inicio'
let panTempoExpandido = false;
let panTempoAtual = null;   // { referencia, itens } do recorte, antes dos filtros
let panTempoFiltros = {};   // { idDoFiltro: [valores marcados] } dos filtros da seção
let panTempoMenu = '';      // id do filtro com a lista de opções aberta

// Todas as datas das etapas do caso (ms, sem repetição, em ordem), até a referência.
function panDatasDoCaso(rows, referenciaMs) {
  const datas = new Set();
  const somar = (valor) => { const ms = panMs(valor); if (ms && ms <= referenciaMs) datas.add(ms); };
  rows.forEach((row) => PAN_DATAS_ETAPA.forEach((campo) => somar(row[campo])));
  return Array.from(datas).sort((a, b) => a - b);
}

function panMedia(valores) {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

function panMediana(valores) {
  if (!valores.length) return null;
  const v = valores.slice().sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Tempo de cada caso do resumo `r`, com os atributos usados nos filtros da
// seção. `rowsTodas` são as etapas do recorte SEM o corte de mês (o corte
// entra pela referência).
function panTempoItens(r, rowsTodas, hojeMs) {
  const fimCorte = panFimDoMes(r.corte);
  const referencia = Math.min(hojeMs + PAN_DIA_MS - 1, fimCorte);
  // Para contar dias, o que vale é o DIA da referência (sem as horas).
  const diaReferencia = new Date(referencia).setHours(0, 0, 0, 0);
  const rowsPorCaso = new Map();
  rowsTodas.forEach((row) => { const n = panNumeroCaso(row); if (!n) return; if (!rowsPorCaso.has(n)) rowsPorCaso.set(n, []); rowsPorCaso.get(n).push(row); });
  const unicos = (lista) => Array.from(new Set(lista.filter(Boolean))).sort(compararCaso);
  const itens = r.listaCasos.map((c) => {
    const datas = panDatasDoCaso(rowsPorCaso.get(c.caso) || c.rows, referencia);
    const inicio = datas[0] || 0;
    // Julgado conta como concluído quando a última etapa já aconteceu até o
    // corte, a mesma regra do finalizado.
    const status = normStatus(c.statusCaso);
    const julgado = !c.finalizado && status === 'julgado' && (!c.ultima || c.ultima <= fimCorte);
    const concluido = c.finalizado || julgado;
    // Concluído: até a última data do caso. Em andamento: até a referência.
    const fim = !inicio ? 0 : (concluido ? datas[datas.length - 1] : Math.max(diaReferencia, inicio));
    const processos = processosSancionadoresDoCaso(c);
    const primeira = c.rows[0] || {};
    return {
      rows: rowsPorCaso.get(c.caso) || c.rows,
      caso: c.caso, clube: c.clube, serie: c.serie, origem: c.origem, finalizado: c.finalizado, julgado, concluido,
      // "Denunciante x Clube" nas denúncias; nos demais, o clube.
      nome: typeof parteCasoFluxograma === 'function' ? parteCasoFluxograma(c.rows.find((row) => row.denunciante) || primeira) : c.clube,
      situacao: c.finalizado ? 'Finalizado' : (julgado ? 'Julgado' : (status === 'em-fase-de-recurso' ? 'Em fase de recurso' : 'Em andamento')),
      inicio, fim, ultimaData: datas[datas.length - 1] || 0, datas: datas.length,
      dias: inicio ? Math.round((fim - inicio) / PAN_DIA_MS) : null,
      // atributos dos filtros
      relatores: unicos(processos.map((p) => p.relator)),
      // Indeferido: o caso não foi adiante. Vale a etapa "Decisão de
      // Indeferimento" e também a decisão (ex.: Decisão da Presidência) cuja
      // sanção é "Indeferido".
      indeferido: (typeof casoIndeferido === 'function' && casoIndeferido(c.rows)) || (typeof casoIndeferidoPorDecisao === 'function' && casoIndeferidoPorDecisao(c.rows)),
      comSancao: processos.some((p) => p.situacao === 'aplicada'),
      recurso: processos.some((p) => p.recurso) || c.rows.some((row) => ehEtapaRecursal(row.etapa)),
    };
  });
  return { referencia, itens };
}

// Os números de um conjunto de casos (já filtrado ou não).
function panTempoResumo(itens, referencia) {
  const comData = itens.filter((i) => i.dias !== null);
  // "fin" são os concluídos: finalizados e julgados.
  const fin = comData.filter((i) => i.concluido);
  const and = comData.filter((i) => !i.concluido);
  const dias = (lista) => lista.map((i) => i.dias);
  const ordenados = fin.slice().sort((a, b) => (a.dias - b.dias) || compararCaso(a.caso, b.caso));
  // Um caso com dois valores (ex.: julgado em duas turmas) conta nos dois.
  const grupo = (lista, valoresDe) => {
    const m = new Map();
    lista.forEach((i) => valoresDe(i).forEach((k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(i.dias); }));
    return Array.from(m.entries()).map(([k, v]) => ({ nome: k, casos: v.length, media: panMedia(v) })).sort((a, b) => compararCaso(a.nome, b.nome));
  };
  return {
    referencia, itens,
    finalizados: {
      casos: fin.length, julgados: fin.filter((i) => i.julgado).length, semDatas: itens.filter((i) => i.concluido && i.dias === null).length,
      media: panMedia(dias(fin)), mediana: panMediana(dias(fin)),
      maisRapido: ordenados[0] || null, maisLongo: ordenados[ordenados.length - 1] || null,
    },
    andamento: { casos: and.length, media: panMedia(dias(and)), semDatas: itens.filter((i) => !i.concluido && i.dias === null).length },
    porSerie: grupo(fin, (i) => [i.serie || '—']),
    porOrigem: grupo(fin, (i) => [i.origem || '—']),
    porRelator: grupo(fin, (i) => i.relatores || []),
  };
}

function panTempos(r, rowsTodas, hojeMs) {
  const base = panTempoItens(r, rowsTodas, hojeMs);
  return panTempoResumo(base.itens, base.referencia);
}

// ----- filtros da seção -----
// Cada filtro diz quais valores um caso tem naquela dimensão. Em cada filtro
// dá para marcar VÁRIAS opções: o caso passa quando tem pelo menos uma delas
// (ex.: relator Pedro ou Vantuil). Filtros diferentes se somam.
const PAN_TEMPO_ADMITIDO = 'Admitidos';
const PAN_TEMPO_INDEFERIDO = 'Indeferidos';
const PAN_TEMPO_FILTROS = [
  { id: 'serie', rotulo: 'Série', todos: 'Todas', valores: (i) => [i.serie && i.serie !== '—' ? i.serie : 'Sem série'], nome: (v) => (v === 'Sem série' ? v : `Série ${v}`) },
  { id: 'origem', rotulo: 'Origem', todos: 'Todas', valores: (i) => [i.origem || 'Sem origem'] },
  { id: 'situacao', rotulo: 'Situação', todos: 'Todas', valores: (i) => [i.situacao] },
  { id: 'admissao', rotulo: 'Admissão', todos: 'Todos', valores: (i) => [i.indeferido ? PAN_TEMPO_INDEFERIDO : PAN_TEMPO_ADMITIDO] },
  { id: 'relator', rotulo: 'Relator', todos: 'Todos', valores: (i) => (i.relatores.length ? i.relatores : ['Sem relator']) },
  { id: 'sancao', rotulo: 'Resultado', todos: 'Todos', valores: (i) => [i.comSancao ? 'Com sanção aplicada' : 'Sem sanção aplicada'] },
  { id: 'recurso', rotulo: 'Recurso', todos: 'Todos', valores: (i) => [i.recurso ? 'Com recurso' : 'Sem recurso'] },
  { id: 'clube', rotulo: 'Clube', todos: 'Todos', valores: (i) => [i.clube || 'Sem clube'] },
];

function panTempoMarcados(filtros, id) {
  return Array.isArray(filtros[id]) ? filtros[id] : [];
}

function panTempoFiltrar(itens, filtros, menos = '') {
  const ativos = PAN_TEMPO_FILTROS.filter((f) => f.id !== menos && panTempoMarcados(filtros, f.id).length);
  if (!ativos.length) return itens;
  return itens.filter((i) => ativos.every((f) => { const marcados = panTempoMarcados(filtros, f.id); return f.valores(i).some((v) => marcados.includes(v)); }));
}

// Opções de um filtro: [valor, rótulo, nº de casos]. Entram todos os valores
// que existem no recorte; o número conta os casos que passam nos OUTROS
// filtros, ou seja, quantos entram se aquela opção for marcada (pode ser 0).
function panTempoOpcoes(itens, filtros, filtro) {
  const m = new Map();
  itens.forEach((i) => filtro.valores(i).forEach((v) => { if (!m.has(v)) m.set(v, 0); }));
  panTempoFiltrar(itens, filtros, filtro.id).forEach((i) => filtro.valores(i).forEach((v) => m.set(v, m.get(v) + 1)));
  return Array.from(m.entries()).map(([v, n]) => [v, filtro.nome ? filtro.nome(v) : v, n]).sort((a, b) => compararCaso(a[1], b[1]));
}

// Opção marcada que não existe mais nos casos (mudou o recorte ou o mês) cai.
function panTempoFiltrosValidos(itens, filtros) {
  const validos = {};
  PAN_TEMPO_FILTROS.forEach((f) => {
    const existentes = new Set();
    itens.forEach((i) => f.valores(i).forEach((v) => existentes.add(v)));
    const marcados = panTempoMarcados(filtros, f.id).filter((v) => existentes.has(v));
    // Marcar todas as opções é o mesmo que não filtrar.
    if (marcados.length && marcados.length < existentes.size) validos[f.id] = marcados;
  });
  return validos;
}

// Marca ou desmarca uma opção, devolvendo os filtros novos.
function panTempoAlternar(filtros, id, valor) {
  const marcados = panTempoMarcados(filtros, id);
  const novos = marcados.includes(valor) ? marcados.filter((v) => v !== valor) : marcados.concat([valor]);
  const saida = { ...filtros };
  if (novos.length) saida[id] = novos; else delete saida[id];
  return saida;
}

function panDias(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Math.round(Number(n));
  return `${v.toLocaleString('pt-BR')} ${v === 1 ? 'dia' : 'dias'}`;
}

// "≈ 2,4 meses" para durações de um mês ou mais; '' abaixo disso.
function panMesesAprox(n) {
  if (n === null || n === undefined || Number(n) < 30) return '';
  const meses = Number(n) / 30.4375;
  return `≈ ${meses.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${meses.toFixed(1) === '1.0' ? 'mês' : 'meses'}`;
}

// "Caso 54 - Denunciante x Clube" nas denúncias; nos demais, "Caso 29 - Clube".
function panTempoRotuloCaso(i) {
  return `Caso ${i.caso} - ${i.nome || i.clube}`;
}

// Casos da comparação, conforme a visão e a ordem escolhidas.
function panTempoLinhas(t, visao, ordem) {
  const lista = t.itens.filter((i) => i.dias !== null && (visao === 'todos' || i.concluido));
  const por = {
    maior: (a, b) => (b.dias - a.dias) || compararCaso(a.caso, b.caso),
    menor: (a, b) => (a.dias - b.dias) || compararCaso(a.caso, b.caso),
    inicio: (a, b) => (a.inicio - b.inicio) || compararCaso(a.caso, b.caso),
  };
  return lista.sort(por[ordem] || por.maior);
}

function panTempoKpis(t) {
  const f = t.finalizados;
  const a = t.andamento;
  const card = (v, l, sub, cls = '') => `<div class="pan-rt-kpi ${cls}"><strong>${esc(v)}</strong><span>${esc(l)}</span><small>${esc(sub)}</small></div>`;
  const ate = panDataBrDeMs(t.referencia);
  const extremos = f.casos > 1
    ? [`${Math.round(f.maisRapido.dias).toLocaleString('pt-BR')} a ${panDias(f.maisLongo.dias)}`, 'Do mais rápido ao mais longo', `${panTempoRotuloCaso(f.maisRapido)} · ${panTempoRotuloCaso(f.maisLongo)}`]
    : [f.casos ? panDias(f.maisRapido.dias) : '—', 'Do mais rápido ao mais longo', f.casos ? `só ${panTempoRotuloCaso(f.maisRapido)} está concluído` : 'nenhum caso concluído'];
  // Com julgados na conta, o cartão diz quantos são de cada situação.
  const quantos = !f.julgados ? `${f.casos} ${f.casos === 1 ? 'caso finalizado' : 'casos finalizados'}`
    : (f.julgados === f.casos ? `${f.casos} ${f.casos === 1 ? 'caso julgado' : 'casos julgados'}`
      : `${f.casos - f.julgados} ${f.casos - f.julgados === 1 ? 'finalizado' : 'finalizados'} e ${f.julgados} ${f.julgados === 1 ? 'julgado' : 'julgados'}`);
  return `<div class="pan-rt-kpis">
    ${card(panDias(f.media), 'Tempo médio dos concluídos', f.casos ? [quantos, panMesesAprox(f.media)].filter(Boolean).join(' · ') : 'nenhum caso finalizado ou julgado com data', 'pan-tp-principal')}
    ${card(panDias(f.mediana), 'Mediana', f.casos ? `metade dos casos terminou em até ${panDias(f.mediana)}` : 'sem casos concluídos')}
    ${card(extremos[0], extremos[1], extremos[2])}
    ${card(panDias(a.media), 'Em andamento, em média', a.casos ? `${a.casos} ${a.casos === 1 ? 'caso aberto' : 'casos abertos'}, contados até ${ate}` : 'nenhum caso em andamento')}
  </div>`;
}

// Tempo médio por grupo. Cada grupo é um botão que aplica o filtro.
function panTempoQuebra(titulo, grupos, filtroId, valorDe = (nome) => nome) {
  if (grupos.length < 2) return '';
  return `<p class="pan-tp-quebra"><b>${esc(titulo)}</b>${grupos.map((g) => `<button type="button" data-pan-tempo-atalho="${esc(filtroId)}" data-valor="${esc(valorDe(g.nome))}" title="Filtrar por ${esc(g.nome)}">${esc(g.nome)}: <strong>${esc(panDias(g.media))}</strong> <i>(${g.casos} ${g.casos === 1 ? 'caso' : 'casos'})</i></button>`).join('')}</p>`;
}

// Barra de filtros da seção. Cada filtro é um botão que abre uma lista de
// opções com caixas de seleção; dá para marcar várias.
function panTempoBarraFiltros(base, filtros, restam) {
  const nomeDe = (f, v) => (f.nome ? f.nome(v) : v);
  const campos = PAN_TEMPO_FILTROS.map((f) => {
    const opcoes = panTempoOpcoes(base.itens, filtros, f);
    // Dimensão com um valor só no recorte não ajuda a filtrar (ex.: origem
    // dentro de um recorte). Fora isso o campo fica sempre no lugar.
    if (opcoes.length < 2) return '';
    const marcados = panTempoMarcados(filtros, f.id);
    const resumo = !marcados.length ? f.todos : (marcados.length <= 2 ? marcados.map((v) => nomeDe(f, v)).join(', ') : `${marcados.length} selecionados`);
    const aberto = panTempoMenu === f.id;
    const lista = opcoes.map(([v, rotulo, n]) => {
      const marcado = marcados.includes(v);
      return `<label class="pan-tp-opcao${n === 0 && !marcado ? ' vazia' : ''}"><input type="checkbox" data-pan-tempo-opcao="${esc(f.id)}" value="${esc(v)}"${marcado ? ' checked' : ''}><span>${esc(rotulo)}</span><i>${n}</i></label>`;
    }).join('');
    return `<div class="pan-tp-multi${marcados.length ? ' ativo' : ''}${aberto ? ' aberto' : ''}" data-pan-tempo-multi="${esc(f.id)}">
        <span class="pan-label" id="pan-tp-rot-${esc(f.id)}">${esc(f.rotulo)}</span>
        <button type="button" class="pan-tp-multi-botao" data-pan-tempo-abrir="${esc(f.id)}" aria-haspopup="true" aria-expanded="${aberto}" aria-labelledby="pan-tp-rot-${esc(f.id)}" title="${esc(marcados.map((v) => nomeDe(f, v)).join(', '))}"><span>${esc(resumo)}</span><b aria-hidden="true">⌄</b></button>
        ${aberto ? `<div class="pan-tp-menu" role="group" aria-labelledby="pan-tp-rot-${esc(f.id)}">
          <div class="pan-tp-menu-lista">${lista}</div>
          <div class="pan-tp-menu-pe"><button type="button" data-pan-tempo-zerar="${esc(f.id)}" ${marcados.length ? '' : 'disabled'}>Desmarcar tudo</button><button type="button" data-pan-tempo-fechar>Pronto</button></div>
        </div>` : ''}
      </div>`;
  }).join('');
  const ativos = PAN_TEMPO_FILTROS.filter((f) => panTempoMarcados(filtros, f.id).length);
  const total = base.itens.length;
  const etiquetas = ativos.flatMap((f) => panTempoMarcados(filtros, f.id).map((v) => `<span class="pan-tp-chip">${esc(f.rotulo)}: ${esc(nomeDe(f, v))}<button type="button" data-pan-tempo-tirar="${esc(f.id)}" data-valor="${esc(v)}" aria-label="Tirar ${esc(nomeDe(f, v))} do filtro ${esc(f.rotulo)}">×</button></span>`)).join('');
  const resumo = ativos.length
    ? `<b>${restam}</b> de ${total} ${total === 1 ? 'caso' : 'casos'} com ${etiquetas}<button type="button" class="pan-tp-limpar" data-pan-tempo-limpar>Limpar filtros</button>`
    : `<b>${total}</b> ${total === 1 ? 'caso' : 'casos'} neste recorte. Em cada filtro dá para marcar mais de uma opção.`;
  // Atalho para o pedido mais comum: tirar da conta os casos indeferidos.
  const indeferidos = base.itens.filter((i) => i.indeferido).length;
  const semIndeferidos = panTempoMarcados(filtros, 'admissao').length === 1 && panTempoMarcados(filtros, 'admissao')[0] === PAN_TEMPO_ADMITIDO;
  const atalho = indeferidos && indeferidos < total && !semIndeferidos
    ? `<p class="pan-tp-dica"><span><b>${indeferidos}</b> ${indeferidos === 1 ? 'caso deste recorte foi indeferido' : 'casos deste recorte foram indeferidos'}. Como não vão adiante, puxam o tempo médio para baixo.</span><button type="button" data-pan-tempo-so-admitidos>Ver só os admitidos</button></p>`
    : '';
  return `<div class="pan-tp-filtros" role="group" aria-label="Filtros do tempo dos casos">${campos}</div>${atalho}<p class="pan-tp-ativos">${resumo}</p>`;
}

// Comparação caso a caso: uma barra por caso, todas na mesma escala, com a
// linha da média dos concluídos. Clicar numa linha abre o caso.
function panTempoComparacao(t) {
  const linhas = panTempoLinhas(t, panTempoVisao, panTempoOrdem);
  const temAndamento = t.itens.some((i) => !i.concluido && i.dias !== null);
  const opcao = (grupo, valor, rotulo, atual) => `<button type="button" class="${atual === valor ? 'ativa' : ''}" data-pan-tempo-${grupo}="${valor}" aria-pressed="${atual === valor}">${esc(rotulo)}</button>`;
  const controles = `<div class="pan-tp-controles">
      <div class="pan-tp-abas" role="group" aria-label="Quais casos comparar">${opcao('visao', 'finalizados', 'Só concluídos', panTempoVisao)}${temAndamento ? opcao('visao', 'todos', 'Com os em andamento', panTempoVisao) : ''}</div>
      <div class="pan-tp-abas" role="group" aria-label="Ordem">${opcao('ordem', 'maior', 'Mais longos primeiro', panTempoOrdem)}${opcao('ordem', 'menor', 'Mais rápidos primeiro', panTempoOrdem)}${opcao('ordem', 'inicio', 'Por data de início', panTempoOrdem)}</div>
    </div>`;
  if (!linhas.length) return `${controles}<div class="op-empty">Nenhum caso ${panTempoVisao === 'finalizados' ? 'finalizado ou julgado ' : ''}com etapa datada ${Object.keys(panTempoFiltros).length ? 'com esses filtros' : 'neste recorte'}.</div>`;
  const max = Math.max(...linhas.map((i) => i.dias), 1);
  const media = t.finalizados.media;
  const pct = (dias) => Math.max(0, Math.min(100, (dias / max) * 100));
  const visiveis = panTempoExpandido ? linhas : linhas.slice(0, PAN_TEMPO_LINHAS);
  const marcaMedia = media !== null && media <= max
    ? `<span class="pan-tp-media" style="left:${pct(media)}%" aria-hidden="true"></span>` : '';
  const corpo = visiveis.map((i) => {
    const periodo = `${panDataBrDeMs(i.inicio)} a ${i.concluido ? panDataBrDeMs(i.fim) : 'hoje'}`;
    const dica = `${panTempoRotuloCaso(i)}${i.indeferido ? ' · indeferido' : ''}${i.julgado ? ' · julgado, em acompanhamento do cumprimento' : ''}\n${panDias(i.dias)}${i.concluido ? '' : ' em aberto'} · ${periodo}\n${i.datas} ${i.datas === 1 ? 'data de etapa' : 'datas de etapas'}${i.concluido ? '' : ` · última em ${panDataBrDeMs(i.ultimaData)}`}`;
    const detalhe = [i.serie && i.serie !== '—' ? `Série ${esc(i.serie)}` : '', i.indeferido ? '<em class="pan-tp-indef">indeferido</em>' : '', i.julgado ? '<em class="pan-tp-julg">julgado</em>' : ''].filter(Boolean).join(' · ');
    return `<tr data-caso="${esc(i.caso)}" class="${i.concluido ? '' : 'pan-tp-aberto'}" title="${esc(dica)}" tabindex="0">
      <th scope="row"><b>${esc(panTempoRotuloCaso(i))}</b><span>${detalhe}</span></th>
      <td class="pan-tp-trilho"><div class="pan-tp-faixa">${marcaMedia}<span class="pan-tp-barra" style="width:${Math.max(pct(i.dias), 0.6)}%"></span></div></td>
      <td class="pan-tp-dias"><strong>${esc(panDias(i.dias))}</strong>${i.concluido ? '' : `<span class="pan-tp-etq">${i.situacao === 'Em fase de recurso' ? 'em recurso' : 'em andamento'}</span>`}</td>
      <td class="pan-tp-periodo">${esc(periodo)}</td>
    </tr>`;
  }).join('');
  const legenda = `<p class="pan-tp-legenda"><span><i class="pan-tp-cor fin"></i>finalizado ou julgado: da primeira à última data</span>${panTempoVisao === 'todos' ? `<span><i class="pan-tp-cor and"></i>em andamento: da primeira data até ${esc(panDataBrDeMs(t.referencia))}</span>` : ''}${media !== null ? `<span><i class="pan-tp-cor med"></i>média dos concluídos: ${esc(panDias(media))}</span>` : ''}</p>`;
  const resto = linhas.length - visiveis.length;
  return `${controles}${legenda}
    <div class="pan-tp-tabela"><table class="pan-tp-tbl"><thead><tr><th>Caso</th><th>Duração, todos na mesma escala</th><th class="pan-tp-dias">Tempo</th><th>Período</th></tr></thead><tbody>${corpo}</tbody></table></div>
    ${resto > 0 ? `<button type="button" class="pan-tp-mais" data-pan-tempo-expandir>Ver os outros ${resto} ${resto === 1 ? 'caso' : 'casos'}</button>` : (panTempoExpandido && linhas.length > PAN_TEMPO_LINHAS ? '<button type="button" class="pan-tp-mais" data-pan-tempo-expandir>Mostrar menos</button>' : '')}`;
}

function panTempoSecao(base, chave) {
  panTempoFiltros = panTempoFiltrosValidos(base.itens, panTempoFiltros);
  const filtrados = panTempoFiltrar(base.itens, panTempoFiltros);
  const t = panTempoResumo(filtrados, base.referencia);
  const f = t.finalizados;
  const onde = chave && chave !== 'todos' ? panRecorteLabel(chave) : 'todos os casos';
  const semDatas = f.semDatas + t.andamento.semDatas;
  // Sem o módulo de uma visão carregado, ela não aparece; a do caso inteiro
  // existe sempre.
  const temTipo = typeof panPrazosHtml === 'function';
  const temRito = typeof panRitosHtml === 'function';
  const visao = panTempoModo === 'tipo' && temTipo ? 'tipo' : (panTempoModo !== 'caso' && temRito ? 'acordao' : 'caso');
  const porRito = visao === 'acordao';
  const modo = (valor, rotulo) => `<button type="button" class="${visao === valor ? 'ativa' : ''}" data-pan-tempo-modo="${valor}" aria-pressed="${visao === valor}">${esc(rotulo)}</button>`;
  const explica = { tipo: 'Por tipo de caso: até a decisão, depois dela e o caso inteiro, com o tempo de cada fase.', acordao: 'Compara processos que passaram pelas mesmas etapas, da primeira etapa ao acórdão.', caso: 'Mede o caso inteiro, da primeira à última etapa, incluindo recurso e cumprimento.' }[visao];
  return `<section class="pan-retrato pan-tempo" id="pan-tempo" aria-label="Tempo dos casos">
    <div class="pan-rt-head"><span class="pan-label">Tempo dos casos · ${esc(onde)} · dados até ${esc(panMesLabel(panCorte))}</span><h3>Quanto tempo os casos levam</h3></div>
    <div class="pan-tp-modo" role="group" aria-label="O que medir"><div class="pan-tp-abas">${temTipo ? modo('tipo', 'Por tipo de caso') : ''}${temRito ? modo('acordao', 'Por rito') : ''}${modo('caso', 'Caso inteiro')}</div><span>${explica}</span></div>
    ${panTempoBarraFiltros(base, panTempoFiltros, filtrados.length)}
    ${visao === 'tipo' ? panPrazosHtml(filtrados, base.referencia) : porRito ? panRitosHtml(filtrados, base.referencia) : `
    ${panTempoKpis(t)}
    ${panTempoQuebra('Tempo médio por série', t.porSerie, 'serie', (nome) => (nome === '—' ? 'Sem série' : nome))}
    ${panTempoQuebra('Por origem', t.porOrigem, 'origem')}
    ${panTempoQuebra('Por relator', t.porRelator, 'relator')}
    <div class="pan-tp-comparacao"><h4>Caso a caso</h4>${panTempoComparacao(t)}</div>
    <p class="pan-rt-legenda"><b>Como é contado</b> da primeira à última data das etapas do caso. O tempo médio usa os casos finalizados e os julgados: no caso julgado os trâmites da Agência já terminaram, e ele só segue aberto para acompanhar a regularização do clube. Datas de tarefas, prazos de etapa e datas futuras não entram.${semDatas ? ` ${semDatas} ${semDatas === 1 ? 'caso sem nenhuma etapa datada ficou' : 'casos sem nenhuma etapa datada ficaram'} de fora.` : ''} Clique num caso para abri-lo.</p>`}
  </section>`;
}

// Mexer na visão ou na ordem refaz só esta seção: a página não rola.
function panAtualizarTempo() {
  const el = document.querySelector('#pan-tempo');
  if (!el || !panTempoAtual) return;
  el.outerHTML = panTempoSecao(panTempoAtual, panRecorte);
  conectarControlesTempo();
}

function conectarControlesTempo() {
  const raiz = document.querySelector('#pan-tempo');
  if (!raiz) return;
  raiz.querySelectorAll('[data-pan-tempo-modo]').forEach((b) => b.addEventListener('click', () => { panTempoModo = b.dataset.panTempoModo; panTempoExpandido = false; panAtualizarTempo(); document.querySelector(`#pan-tempo [data-pan-tempo-modo="${panTempoModo}"]`)?.focus(); }));
  if (typeof conectarControlesRitos === 'function') conectarControlesRitos();
  if (typeof conectarControlesPrazos === 'function') conectarControlesPrazos();
  raiz.querySelectorAll('[data-pan-tempo-visao]').forEach((b) => b.addEventListener('click', () => { panTempoVisao = b.dataset.panTempoVisao; panTempoExpandido = false; panAtualizarTempo(); }));
  raiz.querySelectorAll('[data-pan-tempo-ordem]').forEach((b) => b.addEventListener('click', () => { panTempoOrdem = b.dataset.panTempoOrdem; panAtualizarTempo(); }));
  raiz.querySelector('[data-pan-tempo-expandir]')?.addEventListener('click', () => { panTempoExpandido = !panTempoExpandido; panAtualizarTempo(); });
  // Depois de refazer a seção, o foco volta para onde estava (teclado).
  const refazer = (focar = '') => {
    panTempoExpandido = false;
    panAtualizarTempo();
    if (focar) document.querySelector(`#pan-tempo ${focar}`)?.focus();
  };
  raiz.querySelectorAll('[data-pan-tempo-abrir]').forEach((b) => b.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = b.dataset.panTempoAbrir;
    panTempoMenu = panTempoMenu === id ? '' : id;
    panAtualizarTempo();
    document.querySelector(`#pan-tempo [data-pan-tempo-abrir="${id}"]`)?.focus();
  }));
  raiz.querySelectorAll('[data-pan-tempo-opcao]').forEach((caixa) => caixa.addEventListener('change', () => {
    const id = caixa.dataset.panTempoOpcao;
    panTempoFiltros = panTempoAlternar(panTempoFiltros, id, caixa.value);
    // A lista continua aberta para marcar a próxima opção.
    refazer(`[data-pan-tempo-opcao="${id}"][value="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(caixa.value) : caixa.value}"]`);
  }));
  raiz.querySelectorAll('[data-pan-tempo-zerar]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.panTempoZerar; delete panTempoFiltros[id]; refazer(`[data-pan-tempo-abrir="${id}"]`); }));
  raiz.querySelector('[data-pan-tempo-fechar]')?.addEventListener('click', () => { const id = panTempoMenu; panTempoMenu = ''; panAtualizarTempo(); document.querySelector(`#pan-tempo [data-pan-tempo-abrir="${id}"]`)?.focus(); });
  raiz.querySelector('.pan-tp-menu')?.addEventListener('click', (event) => event.stopPropagation());
  // Atalhos das quebras: deixam só aquele grupo marcado no filtro.
  raiz.querySelectorAll('[data-pan-tempo-atalho]').forEach((b) => b.addEventListener('click', () => { panTempoFiltros = { ...panTempoFiltros, [b.dataset.panTempoAtalho]: [b.dataset.valor] }; panTempoMenu = ''; refazer(); }));
  raiz.querySelectorAll('[data-pan-tempo-tirar]').forEach((b) => b.addEventListener('click', () => { panTempoFiltros = panTempoAlternar(panTempoFiltros, b.dataset.panTempoTirar, b.dataset.valor); refazer(); }));
  raiz.querySelector('[data-pan-tempo-so-admitidos]')?.addEventListener('click', () => { panTempoFiltros = { ...panTempoFiltros, admissao: [PAN_TEMPO_ADMITIDO] }; panTempoMenu = ''; refazer(); });
  raiz.querySelector('[data-pan-tempo-limpar]')?.addEventListener('click', () => { panTempoFiltros = {}; panTempoMenu = ''; refazer(); });
  raiz.querySelectorAll('tr[data-caso]').forEach((tr) => {
    const abrir = () => { if (typeof opGoCaso === 'function') opGoCaso(tr.dataset.caso); };
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter') abrir(); });
  });
}

async function renderPanorama() {
  const panel = document.querySelector('#panorama');
  if (!panel) return;
  if (typeof opLoad === 'function') await opLoad();

  const todas = panRows();
  const opcoesRecorte = panOpcoesRecorte(todas);
  if (panRecorte !== 'todos' && !opcoesRecorte.some(([k]) => k === panRecorte)) panRecorte = 'todos';
  const doRecorte = panFiltrarRecorte(todas, panRecorte);
  const r = panResumo(doRecorte, panCorte);
  const detalhe = panDetalhe(r, panDrill);
  const sub = panRecorte === 'todos'
    ? `Processos, autos, sanções e decisões da Agência até ${panMesLabel(panCorte)}. Uma visão geral do trabalho feito até aqui.`
    : `Recorte ${panRecorteLabel(panRecorte)}: processos, autos, sanções e decisões até ${panMesLabel(panCorte)}.`;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  panTempoAtual = panTempoItens(r, doRecorte, hoje.getTime());

  panel.innerHTML = `<div class="op-layout">
    ${opHero('Panorama', 'Panorama da Agência', sub, 'purple')}
    ${panFiltros(r, opcoesRecorte)}
    ${panRecorte !== 'todos' ? panRetratoSecao(r, panRecorte, hoje.getTime()) : ''}
    ${panKpis(r)}
    ${panTempoSecao(panTempoAtual, panRecorte)}
    <div class="pan-grid">
      ${panCardMensal('Autos de infração', r.linhaTempo, 'autos', 'orange')}
      ${panCardMensal('Decisões proferidas', r.linhaTempo, 'decisoes', 'blue')}
      ${panCardMensal('Casos iniciados', r.linhaTempo, 'casos', 'gold')}
    </div>
    <div class="pan-grid">
      ${panCard('Desfecho dos processos', 'Situação de cada par auto + decisão', r.desfechos, 'purple', 'desfecho')}
      ${panCard('Sanções aplicadas', 'Cada parte de "A + B" conta uma vez', r.sancoesPorTipo, 'green', 'sancaoTipo')}
      ${panCard('Decisões por Turma', 'Acórdãos finalizados', r.porTurma, 'blue', 'turma')}
    </div>
    <div class="pan-grid">
      ${panCard('Casos por origem', '', r.porOrigem, 'gold', 'origem')}
      ${panCard('Casos por série', '', r.porSerie, 'gold', 'serie')}
      ${panCard('Autos por processo', 'PSS ou PSO, pelo nome da etapa', r.porProcesso, 'orange', 'processoAuto')}
    </div>
    ${panCard('Clubes com mais processos', 'Até 12 clubes, por número de processos sancionadores', r.porClube, 'red', 'clube')}
    ${panTabelaMeses(r.linhaTempo)}
    ${panSecaoDetalhe(detalhe)}
  </div>`;

  conectarControlesPanorama();
  conectarControlesTempo();
  if (detalhe) panRolarAteDetalhe();
  else if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel('panorama');
}

function panRolarAteDetalhe() {
  const alvo = document.querySelector('#pan-detalhe');
  if (!alvo || typeof alvo.scrollIntoView !== 'function') return;
  const suave = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
}

function limparFiltrosPanorama() {
  panCorte = panCortePadrao();
  panRecorte = 'todos';
  panDrill = null;
  panTempoVisao = 'finalizados'; panTempoOrdem = 'maior'; panTempoExpandido = false; panTempoFiltros = {}; panTempoMenu = '';
  renderPanorama();
}

function conectarControlesPanorama() {
  document.querySelector('#pan-corte')?.addEventListener('change', (event) => {
    panCorte = event.target.value || panCortePadrao();
    panDrill = null; // o recorte anterior pode não existir no novo corte
    renderPanorama();
  });
  document.querySelector('#pan-recorte')?.addEventListener('change', (event) => {
    panRecorte = event.target.value || 'todos';
    panDrill = null;
    renderPanorama();
  });
  document.querySelectorAll('#panorama .pan-retrato:not(.pan-tempo) tr[data-caso]').forEach((tr) => tr.addEventListener('click', () => {
    if (typeof opGoCaso === 'function') opGoCaso(tr.dataset.caso);
  }));
  // Clicar de novo no mesmo card fecha o detalhe.
  document.querySelectorAll('#panorama [data-pan-dim]').forEach((el) => el.addEventListener('click', () => {
    const dim = el.dataset.panDim;
    const val = el.dataset.panVal || '';
    panDrill = (panDrill && panDrill.dim === dim && String(panDrill.val ?? '') === val) ? null : { dim, val };
    renderPanorama();
  }));
  document.querySelector('#panorama [data-pan-fechar]')?.addEventListener('click', () => {
    panDrill = null;
    renderPanorama();
  });
  document.querySelectorAll('#panorama .pan-tbl-detalhe tr[data-caso]').forEach((tr) => tr.addEventListener('click', () => {
    if (typeof opGoCaso === 'function') opGoCaso(tr.dataset.caso);
  }));
  document.querySelector('#panorama [data-op-clear]')?.addEventListener('click', limparFiltrosPanorama);
  document.querySelector('#panorama [data-op-print]')?.addEventListener('click', () => {
    const alvo = document.querySelector('#panorama .op-layout');
    if (typeof imprimirSomente === 'function' && alvo) imprimirSomente(alvo);
    else window.print();
  });
}

// Lista de opções de um filtro: fecha ao clicar fora ou apertar Esc.
if (typeof document.addEventListener === 'function') {
  document.addEventListener('click', (event) => {
    if (!panTempoMenu || event.target.closest?.('.pan-tp-multi')) return;
    panTempoMenu = '';
    panAtualizarTempo();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !panTempoMenu) return;
    const id = panTempoMenu;
    panTempoMenu = '';
    panAtualizarTempo();
    document.querySelector(`#pan-tempo [data-pan-tempo-abrir="${id}"]`)?.focus();
  });
}

navItems.forEach((item) => {
  if (item.dataset.panel !== 'panorama') return;
  item.addEventListener('click', renderPanorama);
});

if (document.querySelector('#panorama')?.classList.contains('active-panel')) renderPanorama();
