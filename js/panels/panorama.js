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

const PAN_CORTE_PADRAO = '2026-08';
let panCorte = PAN_CORTE_PADRAO;
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
  const w = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
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

function panFiltros(resumo) {
  const nota = resumo.semData
    ? `${resumo.semData} ${resumo.semData === 1 ? 'etapa sem data foi incluída' : 'etapas sem data foram incluídas'} na contagem, por não ser possível situá-las no tempo.`
    : 'Todas as etapas contadas têm data.';
  return `<section class="pan-filtros" aria-label="Filtros do panorama">
    <label class="pan-field"><span class="pan-label">Dados até</span><input id="pan-corte" type="month" value="${esc(panCorte)}" max="2099-12"></label>
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
    return `<tr data-caso="${esc(it.caso)}">${td(`Caso ${it.caso}`)}${td(it.clube)}${td(it.origem)}${td(it.serie)}${td(it.finalizado ? 'Finalizado' : 'Em andamento')}${td(panDataBrDeMs(it.ultima))}${td(it.rows.length)}</tr>`;
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

async function renderPanorama() {
  const panel = document.querySelector('#panorama');
  if (!panel) return;
  if (typeof opLoad === 'function') await opLoad();

  const r = panResumo(panRows(), panCorte);
  const detalhe = panDetalhe(r, panDrill);
  const sub = `Processos, autos, sanções e decisões da Agência até ${panMesLabel(panCorte)}. Uma visão geral do trabalho feito até aqui.`;

  panel.innerHTML = `<div class="op-layout">
    ${opHero('Panorama', 'Panorama da Agência', sub, 'purple')}
    ${panFiltros(r)}
    ${panKpis(r)}
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
  if (detalhe) panRolarAteDetalhe();
}

function panRolarAteDetalhe() {
  const alvo = document.querySelector('#pan-detalhe');
  if (!alvo || typeof alvo.scrollIntoView !== 'function') return;
  const suave = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
}

function limparFiltrosPanorama() {
  panCorte = PAN_CORTE_PADRAO;
  panDrill = null;
  renderPanorama();
}

function conectarControlesPanorama() {
  document.querySelector('#pan-corte')?.addEventListener('change', (event) => {
    panCorte = event.target.value || PAN_CORTE_PADRAO;
    panDrill = null; // o recorte anterior pode não existir no novo corte
    renderPanorama();
  });
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

navItems.forEach((item) => {
  if (item.dataset.panel !== 'panorama') return;
  item.addEventListener('click', renderPanorama);
});

if (document.querySelector('#panorama')?.classList.contains('active-panel')) renderPanorama();
