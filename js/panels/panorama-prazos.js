// Panorama › Tempo dos casos › visão "Por tipo de caso".
//
// Responde três perguntas, sempre dentro de um TIPO de caso (a origem:
// Solvência, Denúncia, DF, Omissão...), porque cada tipo tem o seu caminho:
//
//   1. Até a decisão:    da primeira etapa do processo à decisão.
//   2. Depois da decisão: da primeira decisão ao fim do caso (recurso e
//      cumprimento), nos casos finalizados e julgados.
//   3. Caso inteiro:     da primeira à última etapa do caso.
//
// E mostra ONDE o tempo fica até a decisão, em poucas FASES fixas, com marcos
// que todo processo daquele tipo tem:
//
//   Auto de Infração: Auto → defesa → distribuição → decisão
//   Denúncia:         Recebida → intimação → defesa → distribuição → decisão
//
// Marcos:
//   * Abertura:      início da primeira etapa do processo.
//   * Intimação:     início da etapa Denúncia (só nas denúncias).
//   * Defesa:        data de ENVIO da etapa em que corre o prazo de defesa (o
//                    Auto de Infração; na denúncia, a etapa Denúncia). Sem essa
//                    data, vale o início do Parecer Técnico Conclusivo, e o
//                    número sai marcado com asterisco.
//   * Distribuição:  início do Despacho de Distribuição.
//   * Decisão:       o fim do processo (primeiro acórdão finalizado; na falta,
//                    a Decisão de Indeferimento ou da Presidência).
//
// Processo sem distribuição (rito sumário, decisão da Presidência) tem as duas
// últimas fases juntas: "Defesa até a decisão". Por isso, dentro do tipo, os
// processos são separados por CAMINHO (com ou sem distribuição).
//
// As barras de fase usam só os processos com todas as datas das fases, para
// que as fases somem o total da barra.
//
// O corte em processos vem de js/panels/panorama-ritos.js (panRitoProcessosDoCaso).

const PAN_PRAZO_FASES = {
  admissao: { quem: 'Unidade Técnica' },
  defesa: { quem: 'com o clube' },
  analise: { quem: 'Unidade Técnica e Presidência' },
  julgamento: { quem: 'Turma' },
  decisao: { quem: 'Agência' },
};

const PAN_PRAZO_CAMINHOS = {
  'auto-dist': { nome: 'Com distribuição à Turma', fases: [['defesa', 'Auto até a defesa'], ['analise', 'Defesa até a distribuição'], ['julgamento', 'Distribuição até a decisão']] },
  'auto-direto': { nome: 'Sem distribuição', fases: [['defesa', 'Auto até a defesa'], ['decisao', 'Defesa até a decisão']] },
  'den-dist': { nome: 'Com distribuição à Turma', fases: [['admissao', 'Recebida até a intimação'], ['defesa', 'Intimação até a defesa'], ['analise', 'Defesa até a distribuição'], ['julgamento', 'Distribuição até a decisão']] },
  'den-direto': { nome: 'Sem distribuição', fases: [['admissao', 'Recebida até a intimação'], ['defesa', 'Intimação até a defesa'], ['decisao', 'Defesa até a decisão']] },
  'den-sem-intimacao': { nome: 'Sem intimação do clube', fases: [] },
  outros: { nome: 'Outras sequências', fases: [] },
};

const PAN_PRAZO_POUCOS = 3; // abaixo disso a média é só uma referência

// Dias entre dois marcos; null quando falta um deles ou a ordem está invertida.
function panPrazoDias(a, b) {
  return a && b && b >= a ? Math.round((b - a) / PAN_DIA_MS) : null;
}

// Marcos de um processo (ver o cabeçalho do arquivo).
function panPrazoMarcos(p) {
  const passos = p.passos || [];
  const primeiro = passos[0] ? passos[0].tipo : '';
  const familia = primeiro === 'denuncia-recebida' ? 'den' : (primeiro === 'auto-de-infracao' ? 'auto' : '');
  const marcos = { familia, inicio: p.inicio || 0, intimacao: 0, defesa: 0, defesaFonte: '', distribuicao: 0, decisao: p.concluido ? p.fim : 0 };
  if (!familia) return marcos;
  const achar = (tipo, de) => passos.findIndex((x, i) => i >= de && x.tipo === tipo);
  // Etapa em que corre o prazo de defesa do clube.
  const iDef = familia === 'den' ? achar('denuncia', 1) : 0;
  if (iDef < 0) return marcos;
  marcos.intimacao = passos[iDef].ms || 0;
  if (!marcos.intimacao) return marcos;
  const iPar = achar('parecer-tecnico-conclusivo', iDef + 1);
  const iDist = achar('despacho-de-distribuicao', iDef + 1);
  marcos.distribuicao = iDist >= 0 ? passos[iDist].ms || 0 : 0;
  const envio = passos[iDef].envio || 0;
  const limite = marcos.distribuicao || marcos.decisao || Number.POSITIVE_INFINITY;
  if (envio && envio >= marcos.intimacao && envio <= limite) {
    marcos.defesa = envio; marcos.defesaFonte = 'envio';
  } else if (iPar >= 0 && passos[iPar].ms && passos[iPar].ms >= marcos.intimacao) {
    marcos.defesa = passos[iPar].ms; marcos.defesaFonte = 'parecer';
  }
  return marcos;
}

