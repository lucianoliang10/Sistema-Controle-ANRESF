// Painel "Armazenamento" (só administradores): quanto os anexos ocupam no
// Supabase Storage e a limpeza dos arquivos que nenhum caso, etapa ou tarefa
// usa mais. Quem decide o que é "sem uso" é o servidor (/api/anexos-limpeza),
// que confere de novo na hora de excluir.

const ARM_LIMITE_GRATIS = 1024 * 1024 * 1024; // 1 GB de arquivos no plano grátis do Supabase
const ARM_MAX_ZIP = 150 * 1024 * 1024;        // cada .zip de cópia fica abaixo disso

const armUI = { carregado: false, carregando: false, erro: '', dados: null, marcados: new Set(), ocupado: '', progresso: '', aviso: null };

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

async function armCarregar() {
  if (armUI.carregando) return;
  armUI.carregando = true; armUI.erro = '';
  armRender();
  try {
    const resposta = await fetch('/api/anexos-limpeza');
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok || !dados) throw new Error((dados && dados.erro) || 'Não foi possível analisar o armazenamento.');
    armUI.dados = dados;
    // Tudo marcado por padrão; o que já não está na lista sai da seleção.
    const nomes = new Set(dados.semUso.lista.map((a) => a.nome));
    armUI.marcados = armUI.carregado ? new Set(Array.from(armUI.marcados).filter((n) => nomes.has(n))) : new Set(nomes);
    armUI.carregado = true;
  } catch (erro) {
    armUI.erro = erro.message || 'Não foi possível analisar o armazenamento.';
  }
  armUI.carregando = false;
  armRender();
}

