let macroBusca = '';
let macroFiltro = 'todos';
let macroTipoCaso = 'todos';
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

// Tarefas em aberto vinculadas às etapas do caso, mais urgentes primeiro.
function macroTarefasAbertasDoCaso(rows) {
  if (!Array.isArray(dadosTarefas) || !dadosTarefas.length) return [];
  const etapaIds = new Set(rows.map((r) => String(r.etapa_banco_id)).filter(Boolean));
  const finalizada = (t) => typeof tarefaFinalizada === 'function' && tarefaFinalizada(t);
  return dadosTarefas
    .filter((t) => etapaIds.has(String(t.etapa_id)) && !finalizada(t))
    .sort((a, b) => (macroDataMs(a.data_final) || Number.MAX_SAFE_INTEGER) - (macroDataMs(b.data_final) || Number.MAX_SAFE_INTEGER));
}

function macroComputeCaseMetrics() {
  return Array.from(groupBy(dadosFluxograma, macroCasoId).entries())
    .map(([caso, rows]) => {
      const ordenadas = [...rows].sort(stageSort);
      const atual = macroEtapaAtual(ordenadas);
      const status = macroStatusCaso(ordenadas);
      const finalizado = normStatus(status).includes('finalizado');
      let prazo = macroProximoPrazo(ordenadas);
      let pendencia = macroPendencia(atual.statusEtapa || status);
      let etapaAtual = macroValor(atual.etapa);
      const dataInicial = macroDataInicial(ordenadas);
      const sancao = macroSancao(ordenadas, status);
      const observacaoCaso = macroObservacaoCaso(ordenadas);

      // Quando não há pendência de ETAPA (ANRESF/Clube) mas existe uma TAREFA em
      // aberto, a pendência do caso passa a ser a tarefa: mostra a observação da
      // tarefa como atividade atual e "Pendente" como pendência.
      let tarefaAtiva = null;
      if (!finalizado && pendencia !== 'ANRESF' && pendencia !== 'Clube') {
        tarefaAtiva = macroTarefasAbertasDoCaso(ordenadas)[0] || null;
        if (tarefaAtiva) {
          pendencia = 'Pendente';
          etapaAtual = macroValor(tarefaAtiva.observacao, macroValor(atual.etapa));
          if (!prazo && tarefaAtiva.data_final) prazo = (typeof isoToBrDate === 'function' ? isoToBrDate(tarefaAtiva.data_final) : tarefaAtiva.data_final);
        }
      }
      const dias = macroDiasAte(prazo);

      return {
        caso,
        titulo: macroTituloCaso(caso),
        clube: macroMaisFrequente(ordenadas, 'clube', 'Sem clube'),
        serie: macroMaisFrequente(ordenadas, 'serie', '—'),
        origem: macroMaisFrequente(ordenadas, 'origem', 'Sem origem'),
        status,
        finalizado,
        etapaAtual,
        pendencia,
        dataInicial: macroValor(dataInicial),
        dataInicialSort: macroDataMs(dataInicial),
        proximoPrazo: macroValor(prazo),
        proximoPrazoSort: macroDataMs(prazo) || Number.MAX_SAFE_INTEGER,
        dias,
        sancao,
        observacaoCaso,
        busca: [caso, macroMaisFrequente(ordenadas, 'clube', 'Sem clube'), macroMaisFrequente(ordenadas, 'serie', '—'), macroMaisFrequente(ordenadas, 'origem', 'Sem origem'), status, etapaAtual, atual.objeto, pendencia, sancao, observacaoCaso, tarefaAtiva?.observacao].join(' ').toLowerCase(),
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

function macroCasosFiltrados(casos) {
  const busca = macroBusca.trim().toLowerCase();
  return casos
    .filter(macroFiltroAceita)
    .filter((caso) => macroTipoCaso === 'todos' || caso.origem === macroTipoCaso)
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
        <span class="pill gold">Macro</span>
        <h2>Visão macro dos casos</h2>
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

function macroTiposCaso(casos) {
  return Array.from(new Set(casos.map((caso) => caso.origem).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }));
}

function renderMacroTable(casos, todosCasos) {
  const tiposCaso = macroTiposCaso(todosCasos);
  const linhas = casos.map((caso) => `
    <tr data-macro-caso="${esc(caso.caso)}" class="${caso.finalizado ? 'row-done' : ''}">
      <td><strong>${esc(caso.titulo)}</strong></td>
      <td>${esc(caso.clube)}</td>
      <td>${esc(caso.serie)}</td>
      <td>${esc(caso.origem)}</td>
      <td>${macroStatusPill(caso.status)}</td>
      <td>${esc(caso.etapaAtual)}</td>
      <td>${macroPendenciaPill(caso.pendencia)}</td>
      <td>${esc(caso.dataInicial)}</td>
      <td>${esc(caso.proximoPrazo)}</td>
      <td>${macroDiasCell(caso.dias, caso.finalizado)}</td>
      <td>${esc(caso.sancao)}</td>
      <td>${esc(caso.observacaoCaso)}</td>
    </tr>
  `).join('');

  return `
    <section class="card macro-card">
      <div class="card-head">
        <div><h3>Casos consolidados</h3><p class="muted">Uma linha por caso</p></div>
        <button type="button" class="btn ghost" id="macro-clear">Limpar filtros</button>
      </div>
      <div class="card-body">
        <div class="macro-filterbar">
          <label class="macro-field"><span class="macro-label">BUSCA</span><input id="macro-busca" type="search" value="${esc(macroBusca)}" placeholder="Buscar caso, clube, origem, etapa ou sanção"></label>
          <label class="macro-field"><span class="macro-label">FILTRO</span><select id="macro-filtro">
            <option value="todos" ${macroFiltro === 'todos' ? 'selected' : ''}>Todos</option>
            <option value="andamento" ${macroFiltro === 'andamento' ? 'selected' : ''}>Em andamento</option>
            <option value="finalizado" ${macroFiltro === 'finalizado' ? 'selected' : ''}>Finalizados</option>
            <option value="anresf" ${macroFiltro === 'anresf' ? 'selected' : ''}>Pendência ANRESF</option>
            <option value="clube" ${macroFiltro === 'clube' ? 'selected' : ''}>Pendência Clube</option>
            <option value="pendente" ${macroFiltro === 'pendente' ? 'selected' : ''}>Tarefa pendente</option>
            <option value="sancao" ${macroFiltro === 'sancao' ? 'selected' : ''}>Com sanção</option>
            <option value="vencido" ${macroFiltro === 'vencido' ? 'selected' : ''}>Prazos vencidos</option>
          </select></label>
          <label class="macro-field"><span class="macro-label">TIPO DE CASO</span><select id="macro-tipo-caso">
            <option value="todos" ${macroTipoCaso === 'todos' ? 'selected' : ''}>Todos os tipos</option>
            ${tiposCaso.map((tipo) => `<option value="${esc(tipo)}" ${macroTipoCaso === tipo ? 'selected' : ''}>${esc(tipo)}</option>`).join('')}
          </select></label>
          <button type="button" class="btn ghost" id="macro-sort-prazo">Ordenar por prazo</button>
        </div>
        <p class="quick-filter-note">Exibindo ${esc(casos.length)} de ${esc(todosCasos.length)} casos. Clique nos KPIs para filtrar rapidamente e em uma linha para abrir o caso no Fluxograma.</p>
      </div>
      <div class="table-wrap">
        ${casos.length === 0 ? '<div class="empty">Nenhum caso consolidado encontrado para os filtros selecionados.</div>' : `
          <table class="tbl clickable">
            <thead>
              <tr>
                ${[
                  ['titulo', 'Caso'], ['clube', 'Clube'], ['serie', 'Série'], ['origem', 'Origem'], ['status', 'Status Caso'], ['etapaAtual', 'Etapa atual'], ['pendencia', 'Pendência'], ['dataInicialSort', 'Data inicial'], ['proximoPrazoSort', 'Próximo prazo'], ['dias', 'Dias'], ['sancao', 'Sanção decidida'], ['observacaoCaso', 'Observação']]
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
}

function conectarControlesMacro() {
  document.querySelector('#macro-print')?.addEventListener('click', () => window.print());
  document.querySelector('#macro-export-excel')?.addEventListener('click', (event) => {
    if (typeof exportarCasosExcel === 'function') exportarCasosExcel(event.currentTarget);
  });
  document.querySelector('#macro-clear')?.addEventListener('click', () => {
    macroBusca = '';
    macroFiltro = 'todos';
    macroTipoCaso = 'todos';
    renderMacro();
  });
  document.querySelector('#macro-busca')?.addEventListener('input', (event) => {
    macroBusca = event.target.value;
    renderMacro();
  });
  document.querySelector('#macro-filtro')?.addEventListener('change', (event) => {
    macroFiltro = event.target.value;
    renderMacro();
  });
  document.querySelector('#macro-tipo-caso')?.addEventListener('change', (event) => {
    macroTipoCaso = event.target.value;
    renderMacro();
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
