// Panorama › Tempo dos casos › visão "Até o acórdão".
//
// Compara processos iguais. Em vez de medir o caso inteiro (que mistura quem
// parou no acórdão com quem teve recurso e cumprimento), mede cada PROCESSO da
// sua primeira etapa até o primeiro acórdão, e só compara processos que
// passaram pelas MESMAS etapas, na mesma ordem. Essa sequência é o "rito".
//
//   * Processo: começa na primeira etapa do caso e termina no primeiro acórdão
//     finalizado. Um novo Auto de Infração depois do acórdão abre outro
//     processo no mesmo caso.
//   * Sem acórdão, o processo também termina numa Decisão de Indeferimento, ou
//     na Decisão da Presidência que encerrou o caso (caso finalizado/julgado).
//   * O que vem depois (recurso, Plenário, cumprimento) fica de fora da conta.
//   * Rito: a sequência dos tipos de etapa até o fim do processo. PSS e PSO do
//     mesmo tipo de etapa contam juntos, como no Controle de IDs.
//   * Trecho: o tempo entre uma etapa e a seguinte, pelas datas das etapas.
//   * Na Denúncia os trechos são outros, definidos pela equipe (ver
//     panRitoTrechosDenuncia): só dois, medidos pela data de envio.
//   * Processo ainda sem acórdão aparece à parte, como em andamento.
//
// Usa helpers de panorama.js (panMs, panDataEtapa, panMedia, panMediana...).

const PAN_RITO_CURTOS = {
  'auto-de-infracao': 'Auto',
  'parecer-tecnico-conclusivo': 'Parecer',
  'despacho-de-distribuicao': 'Distribuição',
  'despacho-do-relator': 'Relator',
  acordao: 'Acórdão',
  'denuncia-recebida': 'Recebida',
  'nota-de-admissibilidade': 'Admissibilidade',
  denuncia: 'Denúncia',
  'decisao-da-presidencia': 'Presidência',
  'decisao-de-indeferimento': 'Indeferimento',
  diligencia: 'Diligência',
  'nota-tecnica': 'Nota Técnica',
};

// Sequências conhecidas ganham nome; as demais são descritas pelas etapas.
const PAN_RITO_NOMES = {
  'auto-de-infracao|parecer-tecnico-conclusivo|despacho-de-distribuicao|despacho-do-relator|acordao': 'Ordinário',
  'auto-de-infracao|acordao': 'Sumário',
  'auto-de-infracao|decisao-da-presidencia|parecer-tecnico-conclusivo|despacho-de-distribuicao|despacho-do-relator|acordao': 'Convertido (PSS para PSO)',
  'denuncia-recebida|nota-de-admissibilidade|denuncia|parecer-tecnico-conclusivo|despacho-de-distribuicao|despacho-do-relator|acordao': 'Denúncia',
  'denuncia-recebida|nota-de-admissibilidade|denuncia|parecer-tecnico-conclusivo|decisao-da-presidencia': 'Denúncia encerrada pela Presidência',
  'denuncia-recebida|decisao-de-indeferimento': 'Denúncia indeferida',
};

const PAN_RITO_MIN_GRUPO = 2; // sequência com um processo só vai para "outras"