function panPrazoCaminho(m) {
  if (m.familia === 'auto') return m.distribuicao ? 'auto-dist' : 'auto-direto';
  if (m.familia === 'den') return !m.intimacao ? 'den-sem-intimacao' : (m.distribuicao ? 'den-dist' : 'den-direto');
  return 'outros';
}

function panPrazoFasesDias(caminho, m) {
  const d = panPrazoDias;
  switch (caminho) {
    case 'auto-dist': return [d(m.inicio, m.defesa), d(m.defesa, m.distribuicao), d(m.distribuicao, m.decisao)];
    case 'auto-direto': return [d(m.inicio, m.defesa), d(m.defesa, m.decisao)];
    case 'den-dist': return [d(m.inicio, m.intimacao), d(m.intimacao, m.defesa), d(m.defesa, m.distribuicao), d(m.distribuicao, m.decisao)];
    case 'den-direto': return [d(m.inicio, m.intimacao), d(m.intimacao, m.defesa), d(m.defesa, m.decisao)];
    default: return [];
  }
}

// Onde está um processo ainda sem decisão: o último marco alcançado.
function panPrazoEstado(m, diaReferencia) {
  let rotulo = 'Em andamento';
  let quem = '';
  let desde = m.inicio;
  if (m.distribuicao) { rotulo = 'Distribuído, aguardando a decisão'; quem = PAN_PRAZO_FASES.julgamento.quem; desde = m.distribuicao; }
  else if (m.defesa) { rotulo = 'Defesa entregue, em análise'; quem = PAN_PRAZO_FASES.analise.quem; desde = m.defesa; }
  else if (m.intimacao) { rotulo = m.familia === 'den' ? 'Clube intimado, aguardando a defesa' : 'Aguardando a defesa'; quem = PAN_PRAZO_FASES.defesa.quem; desde = m.intimacao; }
  else if (m.familia === 'den') { rotulo = 'Recebida, em admissibilidade'; quem = PAN_PRAZO_FASES.admissao.quem; }
  return { rotulo, quem, desde, dias: desde ? Math.max(Math.round((diaReferencia - desde) / PAN_DIA_MS), 0) : null };
}

function panPrazoPeriodoDoCaso(item) {
  const linha = (item.rows || []).find((row) => row && String(row.periodo || '').trim());
  return linha ? String(linha.periodo).trim() : '';
}

