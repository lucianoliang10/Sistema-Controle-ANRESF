let opCarregando = false;
const opState = {
  dossieClube: '', dossieCaso: 'todos',
  sancoesBusca: '', sancoesSituacoes: [], sancoesSeries: [], sancoesTurmas: [], sancoesRecurso: false, sancoesRecorte: null, idsBusca: '', idsClubes: [], idsTipos: [], idsSituacoes: [], idsSortCol: '', idsSortDir: 'asc',
  julgBusca: '', julgPendencia: 'todas', julgRota: 'todas', julgProcesso: 'todos', julgClube: 'todos', julgRecorte: null
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
function opHero(kind,title,sub,cls='',extraAcoes='') { return `<section class="op-hero"><div>${opPill(kind,cls)}<h2>${esc(title)}</h2><p>${esc(sub)}</p></div><div class="op-actions">${extraAcoes}<button type="button" class="op-btn" data-op-print>Imprimir/PDF</button><button type="button" class="op-btn" data-op-clear>Limpar filtros</button></div></section>`; }
function opTable(rows, headers, body) { return `<div class="op-table-wrap"><table class="op-tbl"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(body).join('') : `<tr><td colspan="${headers.length}"><div class="op-empty">Nenhum registro encontrado.</div></td></tr>`}</tbody></table></div>`; }
function opGoCaso(caso) { casoSelecionado = caso || casoSelecionado; if (typeof renderizarFluxograma === 'function') renderizarFluxograma(); const nav = document.querySelector('.nav-item[data-panel="fluxograma"]'); if (nav) activatePanel('fluxograma', nav); }
function opOptions(vals, selected, all='Todos') { return [`<option value="todos">${all}</option>`, ...Array.from(new Set(vals.filter(Boolean))).sort(compararCaso).map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`)].join(''); }

function caseSummaries() { return Array.from(opGroupsByCase().entries()).map(([caso, rows]) => { const atual = opAtual(rows); const abertas = rows.filter(r=>!isFinalizada(r)); const vencidas = abertas.filter(r=>opDias(r.prazoFinal) !== null && opDias(r.prazoFinal) < 0); return { caso, rows, atual, clube:opMost(rows,'clube','Sem clube'), serie:opMost(rows,'serie','—'), origem:opMost(rows,'origem','Sem origem'), status:abertas.length?'Em andamento':'Finalizado', pendencia:opResp(atual), prazo:atual.prazoFinal || '', dias:opDias(atual.prazoFinal), vencidas:vencidas.length, sancao:rows.filter(r=>r.sancao).slice(-1)[0]?.sancao || '', ultimo:opUltimo(rows) }; }); }

// Rótulo rico do caso no seletor do Dossiê: nº · clube · origem · status/prazo.
function dossieCasoLabel(c) {
  const partes = [opCasoTitulo(c.caso)];
  if (c.clube && c.clube !== 'Sem clube') partes.push(c.clube);
  if (c.origem && c.origem !== 'Sem origem') partes.push(c.origem);
  const cauda = c.prazo ? `${c.status} · vence ${c.prazo}` : c.status;
  if (cauda) partes.push(cauda);
  return partes.join(' · ');
}

function dossieTarefasDoClube() {
  const tarefas = Array.isArray(dadosTarefas) ? dadosTarefas : [];
  return tarefas.filter((t) => opVal(t.clube, 'Sem clube') === opState.dossieClube
    && (opState.dossieCaso === 'todos' || String(t.numero_caso) === String(opState.dossieCaso)));
}

// Linha do tempo consolidada: etapas e tarefas tratadas como o mesmo tipo de evento.
// Converte qualquer data para o formato BR antes de calcular o "ms", para que o
// mesmo dia do calendário produza o mesmo instante (evita divergência de fuso
// entre datas de etapa em dd/mm/aaaa e datas de tarefa em ISO).
function eventoTimelineMs(v) { return opMs((typeof isoToBrDate === 'function' ? isoToBrDate(v) : '') || v); }
function eventoTimelineData(v) { return ((typeof isoToBrDate === 'function' ? isoToBrDate(v) : '') || v) || 'Sem data'; }

function eventosLinhaTempo(clubRows) {
  const eventos = [];
  // Mapa etapa_banco_id -> {ordem, banco} para agrupar cada tarefa sob a sua etapa-pai
  // (mesma lógica do histórico, que ordena por etapa e depois etapa-antes-da-tarefa).
  const etapaPorId = new Map();
  clubRows.forEach((r) => { if (r.etapa_banco_id != null) etapaPorId.set(String(r.etapa_banco_id), { ordem: Number(r.ordem) || 0, banco: Number(r.etapa_banco_id) || 0 }); });

  clubRows.forEach((r) => {
    const data = r.dataEnvio || r.dataEtapa || r.dataEntrega || r.dataDecisao || '';
    eventos.push({
      ms: eventoTimelineMs(data),
      tipo: 'etapa',
      ordemEtapa: Number(r.ordem) || 0,
      bancoEtapa: Number(r.etapa_banco_id) || 0,
      tarefaId: 0,
      data: eventoTimelineData(data),
      titulo: opVal(r.etapa),
      caso: opCaso(r),
      doc: (r.doc && /^https?:\/\//i.test(r.doc)) ? r.doc : '',
      docLabel: 'doc',
    });
  });
  dossieTarefasDoClube().forEach((t) => {
    const iso = t.data_inicial || t.data_final || '';
    const pai = etapaPorId.get(String(t.etapa_id)) || { ordem: Number.MAX_SAFE_INTEGER, banco: 0 };
    eventos.push({
      ms: eventoTimelineMs(iso),
      tipo: 'tarefa',
      ordemEtapa: pai.ordem,
      bancoEtapa: pai.banco,
      tarefaId: Number(t.id) || 0,
      data: eventoTimelineData(iso),
      titulo: opVal(t.observacao, opVal(t.responsavel, 'Tarefa')),
      caso: String(t.numero_caso || ''),
      doc: t.anexo_url || '',
      docLabel: 'anexo',
    });
  });
  // Mesma ordenação do "Histórico do caso selecionado":
  //  1) data crescente; 2) empatando a data, agrupa pela etapa-pai (ordem, depois id);
  //  3) no mesmo grupo, a etapa vem antes das suas tarefas; 4) tarefas por id.
  eventos.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms;
    if (a.bancoEtapa !== b.bancoEtapa) return (a.ordemEtapa - b.ordemEtapa) || (a.bancoEtapa - b.bancoEtapa);
    if (a.tipo !== b.tipo) return a.tipo === 'etapa' ? -1 : 1;
    return a.tarefaId - b.tarefaId;
  });
  return eventos.slice(-12);
}

async function renderDossie() { await opLoad(); if (typeof garantirDadosTarefasCarregados === 'function') await garantirDadosTarefasCarregados(); const rows = opRows(); const clubes = Array.from(new Set(rows.map(r=>opVal(r.clube,'Sem clube')))).sort(compararCaso); if (!opState.dossieClube) opState.dossieClube = clubes[0] || 'Sem clube'; const casosDoClube = caseSummaries().filter(c=>c.clube===opState.dossieClube); if (opState.dossieCaso==='todos' || !casosDoClube.some(c=>c.caso===opState.dossieCaso)) opState.dossieCaso = casosDoClube[0]?.caso || 'todos'; const clubRows = rows.filter(r=>opVal(r.clube,'Sem clube')===opState.dossieClube && (opState.dossieCaso==='todos'||opCaso(r)===opState.dossieCaso)); const casos = casosDoClube.filter(c=>opState.dossieCaso==='todos'||c.caso===opState.dossieCaso); const abertas = casos.filter(c=>c.status!=='Finalizado'); const pendClube = clubRows.filter(r=>opResp(r)==='Clube').length; const pendAnresf = clubRows.filter(r=>opResp(r)==='ANRESF').length; const prazoCrit = casos.filter(c=>c.dias!==null && c.dias<=7 && c.status!=='Finalizado').length; const sancoes = clubRows.filter(r=>r.sancao).length; const eventos = eventosLinhaTempo(clubRows); document.querySelector('#dossie').innerHTML = `<div class="op-layout">${opHero('Dossiê clube','Dossiê do Clube','Casos, prazos, sanções, documentos e pendências do clube selecionado.','blue')}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Clube</span><select id="dossie-clube">${clubes.map(c=>`<option ${c===opState.dossieClube?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="op-field wide"><span class="op-label">Caso</span><select id="dossie-caso"><option value="todos" ${opState.dossieCaso==='todos'?'selected':''}>Todos os casos</option>${casosDoClube.map(c=>`<option value="${esc(c.caso)}" ${c.caso===opState.dossieCaso?'selected':''}>${esc(dossieCasoLabel(c))}</option>`).join('')}</select></label></div><div class="op-kpis">${opKpi('Total de casos',casos.length)}${opKpi('Em andamento',abertas.length,'blue')}${opKpi('Prazo crítico',prazoCrit,'red')}${opKpi('Com sanção',sancoes,'orange')}${opKpi('Pend. clube',pendClube,'orange')}${opKpi('Pend. ANRESF',pendAnresf,'purple')}</div><div class="op-grid"><section class="op-card"><div class="op-card-head"><div><h3>Resumo regulatório</h3><p class="op-muted">Situação geral do clube</p></div></div><div class="op-card-body op-list"><div class="op-item"><div class="op-meta"><div><span>Série</span><strong>${esc(opMost(clubRows,'serie','—'))}</strong></div><div><span>Processos</span><strong>${casos.length}</strong></div><div><span>Situação</span><strong>${abertas.length?'Em andamento':'Finalizado'}</strong></div><div><span>Última movimentação</span><strong>${esc(opUltimo(clubRows).dataEntrega||opUltimo(clubRows).dataEnvio||opUltimo(clubRows).dataDecisao||'Não informado')}</strong></div><div><span>Próximo prazo</span><strong>${esc(casos.find(c=>c.prazo)?.prazo||'Não informado')}</strong></div><div><span>Sanção relevante</span><strong>${esc(clubRows.filter(r=>r.sancao).slice(-1)[0]?.sancao||'Não informado')}</strong></div></div></div></div></section><section class="op-card"><div class="op-card-head"><div><h3>Linha do tempo consolidada</h3><p class="op-muted">Etapas e tarefas do clube</p></div></div><div class="op-card-body op-timeline">${eventos.length?eventos.map(ev=>`<div class="op-time"><b>${esc(ev.data)}</b><span>${esc(ev.titulo)} · ${esc(opCasoTitulo(ev.caso))}</span>${ev.doc?`<a class="op-time-doc" href="${esc(ev.doc)}" target="_blank" rel="noopener" title="Abrir ${esc(ev.docLabel)}">${esc(ev.docLabel)}</a>`:''}</div>`).join(''):'<div class="op-empty">Sem eventos identificados.</div>'}</div></section></div>${opTable(casos,['ID','Caso','Origem','Etapa atual','Status','Prazo final','Entrega','Documento','Sanção'],c=>`<tr data-caso="${esc(c.caso)}"><td>${esc(documento(c.atual))}</td><td>${esc(opCasoTitulo(c.caso))}</td><td>${esc(c.origem)}</td><td>${esc(opVal(c.atual.etapa))}</td><td>${opStatusPill(c.atual.statusEtapa||c.status)}</td><td>${esc(opVal(c.atual.prazoFinal))}</td><td>${esc(opVal(c.atual.dataEntrega))}</td><td>${opDoc(c.atual)}</td><td>${esc(opVal(c.sancao))}</td></tr>`)}<section class="op-card"><div class="op-card-head"><div><h3>Pendências</h3><p class="op-muted">Clube, ANRESF e prazos críticos</p></div></div><div class="op-card-body op-list">${clubRows.filter(r=>!isFinalizada(r)).slice(0,8).map(r=>`<div class="op-item"><h4>${esc(opVal(r.etapa))}</h4><p>${esc(opCasoTitulo(opCaso(r)))} · ${esc(opResp(r))} · ${esc(opPrazoTxt(r))}</p></div>`).join('')||'<div class="op-empty">Sem pendências abertas.</div>'}</div></section></div>`; bindOps(); }


function serieSancao(nomeEtapa) { const n = normStatus(nomeEtapa); if (n.includes('pss')) return 'PSS'; if (n.includes('pso')) return 'PSO'; return null; }
function ehAutoInfracao(nomeEtapa) { return normStatus(nomeEtapa).includes('auto-de-infracao') || normStatus(nomeEtapa).includes('auto-infracao'); }
// Decisão sancionadora (o par do Auto de Infração): Acórdão OU Decisão da
// Presidência — ambos finalizam/aplicam a sanção do processo.
// Decisão sancionadora (par do Auto de Infração): Acórdão OU Decisão da
// Presidência. Etapas de "despacho" NÃO contam — inclui o "Despacho do Relator"
// e a "Decisão Presidência - Despacho" (esta é só administrativa: trocar PSS/PSO
// ou finalizar um processo; nunca traz sanção). Assim ambas ficam de fora das
// Sanções e dos Julgamentos.
function ehAcordao(nomeEtapa) { const n = normStatus(nomeEtapa); if (n.includes('despacho')) return false; return n.includes('acordao') || n.includes('decisao-da-presidencia'); }

// Um "processo sancionador" = o par Auto de Infração + Acórdão/Decisão de um
// caso, por processo (PSS/PSO). A SANÇÃO só é considerada APLICADA quando a
// etapa de acórdão/decisão está FINALIZADA. Enquanto não estiver, fica como
// "prevista" e o card recebe um flag de alerta.
function processosSancionadoresDoCaso(c) {
  const buckets = new Map();
  c.rows.forEach((row) => {
    const auto = ehAutoInfracao(row.etapa);
    const acordao = !auto && ehAcordao(row.etapa);
    if (!auto && !acordao) return;
    const processo = serieSancao(row.etapa) || 'Sem PSS/PSO';
    if (!buckets.has(processo)) buckets.set(processo, { autos: [], acordaos: [] });
    (auto ? buckets.get(processo).autos : buckets.get(processo).acordaos).push(row);
  });

  return Array.from(buckets.entries()).map(([processo, bucket]) => {
    const autoInfracao = [...bucket.autos].sort((a, b) => opMs(a.dataEnvio || a.dataEtapa) - opMs(b.dataEnvio || b.dataEtapa))[0];
    const acordao = [...bucket.acordaos].sort((a, b) => opMs(b.dataEnvio || b.dataEtapa) - opMs(a.dataEnvio || a.dataEtapa))[0];
    const referencia = acordao || autoInfracao;
    const decisaoFinalizada = acordao ? isFinalizada(acordao) : false;
    const decisaoPendente = !!acordao && !decisaoFinalizada;
    const sancaoProposta = autoInfracao?.sancao || '';
    // Aplicada só quando o acórdão/decisão está finalizado E traz uma sanção.
    const sancaoAplicada = (acordao && decisaoFinalizada) ? (acordao.sancao || '') : '';
    // Prevista: proposta no auto, ou a que consta no acórdão ainda não finalizado.
    const sancaoPrevista = sancaoProposta || (decisaoPendente ? (acordao.sancao || '') : '');

    let situacao;
    let situacaoLabel;
    if (sancaoAplicada) { situacao = 'aplicada'; situacaoLabel = 'Sanção aplicada'; }
    else if (decisaoPendente) { situacao = 'aguardando-decisao'; situacaoLabel = 'Aguardando decisão'; }
    else if (acordao && decisaoFinalizada) { situacao = 'sem-sancao-final'; situacaoLabel = 'Decidido sem sanção'; }
    else if (autoInfracao) { situacao = 'aguardando-julgamento'; situacaoLabel = 'Aguardando julgamento'; }
    else { situacao = 'sem-sancao'; situacaoLabel = 'Sem sanção'; }

    return {
      caso: c.caso, clube: c.clube, origem: c.origem, serie: c.serie, processo,
      autoInfracao, acordao, referencia, decisaoFinalizada, decisaoPendente,
      sancaoProposta, sancaoAplicada, sancaoPrevista,
      situacao, situacaoLabel,
      recurso: /recurso/i.test([autoInfracao?.etapa, autoInfracao?.objeto, acordao?.etapa, acordao?.objeto].join(' ')),
    };
  });
}

// Rótulo da Turma julgadora; acórdãos da Presidência caem em "Presidência".
function sancTurmaLabel(p) {
  const t = p.referencia?.turma;
  if (t) return t;
  const nome = normStatus(p.acordao?.etapa || p.referencia?.etapa || '');
  if (nome.includes('presidencia')) return 'Presidência';
  return 'Sem turma';
}

// Contagem por dimensão (clube/origem/série/turma), do maior para o menor.
function sancContagem(rows, keyFn) {
  const m = new Map();
  rows.forEach((p) => { const k = keyFn(p) || '—'; m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => (b[1] - a[1]) || compararCaso(a[0], b[0]));
}

function sancSituacaoCls(sit) {
  return { aplicada: 'green', 'aguardando-decisao': 'orange', 'aguardando-julgamento': 'blue' }[sit] || 'neutral';
}
function sancProcessoCls(s) { return s === 'PSS' ? 'blue' : s === 'PSO' ? 'purple' : 'orange'; }

function sancFiltroAceita(p) {
  // Multi-seleção: OR dentro de cada campo, AND entre campos (igual ao Controle de IDs).
  if (opState.sancoesSituacoes.length && !opState.sancoesSituacoes.includes(p.situacao)) return false;
  if (opState.sancoesSeries.length && !opState.sancoesSeries.includes(opVal(p.serie, '—'))) return false;
  if (opState.sancoesTurmas.length && !opState.sancoesTurmas.includes(sancTurmaLabel(p))) return false;
  if (opState.sancoesRecurso && !p.recurso) return false;
  return true;
}
// Uma sanção com "+" significa VÁRIAS sanções (ex.: "Advertência + Multa
// prospectiva" = duas sanções). Divide o texto em partes individuais.
function sancPartes(texto) {
  return String(texto || '').split('+').map((s) => s.trim()).filter(Boolean);
}
// Lista de sanções APLICADAS de um processo (já dividida pelo "+").
function sancListaAplicadas(p) { return p.situacao === 'aplicada' ? sancPartes(p.sancaoAplicada) : []; }
// Contagem de sanções aplicadas por tipo (cada parte do "+" conta separada).
function sancContagemAplicadas(rows) {
  const m = new Map();
  rows.forEach((p) => sancListaAplicadas(p).forEach((s) => m.set(s, (m.get(s) || 0) + 1)));
  return Array.from(m.entries()).sort((a, b) => (b[1] - a[1]) || compararCaso(a[0], b[0]));
}
// Menu de seleção múltipla das Sanções (mesma estética/UX do Controle de IDs).
function sancMultiSelect(id, opcoes, selecionados, rotuloTodos) {
  const resumo = selecionados.length === 0 ? rotuloTodos
    : selecionados.length === 1 ? (opcoes.find(([v]) => v === selecionados[0])?.[1] || selecionados[0])
      : `${selecionados.length} selecionados`;
  return `<details class="op-multi" data-sanc-multi="${esc(id)}"><summary>${esc(resumo)}</summary><div class="op-multi-menu">${opcoes.map(([v, label]) => `<label><input type="checkbox" value="${esc(v)}" ${selecionados.includes(v) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}<div class="op-multi-actions"><button type="button" class="op-multi-clear">Limpar</button><button type="button" class="op-multi-apply">Aplicar</button></div></div></details>`;
}

// Recorte por dimensão (clicando numa barra de distribuição).
function sancRecorteAceita(p) {
  const r = opState.sancoesRecorte;
  if (!r) return true;
  if (r.dim === 'clube') return (p.clube || '—') === r.val;
  if (r.dim === 'origem') return (p.origem || '—') === r.val;
  if (r.dim === 'serie') return (p.serie || '—') === r.val;
  if (r.dim === 'turma') return sancTurmaLabel(p) === r.val;
  if (r.dim === 'sancao') return sancListaAplicadas(p).includes(r.val);
  return true;
}

const SANC_PRIORIDADE = { aplicada: 0, 'aguardando-decisao': 1, 'aguardando-julgamento': 2, 'sem-sancao-final': 3, 'sem-sancao': 4 };

function sancFiltroVazio() {
  return !opState.sancoesSituacoes.length && !opState.sancoesSeries.length && !opState.sancoesTurmas.length && !opState.sancoesRecurso;
}
// KPI clicável: 'todos' limpa os filtros; 'recurso' alterna o recorte de recurso;
// os demais alternam a situação na multi-seleção.
function sancKpi(label, value, tipo, cls) {
  let ativo = '';
  if (tipo === 'todos') ativo = sancFiltroVazio() ? ' ativo' : '';
  else if (tipo === 'recurso') ativo = opState.sancoesRecurso ? ' ativo' : '';
  else ativo = opState.sancoesSituacoes.includes(tipo) ? ' ativo' : '';
  return `<button type="button" class="op-kpi op-kpi-btn ${cls}${ativo}" data-sanc-kpi="${esc(tipo)}"><strong>${esc(value)}</strong><span>${esc(label)}</span></button>`;
}

function sancBar(dim, label, value, max, cor) {
  const w = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
  const r = opState.sancoesRecorte;
  const ativo = (r && r.dim === dim && r.val === label) ? ' ativo' : '';
  return `<button type="button" class="sanc-bar${ativo}" data-sanc-dim="${esc(dim)}" data-sanc-val="${esc(label)}" title="${esc(label)}: ${value}">
    <span class="sanc-bar-label">${esc(label)}</span>
    <span class="sanc-bar-track"><span class="sanc-bar-fill ${cor}" style="width:${w}%"></span></span>
    <span class="sanc-bar-num">${value}</span>
  </button>`;
}

function sancBreakdown(titulo, dim, entries, cor) {
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);
  const corpo = entries.length
    ? entries.map(([label, value]) => sancBar(dim, label, value, max, cor)).join('')
    : '<div class="op-empty">Sem dados.</div>';
  return `<section class="op-card sanc-bd"><div class="op-card-head"><div><h3>${esc(titulo)}</h3></div></div><div class="op-card-body sanc-bars">${corpo}</div></section>`;
}

// Célula "Sanção" da tabela: sanções aplicadas viram pílulas verdes (uma por
// parte do "+"); se ainda não aplicada, mostra a prevista.
function sancSancaoCelula(p) {
  if (p.situacao === 'aplicada') {
    const partes = sancPartes(p.sancaoAplicada);
    return partes.length ? partes.map((s) => opPill(s, 'green')).join(' ') : '—';
  }
  if (p.sancaoPrevista) return `${opPill(p.sancaoPrevista, 'gold')} <small class="op-muted">prevista</small>`;
  return '—';
}

// Uma linha da tabela de Processos sancionadores (clique abre o caso no Fluxograma).
function sancLinhaTabela(p) {
  return `<tr data-caso="${esc(p.caso)}"><td>${esc(p.clube)}</td><td>${esc(opCasoTitulo(p.caso))}</td><td>${esc(p.origem)}</td><td>${esc(opVal(p.serie, '—'))}</td><td>${opPill(p.processo, sancProcessoCls(p.processo))}</td><td>${opPill(p.situacaoLabel, sancSituacaoCls(p.situacao))}</td><td>${sancSancaoCelula(p)}</td><td>${esc(sancTurmaLabel(p))}</td><td>${esc(opVal(p.referencia?.dataDecisao))}</td><td>${esc(opVal(p.referencia?.objeto))}</td><td>${p.recurso ? 'Sim' : '—'}</td></tr>`;
}

async function renderSancoes() {
  await opLoad();
  const processos = caseSummaries().flatMap(processosSancionadoresDoCaso);

  const q = opState.sancoesBusca.toLowerCase();
  // "base" = filtrado por busca + situação (alimenta os gráficos de distribuição).
  const base = processos.filter((p) => (!q || [p.caso, p.clube, p.origem, p.serie, p.processo, p.sancaoPrevista, p.sancaoAplicada, p.referencia?.objeto, p.situacaoLabel].join(' ').toLowerCase().includes(q)) && sancFiltroAceita(p));
  // "detalhe" = base + recorte de barra (alimenta os cards).
  const detalhe = base.filter(sancRecorteAceita)
    .sort((a, b) => (SANC_PRIORIDADE[a.situacao] - SANC_PRIORIDADE[b.situacao]) || compararCaso(a.caso, b.caso));

  const nAplicadas = processos.filter((p) => p.situacao === 'aplicada').length;
  const nAgDecisao = processos.filter((p) => p.situacao === 'aguardando-decisao').length;
  const nRecurso = processos.filter((p) => p.recurso).length;

  const breakdowns = `<div class="sanc-breakdowns">
    ${sancBreakdown('Sanções por clube', 'clube', sancContagem(base, (p) => p.clube), 'red')}
    ${sancBreakdown('Sanções por origem', 'origem', sancContagem(base, (p) => p.origem), 'purple')}
    ${sancBreakdown('Sanções aplicadas', 'sancao', sancContagemAplicadas(base), 'green')}
    ${sancBreakdown('Sanções por Turma/Presidência', 'turma', sancContagem(base, (p) => sancTurmaLabel(p)), 'blue')}
  </div>`;

  const r = opState.sancoesRecorte;
  const recorteChip = r
    ? `<div class="sanc-recorte"><span class="op-muted">Recorte ativo:</span> <span class="sanc-chip">${esc(r.val)} <button type="button" data-sanc-clear-recorte aria-label="Remover recorte">×</button></span></div>`
    : '';

  const situacaoOpts = [['aplicada', 'Sanção aplicada'], ['aguardando-decisao', 'Aguardando decisão'], ['sem-sancao-final', 'Decidido sem sanção'], ['sem-sancao', 'Sem sanção']];
  const serieOpts = Array.from(new Set(processos.map((p) => opVal(p.serie, '—')))).sort(compararCaso).map((v) => [v, v]);
  const turmaOpts = Array.from(new Set(processos.map((p) => sancTurmaLabel(p)))).sort(compararCaso).map((v) => [v, v]);
  const grid = detalhe.length
    ? opTable(detalhe, ['Clube', 'Caso', 'Origem', 'Série', 'Processo', 'Situação', 'Sanção', 'Turma', 'Data decisão', 'Objeto', 'Recurso'], sancLinhaTabela)
    : '<div class="op-empty">Nenhuma sanção encontrada para os filtros selecionados.</div>';

  document.querySelector('#sancoes').innerHTML = `<div class="op-layout">${opHero('Sanções', 'Sanções e Julgamentos', 'Panorama das sanções por clube, origem, série e turma julgadora. Clique numa barra para recortar e num card para abrir o caso.', 'red')}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Busca</span><input id="sancoes-busca" value="${esc(opState.sancoesBusca)}" placeholder="Buscar clube, caso, série, infração ou sanção"></label><div class="op-field"><span class="op-label">Situação</span>${sancMultiSelect('situacoes', situacaoOpts, opState.sancoesSituacoes, 'Todas')}</div><div class="op-field"><span class="op-label">Série</span>${sancMultiSelect('series', serieOpts, opState.sancoesSeries, 'Todas')}</div><div class="op-field"><span class="op-label">Turma</span>${sancMultiSelect('turmas', turmaOpts, opState.sancoesTurmas, 'Todas')}</div></div><div class="op-kpis">${sancKpi('Sanções aplicadas', nAplicadas, 'aplicada', 'green')}${sancKpi('Aguardando decisão', nAgDecisao, 'aguardando-decisao', 'orange')}${sancKpi('Com recurso', nRecurso, 'recurso', 'purple')}${sancKpi('Total de processos', processos.length, 'todos', '')}</div><div class="sanc-print">${breakdowns}<div class="sanc-detalhe-head"><h3>Processos sancionadores <span class="op-muted">${detalhe.length} de ${base.length}</span></h3>${recorteChip}</div>${grid}</div></div>`;
  bindOps();
}

// Chave de unicidade do ID: mesma etapa (tipo) + mesmo ID.
// Tipo-base do ID: delega para tipoBaseEtapa (definido em script.js), fonte
// única compartilhada com a sugestão de ID do Fluxograma. A natureza da etapa
// é tudo antes do " - "; o sufixo (PSS/PSO/Despacho/…) é só variação do mesmo
// tipo (ex.: "Decisão da Presidência - Despacho/PSS/PSO" contam como um só).
function idTipoBase(nomeEtapa) {
  return typeof tipoBaseEtapa === 'function' ? tipoBaseEtapa(nomeEtapa) : normStatus(nomeEtapa);
}

// Auto de Infração e o seu Acórdão podem compartilhar o ID (tipos-base
// diferentes); só é inconsistência quando duas etapas do MESMO tipo-base
// (Acórdão PSS e Acórdão PSO, por exemplo) repetem o ID.
function idChaveTipo(r) { return `${idTipoBase(r.etapa)}|${String(r.id).trim()}`; }

function idRows() {
  const rows = opRows();
  const grupos = groupBy(rows.filter(r => !r.semId && r.id), idChaveTipo);
  return rows.map(r => {
    const semId = r.semId || !r.id;
    const id = semId ? 'Sem ID' : String(r.id).trim();
    const dup = !semId && (grupos.get(idChaveTipo(r))?.length || 0) > 1;
    const caso = opCaso(r), principal = String(caso).split('.')[0];
    const obs = dup ? 'ID repetido no mesmo tipo (variações após o " - " contam como uma só)' : (semId ? 'Sem ID' : 'Sem inconsistência');
    return { row: r, id, tipo: opVal(r.etapa, 'Sem etapa'), caso, principal, sub: String(caso).includes('.') ? 'Sim' : 'Não', dup, semId, obs };
  });
}

// Colunas do painel de IDs (key vazio = coluna não ordenável).
const IDS_COLUNAS = [
  { key: 'id', label: 'ID' }, { key: 'clube', label: 'Clube' }, { key: 'caso', label: 'Caso' },
  { key: 'origem', label: 'Origem' }, { key: 'tipo', label: 'Tipo' }, { key: 'etapa', label: 'Etapa' },
  { key: 'status', label: 'Status' }, { key: 'principal', label: 'Processo principal' },
  { key: 'sub', label: 'Subprocesso' }, { key: 'obs', label: 'Observação' }, { key: '', label: 'Ações' },
];

function idsValorOrdenacao(x, key) {
  switch (key) {
    case 'id': { if (x.semId) return { n: Infinity }; const m = String(x.id).match(/^(\d+)\/(\d{4})$/); return { n: m ? Number(m[2]) * 1000 + Number(m[1]) : Infinity, s: String(x.id) }; }
    case 'clube': return { s: opVal(x.row.clube, 'Sem clube') };
    case 'caso': return { n: parseFloat(String(x.caso).replace(',', '.')), s: String(x.caso) };
    case 'origem': return { s: opVal(x.row.origem, 'Sem origem') };
    case 'tipo': return { s: x.sub === 'Sim' ? 'Subprocesso' : 'Principal' };
    case 'etapa': return { s: x.tipo };
    case 'status': return { s: opVal(x.row.statusEtapa, '') };
    case 'principal': return { n: parseFloat(String(x.principal).replace(',', '.')), s: String(x.principal) };
    case 'sub': return { s: x.sub };
    case 'obs': return { s: x.obs };
    default: return { s: '' };
  }
}

function compararIds(a, b, key, dir) {
  const va = idsValorOrdenacao(a, key), vb = idsValorOrdenacao(b, key);
  let r;
  if (typeof va.n === 'number' && typeof vb.n === 'number' && !Number.isNaN(va.n) && !Number.isNaN(vb.n)) {
    r = (va.n - vb.n) || String(va.s || '').localeCompare(String(vb.s || ''), 'pt', { numeric: true });
  } else {
    r = String(va.s ?? '').localeCompare(String(vb.s ?? ''), 'pt', { sensitivity: 'base', numeric: true });
  }
  return dir === 'desc' ? -r : r;
}

function idsThead() {
  return `<thead><tr>${IDS_COLUNAS.map(c => {
    if (!c.key) return `<th>${esc(c.label)}</th>`;
    const ativo = opState.idsSortCol === c.key;
    const seta = ativo ? (opState.idsSortDir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th class="op-th-sort${ativo ? ' ativo' : ''}" data-sort="${c.key}" title="Ordenar por ${esc(c.label)}">${esc(c.label)}<span class="op-sort-ico">${seta}</span></th>`;
  }).join('')}</tr></thead>`;
}

// Busca com múltiplos termos (separados por vírgula, ; ou quebra de linha):
// um registro passa se casar com QUALQUER termo (OR).
function idsTermosBusca(busca) {
  return String(busca || '').split(/[,;\n]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
}
function idsCorrespondeBusca(registro, termos) {
  if (!termos.length) return true;
  const conteudo = [registro.id, registro.caso, registro.row.clube, registro.row.origem, registro.tipo, registro.obs].join(' ').toLowerCase();
  return termos.some(t => conteudo.includes(t));
}
// Re-render preservando o foco/cursor do campo de busca.
async function idsAtualizarBusca(input) {
  opState.idsBusca = input.value;
  const cursor = input.selectionStart ?? input.value.length;
  await renderIds();
  const novo = document.querySelector('#ids-busca');
  if (!novo) return;
  novo.focus();
  novo.setSelectionRange(cursor, cursor);
}

function idsSituacaoAceita(registro, situacao) {
  if (situacao === 'inconsistencias') return registro.dup;
  if (situacao === 'com-id') return !registro.semId;
  if (situacao === 'sem-id') return registro.semId;
  return false;
}

function idsFiltrosMultiplosAceitam(registro, filtros) {
  const clube = opVal(registro.row.clube, 'Sem clube');
  if (filtros.clubes.length && !filtros.clubes.includes(clube)) return false;
  if (filtros.tipos.length && !filtros.tipos.includes(registro.tipo)) return false;
  if (filtros.situacoes.length && !filtros.situacoes.some(situacao => idsSituacaoAceita(registro, situacao))) return false;
  return true;
}

function idsMultiSelect(id, opcoes, selecionados, rotuloTodos) {
  const resumo = selecionados.length === 0
    ? rotuloTodos
    : selecionados.length === 1
      ? opcoes.find(([valorOpcao]) => valorOpcao === selecionados[0])?.[1] || selecionados[0]
      : `${selecionados.length} selecionados`;
  return `<details class="op-multi" data-ids-multi="${esc(id)}"><summary>${esc(resumo)}</summary><div class="op-multi-menu">${opcoes.map(([valorOpcao, label]) => `<label><input type="checkbox" value="${esc(valorOpcao)}" ${selecionados.includes(valorOpcao) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}<div class="op-multi-actions"><button type="button" class="op-multi-clear">Limpar</button><button type="button" class="op-multi-apply">Aplicar</button></div></div></details>`;
}

async function renderIds() {
  await opLoad();
  const all = idRows();
  const termosBusca = idsTermosBusca(opState.idsBusca);
  const rows = all.filter(x => {
    if (!idsCorrespondeBusca(x, termosBusca)) return false;
    if (!idsFiltrosMultiplosAceitam(x, { clubes: opState.idsClubes, tipos: opState.idsTipos, situacoes: opState.idsSituacoes })) return false;
    return true;
  });
  if (opState.idsSortCol) rows.sort((a, b) => compararIds(a, b, opState.idsSortCol, opState.idsSortDir));
  const totalComId = all.filter(x => !x.semId).length;
  const duplicados = all.filter(x => x.dup).length;
  const conflitos = new Set(all.filter(x => x.dup).map(x => idChaveTipo(x.row))).size;
  const clubeOpts = Array.from(new Set(all.map(x => opVal(x.row.clube, 'Sem clube')))).sort(compararCaso).map(valorOpcao => [valorOpcao, valorOpcao]);
  const tipoOpts = Array.from(new Set(all.map(x => x.tipo))).sort(compararCaso).map(valorOpcao => [valorOpcao, valorOpcao]);
  const situacaoOpts = [['inconsistencias', 'Só inconsistências'], ['com-id', 'Com ID'], ['sem-id', 'Sem ID']];
  const linhaId = x => `<tr data-caso="${esc(x.caso)}"><td>${esc(x.id)}</td><td>${esc(opVal(x.row.clube, 'Sem clube'))}</td><td>${esc(opCasoTitulo(x.caso))}</td><td>${esc(opVal(x.row.origem, 'Sem origem'))}</td><td>${esc(x.sub === 'Sim' ? 'Subprocesso' : 'Principal')}</td><td>${esc(x.tipo)}</td><td>${opStatusPill(x.row.statusEtapa)}</td><td>${esc(opCasoTitulo(x.principal))}</td><td>${esc(x.sub)}</td><td>${x.dup ? opPill(x.obs, 'red') : (x.semId ? opPill(x.obs, 'neutral') : opPill(x.obs, 'green'))}</td><td><button type="button" class="op-btn" data-copy-id="${esc(x.id)}">Copiar ID</button></td></tr>`;
  const tabela = `<div class="op-table-wrap"><table class="op-tbl">${idsThead()}<tbody>${rows.length ? rows.map(linhaId).join('') : `<tr><td colspan="${IDS_COLUNAS.length}"><div class="op-empty">Nenhum registro encontrado.</div></td></tr>`}</tbody></table></div>`;
  document.querySelector('#ids').innerHTML = `<div class="op-layout">${opHero('Governança', 'Controle de IDs', 'Validação de identificadores das etapas: cada tipo de etapa não pode repetir o mesmo ID. O tipo é definido pelo nome antes do " - " — as variações após o traço (PSS, PSO, Despacho…) compartilham o mesmo espaço de IDs.', 'blue')}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Busca</span><input id="ids-busca" value="${esc(opState.idsBusca)}" placeholder="Buscar ID, clube, caso, etapa… (separe por vírgula para vários)"></label><div class="op-field"><span class="op-label">Clube</span>${idsMultiSelect('clubes', clubeOpts, opState.idsClubes, 'Todos')}</div><div class="op-field"><span class="op-label">Etapa</span>${idsMultiSelect('tipos', tipoOpts, opState.idsTipos, 'Todos')}</div><div class="op-field"><span class="op-label">Situação</span>${idsMultiSelect('situacoes', situacaoOpts, opState.idsSituacoes, 'Todas')}</div></div><div class="op-kpis">${opKpi('Total de IDs', totalComId)}${opKpi('IDs únicos', totalComId - duplicados, 'green')}${opKpi('Duplicados', duplicados, duplicados ? 'red' : 'green')}${opKpi('Etapas sem ID', all.filter(x => x.semId).length, 'orange')}${opKpi('Subprocessos', all.filter(x => x.sub === 'Sim').length, 'purple')}${opKpi('Inconsistências', conflitos, conflitos ? 'red' : 'green')}</div>${tabela}</div>`;
  bindOps();
}

/* ===== Painel Julgamentos: casos no fluxo de julgamento e sua pendência =====
   Fluxo: Despacho do Relator -> (relatoria) -> julgamento (Acórdão/Decisão da
   Presidência, que acontece na "data de envio" do acórdão). A pendência de cada
   caso pode ser:
     - "Definir relator"       -> despacho aberto e SEM responsável (relator).
     - "Com o relator"         -> despacho aberto e COM relator definido.
     - "Aguardando julgamento" -> relatoria concluída e acórdão/decisão pendente
                                   (julgamento marcado para a data do acórdão).
     - "Agendar julgamento"    -> relatoria concluída mas ainda sem acórdão/decisão.
   Rota alternativa: Parecer Técnico Conclusivo pronto e SEM Despacho do Relator
   segue direto para a Decisão da Presidência.
   Casos cujo acórdão/decisão já esteja FINALIZADO saem da fila (já julgados). */
function ehDespachoRelator(nomeEtapa){ const n=normStatus(nomeEtapa); return n.includes('despacho') && n.includes('relator'); }
function ehParecerConclusivo(nomeEtapa){ const n=normStatus(nomeEtapa); return n.includes('parecer') && n.includes('conclusivo'); }
function etapaGatilhoPronta(row){ const d=opDias(row.prazoFinal); return isFinalizada(row) || (d!==null && d<=0); }
function julgProcessoCaso(rows){ for(const r of rows){ const p=serieSancao(r.etapa); if(p) return p; } return null; }
function julgMaisRecente(arr){ return [...arr].sort((a,b)=>opMs(b.prazoFinal||b.dataEnvio||b.dataEtapa)-opMs(a.prazoFinal||a.dataEnvio||a.dataEtapa))[0]; }

function julgamentoDoCaso(c){
  const rows=c.rows;
  const despacho=julgMaisRecente(rows.filter(r=>ehDespachoRelator(r.etapa)));
  const parecer=julgMaisRecente(rows.filter(r=>ehParecerConclusivo(r.etapa)));
  const julg=julgMaisRecente(rows.filter(r=>ehAcordao(r.etapa))); // Acórdão OU Decisão da Presidência
  const noFluxo = !!despacho || !!julg || (!!parecer && etapaGatilhoPronta(parecer));
  if(!noFluxo) return null;
  if(julg && isFinalizada(julg)) return null; // já julgado

  const dataJulg = julg ? (julg.dataEnvio||julg.prazoFinal||'') : '';
  const turmaJulg = julg ? (julg.turma||'') : '';
  const proc = serieSancao((julg&&julg.etapa)||(despacho&&despacho.etapa)||(parecer&&parecer.etapa)||'') || julgProcessoCaso(rows) || 'Sem PSS/PSO';
  let rota, rotaKey, situacao, situacaoLabel, relator, turma, dataJulgamento, objeto;

  if(despacho){
    rota='Despacho do Relator'; rotaKey='despacho';
    const nomeRelator=(despacho.responsavel||'').trim();
    if(!isFinalizada(despacho)){
      if(!nomeRelator){ situacao='definir-relator'; situacaoLabel='Definir relator'; relator='—'; }
      else { situacao='com-relator'; situacaoLabel='Com o relator'; relator=nomeRelator; }
      // relatoria ainda em curso: a data do julgamento só é exibida quando o
      // caso realmente estiver aguardando o julgamento (acórdão/decisão agendado).
      turma=turmaJulg; dataJulgamento=''; objeto=opVal(despacho.objeto);
    } else {
      relator=nomeRelator||'—';
      if(julg){ situacao='aguardando-julgamento'; situacaoLabel='Aguardando julgamento'; turma=turmaJulg; dataJulgamento=dataJulg; objeto=opVal(julg.objeto||despacho.objeto); }
      else { situacao='agendar-julgamento'; situacaoLabel='Agendar julgamento'; turma=''; dataJulgamento=''; objeto=opVal(despacho.objeto); }
    }
  } else if(parecer && etapaGatilhoPronta(parecer)){
    rota='Parecer Conclusivo → Presidência'; rotaKey='presidencia';
    relator=(parecer.responsavel||'').trim()||'—';
    if(julg){ situacao='aguardando-julgamento'; situacaoLabel='Aguardando julgamento'; turma=turmaJulg||'Presidência'; dataJulgamento=dataJulg; objeto=opVal(julg.objeto||parecer.objeto); }
    else { situacao='agendar-julgamento'; situacaoLabel='Agendar Decisão da Presidência'; turma='Presidência'; dataJulgamento=''; objeto=opVal(parecer.objeto); }
  } else {
    rota='Julgamento'; rotaKey='julgamento';
    situacao='aguardando-julgamento'; situacaoLabel='Aguardando julgamento';
    relator=(julg.responsavel||'').trim()||'—'; turma=turmaJulg; dataJulgamento=dataJulg; objeto=opVal(julg.objeto);
  }

  return { caso:c.caso, clube:c.clube, serie:c.serie, origem:c.origem, processo:proc, rota, rotaKey,
    situacao, situacaoLabel, relator, turma:opVal(turma), dataJulgamento:opVal(dataJulgamento,'—'), objeto };
}
function julgamentosProntos(){ return caseSummaries().map(julgamentoDoCaso).filter(Boolean); }
function julgFiltroAceita(j){
  const q=opState.julgBusca.toLowerCase();
  if(q && ![j.caso,j.clube,j.origem,j.serie,j.rota,j.situacaoLabel,j.relator,j.turma,j.objeto,j.processo].join(' ').toLowerCase().includes(q)) return false;
  if(opState.julgPendencia!=='todas' && j.situacao!==opState.julgPendencia) return false;
  if(opState.julgRota!=='todas' && j.rotaKey!==opState.julgRota) return false;
  if(opState.julgProcesso!=='todos'){ if(opState.julgProcesso==='sem'){ if(j.processo==='PSS'||j.processo==='PSO') return false; } else if(j.processo!==opState.julgProcesso) return false; }
  if(opState.julgClube!=='todos' && j.clube!==opState.julgClube) return false;
  return true;
}
function julgRecorteAceita(j){ const r=opState.julgRecorte; if(!r) return true; if(r.dim==='clube') return j.clube===r.val; if(r.dim==='serie') return (j.serie||'—')===r.val; if(r.dim==='pendencia') return j.situacaoLabel===r.val; if(r.dim==='rota') return j.rota===r.val; return true; }
const JULG_SIT_PRIOR={'aguardando-julgamento':0,'agendar-julgamento':1,'com-relator':2,'definir-relator':3};
function julgOrdena(a,b){ const pa=JULG_SIT_PRIOR[a.situacao]??9, pb=JULG_SIT_PRIOR[b.situacao]??9; if(pa!==pb) return pa-pb; const ma=opMs(a.dataJulgamento), mb=opMs(b.dataJulgamento); if(ma&&mb&&ma!==mb) return ma-mb; if(ma&&!mb) return -1; if(!ma&&mb) return 1; return compararCaso(a.caso,b.caso); }
function julgContagem(rows,keyFn){ const m=new Map(); rows.forEach(j=>{const k=keyFn(j)||'—'; m.set(k,(m.get(k)||0)+1);}); return Array.from(m.entries()).sort((a,b)=>(b[1]-a[1])||compararCaso(a[0],b[0])); }
function julgBar(dim,label,value,max,cor){ const w=max>0?Math.max(6,Math.round((value/max)*100)):0; const r=opState.julgRecorte; const ativo=(r&&r.dim===dim&&r.val===label)?' ativo':''; return `<button type="button" class="sanc-bar${ativo}" data-julg-dim="${esc(dim)}" data-julg-val="${esc(label)}" title="${esc(label)}: ${value}"><span class="sanc-bar-label">${esc(label)}</span><span class="sanc-bar-track"><span class="sanc-bar-fill ${cor}" style="width:${w}%"></span></span><span class="sanc-bar-num">${value}</span></button>`; }
function julgBreakdown(titulo,dim,entries,cor){ const max=entries.reduce((m,[,v])=>Math.max(m,v),0); const corpo=entries.length?entries.map(([l,v])=>julgBar(dim,l,v,max,cor)).join(''):'<div class="op-empty">Sem dados.</div>'; return `<section class="op-card sanc-bd"><div class="op-card-head"><div><h3>${esc(titulo)}</h3></div></div><div class="op-card-body sanc-bars">${corpo}</div></section>`; }
function julgProcessoCls(p){ return p==='PSS'?'blue':p==='PSO'?'purple':'neutral'; }
function julgSituacaoCls(s){ return {'aguardando-julgamento':'blue','agendar-julgamento':'','com-relator':'orange','definir-relator':'red'}[s]??'neutral'; }
const JULG_COLS=['Caso','Clube','Série','Origem','Processo','Rota','Pendência','Relator','Turma','Data do julgamento','Objeto'];
function julgLinhaExport(j){ return [opCasoTitulo(j.caso), j.clube, j.serie, j.origem, j.processo, j.rota, j.situacaoLabel, j.relator, j.turma, j.dataJulgamento, j.objeto]; }

async function julgAtualizarBusca(input){ opState.julgBusca=input.value; const cursor=input.selectionStart??input.value.length; await renderJulgamentos(); const n=document.querySelector('#julg-busca'); if(!n) return; n.focus(); n.setSelectionRange(cursor,cursor); }

async function renderJulgamentos(){
  await opLoad();
  const todos=julgamentosProntos();
  const base=todos.filter(julgFiltroAceita);
  const detalhe=base.filter(julgRecorteAceita).sort(julgOrdena);
  const cont=s=>todos.filter(j=>j.situacao===s).length;
  const nComData=todos.filter(j=>j.dataJulgamento!=='—').length;
  const breakdowns=`<div class="sanc-breakdowns">${julgBreakdown('Por pendência','pendencia',julgContagem(base,j=>j.situacaoLabel),'blue')}${julgBreakdown('Por clube','clube',julgContagem(base,j=>j.clube),'purple')}${julgBreakdown('Por série','serie',julgContagem(base,j=>j.serie),'gold')}${julgBreakdown('Por rota','rota',julgContagem(base,j=>j.rota),'green')}</div>`;
  const r=opState.julgRecorte;
  const recorteChip=r?`<div class="sanc-recorte"><span class="op-muted">Recorte ativo:</span> <span class="sanc-chip">${esc(r.val)} <button type="button" data-julg-clear-recorte aria-label="Remover recorte">×</button></span></div>`:'';
  const tabela=opTable(detalhe,JULG_COLS,j=>`<tr data-caso="${esc(j.caso)}"><td><strong>${esc(opCasoTitulo(j.caso))}</strong></td><td>${esc(j.clube)}</td><td>${esc(j.serie)}</td><td>${esc(j.origem)}</td><td>${opPill(j.processo,julgProcessoCls(j.processo))}</td><td>${esc(j.rota)}</td><td>${opPill(j.situacaoLabel,julgSituacaoCls(j.situacao))}</td><td>${esc(j.relator)}</td><td>${esc(j.turma)}</td><td>${esc(j.dataJulgamento)}</td><td>${esc(j.objeto)}</td></tr>`);
  const clubeOpts=opOptions(todos.map(j=>j.clube),opState.julgClube);
  const exportBtn=`<button type="button" class="op-btn" data-julg-export>Exportar Excel</button>`;
  const optP=(v,l)=>`<option value="${v}" ${opState.julgPendencia===v?'selected':''}>${l}</option>`;
  document.querySelector('#julgamentos').innerHTML=`<div class="op-layout">${opHero('Julgamentos','Agenda de Julgamentos','Casos no fluxo de julgamento e o que falta em cada um: definir relator, andamento com o relator, ou aguardando o julgamento (na data do acórdão/decisão). Casos já julgados saem da fila.','purple',exportBtn)}<div class="op-filter-grid"><label class="op-field wide"><span class="op-label">Busca</span><input id="julg-busca" value="${esc(opState.julgBusca)}" placeholder="Buscar caso, clube, relator, turma, objeto…"></label><label class="op-field"><span class="op-label">Pendência</span><select id="julg-pendencia">${optP('todas','Todas')}${optP('definir-relator','Definir relator')}${optP('com-relator','Com o relator')}${optP('aguardando-julgamento','Aguardando julgamento')}${optP('agendar-julgamento','Agendar julgamento')}</select></label><label class="op-field"><span class="op-label">Rota</span><select id="julg-rota"><option value="todas">Todas</option><option value="despacho" ${opState.julgRota==='despacho'?'selected':''}>Despacho do Relator</option><option value="presidencia" ${opState.julgRota==='presidencia'?'selected':''}>Presidência</option></select></label><label class="op-field"><span class="op-label">Processo</span><select id="julg-processo"><option value="todos">Todos</option><option value="PSS" ${opState.julgProcesso==='PSS'?'selected':''}>PSS</option><option value="PSO" ${opState.julgProcesso==='PSO'?'selected':''}>PSO</option><option value="sem" ${opState.julgProcesso==='sem'?'selected':''}>Sem PSS/PSO</option></select></label><label class="op-field"><span class="op-label">Clube</span><select id="julg-clube">${clubeOpts}</select></label></div><div class="op-kpis">${opKpi('No fluxo de julgamento',todos.length,'purple')}${opKpi('Definir relator',cont('definir-relator'),cont('definir-relator')?'red':'green')}${opKpi('Com o relator',cont('com-relator'),'orange')}${opKpi('Aguardando julgamento',cont('aguardando-julgamento'),'blue')}${opKpi('Agendar julgamento',cont('agendar-julgamento'))}${opKpi('Com data marcada',nComData,'green')}</div>${breakdowns}<div class="sanc-detalhe-head"><h3>Casos no fluxo de julgamento <span class="op-muted">${detalhe.length} de ${todos.length}</span></h3>${recorteChip}</div>${tabela}</div>`;
  bindOps();
}

async function exportarJulgamentosExcel(botao){
  const txt=botao?botao.textContent:''; if(botao){botao.disabled=true;botao.textContent='Gerando…';}
  try{
    await opLoad();
    const detalhe=julgamentosProntos().filter(julgFiltroAceita).filter(julgRecorteAceita).sort(julgOrdena);
    if(!detalhe.length){ window.alert('Não há casos no fluxo de julgamento para exportar.'); return; }
    const linhas=[JULG_COLS.slice(),...detalhe.map(julgLinhaExport)];
    const bytes=montarXlsx(linhas,'Julgamentos');
    baixarArquivo(bytes,`julgamentos-anresf-${new Date().toISOString().slice(0,10)}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }catch(e){ console.error('Erro ao exportar julgamentos:',e); window.alert('Não foi possível gerar o Excel. Tente novamente.'); }
  finally{ if(botao){botao.disabled=false;botao.textContent=txt;} }
}

// Alvo de impressão de cada painel operacional: a área de dados (tabela) — ou,
// no painel Sanções (sem tabela), o dashboard de distribuição + cards.
function opPrintTarget(id){ const sel = id==='sancoes' ? '#sancoes .sanc-print' : `#${id} .op-table-wrap`; return document.querySelector(sel); }
function bindOps(){ document.querySelectorAll('[data-op-print]').forEach(b=>b.onclick=()=>{ const id=document.querySelector('.active-panel')?.id; imprimirSomente(opPrintTarget(id)); }); document.querySelectorAll('[data-caso]').forEach(el=>el.onclick=e=>{ if(e.target.closest('button,a')) return; opGoCaso(el.dataset.caso); }); document.querySelectorAll('[data-copy-id]').forEach(b=>b.onclick=()=>navigator.clipboard?.writeText(b.dataset.copyId||'')); const clear=document.querySelector('.active-panel [data-op-clear]'); if(clear) clear.onclick=()=>clearOperationalFilters(document.querySelector('.active-panel')?.id);
  document.querySelector('#dossie-clube')?.addEventListener('change',e=>{opState.dossieClube=e.target.value;opState.dossieCaso='todos';renderDossie();});
  document.querySelector('#dossie-caso')?.addEventListener('change',e=>{opState.dossieCaso=e.target.value;renderDossie();});
  document.querySelector('#sancoes-busca')?.addEventListener('input',e=>{opState.sancoesBusca=e.target.value;renderSancoes();});
  document.querySelectorAll('#sancoes [data-sanc-multi]').forEach(det=>{ const campo=det.dataset.sancMulti; const key='sancoes'+campo.charAt(0).toUpperCase()+campo.slice(1); det.querySelector('.op-multi-apply')?.addEventListener('click',()=>{ opState[key]=Array.from(det.querySelectorAll('input[type="checkbox"]:checked')).map(c=>c.value); renderSancoes(); }); det.querySelector('.op-multi-clear')?.addEventListener('click',()=>{ opState[key]=[]; renderSancoes(); }); });
  document.querySelectorAll('#sancoes [data-sanc-kpi]').forEach(b=>b.onclick=()=>{ const t=b.dataset.sancKpi; if(t==='todos'){ Object.assign(opState,{sancoesSituacoes:[],sancoesSeries:[],sancoesTurmas:[],sancoesRecurso:false}); } else if(t==='recurso'){ opState.sancoesRecurso=!opState.sancoesRecurso; } else { const i=opState.sancoesSituacoes.indexOf(t); if(i>=0) opState.sancoesSituacoes.splice(i,1); else opState.sancoesSituacoes.push(t); } renderSancoes(); });
  document.querySelectorAll('#sancoes [data-sanc-dim]').forEach(b=>b.onclick=()=>{ const dim=b.dataset.sancDim,val=b.dataset.sancVal; const r=opState.sancoesRecorte; opState.sancoesRecorte=(r&&r.dim===dim&&r.val===val)?null:{dim,val}; renderSancoes(); });
  document.querySelector('#sancoes [data-sanc-clear-recorte]')?.addEventListener('click',()=>{ opState.sancoesRecorte=null; renderSancoes(); });
  document.querySelector('#ids-busca')?.addEventListener('input',e=>{ idsAtualizarBusca(e.target); });
  document.querySelectorAll('#ids [data-ids-multi]').forEach(det=>{ const campo=det.dataset.idsMulti; const key='ids'+campo.charAt(0).toUpperCase()+campo.slice(1); det.querySelector('.op-multi-apply')?.addEventListener('click',()=>{ opState[key]=Array.from(det.querySelectorAll('input[type="checkbox"]:checked')).map(c=>c.value); renderIds(); }); det.querySelector('.op-multi-clear')?.addEventListener('click',()=>{ opState[key]=[]; renderIds(); }); });
  document.querySelectorAll('#ids .op-th-sort').forEach(th=>th.addEventListener('click',()=>{ const key=th.dataset.sort; if(opState.idsSortCol===key){ opState.idsSortDir=opState.idsSortDir==='asc'?'desc':'asc'; } else { opState.idsSortCol=key; opState.idsSortDir='asc'; } renderIds(); }));
  document.querySelector('#julg-busca')?.addEventListener('input',e=>{ julgAtualizarBusca(e.target); }); document.querySelector('#julg-pendencia')?.addEventListener('change',e=>{opState.julgPendencia=e.target.value;renderJulgamentos();}); document.querySelector('#julg-rota')?.addEventListener('change',e=>{opState.julgRota=e.target.value;renderJulgamentos();}); document.querySelector('#julg-processo')?.addEventListener('change',e=>{opState.julgProcesso=e.target.value;renderJulgamentos();}); document.querySelector('#julg-clube')?.addEventListener('change',e=>{opState.julgClube=e.target.value;renderJulgamentos();});
  document.querySelectorAll('[data-julg-dim]').forEach(b=>b.onclick=()=>{const dim=b.dataset.julgDim,val=b.dataset.julgVal;const r=opState.julgRecorte;opState.julgRecorte=(r&&r.dim===dim&&r.val===val)?null:{dim,val};renderJulgamentos();});
  document.querySelector('[data-julg-clear-recorte]')?.addEventListener('click',()=>{opState.julgRecorte=null;renderJulgamentos();});
  document.querySelector('[data-julg-export]')?.addEventListener('click',e=>exportarJulgamentosExcel(e.currentTarget)); }

function clearOperationalFilters(id) {
  if (id === 'dossie') { opState.dossieClube = ''; opState.dossieCaso = 'todos'; }
  if (id === 'sancoes') Object.assign(opState, { sancoesBusca: '', sancoesSituacoes: [], sancoesSeries: [], sancoesTurmas: [], sancoesRecurso: false, sancoesRecorte: null });
  if (id === 'ids') Object.assign(opState, { idsBusca: '', idsClubes: [], idsTipos: [], idsSituacoes: [], idsSortCol: '', idsSortDir: 'asc' });
  if (id === 'julgamentos') Object.assign(opState, { julgBusca: '', julgPendencia: 'todas', julgRota: 'todas', julgProcesso: 'todos', julgClube: 'todos', julgRecorte: null });
  renderOperationalPanel(id);
}

function renderOperationalPanel(id){ if(id==='dossie') return renderDossie(); if(id==='sancoes') return renderSancoes(); if(id==='ids') return renderIds(); if(id==='julgamentos') return renderJulgamentos(); }
navItems.forEach(item=>{ if(['dossie','sancoes','ids','julgamentos'].includes(item.dataset.panel)) item.addEventListener('click',()=>renderOperationalPanel(item.dataset.panel)); });
const activeOperational = document.querySelector('.panel.active-panel'); if (activeOperational && ['dossie','sancoes','ids','julgamentos'].includes(activeOperational.id)) renderOperationalPanel(activeOperational.id);
