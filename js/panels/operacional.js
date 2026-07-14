let opCarregando = false;
const opState = {
  dossieClube: '', dossieCaso: 'todos', esteiraBusca: '', esteiraClube: 'todos', esteiraSerie: 'todos', esteiraOrigem: 'todos', esteiraStatus: 'todos', esteiraEtapa: 'todos', esteiraPrazo: 'todos',
  sancoesBusca: '', sancoesFiltro: 'todos', idsBusca: '', idsFiltro: 'todos'
};

function opVal(v, fb = 'Não informado') { return v === null || v === undefined || v === '' ? fb : v; }
function opNorm(v) { return normStatus(v); }
function opCaso(row = {}) { return String(row.casoRaiz || row.numero_caso || row.caso_banco_id || row.caso || 'Caso'); }
function opCasoTitulo(c) { const t = String(c || '').trim(); return /^caso\b/i.test(t) ? t : `Caso ${t || '—'}`; }
function opMs(v) { if (!v) return 0; const t = String(v); const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); const d = br ? new Date(+br[3], +br[2] - 1, +br[1]) : new Date(t); return Number.isFinite(d.getTime()) ? d.getTime() : 0; }
function opDias(prazo) { const ms = opMs(prazo); if (!ms) return null; const h = new Date(); h.setHours(0,0,0,0); return Math.round((ms - h.getTime()) / 86400000); }
function opPrazoClass(row) { const d = opDias(row.prazoFinal); if (d === null) return 'neutral'; if (d < 0) return 'red'; if (d <= 7) return 'orange'; return 'green'; }
function opPrazoTxt(row) { const d = opDias(row.prazoFinal); if (d === null) return 'Sem prazo'; if (d < 0) return `${Math.abs(d)}d em atraso`; if (d === 0) return 'Vence hoje'; return `Faltam ${d}d`; }
function opResp(row) { const s = opNorm(row.statusEtapa); if (s.includes('clube')) return 'Clube'; if (s.includes('anresf')) return 'ANRESF'; if (s.includes('finalizado')) return 'Sem pendência'; return 'Verificar'; }
function opPill(txt, cls='neutral') { return `<span class="op-pill ${cls}">${esc(opVal(txt, 'Não informado'))}</span>`; }
function opStatusPill(status) { const n = opNorm(status); if (n.includes('finalizado') || n.includes('encerrado')) return opPill(opVal(status,'Sem status'),'green'); if (n.includes('clube')) return opPill(status,'orange'); if (n.includes('anresf') || n.includes('andamento')) return opPill(status,'blue'); if (n.includes('venc') || n.includes('critic')) return opPill(status,'red'); return opPill(opVal(status,'Sem status'),'neutral'); }
function opDoc(row) { if (!row.doc) return '—'; const href = esc(row.doc); return /^https?:\/\//i.test(row.doc) ? `<a class="op-doc" href="${href}" target="_blank" rel="noopener">Documento</a>` : esc(row.doc); }
async function opLoad() { if (Array.isArray(dadosFluxograma) && dadosFluxograma.length) return; if (opCarregando) return; opCarregando = true; try { const r = await fetch('/api/etapas'); if (!r.ok) throw new Error('Falha ao carregar dados operacionais.'); DATA = await r.json(); dadosFluxograma = Array.isArray(DATA) ? DATA : []; } catch(e) { console.warn('Não foi possível carregar dados operacionais.', e); DATA = []; dadosFluxograma = []; } finally { opCarregando = false; } }
function opRows() { return Array.isArray(dadosFluxograma) ? dadosFluxograma : []; }
function opGroupsByCase(rows = opRows()) { return groupBy(rows, opCaso); }
function opAtual(rows) { return currentRows(rows); }
function opMost(rows, field, fb='Não informado') { const m = new Map(); rows.forEach(r => { if (r[field]) m.set(r[field], (m.get(r[field])||0)+1); }); return Array.from(m.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0] || fb; }
function opUltimo(rows) { return [...rows].sort((a,b)=>Math.max(opMs(b.dataEntrega),opMs(b.dataEnvio),opMs(b.dataDecisao))-Math.max(opMs(a.dataEntrega),opMs(a.dataEnvio),opMs(a.dataDecisao)))[0] || {}; }
function opKpi(label, value, cls='', sub='') { return `<div class="op-kpi ${cls}"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(sub)}</small></div>`; }
function opHero(kind,title,sub,cls='') { return `<section class="op-hero"><div>${opPill(kind,cls)}<h2>${esc(title)}</h2><p>${esc(sub)}</p></div><div class="op-actions"><button type="button" class="op-btn" data-op-print>Imprimir/PDF</button><button type="button" class="op-btn" data-op-clear>Limpar filtros</button></div></section>`; }
function opTable(rows, headers, body) { return `<div class="op-table-wrap"><table class="op-tbl"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(body).join('') : `<tr><td colspan="${headers.length}"><div class="op-empty">Nenhum registro encontrado.</div></td></tr>`}</tbody></table></div>`; }
function opGoCaso(caso) { casoSelecionado = caso || casoSelecionado; if (typeof renderizarFluxograma === 'function') renderizarFluxograma(); const nav = document.querySelector('.nav-item[data-panel="fluxograma"]'); if (nav) activatePanel('fluxograma', nav); }
function opOptions(vals, selected, all='Todos') { return [`<option value="todos">${all}</option>`, ...Array.from(new Set(vals.filter(Boolean))).sort(compararCaso).map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`)].join(''); }

function caseSummaries() { return Array.from(opGroupsByCase().entries()).map(([caso, rows]) => { const atual = opAtual(rows); const abertas = rows.filter(r=>!isFinalizada(r)); const vencidas = abertas.filter(r=>opDias(r.prazoFinal) !== null && opDias(r.prazoFinal) < 0); return { caso, rows, atual, clube:opMost(rows,'clube','Sem clube'), serie:opMost(rows,'serie','—'), origem:opMost(rows,'origem','Sem origem'), status:abertas.length?'Em andamento':'Finalizado', pendencia:opResp(atual), prazo:atual.prazoFinal || '', dias:opDias(atual.prazoFinal), vencidas:vencidas.length, sancao:rows.filter(r=>r.sancao).slice(-1)[0]?.sancao || '', ultimo:opUltimo(rows) }; }); }

function dossieTarefasDoClube() {
  const tarefas = Array.isArray(dadosTarefas) ? dadosTarefas : [];
  return tarefas.filter((t) => opVal(t.clube, 'Sem clube') === opState.dossieClube
    && (opState.dossieCaso === 'todos' || String(t.numero_caso) === String(opState.dossieCaso)));
}

// Linha do tempo consolidada: etapas e tarefas tratadas como o mesmo tipo de evento.
function eventosLinhaTempo(clubRows) {
  const eventos = [];
  clubRows.forEach((r) => {
    const data = r.dataEnvio || r.dataEtapa || r.dataEntrega || r.dataDecisao || '';
    eventos.push({
      ms: opMs(data),
      data: data || 'Sem data',
      titulo: opVal(r.etapa),
      caso: opCaso(r),
      doc: (r.doc && /^https?:\/\//i.test(r.doc)) ? r.doc : '',
      docLabel: 'doc',
    });
  });
  dossieTarefasDoClube().forEach((t) => {
    const iso = t.data_inicial || t.data_final || '';
    eventos.push({
      ms: opMs(iso),
      data: (typeof isoToBrDate === 'function' ? isoToBrDate(iso) : iso) || 'Sem data',
      titulo: opVal(t.observacao, opVal(t.responsavel, 'Tarefa')),
      caso: String(t.numero_caso || ''),
      doc: t.anexo_url || '',
      docLabel: 'anexo',
    });
  });
  return eventos.sort((a, b) => b.ms - a.ms).slice(0, 12);
}

async function renderDossie() { await opLoad(); if (typeof garantirDadosTarefasCarregados === 'function') await garantirDadosTarefasCarregados(); const rows = opRows(); const clubes = Array.from(new Set(rows.map(r=>opVal(r.clube,'Sem clube')))).sort(compararCaso); if (!opState.dossieClube) opState.dossieClube = clubes[0] || 'Sem clube'; const casosDoClube = caseSummaries().filter(c=>c.clube===opState.dossieClube); if (opState.dossieCaso!=='todos' && !casosDoClube.some(c=>c.caso===opState.dossieCaso)) opState.dossieCaso='todos'; const clubRows = rows.filter(r=>opVal(r.clube,'Sem clube')===opState.dossieClube && (opState.dossieCaso==='todos'||opCaso(r)===opState.dossieCaso)); const casos = casosDoClube.filter(c=>opState.dossieCaso==='todos'||c.caso===opState.dossieCaso); const abertas = casos.filter(c=>c.status!=='Finalizado'); const pendClube = clubRows.filter(r=>opResp(r)==='Clube').length; const pendAnresf = clubRows.filter(r=>opResp(r)==='ANRESF').length; const prazoCrit = casos.filter(c=>c.dias!==null && c.dias<=7 && c.status!=='Finalizado').length; const sancoes = clubRows.filter(r=>r.sancao).length; const eventos = eventosLinhaTempo(clubRows); document.querySelector('#dossie').innerHTML = `<div class="op-layout">${opHero('Dossiê clube','Dossiê do Clube','Casos, prazos, sanções, documentos e pendências do clube selecionado.','blue')}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Clube</span><select id="dossie-clube">${clubes.map(c=>`<option ${c===opState.dossieClube?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="op-field wide"><span class="op-label">Caso</span><select id="dossie-caso"><option value="todos" ${opState.dossieCaso==='todos'?'selected':''}>Todos os casos</option>${casosDoClube.map(c=>`<option value="${esc(c.caso)}" ${c.caso===opState.dossieCaso?'selected':''}>${esc(opCasoTitulo(c.caso))}</option>`).join('')}</select></label></div><div class="op-kpis">${opKpi('Total de casos',casos.length)}${opKpi('Em andamento',abertas.length,'blue')}${opKpi('Prazo crítico',prazoCrit,'red')}${opKpi('Com sanção',sancoes,'orange')}${opKpi('Pend. clube',pendClube,'orange')}${opKpi('Pend. ANRESF',pendAnresf,'purple')}</div><div class="op-grid"><section class="op-card"><div class="op-card-head"><div><h3>Resumo regulatório</h3><p class="op-muted">Situação geral do clube</p></div></div><div class="op-card-body op-list"><div class="op-item"><div class="op-meta"><div><span>Série</span><strong>${esc(opMost(clubRows,'serie','—'))}</strong></div><div><span>Processos</span><strong>${casos.length}</strong></div><div><span>Situação</span><strong>${abertas.length?'Em andamento':'Finalizado'}</strong></div><div><span>Última movimentação</span><strong>${esc(opUltimo(clubRows).dataEntrega||opUltimo(clubRows).dataEnvio||opUltimo(clubRows).dataDecisao||'Não informado')}</strong></div><div><span>Próximo prazo</span><strong>${esc(casos.find(c=>c.prazo)?.prazo||'Não informado')}</strong></div><div><span>Sanção relevante</span><strong>${esc(clubRows.filter(r=>r.sancao).slice(-1)[0]?.sancao||'Não informado')}</strong></div></div></div></div></section><section class="op-card"><div class="op-card-head"><div><h3>Linha do tempo consolidada</h3><p class="op-muted">Etapas e tarefas do clube</p></div></div><div class="op-card-body op-timeline">${eventos.length?eventos.map(ev=>`<div class="op-time"><b>${esc(ev.data)}</b><span>${esc(ev.titulo)} · ${esc(opCasoTitulo(ev.caso))}</span>${ev.doc?`<a class="op-time-doc" href="${esc(ev.doc)}" target="_blank" rel="noopener" title="Abrir ${esc(ev.docLabel)}">${esc(ev.docLabel)}</a>`:''}</div>`).join(''):'<div class="op-empty">Sem eventos identificados.</div>'}</div></section></div>${opTable(casos,['ID','Caso','Origem','Etapa atual','Status','Prazo final','Entrega','Documento','Sanção'],c=>`<tr data-caso="${esc(c.caso)}"><td>${esc(documento(c.atual))}</td><td>${esc(opCasoTitulo(c.caso))}</td><td>${esc(c.origem)}</td><td>${esc(opVal(c.atual.etapa))}</td><td>${opStatusPill(c.atual.statusEtapa||c.status)}</td><td>${esc(opVal(c.atual.prazoFinal))}</td><td>${esc(opVal(c.atual.dataEntrega))}</td><td>${opDoc(c.atual)}</td><td>${esc(opVal(c.sancao))}</td></tr>`)}<section class="op-card"><div class="op-card-head"><div><h3>Pendências</h3><p class="op-muted">Clube, ANRESF e prazos críticos</p></div></div><div class="op-card-body op-list">${clubRows.filter(r=>!isFinalizada(r)).slice(0,8).map(r=>`<div class="op-item"><h4>${esc(opVal(r.etapa))}</h4><p>${esc(opCasoTitulo(opCaso(r)))} · ${esc(opResp(r))} · ${esc(opPrazoTxt(r))}</p></div>`).join('')||'<div class="op-empty">Sem pendências abertas.</div>'}</div></section></div>`; bindOps(); }

function esteiraRows() { let cs = caseSummaries(); const q=opState.esteiraBusca.toLowerCase(); return cs.filter(c => (!q || [c.caso,c.clube,c.origem,c.serie,c.atual.etapa,c.atual.objeto].join(' ').toLowerCase().includes(q)) && (opState.esteiraClube==='todos'||c.clube===opState.esteiraClube) && (opState.esteiraSerie==='todos'||c.serie===opState.esteiraSerie) && (opState.esteiraOrigem==='todos'||c.origem===opState.esteiraOrigem) && (opState.esteiraStatus==='todos'||c.pendencia===opState.esteiraStatus) && (opState.esteiraEtapa==='todos'||opVal(c.atual.etapa)===opState.esteiraEtapa) && (opState.esteiraPrazo==='todos'||(opState.esteiraPrazo==='vencido'?c.dias!==null&&c.dias<0:opState.esteiraPrazo==='critico'?c.dias!==null&&c.dias<=7&&c.dias>=0:true))); }
async function renderEsteira() { await opLoad(); const all=caseSummaries(), rows=esteiraRows(); const laneMap=groupBy(rows,c=>opVal(c.atual.etapa,'Etapa não informada')); document.querySelector('#esteira').innerHTML=`<div class="op-layout">${opHero('Esteira','Esteira Processual','Visão operacional dos casos por etapa, status e responsabilidade de andamento.','purple')}<div class="op-filter-grid"><label class="op-field"><span class="op-label">Clube</span><select id="esteira-clube">${opOptions(all.map(c=>c.clube),opState.esteiraClube)}</select></label><label class="op-field"><span class="op-label">Série</span><select id="esteira-serie">${opOptions(all.map(c=>c.serie),opState.esteiraSerie,'Todas')}</select></label><label class="op-field"><span class="op-label">Origem</span><select id="esteira-origem">${opOptions(all.map(c=>c.origem),opState.esteiraOrigem)}</select></label><label class="op-field"><span class="op-label">Status</span><select id="esteira-status">${opOptions(['Clube','ANRESF','Sem pendência','Verificar'],opState.esteiraStatus)}</select></label><label class="op-field"><span class="op-label">Etapa</span><select id="esteira-etapa">${opOptions(all.map(c=>opVal(c.atual.etapa,'Etapa não informada')),opState.esteiraEtapa)}</select></label><label class="op-field"><span class="op-label">Prazo</span><select id="esteira-prazo"><option value="todos">Todos</option><option value="vencido" ${opState.esteiraPrazo==='vencido'?'selected':''}>Vencidos</option><option value="critico" ${opState.esteiraPrazo==='critico'?'selected':''}>Críticos</option></select></label><label class="op-field wide"><span class="op-label">Busca</span><input id="esteira-busca" value="${esc(opState.esteiraBusca)}" placeholder="Buscar clube, caso, etapa ou objeto"></label></div><div class="op-kpis">${opKpi('Total na esteira',all.length)}${opKpi('Em análise',all.filter(c=>c.pendencia==='Verificar').length,'blue')}${opKpi('Aguardando clube',all.filter(c=>c.pendencia==='Clube').length,'orange')}${opKpi('Aguardando ANRESF',all.filter(c=>c.pendencia==='ANRESF').length,'purple')}${opKpi('Prazo vencido',all.filter(c=>c.dias!==null&&c.dias<0).length,'red')}${opKpi('Concluídos',all.filter(c=>c.status==='Finalizado').length,'green')}</div><section class="op-card"><div class="op-card-head"><div><h3>Visão por etapa</h3><p class="op-muted">Blocos derivados das etapas existentes</p></div></div><div class="op-card-body"><div class="op-kanban">${Array.from(laneMap.entries()).map(([etapa,items])=>`<div class="op-lane"><h3>${esc(etapa)} · ${items.length}</h3>${items.map(c=>`<div class="op-kanban-card ${c.status==='Finalizado'?'done':c.dias!==null&&c.dias<0?'overdue':c.dias!==null&&c.dias<=7?'soon':''}" data-caso="${esc(c.caso)}"><strong>${esc(opCasoTitulo(c.caso))}</strong><small>${esc(c.clube)} · ${esc(c.pendencia)} · ${esc(opPrazoTxt(c.atual))}</small></div>`).join('')}</div>`).join('')||'<div class="op-empty">Sem casos na esteira.</div>'}</div></div></section>${opTable(rows,['ID','Clube','Caso','Etapa atual','Status','Responsável','Prazo final','Dias','Observação'],c=>`<tr data-caso="${esc(c.caso)}"><td>${esc(documento(c.atual))}</td><td>${esc(c.clube)}</td><td>${esc(opCasoTitulo(c.caso))}</td><td>${esc(opVal(c.atual.etapa))}</td><td>${opStatusPill(c.atual.statusEtapa||c.status)}</td><td>${esc(c.pendencia)}</td><td>${esc(opVal(c.atual.prazoFinal))}</td><td>${opPill(opPrazoTxt(c.atual),opPrazoClass(c.atual))}</td><td>${esc(opVal(c.atual.observacao))}</td></tr>`)}</div>`; bindOps(); }

function serieSancao(nomeEtapa) { const n = normStatus(nomeEtapa); if (n.includes('pss')) return 'PSS'; if (n.includes('pso')) return 'PSO'; return null; }
function ehAutoInfracao(nomeEtapa) { return normStatus(nomeEtapa).includes('auto-de-infracao') || normStatus(nomeEtapa).includes('auto-infracao'); }
function ehAcordao(nomeEtapa) { return normStatus(nomeEtapa).includes('acordao'); }

function processosSancionadoresDoCaso(c) {
  const buckets = new Map();
  c.rows.forEach((row) => {
    const auto = ehAutoInfracao(row.etapa);
    const acordao = !auto && ehAcordao(row.etapa);
    if (!auto && !acordao) return;
    const serie = serieSancao(row.etapa) || 'Outro';
    if (!buckets.has(serie)) buckets.set(serie, { autos: [], acordaos: [] });
    (auto ? buckets.get(serie).autos : buckets.get(serie).acordaos).push(row);
  });

  return Array.from(buckets.entries()).map(([serie, bucket]) => {
    const autoInfracao = [...bucket.autos].sort((a, b) => opMs(a.dataEnvio || a.dataEtapa) - opMs(b.dataEnvio || b.dataEtapa))[0];
    const acordao = [...bucket.acordaos].sort((a, b) => opMs(b.dataEnvio || b.dataEtapa) - opMs(a.dataEnvio || a.dataEtapa))[0];
    const referencia = acordao || autoInfracao;
    return {
      caso: c.caso, clube: c.clube, origem: c.origem, serie,
      autoInfracao, acordao, referencia,
      sancaoProposta: autoInfracao?.sancao || '',
      sancaoAplicada: acordao?.sancao || '',
      statusJulgamento: acordao ? 'Decisão proferida' : autoInfracao ? 'Aguardando julgamento' : 'Sem auto de infração',
      recurso: /recurso/i.test([autoInfracao?.etapa, autoInfracao?.objeto, acordao?.etapa, acordao?.objeto].join(' ')),
    };
  });
}

function riscoProcesso(p) {
  const dias = opDias(p.referencia?.prazoFinal);
  const txt = [p.sancaoAplicada, p.sancaoProposta, p.referencia?.objeto, p.referencia?.observacao].join(' ').toLowerCase();
  if (/transferban|exclus|restri|cr[ií]tic/.test(txt) || (dias !== null && dias < -15)) return 'Crítico';
  if (p.sancaoAplicada || (dias !== null && dias < 0)) return 'Alto';
  if (p.sancaoProposta || (p.referencia && opResp(p.referencia) === 'Clube')) return 'Médio';
  return 'Baixo';
}

async function renderSancoes() {
  await opLoad();
  let processos = caseSummaries().flatMap(processosSancionadoresDoCaso);
  processos.forEach((p) => { p.risco = riscoProcesso(p); });

  const q = opState.sancoesBusca.toLowerCase();
  const rows = processos.filter((p) => (!q || [p.caso, p.clube, p.origem, p.serie, p.sancaoProposta, p.sancaoAplicada, p.referencia?.objeto].join(' ').toLowerCase().includes(q))
    && (opState.sancoesFiltro === 'todos'
      || (opState.sancoesFiltro === 'aplicadas' ? !!p.sancaoAplicada
        : opState.sancoesFiltro === 'recurso' ? p.recurso
        : opState.sancoesFiltro === 'PSS' ? p.serie === 'PSS'
        : opState.sancoesFiltro === 'PSO' ? p.serie === 'PSO'
        : p.risco === opState.sancoesFiltro)));

  document.querySelector('#sancoes').innerHTML = `<div class="op-layout">${opHero('Sanções', 'Sanções e Risco Regulatório', 'Acompanhamento de autos de infração (PSS/PSO), sanções propostas, acórdãos e riscos por clube/caso.', 'red')}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Busca</span><input id="sancoes-busca" value="${esc(opState.sancoesBusca)}" placeholder="Buscar clube, caso, série, infração ou sanção"></label><label class="op-field"><span class="op-label">Filtro</span><select id="sancoes-filtro"><option value="todos">Todos</option><option value="aplicadas" ${opState.sancoesFiltro === 'aplicadas' ? 'selected' : ''}>Sanções aplicadas</option><option value="PSS" ${opState.sancoesFiltro === 'PSS' ? 'selected' : ''}>Processo PSS</option><option value="PSO" ${opState.sancoesFiltro === 'PSO' ? 'selected' : ''}>Processo PSO</option><option value="Alto" ${opState.sancoesFiltro === 'Alto' ? 'selected' : ''}>Risco alto</option><option value="Crítico" ${opState.sancoesFiltro === 'Crítico' ? 'selected' : ''}>Risco crítico</option><option value="recurso" ${opState.sancoesFiltro === 'recurso' ? 'selected' : ''}>Recurso</option></select></label></div><div class="op-kpis">${opKpi('Autos de infração', processos.filter((p) => p.autoInfracao).length, 'orange')}${opKpi('Sanções propostas', processos.filter((p) => p.sancaoProposta).length, 'orange')}${opKpi('Sanções aplicadas', processos.filter((p) => p.sancaoAplicada).length, 'red')}${opKpi('Pend. julgamento', processos.filter((p) => p.statusJulgamento === 'Aguardando julgamento').length, 'purple')}${opKpi('Risco alto', processos.filter((p) => p.risco === 'Alto' || p.risco === 'Crítico').length, 'red')}${opKpi('Com recurso', processos.filter((p) => p.recurso).length, 'blue')}</div>${opTable(rows, ['ID', 'Clube', 'Caso', 'Processo', 'Origem', 'Infração / objeto', 'Sanção proposta', 'Sanção aplicada', 'Turma', 'Data decisão', 'Status julgamento', 'Recurso', 'Documento', 'Risco'], (p) => `<tr data-caso="${esc(p.caso)}"><td>${esc(documento(p.referencia))}</td><td>${esc(p.clube)}</td><td>${esc(opCasoTitulo(p.caso))}</td><td>${opPill(p.serie, p.serie === 'PSS' ? 'blue' : p.serie === 'PSO' ? 'purple' : 'neutral')}</td><td>${esc(p.origem)}</td><td>${esc(opVal(p.referencia?.objeto))}</td><td>${esc(opVal(p.sancaoProposta))}</td><td>${esc(opVal(p.sancaoAplicada))}</td><td>${esc(opVal(p.referencia?.turma))}</td><td>${esc(opVal(p.referencia?.dataDecisao))}</td><td>${esc(p.statusJulgamento)}</td><td>${esc(p.recurso ? 'Sim' : 'Não informado')}</td><td>${opDoc(p.referencia)}</td><td>${opPill(p.risco, p.risco === 'Crítico' || p.risco === 'Alto' ? 'red' : p.risco === 'Médio' ? 'orange' : 'green')}</td></tr>`)}</div>`;
  bindOps();
}

function idRows() { const rows=opRows(); const byId=groupBy(rows.filter(r=>!r.semId&&r.id),r=>String(r.id)); return rows.map(r=>{ const id = r.semId||!r.id ? 'Sem ID' : String(r.id); const dup = id!=='Sem ID' && (byId.get(id)?.length||0)>1; const caso=opCaso(r), principal=String(caso).split('.')[0]; const obs=[]; if(id==='Sem ID') obs.push('ID vazio'); if(dup) obs.push('ID duplicado'); if(id!=='Sem ID' && new Set((byId.get(id)||[]).map(x=>opVal(x.clube,'Sem clube'))).size>1) obs.push('Mesmo ID em clubes diferentes'); if(String(caso).includes('.') && !rows.some(x=>opCaso(x)===principal)) obs.push('Subprocesso sem processo principal'); if((r.doc||r.sancao||/decis/i.test(opVal(r.etapa,''))) && id==='Sem ID') obs.push('Documento/decisão sem ID associado'); return {row:r,id,caso,principal,sub:String(caso).includes('.')?'Sim':'Não',dup,obs:obs.join('; ')||'Sem inconsistência'}; }); }
async function renderIds() { await opLoad(); const all=idRows(); const q=opState.idsBusca.toLowerCase(); const rows=all.filter(x=>(!q||[x.id,x.caso,x.row.clube,x.row.origem,x.row.etapa,x.obs].join(' ').toLowerCase().includes(q))&&(opState.idsFiltro==='todos'||(opState.idsFiltro==='inconsistencias'?x.obs!=='Sem inconsistência':opState.idsFiltro==='sem-id'?x.id==='Sem ID':opState.idsFiltro==='duplicados'?x.dup:true))); const inconsist=all.filter(x=>x.obs!=='Sem inconsistência').length; document.querySelector('#ids').innerHTML=`<div class="op-layout">${opHero('Governança','Controle de IDs','Validação de identificadores, vínculos e integridade da base de casos.','blue')}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Busca</span><input id="ids-busca" value="${esc(opState.idsBusca)}" placeholder="Buscar ID, clube, caso ou inconsistência"></label><label class="op-field"><span class="op-label">Filtro</span><select id="ids-filtro"><option value="todos">Todos</option><option value="inconsistencias" ${opState.idsFiltro==='inconsistencias'?'selected':''}>Inconsistências</option><option value="sem-id" ${opState.idsFiltro==='sem-id'?'selected':''}>Sem ID</option><option value="duplicados" ${opState.idsFiltro==='duplicados'?'selected':''}>Duplicados</option></select></label></div><div class="op-kpis">${opKpi('Total de IDs',all.filter(x=>x.id!=='Sem ID').length)}${opKpi('IDs únicos',new Set(all.filter(x=>x.id!=='Sem ID').map(x=>x.id)).size,'green')}${opKpi('Duplicados',all.filter(x=>x.dup).length,'red')}${opKpi('Casos sem ID',all.filter(x=>x.id==='Sem ID').length,'orange')}${opKpi('Subprocessos',all.filter(x=>x.sub==='Sim').length,'purple')}${opKpi('Inconsistências',inconsist,'red')}</div>${opTable(rows,['ID','Clube','Caso','Origem','Tipo','Etapa','Status','Processo principal','Subprocesso','Observação','Ações'],x=>`<tr data-caso="${esc(x.caso)}"><td>${esc(x.id)}</td><td>${esc(opVal(x.row.clube,'Sem clube'))}</td><td>${esc(opCasoTitulo(x.caso))}</td><td>${esc(opVal(x.row.origem,'Sem origem'))}</td><td>${esc(x.sub==='Sim'?'Subprocesso':'Principal')}</td><td>${esc(opVal(x.row.etapa))}</td><td>${opStatusPill(x.row.statusEtapa)}</td><td>${esc(opCasoTitulo(x.principal))}</td><td>${esc(x.sub)}</td><td>${x.obs==='Sem inconsistência'?opPill(x.obs,'green'):opPill(x.obs,'red')}</td><td><button type="button" class="op-btn" data-copy-id="${esc(x.id)}">Copiar ID</button></td></tr>`)}</div>`; bindOps(); }

function bindOps(){ document.querySelectorAll('[data-op-print]').forEach(b=>b.onclick=()=>window.print()); document.querySelectorAll('[data-caso]').forEach(el=>el.onclick=e=>{ if(e.target.closest('button,a')) return; opGoCaso(el.dataset.caso); }); document.querySelectorAll('[data-copy-id]').forEach(b=>b.onclick=()=>navigator.clipboard?.writeText(b.dataset.copyId||'')); const clear=document.querySelector('.active-panel [data-op-clear]'); if(clear) clear.onclick=()=>clearOperationalFilters(document.querySelector('.active-panel')?.id);
  document.querySelector('#dossie-clube')?.addEventListener('change',e=>{opState.dossieClube=e.target.value;opState.dossieCaso='todos';renderDossie();});
  document.querySelector('#dossie-caso')?.addEventListener('change',e=>{opState.dossieCaso=e.target.value;renderDossie();});
  ['clube','serie','origem','status','etapa','prazo'].forEach(k=>document.querySelector(`#esteira-${k}`)?.addEventListener('change',e=>{opState[`esteira${k[0].toUpperCase()+k.slice(1)}`]=e.target.value;renderEsteira();})); document.querySelector('#esteira-busca')?.addEventListener('input',e=>{opState.esteiraBusca=e.target.value;renderEsteira();});
  document.querySelector('#sancoes-busca')?.addEventListener('input',e=>{opState.sancoesBusca=e.target.value;renderSancoes();}); document.querySelector('#sancoes-filtro')?.addEventListener('change',e=>{opState.sancoesFiltro=e.target.value;renderSancoes();});
  document.querySelector('#ids-busca')?.addEventListener('input',e=>{opState.idsBusca=e.target.value;renderIds();}); document.querySelector('#ids-filtro')?.addEventListener('change',e=>{opState.idsFiltro=e.target.value;renderIds();}); }

function clearOperationalFilters(id) {
  if (id === 'dossie') { opState.dossieClube = ''; opState.dossieCaso = 'todos'; }
  if (id === 'esteira') Object.assign(opState, { esteiraBusca: '', esteiraClube: 'todos', esteiraSerie: 'todos', esteiraOrigem: 'todos', esteiraStatus: 'todos', esteiraEtapa: 'todos', esteiraPrazo: 'todos' });
  if (id === 'sancoes') Object.assign(opState, { sancoesBusca: '', sancoesFiltro: 'todos' });
  if (id === 'ids') Object.assign(opState, { idsBusca: '', idsFiltro: 'todos' });
  renderOperationalPanel(id);
}

function renderOperationalPanel(id){ if(id==='dossie') return renderDossie(); if(id==='esteira') return renderEsteira(); if(id==='sancoes') return renderSancoes(); if(id==='ids') return renderIds(); }
navItems.forEach(item=>{ if(['dossie','esteira','sancoes','ids'].includes(item.dataset.panel)) item.addEventListener('click',()=>renderOperationalPanel(item.dataset.panel)); });
const activeOperational = document.querySelector('.panel.active-panel'); if (activeOperational && ['dossie','esteira','sancoes','ids'].includes(activeOperational.id)) renderOperationalPanel(activeOperational.id);
