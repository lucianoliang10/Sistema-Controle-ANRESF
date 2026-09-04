// Painel Panorama: visão geral do trabalho da Agência até um mês de corte —
// casos, autos de infração, decisões (acórdãos) e sanções. Reaproveita as
// regras de Sanções (operacional.js): ehAutoInfracao, ehAcordao,
// processosSancionadoresDoCaso, sancPartes, sancTurmaLabel.
//
// Corte temporal: a data de cada etapa é dataEnvio (ou dataEtapa). Uma etapa
// conta "até o mês X" quando a sua data é anterior ou igual ao fim de X.
// Etapas SEM data entram sempre — o painel informa quantas são.

const PAN_CORTE_PADRAO = '2026-08';
let panCorte = PAN_CORTE_PADRAO;

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

// Casos a partir das etapas já cortadas. "Finalizado" segue a regra dos demais
// painéis: todas as etapas finalizadas.
function panCasos(rows) {
  const grupos = new Map();
  rows.forEach((row) => {
    const n = panNumeroCaso(row);
    if (!n) return;
    if (!grupos.has(n)) grupos.set(n, []);
    grupos.get(n).push(row);
  });
  return Array.from(grupos.entries()).map(([caso, lista]) => {
    const datas = lista.map((r) => panMs(panDataEtapa(r))).filter(Boolean);
    const abertas = lista.filter((r) => !isFinalizada(r));
    return {
      caso, rows: lista,
      clube: panMaisFrequente(lista, 'clube', 'Sem clube'),
      origem: panMaisFrequente(lista, 'origem', 'Sem origem'),
      serie: panMaisFrequente(lista, 'serie', '—'),
      inicio: datas.length ? Math.min(...datas) : 0,
      finalizado: abertas.length === 0,
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
  const rows = rowsTodas.filter((r) => panDentroDoCorte(r, corte));
  const semData = rows.filter((r) => !panMs(panDataEtapa(r))).length;
  const casos = panCasos(rows);

  const autos = rows.filter((r) => ehAutoInfracao(r.etapa));
  const decisoesTodas = rows.filter((r) => !ehAutoInfracao(r.etapa) && ehAcordao(r.etapa, r.sancao));
  const decisoes = decisoesTodas.filter(isFinalizada);
  const decisoesPendentes = decisoesTodas.filter((r) => !isFinalizada(r));

  const processos = casos.flatMap((c) => processosSancionadoresDoCaso(c));
  const aplicadas = processos.filter((p) => p.situacao === 'aplicada');

  // Sanções por tipo: cada parte do "+" conta uma vez.
  const sancoesTipo = new Map();
  aplicadas.forEach((p) => sancPartes(p.sancaoAplicada).forEach((s) => sancoesTipo.set(s, (sancoesTipo.get(s) || 0) + 1)));

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
  };
}

// ---------- render ----------

function panBar(label, value, max, cor) {
  const w = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return `<div class="pan-bar ${esc(cor)}" title="${esc(label)}: ${value}">
    <span class="pan-bar-label">${esc(label)}</span>
    <span class="pan-bar-track"><span class="pan-bar-fill" style="width:${w}%"></span></span>
    <span class="pan-bar-num">${value}</span>
  </div>`;
}

function panCard(titulo, sub, entries, cor) {
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);
  const corpo = entries.length
    ? entries.map(([label, value]) => panBar(label, value, max, cor)).join('')
    : '<div class="op-empty">Sem dados até este mês.</div>';
  return `<section class="op-card pan-card"><div class="op-card-head"><div><h3>${esc(titulo)}</h3>${sub ? `<p class="op-muted">${esc(sub)}</p>` : ''}</div></div><div class="op-card-body pan-bars">${corpo}</div></section>`;
}

// Linha do tempo: um cartão por medida (um eixo cada), mesmo conjunto de meses.
function panCardMensal(titulo, linhaTempo, campo, cor) {
  const entries = linhaTempo.map((m) => [panMesLabel(m.chave), m[campo]]);
  return panCard(titulo, 'Por mês', entries, cor);
}

function panFiltros(resumo) {
  const nota = resumo.semData
    ? `${resumo.semData} ${resumo.semData === 1 ? 'etapa sem data foi incluída' : 'etapas sem data foram incluídas'} na contagem, por não ser possível situá-las no tempo.`
    : 'Todas as etapas contadas têm data.';
  return `<section class="pan-filtros" aria-label="Filtros do panorama">
    <label class="pan-field"><span class="pan-label">Dados até</span><input id="pan-corte" type="month" value="${esc(panCorte)}" max="2099-12"></label>
    <p class="pan-note">${esc(nota)}</p>
  </section>`;
}

function panKpis(r) {
  return `<div class="op-kpis pan-kpis">
    ${opKpi('Casos', r.casos.total, '', `${r.casos.emAndamento} em andamento · ${r.casos.finalizados} finalizados`)}
    ${opKpi('Autos de infração', r.autos, 'orange', 'lavrados')}
    ${opKpi('Decisões', r.decisoes, 'blue', r.decisoesPendentes ? `${r.decisoesPendentes} aguardando` : 'acórdãos proferidos')}
    ${opKpi('Sanções aplicadas', r.sancoesAplicadas, 'green', 'processos com sanção')}
    ${opKpi('Clubes alcançados', r.clubes, 'purple', 'com pelo menos um caso')}
  </div>`;
}

function panTabelaMeses(linhaTempo) {
  if (!linhaTempo.length) return '';
  const total = linhaTempo.reduce((acc, m) => ({ casos: acc.casos + m.casos, autos: acc.autos + m.autos, decisoes: acc.decisoes + m.decisoes, sancoes: acc.sancoes + m.sancoes }), { casos: 0, autos: 0, decisoes: 0, sancoes: 0 });
  const linhas = linhaTempo.map((m) => `<tr><td>${esc(panMesLabel(m.chave))}</td><td class="pan-num">${m.casos}</td><td class="pan-num">${m.autos}</td><td class="pan-num">${m.decisoes}</td><td class="pan-num">${m.sancoes}</td></tr>`).join('');
  return `<section class="op-card"><div class="op-card-head"><div><h3>Mês a mês</h3><p class="op-muted">Casos pela primeira etapa; autos, decisões e sanções pela data da etapa.</p></div></div>
    <div class="op-table-wrap"><table class="op-tbl pan-tbl"><thead><tr><th>Mês</th><th>Casos iniciados</th><th>Autos</th><th>Decisões</th><th>Sanções aplicadas</th></tr></thead>
    <tbody>${linhas}<tr class="pan-total"><td>Total</td><td class="pan-num">${total.casos}</td><td class="pan-num">${total.autos}</td><td class="pan-num">${total.decisoes}</td><td class="pan-num">${total.sancoes}</td></tr></tbody></table></div></section>`;
}

async function renderPanorama() {
  const panel = document.querySelector('#panorama');
  if (!panel) return;
  if (typeof opLoad === 'function') await opLoad();

  const r = panResumo(panRows(), panCorte);
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
      ${panCard('Desfecho dos processos', 'Situação de cada par auto + decisão', r.desfechos, 'purple')}
      ${panCard('Sanções aplicadas', 'Cada parte de "A + B" conta uma vez', r.sancoesPorTipo, 'green')}
      ${panCard('Decisões por Turma', 'Acórdãos finalizados', r.porTurma, 'blue')}
    </div>
    <div class="pan-grid">
      ${panCard('Casos por origem', '', r.porOrigem, 'gold')}
      ${panCard('Casos por série', '', r.porSerie, 'gold')}
      ${panCard('Autos por processo', 'PSS ou PSO, pelo nome da etapa', r.porProcesso, 'orange')}
    </div>
    ${panCard('Clubes com mais processos', 'Até 12 clubes, por número de processos sancionadores', r.porClube, 'red')}
    ${panTabelaMeses(r.linhaTempo)}
  </div>`;

  conectarControlesPanorama();
}

function limparFiltrosPanorama() {
  panCorte = PAN_CORTE_PADRAO;
  renderPanorama();
}

function conectarControlesPanorama() {
  document.querySelector('#pan-corte')?.addEventListener('change', (event) => {
    panCorte = event.target.value || PAN_CORTE_PADRAO;
    renderPanorama();
  });
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