function panRitoNorm(texto) {
  return String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Tipo da etapa: o nome antes do " - " (Acórdão - PSS e Acórdão - PSO são o
// mesmo tipo). "Acórdão Decisão da Presidência" conta como acórdão.
function panRitoTipo(nomeEtapa) {
  const base = panRitoNorm(String(nomeEtapa || '').split(/\s+[-–—]\s+/)[0]);
  return base.startsWith('acordao') ? 'acordao' : base;
}

function panRitoCurto(tipo, nomeEtapa) {
  return PAN_RITO_CURTOS[tipo] || String(nomeEtapa || '').split(/\s+[-–—]\s+/)[0].trim() || tipo;
}

function panRitoFinalizada(row) {
  return panRitoNorm(row.statusEtapa) === 'finalizado';
}

// Processos de um caso. `item` é o caso do quadro de tempo (com `rows`,
// `concluido`, `nome`...). Etapa com data depois da referência ainda não
// aconteceu naquele corte e é ignorada.
function panRitoProcessosDoCaso(item, referenciaMs) {
  const etapas = (item.rows || [])
    .filter((row) => row && row.etapa && !row.semEtapas)
    .map((row, posicao) => ({ row, posicao, ordem: Number(row.ordem) || 0, ms: panMs(panDataEtapa(row)), envio: panMs(row.enviadaEm), tipo: panRitoTipo(row.etapa) }))
    .filter((e) => !e.ms || e.ms <= referenciaMs)
    .sort((a, b) => (a.ordem - b.ordem) || (a.ms - b.ms) || (a.posicao - b.posicao));
  if (!etapas.length) return [];

  // Corta em processos: cada um vai até o seu fim; um Auto de Infração depois
  // do fim abre o próximo. O que fica entre o fim e o próximo auto (recurso,
  // cumprimento) não pertence a nenhum processo.
  const ehFim = (e) => panRitoFinalizada(e.row) && (e.tipo === 'acordao' || e.tipo === 'decisao-de-indeferimento' || (typeof ehDecisaoQueIndefere === 'function' && ehDecisaoQueIndefere(e.row)));
  const segmentos = [];
  let atual = null;
  etapas.forEach((e) => {
    if (atual && atual.fechado) {
      if (e.tipo !== 'auto-de-infracao') return;
      atual = null;
    }
    if (!atual) { atual = { etapas: [], fechado: false }; segmentos.push(atual); }
    atual.etapas.push(e);
    if (ehFim(e)) atual.fechado = true;
  });
  // Caso concluído sem acórdão: se a última decisão foi da Presidência, é ela
  // que encerra o processo.
  const ultimo = segmentos[segmentos.length - 1];
  if (ultimo && !ultimo.fechado && item.concluido) {
    let corte = -1;
    ultimo.etapas.forEach((e, i) => { if (e.tipo === 'decisao-da-presidencia' && panRitoFinalizada(e.row)) corte = i; });
    if (corte >= 0) { ultimo.etapas = ultimo.etapas.slice(0, corte + 1); ultimo.fechado = true; }
  }

  return segmentos.map((seg, indice) => {
    // Etapas seguidas do mesmo tipo (ex.: uma complementar) contam como uma só,
    // pela data da primeira.
    const passos = [];
    // O envio do passo é o mais recente do grupo, e só vale se já aconteceu até
    // a referência.
    seg.etapas.forEach((e) => {
      const envio = e.envio && e.envio <= referenciaMs ? e.envio : 0;
      const ultimoPasso = passos[passos.length - 1];
      if (ultimoPasso && ultimoPasso.tipo === e.tipo) { ultimoPasso.envio = Math.max(ultimoPasso.envio, envio); return; }
      passos.push({ tipo: e.tipo, curto: panRitoCurto(e.tipo, e.row.etapa), ms: e.ms, envio, nome: String(e.row.etapa) });
    });
    const inicio = passos[0].ms;
    const fim = passos[passos.length - 1].ms;
    const dias = (a, b) => (a && b ? Math.round((b - a) / PAN_DIA_MS) : null);
    const ultima = seg.etapas[seg.etapas.length - 1];
    const proprios = panRitoTrechosDenuncia(passos);
    return {
      caso: item.caso, nome: item.nome || item.clube, clube: item.clube, serie: item.serie, origem: item.origem,
      indice, totalDoCaso: segmentos.length,
      concluido: seg.fechado, casoConcluido: Boolean(item.concluido),
      passos, assinatura: passos.map((p) => p.tipo).join('|'),
      inicio, fim: seg.fechado ? fim : 0,
      total: seg.fechado ? dias(inicio, fim) : null,
      // Trechos: os próprios do rito, quando há; senão, de uma etapa à seguinte.
      trechosProprios: Boolean(proprios),
      rotulosTrechos: proprios ? proprios.map((x) => x.rotulo) : passos.slice(1).map((p, i) => `${passos[i].curto} → ${p.curto}`),
      trechos: proprios ? proprios.map((x) => x.dias) : passos.slice(1).map((p, i) => dias(passos[i].ms, p.ms)),
      // 'envio' = medido pela data de envio; 'padrao' = sem envio, medido até o
      // início da etapa seguinte.
      fontesTrechos: proprios ? proprios.map((x) => x.fonte) : passos.slice(1).map(() => ''),
      etapaAtual: String(ultima.row.etapa), statusAtual: String(ultima.row.statusEtapa || ''),
    };
  });
}

// Trechos da DENÚNCIA, como a equipe acompanha. São três:
//   1. "Recebida até Admissibilidade": do início da Denúncia Recebida até o
//      ENVIO da Nota de Admissibilidade. Sem data de envio, vai até o início
//      da etapa Denúncia.
//   2. "Tempo de defesa": do início da etapa Denúncia até o início do
//      Parecer Técnico Conclusivo. É de início a início, sem data de envio.
//   3. "Denúncia até Parecer": do início do Parecer até o ENVIO do Parecer.
//      Sem data de envio, vai até o início do Despacho de Distribuição (ou da
//      etapa que vier logo depois do parecer).
// Devolve null quando o processo não é uma denúncia com essas etapas.
function panRitoTrechosDenuncia(passos) {
  if (!passos.length || passos[0].tipo !== 'denuncia-recebida') return null;
  const achar = (tipo, de = 0) => passos.findIndex((p, i) => i >= de && p.tipo === tipo);
  const iAdm = achar('nota-de-admissibilidade');
  const iPar = achar('parecer-tecnico-conclusivo');
  if (iAdm < 0 || iPar < 0) return null;
  // Intervalo válido: as duas datas existem e a segunda não vem antes da primeira.
  const medir = (inicio, fimEnvio, fimPadrao) => {
    const dias = (a, b) => (a && b && b >= a ? Math.round((b - a) / PAN_DIA_MS) : null);
    if (fimEnvio) return { dias: dias(inicio, fimEnvio), fonte: 'envio' };
    return { dias: dias(inicio, fimPadrao), fonte: fimPadrao ? 'padrao' : '' };
  };
  const iDen = achar('denuncia', iAdm);
  const iDist = achar('despacho-de-distribuicao', iPar);
  const depoisDoParecer = passos[iDist >= 0 ? iDist : iPar + 1];
  return [
    { rotulo: 'Recebida até Admissibilidade', ...medir(passos[0].ms, passos[iAdm].envio, iDen >= 0 ? passos[iDen].ms : 0) },
    { rotulo: 'Tempo de defesa', dias: medir(iDen >= 0 ? passos[iDen].ms : 0, passos[iPar].ms, 0).dias, fonte: '' },
    { rotulo: 'Denúncia até Parecer', ...medir(passos[iPar].ms, passos[iPar].envio, depoisDoParecer ? depoisDoParecer.ms : 0) },
  ];
}

function panRitoNome(assinatura, passos) {
  return PAN_RITO_NOMES[assinatura] || passos.map((p) => p.curto).join(', ');
}

// Tudo o que a visão mostra, a partir dos casos já filtrados.
function panRitos(itens, referenciaMs) {
  const diaReferencia = new Date(Math.min(referenciaMs, Date.now() + 365 * PAN_DIA_MS)).setHours(0, 0, 0, 0);
  const processos = [];
  (itens || []).forEach((item) => panRitoProcessosDoCaso(item, referenciaMs).forEach((p) => processos.push(p)));
  const concluidos = processos.filter((p) => p.concluido);
  const comData = concluidos.filter((p) => p.total !== null && p.total >= 0);
  // Em andamento: processo aberto de caso aberto. Evento de Insolvência não
  // termina em acórdão, então não entra nessa fila.
  const andamento = processos
    .filter((p) => !p.concluido && !p.casoConcluido && p.inicio && !panRitoNorm(p.origem).includes('insolvencia'))
    .map((p) => ({ ...p, dias: Math.max(Math.round((diaReferencia - p.inicio) / PAN_DIA_MS), 0) }))
    .sort((a, b) => (b.dias - a.dias) || compararCaso(a.caso, b.caso));

  const porAssinatura = new Map();
  comData.forEach((p) => { if (!porAssinatura.has(p.assinatura)) porAssinatura.set(p.assinatura, []); porAssinatura.get(p.assinatura).push(p); });
  const grupos = [];
  const outros = [];
  porAssinatura.forEach((lista, assinatura) => {
    if (lista.length < PAN_RITO_MIN_GRUPO) { outros.push(...lista); return; }
    const passos = lista[0].passos;
    const totais = lista.map((p) => p.total);
    const ordenados = lista.slice().sort((a, b) => (a.total - b.total) || compararCaso(a.caso, b.caso));
    grupos.push({
      assinatura, nome: panRitoNome(assinatura, passos), etapas: passos.map((p) => p.curto),
      processos: lista, media: panMedia(totais), mediana: panMediana(totais),
      maisRapido: ordenados[0], maisLongo: ordenados[ordenados.length - 1],
      proprio: lista[0].trechosProprios,
      trechos: lista[0].rotulosTrechos.map((rotulo, i) => {
        const valores = lista.map((x) => x.trechos[i]).filter((v) => v !== null && v >= 0);
        return { rotulo, casos: valores.length, media: panMedia(valores), mediana: panMediana(valores), semEnvio: lista.filter((x) => x.fontesTrechos[i] === 'padrao').length };
      }),
    });
  });
  grupos.sort((a, b) => (b.processos.length - a.processos.length) || a.nome.localeCompare(b.nome, 'pt-BR'));
  outros.sort((a, b) => (b.total - a.total) || compararCaso(a.caso, b.caso));
  return {
    referencia: referenciaMs, grupos, outros, andamento,
    processos: comData.length,
    semData: concluidos.length - comData.length,
    semAcordao: processos.filter((p) => !p.concluido && p.casoConcluido).length,
  };
}

// ---------- tela ----------

let panRitoSelecionado = '';   // assinatura do rito aberto
let panRitoOrdem = 'maior';    // 'maior' | 'menor' | 'inicio'
let panRitoExpandido = false;
const PAN_RITO_LINHAS = 25;

function panRitoRotuloProcesso(p) {
  return `Caso ${p.caso} - ${p.nome}${p.totalDoCaso > 1 ? ` (${p.indice + 1}º processo)` : ''}`;
}

function panRitoTabelaRitos(r, aberto) {
  const linhas = r.grupos.map((g) => `<tr class="${g.assinatura === aberto ? 'ativo' : ''}" data-pan-rito="${esc(g.assinatura)}" tabindex="0" aria-selected="${g.assinatura === aberto}">
      <th scope="row"><b>${esc(g.nome)}</b><span>${esc(g.etapas.join(' → '))}</span></th>
      <td class="pan-rito-num">${g.processos.length}</td>
      <td class="pan-rito-num"><strong>${esc(panDias(g.media))}</strong></td>
      <td class="pan-rito-num">${esc(panDias(g.mediana))}</td>
      <td class="pan-rito-num">${esc(`${Math.round(g.maisRapido.total).toLocaleString('pt-BR')} a ${panDias(g.maisLongo.total)}`)}</td>
    </tr>`).join('');
  return `<div class="pan-tp-tabela"><table class="pan-rito-tbl"><thead><tr><th>Rito e etapas até o acórdão</th><th class="pan-rito-num">Processos</th><th class="pan-rito-num">Tempo médio</th><th class="pan-rito-num">Mediana</th><th class="pan-rito-num">Do mais rápido ao mais longo</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// Tempo médio de cada trecho do rito: uma barra por trecho, na mesma escala.
function panRitoTrechos(g) {
  const max = Math.max(...g.trechos.map((t) => t.media || 0), 1);
  const soma = g.trechos.reduce((s, t) => s + (t.media || 0), 0) || 1;
  return `<table class="pan-rito-trechos"><tbody>${g.trechos.map((t) => `<tr title="${esc(`${t.rotulo}\nmédia de ${panDias(t.media)} · mediana de ${panDias(t.mediana)} · ${t.casos} ${t.casos === 1 ? 'processo com as duas datas' : 'processos com as duas datas'}${t.semEnvio ? ` · ${t.semEnvio} sem data de envio` : ''}`)}">
      <th scope="row">${esc(t.rotulo)}</th>
      <td class="pan-tp-trilho"><div class="pan-tp-faixa"><span class="pan-tp-barra" style="width:${t.media === null ? 0 : Math.max((t.media / max) * 100, 0.6)}%"></span></div></td>
      <td class="pan-rito-num"><strong>${esc(panDias(t.media))}</strong></td>
      <td class="pan-rito-num pan-rito-dim">${t.media === null || g.proprio ? '' : `${Math.round((t.media / soma) * 100)}% do tempo`}</td>
    </tr>`).join('')}</tbody></table>`;
}

function panRitoProcessos(g) {
  const por = {
    maior: (a, b) => (b.total - a.total) || compararCaso(a.caso, b.caso),
    menor: (a, b) => (a.total - b.total) || compararCaso(a.caso, b.caso),
    inicio: (a, b) => (a.inicio - b.inicio) || compararCaso(a.caso, b.caso),
  };
  const lista = g.processos.slice().sort(por[panRitoOrdem] || por.maior);
  const visiveis = panRitoExpandido ? lista : lista.slice(0, PAN_RITO_LINHAS);
  // Cada coluna de trecho é sombreada pelo seu próprio máximo: o tom mais
  // forte mostra onde aquele processo demorou mais que os outros.
  const maximos = g.trechos.map((_, i) => Math.max(...g.processos.map((p) => p.trechos[i] || 0), 1));
  // O asterisco marca o trecho sem data de envio, contado até a etapa seguinte.
  const celula = (p) => (v, i) => (v === null || v < 0 ? '<td class="pan-rito-num pan-rito-dim">—</td>'
    : `<td class="pan-rito-num" style="background:rgba(46,109,180,${(0.04 + 0.26 * (v / maximos[i])).toFixed(3)})"${p.fontesTrechos[i] === 'padrao' ? ' title="Sem data de envio: contado até o início da etapa seguinte."' : ''}>${v.toLocaleString('pt-BR')}${p.fontesTrechos[i] === 'padrao' ? '<span class="pan-rito-marca">*</span>' : ''}</td>`);
  const temPadrao = g.proprio && g.trechos.some((t) => t.semEnvio);
  const opcao = (valor, rotulo) => `<button type="button" class="${panRitoOrdem === valor ? 'ativa' : ''}" data-pan-rito-ordem="${valor}" aria-pressed="${panRitoOrdem === valor}">${esc(rotulo)}</button>`;
  const resto = lista.length - visiveis.length;
  return `<div class="pan-tp-controles"><div class="pan-tp-abas" role="group" aria-label="Ordem">${opcao('maior', 'Mais longos primeiro')}${opcao('menor', 'Mais rápidos primeiro')}${opcao('inicio', 'Por data de início')}</div></div>
    <div class="pan-tp-tabela"><table class="pan-rito-tbl pan-rito-proc"><thead><tr><th>Processo</th>${g.trechos.map((t) => `<th class="pan-rito-num" title="${esc(t.rotulo)}">${esc(t.rotulo)}</th>`).join('')}<th class="pan-rito-num">Prazo final</th><th>Período</th></tr></thead>
    <tbody>${visiveis.map((p) => `<tr data-caso="${esc(p.caso)}" tabindex="0" title="${esc(`${panRitoRotuloProcesso(p)}\n${panDias(p.total)} · ${panDataBrDeMs(p.inicio)} a ${panDataBrDeMs(p.fim)}`)}">
        <th scope="row"><b>${esc(panRitoRotuloProcesso(p))}</b><span>${p.serie && p.serie !== '—' ? `Série ${esc(p.serie)}` : ''}</span></th>
        ${p.trechos.map(celula(p)).join('')}
        <td class="pan-rito-num"><strong>${esc(panDias(p.total))}</strong></td>
        <td class="pan-tp-periodo">${esc(`${panDataBrDeMs(p.inicio)} a ${panDataBrDeMs(p.fim)}`)}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="pan-tp-legenda"><span>Os números são dias corridos em cada trecho. Quanto mais forte o azul, mais aquele processo demorou no trecho em comparação com os outros.</span></p>
    ${g.proprio ? `<p class="pan-rito-intro"><b>Recebida até Admissibilidade</b> vai do início da Denúncia Recebida até o envio da Nota de Admissibilidade. <b>Tempo de defesa</b> vai do início da etapa Denúncia até o início do Parecer Técnico Conclusivo. <b>Denúncia até Parecer</b> vai do início do Parecer até o envio do Parecer. <b>Prazo final</b> é o tempo todo, da primeira etapa ao acórdão.${temPadrao ? ' <b>*</b> Etapa sem data de envio: Recebida até Admissibilidade foi contado até o início da etapa Denúncia, e Denúncia até Parecer, até o início do Despacho de Distribuição.' : ''}</p>` : ''}
    ${resto > 0 ? `<button type="button" class="pan-tp-mais" data-pan-rito-expandir>Ver os outros ${resto} ${resto === 1 ? 'processo' : 'processos'}</button>` : (panRitoExpandido && lista.length > PAN_RITO_LINHAS ? '<button type="button" class="pan-tp-mais" data-pan-rito-expandir>Mostrar menos</button>' : '')}`;
}

function panRitoAndamento(r) {
  if (!r.andamento.length) return '';
  const linhas = r.andamento.slice(0, 40).map((p) => `<tr data-caso="${esc(p.caso)}" class="pan-tp-aberto" tabindex="0">
      <th scope="row"><b>${esc(panRitoRotuloProcesso(p))}</b><span>${p.serie && p.serie !== '—' ? `Série ${esc(p.serie)}` : ''}</span></th>
      <td>${esc(p.passos.map((x) => x.curto).join(' → '))}</td>
      <td>${esc(p.etapaAtual)}${p.statusAtual ? `<span class="pan-rito-sub">${esc(p.statusAtual)}</span>` : ''}</td>
      <td class="pan-rito-num"><strong>${esc(panDias(p.dias))}</strong><span class="pan-tp-etq">em andamento</span></td>
    </tr>`).join('');
  return `<div class="pan-tp-comparacao"><h4>Em andamento até o acórdão</h4>
    <p class="pan-rito-intro">${r.andamento.length} ${r.andamento.length === 1 ? 'processo ainda não chegou' : 'processos ainda não chegaram'} ao acórdão. Não entram nas médias: o tempo é contado da primeira etapa até ${esc(panDataBrDeMs(r.referencia))}.</p>
    <div class="pan-tp-tabela"><table class="pan-rito-tbl"><thead><tr><th>Processo</th><th>Etapas já feitas</th><th>Etapa atual</th><th class="pan-rito-num">Tempo até aqui</th></tr></thead><tbody>${linhas}</tbody></table></div>
    ${r.andamento.length > 40 ? `<p class="pan-rito-intro">Mostrando os 40 mais antigos de ${r.andamento.length}.</p>` : ''}</div>`;
}

function panRitoOutros(r) {
  if (!r.outros.length) return '';
  return `<details class="pan-rito-outros"><summary>${r.outros.length} ${r.outros.length === 1 ? 'processo com sequência única' : 'processos com sequência única'}, sem outro igual para comparar</summary>
    <div class="pan-tp-tabela"><table class="pan-rito-tbl"><thead><tr><th>Processo</th><th>Etapas até o fim</th><th class="pan-rito-num">Prazo final</th></tr></thead><tbody>${r.outros.map((p) => `<tr data-caso="${esc(p.caso)}" tabindex="0">
      <th scope="row"><b>${esc(panRitoRotuloProcesso(p))}</b><span>${p.serie && p.serie !== '—' ? `Série ${esc(p.serie)}` : ''}</span></th>
      <td>${esc(p.passos.map((x) => x.curto).join(' → '))}</td>
      <td class="pan-rito-num"><strong>${esc(panDias(p.total))}</strong></td></tr>`).join('')}</tbody></table></div></details>`;
}

// Corpo da visão "Até o acórdão" (vai dentro da seção de tempo dos casos).
function panRitosHtml(itens, referenciaMs) {
  const r = panRitos(itens, referenciaMs);
  if (!r.grupos.some((g) => g.assinatura === panRitoSelecionado)) panRitoSelecionado = r.grupos[0] ? r.grupos[0].assinatura : '';
  const g = r.grupos.find((x) => x.assinatura === panRitoSelecionado);
  const foraDaConta = [
    r.semAcordao ? `${r.semAcordao} ${r.semAcordao === 1 ? 'processo de caso encerrado sem acórdão ficou' : 'processos de casos encerrados sem acórdão ficaram'} de fora.` : '',
    r.semData ? `${r.semData} ${r.semData === 1 ? 'processo sem data na primeira etapa ou no acórdão ficou' : 'processos sem data na primeira etapa ou no acórdão ficaram'} de fora.` : '',
  ].filter(Boolean).join(' ');
  const corpo = !r.grupos.length
    ? `<div class="op-empty">Nenhum rito com pelo menos ${PAN_RITO_MIN_GRUPO} processos julgados ${Object.keys(panTempoFiltros).length ? 'com esses filtros' : 'neste recorte'}.</div>`
    : `<p class="pan-rito-intro"><b>${r.processos}</b> ${r.processos === 1 ? 'processo julgado' : 'processos julgados'}, em ${r.grupos.length} ${r.grupos.length === 1 ? 'rito' : 'ritos'}. Cada rito reúne processos que passaram pelas mesmas etapas, na mesma ordem. Clique num rito para abrir.</p>
      ${panRitoTabelaRitos(r, panRitoSelecionado)}
      <div class="pan-tp-comparacao"><h4>${esc(g.nome)} · onde o tempo é gasto</h4>
        <p class="pan-rito-intro">${g.proprio ? 'Tempo médio dos trechos acompanhados na denúncia' : 'Tempo médio entre uma etapa e a seguinte'}, nos ${g.processos.length} processos deste rito.</p>
        ${panRitoTrechos(g)}
      </div>
      <div class="pan-tp-comparacao"><h4>${esc(g.nome)} · processo a processo</h4>${panRitoProcessos(g)}</div>`;
  return `${corpo}
    ${panRitoOutros(r)}
    ${panRitoAndamento(r)}
    <p class="pan-rt-legenda"><b>Como é contado</b> da primeira etapa do processo até o primeiro acórdão finalizado, em dias corridos, pelas datas das etapas. Recurso, Plenário e cumprimento não entram. Etapas seguidas do mesmo tipo contam como uma só. Um novo Auto de Infração depois do acórdão abre outro processo no mesmo caso. Sem acórdão, o processo termina na Decisão de Indeferimento ou na Decisão da Presidência que encerrou o caso. ${foraDaConta} Clique num processo para abrir o caso.</p>`;
}

function conectarControlesRitos() {
  const raiz = document.querySelector('#pan-tempo');
  if (!raiz) return;
  raiz.querySelectorAll('tr[data-pan-rito]').forEach((tr) => {
    const abrir = () => { panRitoSelecionado = tr.dataset.panRito; panRitoExpandido = false; panAtualizarTempo(); document.querySelector(`#pan-tempo tr[data-pan-rito="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(panRitoSelecionado) : panRitoSelecionado}"]`)?.focus(); };
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrir(); } });
  });
  raiz.querySelectorAll('[data-pan-rito-ordem]').forEach((b) => b.addEventListener('click', () => { panRitoOrdem = b.dataset.panRitoOrdem; panAtualizarTempo(); }));
  raiz.querySelector('[data-pan-rito-expandir]')?.addEventListener('click', () => { panRitoExpandido = !panRitoExpandido; panAtualizarTempo(); });
}
