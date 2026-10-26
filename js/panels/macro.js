let macroBusca = '';
let macroFiltro = 'todos'; // filtro rápido dos KPIs
// Filtros combináveis da tabela: OR dentro de cada campo, AND entre campos.
function macroFiltrosPadrao() {
  return { clubes: [], origens: [], series: [], periodos: [], status: [], etapas: [], pendencias: [], sancao: 'todas', prazo: 'qualquer', inicioDe: '', inicioAte: '' };
}
let macroFiltros = macroFiltrosPadrao();
let macroSort = { key: 'proximoPrazoSort', dir: 'asc' };
let macroCarregando = false;

function macroValor(valorOriginal, fallback = '—') {
  return valor(valorOriginal, fallback);
}

function macroCasoId(row = {}) {
  return String(row.casoRaiz || row.numero_caso || row.caso_banco_id || row.caso || 'Caso');
}

function macroTituloCaso(caso) {
  const texto = String(caso || '').trim();
  return /^caso\b/i.test(texto) ? texto : `Caso ${texto || '—'}`;
}

function macroDataMs(valorData) {
  if (!valorData) return 0;
  const texto = String(valorData);
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`).getTime();
  const parsed = new Date(texto).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function macroMaisFrequente(rows, campo, fallback = '—') {
  const contagem = new Map();
  rows.forEach((row) => {
    const valorCampo = row[campo];
    if (!valorCampo) return;
    contagem.set(valorCampo, (contagem.get(valorCampo) || 0) + 1);
  });
  const [maisFrequente] = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0] || [];
  return macroValor(maisFrequente, fallback);
}

function macroStatusCaso(rows) {
  if (!rows.length) return 'Sem status';
  const statusInformado = rows.find((row) => row.statusCaso)?.statusCaso;
  // O status do caso prevalece: etapas concluídas não encerram um caso ainda em andamento.
  if (statusInformado && !normStatus(statusInformado).includes('finalizado')) return 'Em andamento';
  // Também evitamos encerrar um caso enquanto ainda houver alguma etapa aberta.
  if (rows.every(isFinalizada)) return 'Finalizado';
  return 'Em andamento';
}

function macroEtapaAtual(rows) {
  const ordenadas = [...rows].sort(stageSort);
  return ordenadas.find((row) => !isFinalizada(row)) || ordenadas[ordenadas.length - 1] || {};
}

function macroPendencia(statusEtapa) {
  const status = normStatus(statusEtapa);
  if (status.includes('clube')) return 'Clube';
  if (status.includes('anresf')) return 'ANRESF';
  if (status.includes('finalizado')) return 'Sem pendência';
  return 'Verificar';
}

function macroDataInicial(rows) {
  const datas = rows
    .map((row) => row.dataEnvio || row.dataEtapa || row.created_at)
    .filter(Boolean)
    .sort((a, b) => macroDataMs(a) - macroDataMs(b));
  return datas[0] || '';
}

function macroProximoPrazo(rows) {
  // Só etapas EM ABERTO têm "próximo prazo". Um caso finalizado (ou com todas
  // as etapas com prazo já cumpridas) não tem prazo em aberto — não devemos
  // cair no prazo de uma etapa já finalizada, senão a coluna "Dias" mostra um
  // caso concluído como vencido.
  const abertas = rows.filter((row) => !isFinalizada(row) && row.prazoFinal);
  const ordenadas = abertas.sort((a, b) => macroDataMs(a.prazoFinal) - macroDataMs(b.prazoFinal));
  return ordenadas[0]?.prazoFinal || '';
}

function macroDiasAte(dataPrazo) {
  const prazo = macroDataMs(dataPrazo);
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.ceil((prazo - hoje.getTime()) / 86400000);
}

function macroSancao(rows, statusCasoAtual) {
  if (!normStatus(statusCasoAtual).includes('finalizado')) return '—';
  const comSancao = rows.filter((row) => row.sancao);
  const acordao = comSancao.find((row) => String(row.etapa || '').toLowerCase().includes('acórdão') || String(row.etapa || '').toLowerCase().includes('acordao'));
  return macroValor((acordao || comSancao[comSancao.length - 1] || {}).sancao, '—');
}

function macroObservacaoCaso(rows) {
  const registro = rows.find((row) => row.observacaoCaso !== undefined && row.observacaoCaso !== null);
  return macroValor(registro?.observacaoCaso, '—');
}

// Texto da coluna Clube. Caso de Denúncia é "Denunciante x Clube" (mesma regra
// do Fluxograma, parteCasoFluxograma); demais origens, só o clube.
function macroParteCaso(rows, clube, origem) {
  const denunciante = rows.map((r) => String(r.denunciante || '').trim()).find(Boolean) || '';
  if (typeof parteCasoFluxograma === 'function') return parteCasoFluxograma({ clube, origem, denunciante });
  const ehDenuncia = String(origem || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'denuncia';
  return ehDenuncia && denunciante ? `${denunciante} x ${clube}` : clube;
}

function macroComputeCaseMetrics() {
  return Array.from(groupBy(dadosFluxograma, macroCasoId).entries())
    .map(([caso, rows]) => {
      const ordenadas = [...rows].sort(stageSort);
      const atual = macroEtapaAtual(ordenadas);
      const status = macroStatusCaso(ordenadas);
      const prazo = macroProximoPrazo(ordenadas);
      const dias = macroDiasAte(prazo);
      const pendencia = macroPendencia(atual.statusEtapa || status);
      const dataInicial = macroDataInicial(ordenadas);
      const sancao = macroSancao(ordenadas, status);
      const observacaoCaso = macroObservacaoCaso(ordenadas);
      const origem = macroMaisFrequente(ordenadas, 'origem', 'Sem origem');
      const clube = macroParteCaso(ordenadas, macroMaisFrequente(ordenadas, 'clube', 'Sem clube'), origem);

      return {
        caso,
        titulo: macroTituloCaso(caso),
        clube,
        serie: macroMaisFrequente(ordenadas, 'serie', '—'),
        origem,
        periodo: macroMaisFrequente(ordenadas, 'periodo', '—'),
        status,
        etapaAtual: macroValor(atual.etapa),
        pendencia,
        dataInicial: macroValor(dataInicial),
        dataInicialSort: macroDataMs(dataInicial),
        proximoPrazo: macroValor(prazo),
        proximoPrazoSort: macroDataMs(prazo) || Number.MAX_SAFE_INTEGER,
        dias,
        sancao,
        observacaoCaso,
        busca: [caso, clube, macroMaisFrequente(ordenadas, 'serie', '—'), origem, status, atual.etapa, atual.objeto, pendencia, sancao, observacaoCaso].join(' ').toLowerCase(),
      };
    })
    .sort((a, b) => compararCaso(a.caso, b.caso));
}

function macroFiltroAceita(caso) {
  if (macroFiltro === 'andamento') return normStatus(caso.status).includes('andamento');
  if (macroFiltro === 'finalizado') return normStatus(caso.status).includes('finalizado');
  if (macroFiltro === 'anresf') return caso.pendencia === 'ANRESF';
  if (macroFiltro === 'clube') return caso.pendencia === 'Clube';
  if (macroFiltro === 'pendente') return caso.pendencia === 'Pendente';
  if (macroFiltro === 'sancao') return caso.sancao && caso.sancao !== '—';
  if (macroFiltro === 'vencido') return Number.isFinite(caso.dias) && caso.dias < 0;
  return true;
}

// Data "dd/mm/aaaa" ou "aaaa-mm-dd" → ms (0 se vazia/inválida).
function macroDataFiltroMs(texto) {
  const t = String(texto || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return 0;
}

function macroPrazoAceita(caso, prazo) {
  if (prazo === 'qualquer') return true;
  const dias = caso.dias;
  const aberto = !caso.finalizado;
  if (prazo === 'vencido') return aberto && Number.isFinite(dias) && dias < 0;
  if (prazo === 'hoje') return aberto && dias === 0;
  if (prazo === '7') return aberto && Number.isFinite(dias) && dias >= 0 && dias <= 7;
  if (prazo === '30') return aberto && Number.isFinite(dias) && dias >= 0 && dias <= 30;
  if (prazo === 'sem') return aberto && !Number.isFinite(dias);
  return true;
}

function macroFiltrosAceitam(caso, f = macroFiltros) {
  const temSancao = !!caso.sancao && caso.sancao !== '—';
  const inicioMs = Number(caso.dataInicialSort) || 0;
  const de = macroDataFiltroMs(f.inicioDe);
  const ate = macroDataFiltroMs(f.inicioAte);
  if (f.clubes.length && !f.clubes.includes(caso.clube)) return false;
  if (f.origens.length && !f.origens.includes(caso.origem)) return false;
  if (f.series.length && !f.series.includes(caso.serie)) return false;
  if (f.periodos.length && !f.periodos.includes(caso.periodo)) return false;
  if (f.status.length && !f.status.includes(caso.status)) return false;
  if (f.etapas.length && !f.etapas.includes(caso.etapaAtual)) return false;
  if (f.pendencias.length && !f.pendencias.includes(caso.pendencia)) return false;
  if (f.sancao === 'com' && !temSancao) return false;
  if (f.sancao === 'sem' && temSancao) return false;
  if (!macroPrazoAceita(caso, f.prazo)) return false;
  if (de && (!inicioMs || inicioMs < de)) return false;
  if (ate && (!inicioMs || inicioMs > ate)) return false;
  return true;
}

// Algum filtro (busca, rápido ou combinável) está ativo? A ordenação não conta.
function macroTemFiltroAtivo() {
  return macroBusca.trim() !== '' || macroFiltro !== 'todos' || macroChipsFiltros().length > 0;
}

function macroCasosFiltrados(casos) {
  const busca = macroBusca.trim().toLowerCase();
  return casos
    .filter(macroFiltroAceita)
    .filter((caso) => macroFiltrosAceitam(caso))
    .filter((caso) => !busca || caso.busca.includes(busca))
    .sort((a, b) => {
      const dir = macroSort.dir === 'asc' ? 1 : -1;
      const va = a[macroSort.key];
      const vb = b[macroSort.key];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
}

function macroKpiCard(label, value, filtro, color, sub) {
  return `
    <button type="button" class="kpi ${color} ${macroFiltro === filtro ? 'active' : ''}" data-macro-filter="${esc(filtro)}">
      <strong class="kpi-value">${esc(value)}</strong>
      <span class="kpi-label">${esc(label)}</span>
      <small class="kpi-sub">${esc(sub)}</small>
    </button>
  `;
}

function renderMacroHero() {
  return `
    <section class="hero">
      <div>
        <span class="pill gold">Processos</span>
        <h2>Visão dos processos</h2>
        <p class="hero-subtitle">Visão gerencial consolidada por caso, com pendências, prazos e sanções decididas.</p>
      </div>
      <div class="hero-actions">
        <button type="button" class="btn" id="macro-export-excel">Exportar Excel</button>
        <button type="button" class="btn ghost" id="macro-print">Imprimir/PDF</button>
      </div>
    </section>
  `;
}

function renderMacroKpis(casos) {
  const total = casos.length;
  const andamento = casos.filter((caso) => normStatus(caso.status).includes('andamento')).length;
  const finalizados = casos.filter((caso) => normStatus(caso.status).includes('finalizado')).length;
  const anresf = casos.filter((caso) => caso.pendencia === 'ANRESF').length;
  const clube = casos.filter((caso) => caso.pendencia === 'Clube').length;
  const vencidos = casos.filter((caso) => Number.isFinite(caso.dias) && caso.dias < 0).length;
  const sancoes = casos.filter((caso) => caso.sancao && caso.sancao !== '—').length;

  return `
    <div class="kpis">
      ${macroKpiCard('Total de casos', total, 'todos', 'gold', 'Casos consolidados')}
      ${macroKpiCard('Em andamento', andamento, 'andamento', 'blue', 'Com etapas abertas')}
      ${macroKpiCard('Finalizados', finalizados, 'finalizado', 'green', 'Sem etapas abertas')}
      ${macroKpiCard('Pendência ANRESF', anresf, 'anresf', 'purple', 'Responsável atual')}
      ${macroKpiCard('Pendência Clube', clube, 'clube', 'orange', 'Aguardando clube')}
      ${macroKpiCard('Prazos vencidos', vencidos, 'vencido', 'red', 'Em aberto e em atraso')}
      ${macroKpiCard('Casos com sanção', sancoes, 'sancao', 'red', 'Sanção registrada')}
    </div>
  `;
}

function macroStatusPill(status) {
  const normalizado = normStatus(status);
  if (normalizado.includes('finalizado')) return '<span class="pill green">Finalizado</span>';
  if (normalizado.includes('andamento')) return '<span class="pill blue">Em andamento</span>';
  return `<span class="pill neutral">${esc(macroValor(status, 'Sem status'))}</span>`;
}

function macroPendenciaPill(pendencia) {
  if (pendencia === 'ANRESF') return '<span class="pill purple">ANRESF</span>';
  if (pendencia === 'Clube') return '<span class="pill orange">Clube</span>';
  if (pendencia === 'Pendente') return '<span class="pill gold">Pendente</span>';
  if (pendencia === 'Sem pendência') return '<span class="pill green">Sem pendência</span>';
  return '<span class="pill neutral">Verificar</span>';
}

function macroDiasCell(dias, finalizado) {
  if (finalizado) return '<span class="days done">✓ Concluído</span>';
  if (!Number.isFinite(dias)) return '<span class="muted">—</span>';
  const classe = dias < 0 ? 'negative' : dias === 0 ? 'today' : dias <= 7 ? 'warning' : 'ok';
  const texto = dias < 0
    ? `${Math.abs(dias)}d em atraso`
    : dias === 0 ? 'vence hoje' : `faltam ${dias}d`;
  return `<span class="days ${classe}">${esc(texto)}</span>`;
}

// ---------- barra de filtros ----------

const MACRO_ROTULOS_PRAZO = { qualquer: 'Qualquer prazo', vencido: 'Vencido', hoje: 'Vence hoje', 7: 'Até 7 dias', 30: 'Até 30 dias', sem: 'Sem prazo' };
const MACRO_ROTULOS_SANCAO = { todas: 'Com ou sem', com: 'Com sanção', sem: 'Sem sanção' };
const MACRO_CAMPOS_MULTI = [
  ['clubes', 'clube', 'Clube', 'Todos os clubes'],
  ['origens', 'origem', 'Origem', 'Todas as origens'],
  ['series', 'serie', 'Série', 'Todas as séries'],
  ['periodos', 'periodo', 'Período', 'Todos os períodos'],
  ['status', 'status', 'Status do caso', 'Todos os status'],
  ['etapas', 'etapaAtual', 'Etapa atual', 'Todas as etapas'],
  ['pendencias', 'pendencia', 'Pendência', 'Todas as pendências'],
];

function macroOpcoes(casos, campo) {
  const contagem = new Map();
  casos.forEach((caso) => { const v = macroValor(caso[campo], '—'); contagem.set(v, (contagem.get(v) || 0) + 1); });
  return Array.from(contagem.entries()).sort((a, b) => compararCaso(a[0], b[0]));
}

function macroMulti(chave, rotulo, todosRotulo, opcoes, selecionados) {
  const resumo = !selecionados.length ? todosRotulo : selecionados.length === 1 ? selecionados[0] : `${selecionados.length} selecionados`;
  return `<div class="macro-field"><span class="macro-label">${esc(rotulo)}</span><details class="op-multi" data-macro-multi="${esc(chave)}"><summary>${esc(resumo)}</summary><div class="op-multi-menu">${opcoes.map(([v, n]) => `<label><input type="checkbox" value="${esc(v)}" ${selecionados.includes(v) ? 'checked' : ''}><span>${esc(v)}</span><em>${n}</em></label>`).join('')}<div class="op-multi-actions"><button type="button" class="op-multi-clear">Limpar</button><button type="button" class="op-multi-apply">Aplicar</button></div></div></details></div>`;
}

// Filtros ativos como chips: [{ chave, valor, rotulo }]. Clicar no chip tira só ele.
function macroChipsFiltros(f = macroFiltros) {
  const chips = [];
  MACRO_CAMPOS_MULTI.forEach(([chave, , rotulo]) => f[chave].forEach((v) => chips.push({ chave, valor: v, rotulo: `${rotulo}: ${v}` })));
  if (f.sancao !== 'todas') chips.push({ chave: 'sancao', valor: f.sancao, rotulo: `Sanção: ${MACRO_ROTULOS_SANCAO[f.sancao]}` });
  if (f.prazo !== 'qualquer') chips.push({ chave: 'prazo', valor: f.prazo, rotulo: `Prazo: ${MACRO_ROTULOS_PRAZO[f.prazo]}` });
  if (f.inicioDe) chips.push({ chave: 'inicioDe', valor: f.inicioDe, rotulo: `Início a partir de ${macroDataBr(f.inicioDe)}` });
  if (f.inicioAte) chips.push({ chave: 'inicioAte', valor: f.inicioAte, rotulo: `Início até ${macroDataBr(f.inicioAte)}` });
  return chips;
}

function macroDataBr(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

function macroRemoverFiltro(chave, valorChip) {
  if (Array.isArray(macroFiltros[chave])) macroFiltros[chave] = macroFiltros[chave].filter((v) => v !== valorChip);
  else if (chave === 'sancao') macroFiltros.sancao = 'todas';
  else if (chave === 'prazo') macroFiltros.prazo = 'qualquer';
  else macroFiltros[chave] = '';
}

function renderMacroFiltros(todosCasos) {
  const f = macroFiltros;
  const chips = macroChipsFiltros(f);
  const rapido = macroFiltro !== 'todos' ? `<button type="button" class="macro-chip macro-chip-rapido" data-macro-filter="todos" title="Tirar o filtro rápido">Filtro rápido: ${esc({ andamento: 'Em andamento', finalizado: 'Finalizados', anresf: 'Pendência ANRESF', clube: 'Pendência Clube', pendente: 'Tarefa pendente', sancao: 'Com sanção', vencido: 'Prazos vencidos' }[macroFiltro] || macroFiltro)} ×</button>` : '';
  return `
        <div class="macro-filterbar">
          <label class="macro-field macro-field-busca"><span class="macro-label">Busca</span><input id="macro-busca" type="search" value="${esc(macroBusca)}" placeholder="Caso, clube, origem, etapa, sanção, observação…"></label>
          ${MACRO_CAMPOS_MULTI.map(([chave, campo, rotulo, todos]) => macroMulti(chave, rotulo, todos, macroOpcoes(todosCasos, campo), f[chave])).join('')}
          <label class="macro-field"><span class="macro-label">Sanção</span><select data-macro-select="sancao">${Object.entries(MACRO_ROTULOS_SANCAO).map(([v, l]) => `<option value="${v}" ${f.sancao === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="macro-field"><span class="macro-label">Prazo</span><select data-macro-select="prazo">${Object.entries(MACRO_ROTULOS_PRAZO).map(([v, l]) => `<option value="${v}" ${String(f.prazo) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="macro-field"><span class="macro-label">Início de</span><input type="date" data-macro-data="inicioDe" value="${esc(f.inicioDe)}"></label>
          <label class="macro-field"><span class="macro-label">Início até</span><input type="date" data-macro-data="inicioAte" value="${esc(f.inicioAte)}"></label>
          <button type="button" class="btn ghost" id="macro-sort-prazo">Ordenar por prazo</button>
        </div>
        ${chips.length || rapido ? `<div class="macro-chips">${rapido}${chips.map((c) => `<button type="button" class="macro-chip" data-macro-chip="${esc(c.chave)}" data-macro-chip-valor="${esc(c.valor)}" title="Tirar este filtro">${esc(c.rotulo)} ×</button>`).join('')}<button type="button" class="macro-chip macro-chip-limpar" id="macro-clear-chips">Limpar tudo</button></div>` : ''}`;
}

function renderMacroTable(casos, todosCasos) {
  const linhas = casos.map((caso) => `
    <tr data-macro-caso="${esc(caso.caso)}" class="${caso.finalizado ? 'row-done' : ''}">
      <td><strong>${esc(caso.titulo)}</strong></td>
      <td>${esc(caso.clube)}</td>
      <td>${esc(caso.serie)}</td>
      <td>${esc(caso.origem)}</td>
      <td>${macroStatusPill(caso.status)}</td>
      <td>${esc(caso.etapaAtual)}</td>
      <td>${macroPendenciaPill(caso.pendencia)}</td>
      <td>${esc(caso.sancao)}</td>
      <td>${esc(caso.observacaoCaso)}</td>
    </tr>
  `).join('');

  return `
    <section class="card macro-card" id="macro-consolidados">
      <div class="card-head">
        <div><h3>Casos consolidados</h3><p class="muted">Uma linha por caso</p></div>
        <button type="button" class="btn ghost" id="macro-clear">Limpar filtros</button>
      </div>
      <div class="card-body">
        ${renderMacroFiltros(todosCasos)}
        <p class="quick-filter-note">Exibindo <strong>${esc(casos.length)}</strong> de ${esc(todosCasos.length)} casos. Os filtros se combinam; dentro de um mesmo campo vale qualquer opção marcada. Clique nos KPIs para filtrar rapidamente e numa linha para abrir o caso no Fluxograma.</p>
      </div>
      <div class="table-wrap">
        ${casos.length === 0 ? '<div class="empty">Nenhum caso consolidado encontrado para os filtros selecionados.</div>' : `
          <table class="tbl clickable">
            <thead>
              <tr>
                ${[
                  ['titulo', 'Caso'], ['clube', 'Clube'], ['serie', 'Série'], ['origem', 'Origem'], ['status', 'Status Caso'], ['etapaAtual', 'Etapa atual'], ['pendencia', 'Pendência'], ['sancao', 'Sanção decidida'], ['observacaoCaso', 'Observação']]
                    .map(([key, label]) => `<th data-macro-sort="${key}">${label}${macroSort.key === key ? (macroSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`).join('')}
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        `}
      </div>
    </section>
  `;
}

function macroCountBy(casos, key) {
  return casos.reduce((acc, caso) => {
    const chave = macroValor(caso[key], key === 'serie' ? '—' : `Sem ${key}`);
    acc.set(chave, (acc.get(chave) || 0) + 1);
    return acc;
  }, new Map());
}

function renderBar(label, value, total, color = 'gold') {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  return `
    <div class="bar-row">
      <span class="bar-label" title="${esc(label)}">${esc(label)}</span>
      <span class="bar-track"><span class="bar-fill ${esc(color)}" style="width:${width}%"></span></span>
      <span class="bar-num">${esc(value)}</span>
    </div>
  `;
}

function renderMacroBars(casos) {
  const total = casos.length;
  const pendencias = [
    ['ANRESF', casos.filter((caso) => caso.pendencia === 'ANRESF').length, 'purple'],
    ['Clube', casos.filter((caso) => caso.pendencia === 'Clube').length, 'orange'],
    ['Tarefa pendente', casos.filter((caso) => caso.pendencia === 'Pendente').length, 'gold'],
    ['Sem pendência', casos.filter((caso) => caso.pendencia === 'Sem pendência').length, 'green'],
    ['Verificar', casos.filter((caso) => caso.pendencia === 'Verificar').length, 'blue'],
  ];
  const origens = Array.from(macroCountBy(casos, 'origem').entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const series = Array.from(macroCountBy(casos, 'serie').entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return `
    <div class="macro-grid">
      <section class="card macro-card">
        <div class="card-head"><div><h3>Casos por pendência</h3><p class="muted">Responsável atual</p></div></div>
        <div class="card-body op-filter-grid">${pendencias.map(([label, value, color]) => renderBar(label, value, total, color)).join('')}</div>
      </section>
      <section class="card macro-card">
        <div class="card-head"><div><h3>Distribuição de casos</h3><p class="muted">Origem e série</p></div></div>
        <div class="card-body op-filter-grid">
          ${origens.length ? origens.map(([label, value]) => renderBar(`Origem · ${label}`, value, total, 'gold')).join('') : '<div class="empty">Sem origem registrada.</div>'}
          ${series.length ? series.map(([label, value]) => renderBar(`Série · ${label}`, value, total, 'purple')).join('') : ''}
        </div>
      </section>
    </div>
  `;
}

async function carregarDadosMacroSeNecessario() {
  if (Array.isArray(dadosFluxograma) && dadosFluxograma.length > 0) return;
  if (macroCarregando) return;
  macroCarregando = true;
  try {
    const resposta = await fetch('/api/etapas');
    if (!resposta.ok) throw new Error('Falha ao buscar dados do Macro.');
    const dados = await resposta.json();
    DATA = Array.isArray(dados) ? dados : [];
    dadosFluxograma = DATA;
  } catch (erro) {
    console.warn('Não foi possível carregar dados do Macro.', erro);
    DATA = [];
    dadosFluxograma = [];
  } finally {
    macroCarregando = false;
  }
}

async function renderMacro() {
  const panel = document.querySelector('#macro');
  if (!panel) return;

  await carregarDadosMacroSeNecessario();
  if (typeof garantirDadosTarefasCarregados === 'function') await garantirDadosTarefasCarregados();
  const casos = macroComputeCaseMetrics();
  const filtrados = macroCasosFiltrados(casos);

  panel.innerHTML = `
    <div class="macro-layout">
      ${renderMacroHero()}
      ${renderMacroKpis(casos)}
      ${renderMacroTable(filtrados, casos)}
      ${renderMacroBars(filtrados)}
    </div>
  `;

  conectarControlesMacro();
  if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel('macro');
}

function conectarControlesMacro() {
  document.querySelector('#macro-print')?.addEventListener('click', () => imprimirSomente(document.querySelector('#macro-consolidados')));
  document.querySelector('#macro-export-excel')?.addEventListener('click', (event) => {
    if (typeof exportarCasosExcel === 'function') exportarCasosExcel(event.currentTarget);
  });
  const limparTudo = () => {
    macroBusca = '';
    macroFiltro = 'todos';
    macroFiltros = macroFiltrosPadrao();
    renderMacro();
  };
  document.querySelector('#macro-clear')?.addEventListener('click', limparTudo);
  document.querySelector('#macro-clear-chips')?.addEventListener('click', limparTudo);
  document.querySelectorAll('#macro [data-macro-multi]').forEach((det) => {
    const chave = det.dataset.macroMulti;
    det.querySelector('.op-multi-apply')?.addEventListener('click', () => {
      macroFiltros[chave] = Array.from(det.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
      renderMacro();
    });
    det.querySelector('.op-multi-clear')?.addEventListener('click', () => { macroFiltros[chave] = []; renderMacro(); });
  });
  document.querySelectorAll('#macro [data-macro-select]').forEach((sel) => sel.addEventListener('change', () => {
    macroFiltros[sel.dataset.macroSelect] = sel.value;
    renderMacro();
  }));
  document.querySelectorAll('#macro [data-macro-data]').forEach((inp) => inp.addEventListener('change', () => {
    macroFiltros[inp.dataset.macroData] = inp.value;
    renderMacro();
  }));
  document.querySelectorAll('#macro [data-macro-chip]').forEach((chip) => chip.addEventListener('click', () => {
    macroRemoverFiltro(chip.dataset.macroChip, chip.dataset.macroChipValor);
    renderMacro();
  }));
  document.querySelector('#macro-busca')?.addEventListener('input', async (event) => {
    macroBusca = event.target.value;
    const pos = event.target.selectionStart;
    await renderMacro(); // renderMacro é assíncrono: o foco só volta depois da nova tela
    const campo = document.querySelector('#macro-busca');
    if (campo) { campo.focus(); try { campo.setSelectionRange(pos, pos); } catch (e) { /* tipo search em alguns navegadores */ } }
  });
  document.querySelector('#macro-sort-prazo')?.addEventListener('click', () => {
    macroSort = { key: 'proximoPrazoSort', dir: macroSort.key === 'proximoPrazoSort' && macroSort.dir === 'asc' ? 'desc' : 'asc' };
    renderMacro();
  });
  document.querySelectorAll('[data-macro-filter]').forEach((btn) => btn.addEventListener('click', () => {
    macroFiltro = btn.dataset.macroFilter || 'todos';
    renderMacro();
  }));
  document.querySelectorAll('[data-macro-sort]').forEach((th) => th.addEventListener('click', () => {
    const key = th.dataset.macroSort;
    macroSort = { key, dir: macroSort.key === key && macroSort.dir === 'asc' ? 'desc' : 'asc' };
    renderMacro();
  }));
  document.querySelectorAll('[data-macro-caso]').forEach((row) => row.addEventListener('click', () => {
    casoSelecionado = row.dataset.macroCaso || casoSelecionado;
    const navFluxograma = document.querySelector('.nav-item[data-panel="fluxograma"]');
    if (typeof renderizarFluxograma === 'function') renderizarFluxograma();
    if (navFluxograma) activatePanel('fluxograma', navFluxograma);
  }));
}

navItems.forEach((item) => {
  if (item.dataset.panel !== 'macro') return;
  item.addEventListener('click', renderMacro);
});

if (document.querySelector('#macro')?.classList.contains('active-panel')) renderMacro();
