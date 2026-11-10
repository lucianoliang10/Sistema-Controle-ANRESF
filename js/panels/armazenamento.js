// Painel "Armazenamento" (só administradores): quanto os anexos ocupam no
// Supabase Storage e a limpeza dos arquivos que nenhum caso, etapa ou tarefa
// usa mais. Quem decide o que é "sem uso" é o servidor (/api/anexos-limpeza),
// que confere de novo na hora de excluir.

const ARM_LIMITE_GRATIS = 1024 * 1024 * 1024; // 1 GB de arquivos no plano grátis do Supabase
const ARM_MAX_ZIP = 150 * 1024 * 1024;        // cada .zip de cópia fica abaixo disso

const armUI = {
  carregado: false, carregando: false, erro: '', dados: null, marcados: new Set(), ocupado: '', progresso: '', aviso: null,
  filtro: 'todos', busca: '', ordem: { col: 'bytes', dir: 'desc' },
};

const ARM_SITUACOES = {
  'em-uso': { rotulo: 'Em uso', cor: 'green', dica: 'Citado em algum caso, etapa ou tarefa.' },
  'sem-uso': { rotulo: 'Sem uso', cor: 'orange', dica: 'Nenhum caso, etapa ou tarefa cita este arquivo. Pode ser excluído.' },
  recente: { rotulo: 'Recente', cor: 'neutral', dica: 'Ninguém cita ainda, mas foi enviado há pouco. Fica protegido contra exclusão, por cautela.' },
};

function armEhAdm() {
  return typeof perfilAtual === 'function' && perfilAtual() === 'adm';
}