function armSelecionados() {
  const lista = armUI.dados ? armUI.dados.semUso.lista : [];
  return lista.filter((a) => armUI.marcados.has(a.nome));
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
      ${card(armTamanho(d.semUso.bytes), 'Sem uso', armPlural(d.semUso.arquivos, 'arquivo que pode ser excluído', 'arquivos que podem ser excluídos'), d.semUso.arquivos ? 'orange' : 'green')}
      ${card(armTamanho(depois), 'Depois da limpeza', `${pct(depois).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do limite de 1 GB`, 'green')}
    </div>
    <section class="op-card arm-barra-card"><div class="op-card-body">
      <div class="arm-barra" role="img" aria-label="Uso do armazenamento"><span class="arm-barra-uso" style="width:${pct(d.emUso.bytes)}%"></span><span class="arm-barra-sobra" style="width:${pct(d.semUso.bytes)}%"></span></div>
      <p class="arm-legenda"><span><i class="arm-cor uso"></i>em uso</span><span><i class="arm-cor sobra"></i>sem uso</span><span><i class="arm-cor livre"></i>livre</span>
        <b>${pct(total).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</b> do limite de 1 GB de arquivos do plano grátis do Supabase está ocupado.</p>
    </div></section>`;
}

function armHtmlLista(d) {
  const lista = d.semUso.lista;
  if (!lista.length) {
    return `<section class="op-card"><div class="op-card-body"><div class="op-empty"><strong>Nenhum arquivo sem uso.</strong><br>Todos os anexos guardados são citados por algum caso, etapa ou tarefa${d.recentes ? `, ou foram enviados nas últimas ${esc(d.carenciaHoras)} horas` : ''}.</div></div></section>`;
  }
  const sel = armSelecionados();
  const bytesSel = sel.reduce((s, a) => s + a.bytes, 0);
  const travado = Boolean(armUI.ocupado);
  const linhas = lista.map((a) => `<tr>
      <td class="arm-check"><input type="checkbox" data-arm-arquivo="${esc(a.nome)}" ${armUI.marcados.has(a.nome) ? 'checked' : ''} ${travado ? 'disabled' : ''} aria-label="Selecionar ${esc(armNomeLegivel(a.nome))}"></td>
      <td class="arm-nome"><a href="${esc(a.url)}" target="_blank" rel="noopener" title="Abrir o arquivo em outra aba">${esc(armNomeLegivel(a.nome))}</a></td>
      <td class="arm-num">${esc(armTamanho(a.bytes))}</td>
      <td class="arm-num">${esc(armData(a.criado_em))}</td>
    </tr>`).join('');
  return `<section class="op-card"><div class="op-card-head"><div><h3>Arquivos sem uso</h3>
      <p class="op-muted">Nenhum caso, etapa ou tarefa cita estes arquivos. Costumam ser anexos que foram trocados por outro, ou de etapas e tarefas excluídas. Clique no nome para abrir e conferir.${d.recentes ? ` ${esc(armPlural(d.recentes, 'arquivo enviado', 'arquivos enviados'))} nas últimas ${esc(d.carenciaHoras)} horas ${d.recentes === 1 ? 'ficou' : 'ficaram'} de fora, por cautela.` : ''}</p></div></div>
    <div class="arm-acoes">
      <label class="arm-todos"><input type="checkbox" data-arm-todos ${sel.length === lista.length ? 'checked' : ''} ${travado ? 'disabled' : ''}><span>Selecionar todos</span></label>
      <span class="arm-resumo">${esc(armPlural(sel.length, 'selecionado', 'selecionados'))} · ${esc(armTamanho(bytesSel))}</span>
      <span class="arm-espaco"></span>
      <button type="button" class="op-btn" data-arm-acao="baixar" ${sel.length && !travado ? '' : 'disabled'}>${armUI.ocupado === 'baixar' ? esc(armUI.progresso || 'Baixando…') : 'Baixar cópia (.zip)'}</button>
      <button type="button" class="op-btn arm-btn-perigo" data-arm-acao="excluir" ${sel.length && !travado ? '' : 'disabled'}>${armUI.ocupado === 'excluir' ? 'Excluindo…' : `Excluir ${esc(armPlural(sel.length, 'arquivo', 'arquivos'))}`}</button>
    </div>
    <div class="op-table-wrap arm-tabela"><table class="arm-tbl"><thead><tr><th></th><th>Arquivo</th><th class="arm-num">Tamanho</th><th class="arm-num">Enviado em</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <p class="arm-rodape">A exclusão é definitiva: o plano grátis do Supabase não tem backup. Se quiser guardar os arquivos antes, use “Baixar cópia (.zip)”. Na hora de excluir, o servidor confere de novo e só apaga o que continua sem uso.</p>
  </section>`;
}

function armRender() {
  const painel = document.querySelector('#armazenamento');
  if (!painel) return;
  const topo = (acoes = '') => `<section class="op-hero"><div><span class="op-pill">Administração</span><h2>Armazenamento de anexos</h2><p>Quanto os anexos das etapas e tarefas ocupam no Supabase, e a limpeza dos arquivos que nenhum caso usa mais.</p></div><div class="op-actions">${acoes}</div></section>`;
  const vazio = (texto) => `<div class="op-layout">${topo()}<section class="op-card"><div class="op-card-body"><div class="op-empty">${texto}</div></div></section></div>`;
  if (!armEhAdm()) { painel.innerHTML = vazio('Só administradores podem ver e limpar o armazenamento de anexos.'); return; }
  if (armUI.erro) { painel.innerHTML = vazio(`${esc(armUI.erro)} <button type="button" class="op-btn" data-arm-acao="recarregar">Tentar de novo</button><br><span class="arm-dim">Por segurança, nada é listado nem excluído quando a conferência não termina.</span>`); return; }
  if (!armUI.dados) { painel.innerHTML = vazio('Conferindo os arquivos guardados com os casos, etapas e tarefas…'); return; }
  const d = armUI.dados;
  const aviso = armUI.aviso ? `<div class="ind-aviso ${armUI.aviso.tipo === 'erro' ? 'erro' : 'ok'}" role="status">${esc(armUI.aviso.texto)}</div>` : '';
  painel.innerHTML = `<div class="op-layout">
    ${topo(`<button type="button" class="op-btn" data-arm-acao="recarregar" ${armUI.carregando || armUI.ocupado ? 'disabled' : ''}>${armUI.carregando ? 'Conferindo…' : 'Conferir de novo'}</button>`)}
    ${aviso}
    ${armHtmlUso(d)}
    ${armHtmlLista(d)}
    <p class="arm-rodape">Conferência feita em ${esc(Number(d.linhasConferidas).toLocaleString('pt-BR'))} registros de casos, etapas e tarefas.${d.pastasIgnoradas ? ` ${esc(armPlural(d.pastasIgnoradas, 'pasta', 'pastas'))} do armazenamento não ${d.pastasIgnoradas === 1 ? 'foi analisada' : 'foram analisadas'}.` : ''}</p>
  </div>`;
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
  painel.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.armArquivo !== undefined) {
      if (el.checked) armUI.marcados.add(el.dataset.armArquivo); else armUI.marcados.delete(el.dataset.armArquivo);
      return armRender();
    }
    if (el.dataset.armTodos !== undefined && armUI.dados) {
      armUI.marcados = el.checked ? new Set(armUI.dados.semUso.lista.map((a) => a.nome)) : new Set();
      armRender();
    }
  });
  navItems.forEach((item) => {
    if (item.dataset.panel === 'armazenamento') item.addEventListener('click', renderArmazenamento);
  });
  if (painel.classList.contains('active-panel')) renderArmazenamento();
})();