// Linhas da régua de um caminho: Todos, depois por período e por série quando
// houver mais de um. As fases são médias dos processos com todas as datas.
function panPrazoGrupos(def, lista) {
  const linha = (nome, grupo, processos) => {
    const completos = processos.filter((p) => p.completo);
    return {
      nome, grupo, processos: processos.length, completos: completos.length,
      total: panMedia(processos.map((p) => p.total)),
      totalCompletos: panMedia(completos.map((p) => p.total)),
      fases: def.fases.map((_, i) => panMedia(completos.map((p) => p.fases[i]))),
    };
  };
  const separar = (grupo, chaveDe, nomeDe, ordenar) => {
    const m = new Map();
    lista.forEach((p) => { const k = chaveDe(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
    if (m.size < 2) return [];
    return Array.from(m.entries()).sort((a, b) => ordenar(a[0], b[0])).map(([k, ps]) => linha(nomeDe(k), grupo, ps));
  };
  const msPeriodo = (k) => (k ? panMs(panPeriodoLabel(k)) || 0 : Number.POSITIVE_INFINITY);
  return [
    linha('Todos', 'todos', lista),
    ...separar('periodo', (p) => p.periodo || '', (k) => (k ? panPeriodoLabel(k) : 'Sem período'), (a, b) => (msPeriodo(a) - msPeriodo(b)) || compararCaso(a, b)),
    ...separar('serie', (p) => (p.serie && p.serie !== '—' ? p.serie : ''), (k) => (k ? `Série ${k}` : 'Sem série'), (a, b) => (a === '' ? 1 : (b === '' ? -1 : compararCaso(a, b)))),
  ];
}

// Comparação do período mais antigo com o mais recente, quando os dois têm
// pelo menos dois processos completos: de quanto para quanto, e em que fase.
function panPrazoAchado(caminho) {
  const periodos = caminho.grupos.filter((g) => g.grupo === 'periodo' && g.nome !== 'Sem período' && g.completos >= 2);
  if (periodos.length < 2) return null;
  const de = periodos[0];
  const para = periodos[periodos.length - 1];
  if (Math.abs(Math.round(para.totalCompletos) - Math.round(de.totalCompletos)) < 3) return null;
  let fase = 0;
  caminho.fases.forEach((_, i) => { if (Math.abs(para.fases[i] - de.fases[i]) > Math.abs(para.fases[fase] - de.fases[fase])) fase = i; });
  return { de: de.nome, para: para.nome, antes: de.totalCompletos, depois: para.totalCompletos, fase: caminho.fases[fase].rotulo, faseAntes: de.fases[fase], faseDepois: para.fases[fase] };
}

// Tudo o que a visão mostra, a partir dos casos já filtrados.
function panPrazos(itens, referenciaMs) {
  const diaReferencia = new Date(Math.min(referenciaMs, Date.now() + 365 * PAN_DIA_MS)).setHours(0, 0, 0, 0);
  const porTipo = new Map();
  (itens || []).forEach((item) => {
    const nome = String(item.origem || '').trim() || 'Sem origem';
    if (!porTipo.has(nome)) porTipo.set(nome, { nome, casos: 0, decididos: [], abertos: [], inteiros: [], semData: 0, semDecisao: 0 });
    const t = porTipo.get(nome);
    t.casos += 1;
    const periodo = panPrazoPeriodoDoCaso(item);
    const processos = panRitoProcessosDoCaso(item, referenciaMs);
    processos.forEach((p) => {
      const marcos = panPrazoMarcos(p);
      const base = { ...p, tipo: nome, periodo, marcos };
      if (p.concluido) {
        if (p.total === null || p.total < 0) { t.semData += 1; return; }
        const caminho = panPrazoCaminho(marcos);
        const fases = panPrazoFasesDias(caminho, marcos);
        t.decididos.push({ ...base, caminho, fases, completo: fases.length > 0 && fases.every((v) => v !== null), defesaFonte: marcos.defesaFonte });
      } else if (p.casoConcluido) {
        t.semDecisao += 1;
      } else if (p.inicio && !panRitoNorm(nome).includes('insolvencia')) {
        // Evento de Insolvência não termina em decisão: não entra nessa fila.
        t.abertos.push({ ...base, estado: panPrazoEstado(marcos, diaReferencia), dias: Math.max(Math.round((diaReferencia - p.inicio) / PAN_DIA_MS), 0) });
      }
    });
    // Caso inteiro: só os concluídos (finalizados e julgados) com data.
    if (item.concluido && item.dias !== null && item.dias !== undefined) {
      const p0 = processos[0];
      const ate = p0 && p0.concluido && p0.total !== null && p0.total >= 0 && p0.total <= item.dias ? p0.total : null;
      t.inteiros.push({ caso: item.caso, dias: item.dias, ate, depois: ate === null ? null : item.dias - ate });
    }
  });

  const tipos = Array.from(porTipo.values()).map((t) => {
    const totais = t.decididos.map((p) => p.total);
    const comDecisao = t.inteiros.filter((x) => x.depois !== null);
    const porCaminho = new Map();
    t.decididos.forEach((p) => { if (!porCaminho.has(p.caminho)) porCaminho.set(p.caminho, []); porCaminho.get(p.caminho).push(p); });
    const caminhos = Array.from(porCaminho.entries()).map(([id, lista]) => {
      const def = PAN_PRAZO_CAMINHOS[id] || PAN_PRAZO_CAMINHOS.outros;
      const caminho = {
        id, nome: def.nome, processos: lista,
        fases: def.fases.map(([faseId, rotulo]) => ({ id: faseId, rotulo, quem: PAN_PRAZO_FASES[faseId].quem })),
        grupos: panPrazoGrupos(def, lista),
        semEnvio: lista.filter((p) => p.defesaFonte === 'parecer').length,
        incompletos: lista.filter((p) => !p.completo).length,
      };
      caminho.achado = caminho.fases.length ? panPrazoAchado(caminho) : null;
      return caminho;
    }).sort((a, b) => ((b.fases.length ? 1 : 0) - (a.fases.length ? 1 : 0)) || (b.processos.length - a.processos.length) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return {
      nome: t.nome, casos: t.casos, semData: t.semData, semDecisao: t.semDecisao,
      decisao: { processos: totais.length, media: panMedia(totais), mediana: panMediana(totais), menor: totais.length ? Math.min(...totais) : null, maior: totais.length ? Math.max(...totais) : null },
      depois: { casos: comDecisao.length, media: panMedia(comDecisao.map((x) => x.depois)), ate: panMedia(comDecisao.map((x) => x.ate)) },
      inteiro: { casos: t.inteiros.length, media: panMedia(t.inteiros.map((x) => x.dias)) },
      abertos: t.abertos.slice().sort((a, b) => (b.dias - a.dias) || compararCaso(a.caso, b.caso)),
      abertosMedia: panMedia(t.abertos.map((p) => p.dias)),
      caminhos,
    };
  }).sort((a, b) => (b.decisao.processos - a.decisao.processos) || (b.casos - a.casos) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { referencia: referenciaMs, tipos };
}

// ---------- tela ----------

let panPrazoTipo = '';        // origem aberta
let panPrazoCaminhoAberto = ''; // caminho aberto dentro do tipo
let panPrazoOrdem = 'maior';  // 'maior' | 'menor' | 'inicio'
let panPrazoExpandido = false;
const PAN_PRAZO_LINHAS = 25;

function panPrazoPlural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

function panPrazoRotuloProcesso(p) {
  return `Caso ${p.caso} - ${p.nome}${p.totalDoCaso > 1 ? ` (${p.indice + 1}º processo)` : ''}`;
}

function panPrazoDetalheProcesso(p) {
  return [p.serie && p.serie !== '—' ? `Série ${p.serie}` : '', p.periodo ? panPeriodoLabel(p.periodo) : ''].filter(Boolean).join(' · ');
}

// Cartões dos tipos: o único lugar em que tipos diferentes ficam lado a lado.
function panPrazoCartoes(r, aberto) {
  if (r.tipos.length < 2) return '';
  const max = Math.max(...r.tipos.map((t) => t.decisao.media || 0), 1);
  return `<div class="pan-pz-tipos" role="group" aria-label="Tipo de caso">${r.tipos.map((t) => {
    const n = t.decisao.processos;
    const sub = n
      ? `${panPrazoPlural(n, 'processo decidido', 'processos decididos')}${n < PAN_PRAZO_POUCOS ? ' · <u>poucos casos</u>' : ''}`
      : `nenhum decidido${t.abertos.length ? ` · ${t.abertos.length} em andamento` : ''}`;
    return `<button type="button" class="pan-pz-tipo${t.nome === aberto ? ' ativo' : ''}" data-pan-prazo-tipo="${esc(t.nome)}" aria-pressed="${t.nome === aberto}">
        <span class="pan-pz-tipo-nome">${esc(t.nome)}</span>
        <strong>${n ? esc(panDias(t.decisao.media)) : '—'}</strong>
        <span class="pan-pz-tipo-barra"><i style="width:${n ? Math.max((t.decisao.media / max) * 100, 1.5) : 0}%"></i></span>
        <small>${sub}</small>
      </button>`;
  }).join('')}</div>`;
}

function panPrazoTresTempos(t, referenciaMs) {
  const card = (v, l, sub, cls = '') => `<div class="pan-rt-kpi ${cls}"><strong>${esc(v)}</strong><span>${esc(l)}</span><small>${esc(sub)}</small></div>`;
  const d = t.decisao;
  const faixa = d.processos > 1 ? ` · mediana de ${panDias(d.mediana)} · de ${d.menor.toLocaleString('pt-BR')} a ${panDias(d.maior)}` : '';
  // A conta fecha com o número do cartão: o "depois" é o que sobra do total já arredondado.
  const ateInteiro = Math.round(t.depois.ate);
  const conta = t.inteiro.casos && t.depois.casos === t.inteiro.casos
    ? ` · ${ateInteiro.toLocaleString('pt-BR')} até a decisão + ${Math.max(Math.round(t.inteiro.media) - ateInteiro, 0).toLocaleString('pt-BR')} depois` : '';
  return `<div class="pan-rt-kpis">
    ${card(panDias(d.media), 'Até a decisão', d.processos ? `da primeira etapa à decisão · ${panPrazoPlural(d.processos, 'processo', 'processos')}${faixa}` : 'nenhum processo decidido com data', 'pan-tp-principal')}
    ${card(panDias(t.depois.media), 'Depois da decisão', t.depois.casos ? `da primeira decisão ao fim do caso: recurso e cumprimento · ${panPrazoPlural(t.depois.casos, 'caso concluído', 'casos concluídos')}` : 'nenhum caso concluído com decisão')}
    ${card(panDias(t.inteiro.media), 'Caso inteiro', t.inteiro.casos ? `da primeira à última etapa · ${panPrazoPlural(t.inteiro.casos, 'caso concluído', 'casos concluídos')}${conta}` : 'nenhum caso finalizado ou julgado com data')}
    ${card(panDias(t.abertosMedia), 'Ainda sem decisão, em média', t.abertos.length ? `${panPrazoPlural(t.abertos.length, 'processo aberto', 'processos abertos')}, contados até ${panDataBrDeMs(referenciaMs)}` : 'nenhum processo aguardando decisão')}
  </div>`;
}

// Escala redonda para a régua: [teto, passo das marcas].
function panPrazoEscala(max) {
  const passos = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const passo = passos.find((s) => max / s <= 7) || 2000;
  return [Math.max(Math.ceil(max / passo) * passo, passo), passo];
}

function panPrazoSegmentos(fases, valores, escala) {
  return fases.map((f, i) => (valores[i] === null || valores[i] === undefined ? '' : `<i class="pan-pz-seg pan-pz-${esc(f.id)}" style="width:${((valores[i] / escala) * 100).toFixed(2)}%" title="${esc(`${f.rotulo}: ${panDias(valores[i])}`)}"></i>`)).join('');
}

function panPrazoLegenda(fases) {
  return `<p class="pan-pz-leg">${fases.map((f) => `<span><i class="pan-pz-seg pan-pz-${esc(f.id)}"></i>${esc(f.rotulo)}<small>${esc(f.quem)}</small></span>`).join('')}</p>`;
}

// A régua: uma barra por grupo, dividida nas fases, todas na mesma escala.
function panPrazoRegua(caminho) {
  const larguraDe = (g) => (g.completos ? g.fases.reduce((s, v) => s + v, 0) : (g.total || 0));
  const [escala, passo] = panPrazoEscala(Math.max(...caminho.grupos.map(larguraDe), 1));
  const marcas = [];
  for (let v = 0; v <= escala; v += passo) marcas.push(v);
  let anterior = '';
  const linhas = caminho.grupos.map((g) => {
    const sep = anterior && anterior !== g.grupo;
    anterior = g.grupo;
    const quantos = g.completos === g.processos
      ? panPrazoPlural(g.processos, 'processo', 'processos')
      : `${g.completos} de ${panPrazoPlural(g.processos, 'processo', 'processos')} com todas as datas`;
    const barra = g.completos
      ? `<div class="pan-pz-barra">${panPrazoSegmentos(caminho.fases, g.fases, escala)}<em>${esc(panDias(g.totalCompletos))}</em></div>
         <div class="pan-pz-vals" aria-hidden="true">${g.fases.map((v) => `<span style="width:${((v / escala) * 100).toFixed(2)}%">${(v / escala) >= 0.025 ? Math.round(v).toLocaleString('pt-BR') : ''}</span>`).join('')}</div>`
      : `<div class="pan-pz-barra"><i class="pan-pz-seg pan-pz-neutro" style="width:${(((g.total || 0) / escala) * 100).toFixed(2)}%" title="Sem as datas das fases"></i><em>${esc(panDias(g.total))}</em></div>
         <div class="pan-pz-vals"><span class="pan-pz-falta">sem as datas das fases</span></div>`;
    const dica = `${g.nome} · ${quantos}\n${g.completos ? caminho.fases.map((f, i) => `${f.rotulo}: ${panDias(g.fases[i])}`).join('\n') : ''}\nAté a decisão: ${panDias(g.completos ? g.totalCompletos : g.total)}`;
    return `<div class="pan-pz-lin${sep ? ' sep' : ''}" title="${esc(dica)}"><div class="pan-pz-rot"><b>${esc(g.nome)}</b><span>${esc(quantos)}</span></div><div class="pan-pz-pista">${barra}</div></div>`;
  }).join('');
  return `<div class="pan-pz-regua">${linhas}
    <div class="pan-pz-eixo" aria-hidden="true"><b></b><div>${marcas.map((v) => `<span style="left:${(v / escala) * 100}%">${v.toLocaleString('pt-BR')}${v === escala ? ' dias' : ''}</span>`).join('')}</div></div></div>`;
}

function panPrazoOrdenar(lista) {
  const por = {
    maior: (a, b) => (b.total - a.total) || compararCaso(a.caso, b.caso),
    menor: (a, b) => (a.total - b.total) || compararCaso(a.caso, b.caso),
    inicio: (a, b) => (a.inicio - b.inicio) || compararCaso(a.caso, b.caso),
  };
  return lista.slice().sort(por[panPrazoOrdem] || por.maior);
}

// Processo a processo: as mesmas fases, com uma barrinha por processo.
function panPrazoProcessos(caminho) {
  const lista = panPrazoOrdenar(caminho.processos);
  const visiveis = panPrazoExpandido ? lista : lista.slice(0, PAN_PRAZO_LINHAS);
  const max = Math.max(...lista.map((p) => p.total), 1);
  const opcao = (valor, rotulo) => `<button type="button" class="${panPrazoOrdem === valor ? 'ativa' : ''}" data-pan-prazo-ordem="${valor}" aria-pressed="${panPrazoOrdem === valor}">${esc(rotulo)}</button>`;
  const controles = `<div class="pan-tp-controles"><div class="pan-tp-abas" role="group" aria-label="Ordem">${opcao('maior', 'Mais longos primeiro')}${opcao('menor', 'Mais rápidos primeiro')}${opcao('inicio', 'Por data de início')}</div></div>`;
  const resto = lista.length - visiveis.length;
  const mais = resto > 0 ? `<button type="button" class="pan-tp-mais" data-pan-prazo-expandir>Ver os outros ${panPrazoPlural(resto, 'processo', 'processos')}</button>`
    : (panPrazoExpandido && lista.length > PAN_PRAZO_LINHAS ? '<button type="button" class="pan-tp-mais" data-pan-prazo-expandir>Mostrar menos</button>' : '');
  const periodo = (p) => `${panDataBrDeMs(p.inicio)} a ${panDataBrDeMs(p.fim)}`;
  const nome = (p) => `<th scope="row"><b>${esc(panPrazoRotuloProcesso(p))}</b><span>${esc(panPrazoDetalheProcesso(p))}</span></th>`;

  // Caminho sem fases: só o total e as etapas por que passou.
  if (!caminho.fases.length) {
    return `${controles}<div class="pan-tp-tabela"><table class="pan-rito-tbl"><thead><tr><th>Processo</th><th>Etapas até a decisão</th><th class="pan-rito-num">Até a decisão</th><th>Período</th></tr></thead>
      <tbody>${visiveis.map((p) => `<tr data-caso="${esc(p.caso)}" tabindex="0">${nome(p)}<td>${esc(p.passos.map((x) => x.curto).join(' → '))}</td><td class="pan-rito-num"><strong>${esc(panDias(p.total))}</strong></td><td class="pan-tp-periodo">${esc(periodo(p))}</td></tr>`).join('')}</tbody></table></div>${mais}`;
  }

  // O asterisco marca as fases que dependem da defesa quando ela foi contada
  // pelo início do Parecer.
  const iDefesa = caminho.fases.findIndex((f) => f.id === 'defesa');
  const celula = (p) => (v, i) => {
    if (v === null) return '<td class="pan-rito-num pan-rito-dim">—</td>';
    const marca = p.defesaFonte === 'parecer' && (i === iDefesa || i === iDefesa + 1);
    return `<td class="pan-rito-num"${marca ? ' title="Sem data de envio na etapa de defesa: contado pelo início do Parecer Técnico Conclusivo."' : ''}>${v.toLocaleString('pt-BR')}${marca ? '<span class="pan-rito-marca">*</span>' : ''}</td>`;
  };
  const barra = (p) => (p.completo
    ? panPrazoSegmentos(caminho.fases, p.fases, max)
    : `<i class="pan-pz-seg pan-pz-neutro" style="width:${((p.total / max) * 100).toFixed(2)}%" title="Sem as datas das fases"></i>`);
  return `${controles}
    <div class="pan-tp-tabela"><table class="pan-rito-tbl pan-rito-proc pan-pz-proc"><thead><tr><th>Processo</th>${caminho.fases.map((f) => `<th class="pan-rito-num"><i class="pan-pz-seg pan-pz-${esc(f.id)}"></i>${esc(f.rotulo)}</th>`).join('')}<th class="pan-rito-num">Até a decisão</th><th>Na mesma escala</th><th>Período</th></tr></thead>
    <tbody>${visiveis.map((p) => `<tr data-caso="${esc(p.caso)}" tabindex="0" title="${esc(`${panPrazoRotuloProcesso(p)}\n${panDias(p.total)} · ${periodo(p)}`)}">
        ${nome(p)}${p.fases.map(celula(p)).join('')}
        <td class="pan-rito-num"><strong>${esc(panDias(p.total))}</strong></td>
        <td class="pan-pz-mini"><div class="pan-pz-barra">${barra(p)}</div></td>
        <td class="pan-tp-periodo">${esc(periodo(p))}</td>
      </tr>`).join('')}</tbody></table></div>
    ${caminho.semEnvio ? `<p class="pan-rito-intro"><b>*</b> Sem data de envio na etapa de defesa: a entrega da defesa foi contada pelo início do Parecer Técnico Conclusivo. Vale para ${panPrazoPlural(caminho.semEnvio, 'processo', 'processos')} deste grupo.</p>` : ''}
    ${mais}`;
}

function panPrazoAbertos(t, referenciaMs) {
  if (!t.abertos.length) return '';
  const linhas = t.abertos.slice(0, 40).map((p) => `<tr data-caso="${esc(p.caso)}" class="pan-tp-aberto" tabindex="0">
      <th scope="row"><b>${esc(panPrazoRotuloProcesso(p))}</b><span>${esc(panPrazoDetalheProcesso(p))}</span></th>
      <td>${esc(p.estado.rotulo)}${p.estado.quem ? `<span class="pan-rito-sub">${esc(p.estado.quem)}</span>` : ''}</td>
      <td>${esc(p.etapaAtual)}${p.statusAtual ? `<span class="pan-rito-sub">${esc(p.statusAtual)}</span>` : ''}</td>
      <td class="pan-rito-num">${esc(panDias(p.estado.dias))}</td>
      <td class="pan-rito-num"><strong>${esc(panDias(p.dias))}</strong></td>
    </tr>`).join('');
  return `<div class="pan-tp-comparacao"><h4>${esc(t.nome)} · ainda sem decisão</h4>
    <p class="pan-rito-intro">${panPrazoPlural(t.abertos.length, 'processo ainda não chegou', 'processos ainda não chegaram')} à decisão. Não entram nas médias: o tempo é contado até ${esc(panDataBrDeMs(referenciaMs))}.</p>
    <div class="pan-tp-tabela"><table class="pan-rito-tbl"><thead><tr><th>Processo</th><th>Onde está</th><th>Etapa atual</th><th class="pan-rito-num">Há quanto tempo nessa fase</th><th class="pan-rito-num">Desde a abertura</th></tr></thead><tbody>${linhas}</tbody></table></div>
    ${t.abertos.length > 40 ? `<p class="pan-rito-intro">Mostrando os 40 mais antigos de ${t.abertos.length}.</p>` : ''}</div>`;
}

function panPrazoAchadoHtml(a) {
  if (!a) return '';
  const n = (v) => Math.round(v).toLocaleString('pt-BR');
  return `<p class="pan-pz-achado">De ${esc(a.de)} para ${esc(a.para)}, o tempo até a decisão ${a.depois < a.antes ? 'caiu' : 'subiu'} de <b>${n(a.antes)}</b> para <b>${esc(panDias(a.depois))}</b>. A maior diferença está na fase ${esc(a.fase)}: de ${n(a.faseAntes)} para ${esc(panDias(a.faseDepois))}.</p>`;
}

// Corpo da visão "Por tipo de caso" (vai dentro da seção de tempo dos casos).
function panPrazosHtml(itens, referenciaMs) {
  const r = panPrazos(itens, referenciaMs);
  if (!r.tipos.length) return `<div class="op-empty">Nenhum caso ${Object.keys(panTempoFiltros).length ? 'com esses filtros' : 'neste recorte'}.</div>`;
  if (!r.tipos.some((t) => t.nome === panPrazoTipo)) panPrazoTipo = r.tipos[0].nome;
  const t = r.tipos.find((x) => x.nome === panPrazoTipo);
  if (!t.caminhos.some((c) => c.id === panPrazoCaminhoAberto)) panPrazoCaminhoAberto = t.caminhos[0] ? t.caminhos[0].id : '';
  const c = t.caminhos.find((x) => x.id === panPrazoCaminhoAberto);
  const abas = t.caminhos.length > 1
    ? `<div class="pan-tp-controles"><div class="pan-tp-abas" role="group" aria-label="Caminho do processo">${t.caminhos.map((x) => `<button type="button" class="${x.id === c.id ? 'ativa' : ''}" data-pan-prazo-caminho="${esc(x.id)}" aria-pressed="${x.id === c.id}">${esc(x.nome)} · ${x.processos.length}</button>`).join('')}</div></div>` : '';
  const fases = !c ? '' : `<div class="pan-tp-comparacao"><h4>${esc(t.nome)} · entre as etapas: onde o tempo fica até a decisão</h4>
      ${abas}
      ${c.fases.length ? `<p class="pan-rito-intro">${c.fases.length === 2 ? 'Duas' : (c.fases.length === 3 ? 'Três' : 'Quatro')} fases, com os mesmos marcos em todo processo deste grupo. Média de dias em cada fase, todas as barras na mesma escala.</p>
        ${panPrazoAchadoHtml(c.achado)}
        ${panPrazoLegenda(c.fases)}
        ${panPrazoRegua(c)}` : `<p class="pan-rito-intro">${c.id === 'den-sem-intimacao' ? 'Denúncias decididas antes da intimação do clube, como as indeferidas. Não há fases para medir, só o tempo até a decisão.' : 'Processos que não começam por Auto de Infração nem por Denúncia Recebida. Não há fases fixas para medir, só o tempo até a decisão.'}</p>`}
    </div>
    <div class="pan-tp-comparacao"><h4>${esc(t.nome)} · processo a processo</h4>${panPrazoProcessos(c)}</div>`;
  const foraDaConta = [
    t.semDecisao ? `${panPrazoPlural(t.semDecisao, 'processo de caso encerrado sem decisão ficou', 'processos de casos encerrados sem decisão ficaram')} de fora.` : '',
    t.semData ? `${panPrazoPlural(t.semData, 'processo sem data na primeira etapa ou na decisão ficou', 'processos sem data na primeira etapa ou na decisão ficaram')} de fora.` : '',
  ].filter(Boolean).join(' ');
  return `${panPrazoCartoes(r, t.nome)}
    <div class="pan-tp-comparacao"><h4>${esc(t.nome)} · os três tempos</h4>${panPrazoTresTempos(t, referenciaMs)}</div>
    ${fases}
    ${panPrazoAbertos(t, referenciaMs)}
    <p class="pan-rt-legenda"><b>Como é contado</b> em dias corridos, pelas datas de início das etapas. <strong>Até a decisão</strong> vai da primeira etapa do processo ao primeiro acórdão finalizado; sem acórdão, vale a Decisão de Indeferimento ou a Decisão da Presidência que encerrou o caso. <strong>Caso inteiro</strong> e <strong>depois da decisão</strong> usam os casos finalizados e julgados. <strong>Defesa</strong> é a data de envio registrada na etapa do Auto de Infração (na denúncia, na etapa Denúncia); sem ela, vale o início do Parecer Técnico Conclusivo. <strong>Distribuição</strong> é o início do Despacho de Distribuição. As barras das fases usam só os processos com todas as datas. Um novo Auto de Infração depois da decisão abre outro processo no mesmo caso. ${foraDaConta} Clique num processo para abrir o caso.</p>`;
}

function conectarControlesPrazos() {
  const raiz = document.querySelector('#pan-tempo');
  if (!raiz) return;
  const seletor = (atributo, valor) => `#pan-tempo [${atributo}="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(valor) : valor}"]`;
  raiz.querySelectorAll('[data-pan-prazo-tipo]').forEach((b) => b.addEventListener('click', () => { panPrazoTipo = b.dataset.panPrazoTipo; panPrazoCaminhoAberto = ''; panPrazoExpandido = false; panAtualizarTempo(); document.querySelector(seletor('data-pan-prazo-tipo', panPrazoTipo))?.focus(); }));
  raiz.querySelectorAll('[data-pan-prazo-caminho]').forEach((b) => b.addEventListener('click', () => { panPrazoCaminhoAberto = b.dataset.panPrazoCaminho; panPrazoExpandido = false; panAtualizarTempo(); document.querySelector(seletor('data-pan-prazo-caminho', panPrazoCaminhoAberto))?.focus(); }));
  raiz.querySelectorAll('[data-pan-prazo-ordem]').forEach((b) => b.addEventListener('click', () => { panPrazoOrdem = b.dataset.panPrazoOrdem; panAtualizarTempo(); }));
  raiz.querySelector('[data-pan-prazo-expandir]')?.addEventListener('click', () => { panPrazoExpandido = !panPrazoExpandido; panAtualizarTempo(); });
}