function armTamanho(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: n >= 10 * 1024 * 1024 ? 0 : 1 })} MB`;
  if (n >= 1024) return `${Math.round(n / 1024).toLocaleString('pt-BR')} kB`;
  return `${n} bytes`;
}

function armPlural(n, um, varios) {
  return `${Number(n).toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

function armData(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR') : '—';
}

// O sistema grava "<carimbo de tempo>-<nome do arquivo>".
function armNomeLegivel(nome) {
  return String(nome).replace(/^\d{10,}-/, '');
}

function armChave(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function armSemUso() {
  return armUI.dados ? armUI.dados.arquivos.filter((a) => a.situacao === 'sem-uso') : [];
}

async function armCarregar() {
  if (armUI.carregando) return;
  armUI.carregando = true; armUI.erro = '';
  armRender();
  try {
    const resposta = await fetch('/api/anexos-limpeza');
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok || !dados || !Array.isArray(dados.arquivos)) throw new Error((dados && dados.erro) || 'Não foi possível analisar o armazenamento.');
    armUI.dados = dados;
    // Os sem uso começam marcados; o que já não está na lista sai da seleção.
    const nomes = new Set(armSemUso().map((a) => a.nome));
    armUI.marcados = armUI.carregado ? new Set(Array.from(armUI.marcados).filter((n) => nomes.has(n))) : new Set(nomes);
    armUI.carregado = true;
  } catch (erro) {
    armUI.erro = erro.message || 'Não foi possível analisar o armazenamento.';
  }
  armUI.carregando = false;
  armRender();
}

// Só arquivo sem uso pode estar selecionado.
function armSelecionados() {
  return armSemUso().filter((a) => armUI.marcados.has(a.nome));
}

function armVisiveis() {
  const termo = armChave(armUI.busca);
  const { col, dir } = armUI.ordem;
  const fator = dir === 'asc' ? 1 : -1;
  return armUI.dados.arquivos
    .filter((a) => (armUI.filtro === 'todos' || a.situacao === armUI.filtro)
      && (!termo || armChave(`${armNomeLegivel(a.nome)} ${a.usos.join(' ')}`).includes(termo)))
    .sort((a, b) => {
      if (col === 'nome') return fator * armNomeLegivel(a.nome).localeCompare(armNomeLegivel(b.nome), 'pt-BR', { sensitivity: 'base' });
      if (col === 'criado_em') return fator * (Date.parse(a.criado_em || 0) - Date.parse(b.criado_em || 0));
      return fator * (a.bytes - b.bytes);
    });
}

function armHtmlUso(d) {
  const total = d.total.bytes;
  const depois = total - d.semUso.bytes;
  const pct = (b) => Math.min(100, (b / ARM_LIMITE_GRATIS) * 100);
  const cor = pct(total) >= 90 ? 'red' : (pct(total) >= 75 ? 'orange' : 'green');
  const card = (valor, rotulo, sub, cls = '') => `<div class="op-kpi ${cls}"><strong>${esc(valor)}</strong><span>${esc(rotulo)}</span><small>${esc(sub)}</small></div>`;
  return `<div class="op-kpis arm-kpis">
      ${card(armTamanho(total), 'Anexos guardados', armPlural(d.total.arquivos, 'arquivo', 'arquivos'), cor)}
      ${card(armTamanho(d.emUso.bytes), 'Em uso', armPlural(d.emUso.arquivos, 'arquivo citado', 'arquivos citados') + ' em casos, etapas ou tarefas', 'blue')}
      ${card(armTamanho(d.semUso.bytes), 'Sem uso', d.semUso.arquivos ? armPlural(d.semUso.arquivos, 'arquivo que pode ser excluído', 'arquivos que podem ser excluídos') : 'nada para limpar', d.semUso.arquivos ? 'orange' : 'green')}
      ${card(armTamanho(depois), 'Depois da limpeza', `${pct(depois).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do limite de 1 GB`, 'green')}
    </div>
    <section class="op-card arm-barra-card"><div class="op-card-body">
      <div class="arm-barra" role="img" aria-label="Uso do armazenamento"><span class="arm-barra-uso" style="width:${pct(d.emUso.bytes + d.recentes.bytes)}%"></span><span class="arm-barra-sobra" style="width:${pct(d.semUso.bytes)}%"></span></div>
      <p class="arm-legenda"><span><i class="arm-cor uso"></i>em uso</span><span><i class="arm-cor sobra"></i>sem uso</span><span><i class="arm-cor livre"></i>livre</span>
        <b>${pct(total).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</b> do limite de 1 GB de arquivos do plano grátis do Supabase está ocupado.</p>
    </div></section>`;
}

function armHtmlFiltros(d) {
  const opcoes = [['todos', 'Todos', d.total.arquivos], ['sem-uso', 'Sem uso', d.semUso.arquivos], ['em-uso', 'Em uso', d.emUso.arquivos]];
  if (d.recentes.arquivos) opcoes.push(['recente', 'Recentes', d.recentes.arquivos]);
  return `<div class="arm-filtros">
      <div class="arm-abas" role="tablist" aria-label="Filtrar por situação">${opcoes.map(([id, rotulo, n]) => `<button type="button" role="tab" aria-selected="${armUI.filtro === id}" class="${armUI.filtro === id ? 'ativa' : ''}${id === 'sem-uso' && n ? ' alerta' : ''}" data-arm-filtro="${id}">${esc(rotulo)} <b>${esc(Number(n).toLocaleString('pt-BR'))}</b></button>`).join('')}</div>
      <label class="arm-busca"><span class="op-label">Busca</span><input type="search" data-arm-busca value="${esc(armUI.busca)}" placeholder="Nome do arquivo, clube ou etapa"></label>
    </div>`;
}

// Barra de seleção e exclusão. Só existe quando há arquivo sem uso.
function armHtmlAcoes() {
  const semUso = armSemUso();
  if (!semUso.length) return '';
  const sel = armSelecionados();
  const bytesSel = sel.reduce((s, a) => s + a.bytes, 0);
  const travado = Boolean(armUI.ocupado);
  return `<label class="arm-todos"><input type="checkbox" data-arm-todos ${sel.length === semUso.length ? 'checked' : ''} ${travado ? 'disabled' : ''}><span>Selecionar todos os sem uso</span></label>
      <span class="arm-resumo">${esc(armPlural(sel.length, 'selecionado', 'selecionados'))} · ${esc(armTamanho(bytesSel))}</span>
      <span class="arm-espaco"></span>
      <button type="button" class="op-btn" data-arm-acao="baixar" ${sel.length && !travado ? '' : 'disabled'}>${armUI.ocupado === 'baixar' ? esc(armUI.progresso || 'Baixando…') : 'Baixar cópia (.zip)'}</button>
      <button type="button" class="op-btn arm-btn-perigo" data-arm-acao="excluir" ${sel.length && !travado ? '' : 'disabled'}>${armUI.ocupado === 'excluir' ? 'Excluindo…' : `Excluir ${esc(armPlural(sel.length, 'arquivo', 'arquivos'))}`}</button>`;
}

function armHtmlTabela() {
  const d = armUI.dados;
  const lista = armVisiveis();
  const travado = Boolean(armUI.ocupado);
  const seta = (col) => (armUI.ordem.col === col ? (armUI.ordem.dir === 'asc' ? ' ↑' : ' ↓') : '');
  const linhas = lista.map((a) => {
    const sit = ARM_SITUACOES[a.situacao] || ARM_SITUACOES.recente;
    const onde = a.usos.length
      ? `<span title="${esc(a.usos.join('\n'))}">${esc(a.usos[0])}${a.usos.length > 1 ? ` <b class="arm-mais">+${a.usos.length - 1}</b>` : ''}</span>`
      : '<span class="arm-dim">—</span>';
    return `<tr class="${a.situacao === 'sem-uso' ? 'arm-linha-sem-uso' : ''}">
      <td class="arm-check">${a.situacao === 'sem-uso' ? `<input type="checkbox" data-arm-arquivo="${esc(a.nome)}" ${armUI.marcados.has(a.nome) ? 'checked' : ''} ${travado ? 'disabled' : ''} aria-label="Selecionar ${esc(armNomeLegivel(a.nome))}">` : ''}</td>
      <td class="arm-nome"><a href="${esc(a.url)}" target="_blank" rel="noopener" title="Abrir o arquivo em outra aba">${esc(armNomeLegivel(a.nome))}</a></td>
      <td><span class="op-pill ${sit.cor}" title="${esc(sit.dica)}">${esc(sit.rotulo)}</span></td>
      <td class="arm-onde">${onde}</td>
      <td class="arm-num">${esc(armTamanho(a.bytes))}</td>
      <td class="arm-num">${esc(armData(a.criado_em))}</td>
    </tr>`;
  }).join('');
  const vazio = armUI.filtro === 'sem-uso' && !d.semUso.arquivos
    ? '<strong>Nenhum arquivo sem uso.</strong><br>Todos os anexos guardados são citados por algum caso, etapa ou tarefa, ou foram enviados há pouco.'
    : 'Nenhum arquivo com esses filtros.';
  const bytes = lista.reduce((s, a) => s + a.bytes, 0);
  return `<p class="arm-contagem">Mostrando <b>${esc(Number(lista.length).toLocaleString('pt-BR'))}</b> de ${esc(Number(d.total.arquivos).toLocaleString('pt-BR'))} arquivos · ${esc(armTamanho(bytes))}</p>
    <div class="op-table-wrap arm-tabela"><table class="arm-tbl"><thead><tr><th></th><th data-arm-ordem="nome">Arquivo${seta('nome')}</th><th>Situação</th><th>Onde é usado</th><th class="arm-num" data-arm-ordem="bytes">Tamanho${seta('bytes')}</th><th class="arm-num" data-arm-ordem="criado_em">Enviado em${seta('criado_em')}</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="6"><div class="op-empty">${vazio}</div></td></tr>`}</tbody></table></div>`;
}

function armHtmlLista(d) {
  const acoes = armHtmlAcoes();
  return `<section class="op-card"><div class="op-card-head"><div><h3>Arquivos guardados</h3>
      <p class="op-muted">Todos os anexos do Storage, com a situação de cada um e onde é usado. “Sem uso” é o arquivo que nenhum caso, etapa ou tarefa cita: costuma ser um anexo que foi trocado por outro, ou de etapa ou tarefa excluída. Clique no nome para abrir e conferir.</p></div></div>
    ${armHtmlFiltros(d)}
    ${acoes ? `<div class="arm-acoes" id="arm-acoes">${acoes}</div>` : ''}
    <div id="arm-lista">${armHtmlTabela()}</div>
    <p class="arm-rodape">${d.semUso.arquivos ? 'A exclusão é definitiva: o plano grátis do Supabase não tem backup. Se quiser guardar os arquivos antes, use “Baixar cópia (.zip)”. Só arquivo sem uso pode ser selecionado, e na hora de excluir o servidor confere de novo.' : 'Não há arquivo sem uso para excluir.'}${d.recentes.arquivos ? ` ${esc(armPlural(d.recentes.arquivos, 'arquivo recente', 'arquivos recentes'))}, enviado${d.recentes.arquivos === 1 ? '' : 's'} nas últimas ${esc(d.carenciaHoras)} horas e ainda sem citação, ${d.recentes.arquivos === 1 ? 'fica protegido' : 'ficam protegidos'} por cautela.` : ''}</p>
  </section>`;
}

// Atualizações parciais: mexer na seleção, na busca ou na ordem não refaz a
// tela inteira (a tabela tem rolagem própria e o campo de busca perderia o foco).
function armAtualizarAcoes() {
  const el = document.querySelector('#arm-acoes');
  if (el) el.innerHTML = armHtmlAcoes();
}

function armAtualizarLista() {
  const el = document.querySelector('#arm-lista');
  if (!el) return;
  const rolagem = el.querySelector('.arm-tabela');
  const topo = rolagem ? rolagem.scrollTop : 0;
  el.innerHTML = armHtmlTabela();
  const nova = el.querySelector('.arm-tabela');
  if (nova) nova.scrollTop = topo;
}

function armRender() {
  const painel = document.querySelector('#armazenamento');
  if (!painel) return;
  const topo = (acoes = '') => `<section class="op-hero"><div><span class="op-pill">Administração</span><h2>Armazenamento de anexos</h2><p>Todos os anexos das etapas e tarefas guardados no Supabase, quanto ocupam e a limpeza dos que nenhum caso usa mais.</p></div><div class="op-actions">${acoes}</div></section>`;
  const vazio = (texto) => `<div class="op-layout">${topo()}<section class="op-card"><div class="op-card-body"><div class="op-empty">${texto}</div></div></section></div>`;
  if (!armEhAdm()) { painel.innerHTML = vazio('Só administradores podem ver e limpar o armazenamento de anexos.'); return; }
  if (armUI.erro) { painel.innerHTML = vazio(`${esc(armUI.erro)} <button type="button" class="op-btn" data-arm-acao="recarregar">Tentar de novo</button><br><span class="arm-dim">Por segurança, nada é listado nem excluído quando a conferência não termina.</span>`); return; }
  if (!armUI.dados) { painel.innerHTML = vazio('Conferindo os arquivos guardados com os casos, etapas e tarefas…'); return; }
  const d = armUI.dados;
  const rolagem = painel.querySelector('.arm-tabela');
  const topoTabela = rolagem ? rolagem.scrollTop : 0;
  const aviso = armUI.aviso ? `<div class="ind-aviso ${armUI.aviso.tipo === 'erro' ? 'erro' : 'ok'}" role="status">${esc(armUI.aviso.texto)}</div>` : '';
  painel.innerHTML = `<div class="op-layout">
    ${topo(`<button type="button" class="op-btn" data-arm-acao="recarregar" ${armUI.carregando || armUI.ocupado ? 'disabled' : ''}>${armUI.carregando ? 'Conferindo…' : 'Conferir de novo'}</button>`)}
    ${aviso}
    ${armHtmlUso(d)}
    ${armHtmlLista(d)}
    <p class="arm-rodape">Conferência feita em ${esc(Number(d.linhasConferidas).toLocaleString('pt-BR'))} registros de casos, etapas e tarefas.${d.pastasIgnoradas ? ` ${esc(armPlural(d.pastasIgnoradas, 'pasta', 'pastas'))} do armazenamento não ${d.pastasIgnoradas === 1 ? 'foi analisada' : 'foram analisadas'}.` : ''}</p>
  </div>`;
  const nova = painel.querySelector('.arm-tabela');
  if (nova) nova.scrollTop = topoTabela;
  if (typeof restaurarScrollPainel === 'function') restaurarScrollPainel('armazenamento');
}

// Baixa os arquivos selecionados e entrega em um ou mais .zip (cada um abaixo
// de ARM_MAX_ZIP), para quem quiser guardar uma cópia antes de excluir.
async function armBaixarCopia() {
  const sel = armSelecionados();
  if (!sel.length || armUI.ocupado) return;
  armUI.ocupado = 'baixar'; armUI.aviso = null;
  const dia = new Date().toISOString().slice(0, 10);
  let parte = [];
  let bytesParte = 0;
  let numero = 0;
  const fechar = (ultima) => {
    if (!parte.length) return;
    numero += 1;
    const sufixo = ultima && numero === 1 ? '' : `-parte-${numero}`;
    baixarArquivo(montarZip(parte), `anexos-sem-uso-${dia}${sufixo}.zip`, 'application/zip');
    parte = []; bytesParte = 0;
  };
  try {
    for (let i = 0; i < sel.length; i += 1) {
      armUI.progresso = `Baixando ${i + 1} de ${sel.length}…`;
      armRender();
      const resposta = await fetch(sel[i].url);
      if (!resposta.ok) throw new Error(`Não foi possível baixar “${armNomeLegivel(sel[i].nome)}” (HTTP ${resposta.status}).`);
      const dados = new Uint8Array(await resposta.arrayBuffer());
      if (parte.length && bytesParte + dados.length > ARM_MAX_ZIP) fechar(false);
      parte.push({ nome: sel[i].nome, dados });
      bytesParte += dados.length;
    }
    fechar(true);
    armUI.aviso = { tipo: 'ok', texto: `Cópia de ${armPlural(sel.length, 'arquivo', 'arquivos')} baixada${numero > 1 ? ` em ${numero} arquivos .zip` : ''}. Confira os downloads antes de excluir.` };
  } catch (erro) {
    armUI.aviso = { tipo: 'erro', texto: `${erro.message || 'Falha ao baixar a cópia.'} Nada foi excluído.` };
  }
  armUI.ocupado = ''; armUI.progresso = '';
  armRender();
}

async function armExcluir() {
  const sel = armSelecionados();
  if (!sel.length || armUI.ocupado) return;
  const bytes = sel.reduce((s, a) => s + a.bytes, 0);
  if (!window.confirm(`Excluir ${armPlural(sel.length, 'arquivo', 'arquivos')} sem uso (${armTamanho(bytes)})?\n\nA exclusão é definitiva e não pode ser desfeita.`)) return;
  armUI.ocupado = 'excluir'; armUI.aviso = null;
  armRender();
  try {
    const resposta = await fetch('/api/anexos-limpeza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'excluir', nomes: sel.map((a) => a.nome) }) });
    const dados = await resposta.json().catch(() => null);
    if (!dados || (!resposta.ok && !dados.excluidos)) throw new Error((dados && dados.erro) || 'Não foi possível excluir os arquivos.');
    const recusados = Array.isArray(dados.recusados) ? dados.recusados.length : 0;
    armUI.aviso = {
      tipo: dados.erro ? 'erro' : 'ok',
      texto: `${armPlural(dados.excluidos, 'arquivo excluído', 'arquivos excluídos')}, ${armTamanho(dados.bytes)} liberados.${recusados ? ` ${armPlural(recusados, 'arquivo não foi excluído', 'arquivos não foram excluídos')} porque ${recusados === 1 ? 'passou' : 'passaram'} a estar em uso.` : ''}${dados.erro ? ` ${dados.erro}` : ''}`,
    };
  } catch (erro) {
    armUI.aviso = { tipo: 'erro', texto: erro.message || 'Não foi possível excluir os arquivos.' };
  }
  armUI.ocupado = '';
  await armCarregar();
}

function renderArmazenamento() {
  armRender();
  if (armEhAdm() && !armUI.carregado) armCarregar();
}

(() => {
  const painel = document.querySelector('#armazenamento');
  if (!painel) return;
  // O grupo "Administração" do menu só aparece para administradores.
  const grupo = document.querySelector('.nav-group[data-nav-group="administracao"]');
  if (grupo) grupo.hidden = !armEhAdm();

  painel.addEventListener('click', (event) => {
    const alvo = event.target.closest('[data-arm-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.armAcao;
    if (acao === 'recarregar') { armUI.aviso = null; return armCarregar(); }
    if (acao === 'baixar') return armBaixarCopia();
    if (acao === 'excluir') return armExcluir();
  });
  painel.addEventListener('click', (event) => {
    const filtro = event.target.closest('[data-arm-filtro]');
    if (filtro) { armUI.filtro = filtro.dataset.armFiltro; return armRender(); }
    const ordem = event.target.closest('[data-arm-ordem]');
    if (ordem) {
      const col = ordem.dataset.armOrdem;
      armUI.ordem = { col, dir: armUI.ordem.col === col ? (armUI.ordem.dir === 'asc' ? 'desc' : 'asc') : (col === 'nome' ? 'asc' : 'desc') };
      armAtualizarLista();
    }
  });
  painel.addEventListener('input', (event) => {
    if (event.target.dataset.armBusca === undefined) return;
    armUI.busca = event.target.value;
    armAtualizarLista();
  });
  painel.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.armArquivo !== undefined) {
      if (el.checked) armUI.marcados.add(el.dataset.armArquivo); else armUI.marcados.delete(el.dataset.armArquivo);
      return armAtualizarAcoes();
    }
    if (el.dataset.armTodos !== undefined && armUI.dados) {
      armUI.marcados = el.checked ? new Set(armSemUso().map((a) => a.nome)) : new Set();
      armAtualizarAcoes();
      armAtualizarLista();
    }
  });
  navItems.forEach((item) => {
    if (item.dataset.panel === 'armazenamento') item.addEventListener('click', renderArmazenamento);
  });
  if (painel.classList.contains('active-panel')) renderArmazenamento();
})();
