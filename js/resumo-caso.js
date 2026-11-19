// Resumo do caso: ficha para encaminhar aos Diretores e histórico de decisões
// por clube.
//
// A ficha tem duas camadas:
//   1. AUTOMÁTICA: o que o sistema já sabe (identificação, situação, decisões,
//      recurso, cumprimento e valores). Sai das etapas, sem digitar nada.
//   2. ESCRITA: quatro tópicos de texto, guardados na coluna `resumo` (jsonb)
//      da tabela casos: { trata, pontos, decisao, atencao, atualizado_em,
//      atualizado_por }.
// O documento que aparece na janela é o mesmo que vai para o PDF.
//
// Usa as regras do painel Sanções (js/panels/operacional.js) e da Arrecadação
// (js/arrecadacao.js): este arquivo é carregado depois deles.

const RESUMO_TOPICOS = [
  { chave: 'trata', rotulo: 'Do que trata o caso', ajuda: 'O fato que deu origem ao caso e o que está sendo apurado.' },
  { chave: 'pontos', rotulo: 'Principais pontos', ajuda: 'Um ponto por linha. Cada linha vira um item da lista.', lista: true },
  { chave: 'decisao', rotulo: 'Decisão e fundamento', ajuda: 'O que foi decidido e por quê. Deixe em branco se ainda não houve decisão.' },
  { chave: 'atencao', rotulo: 'Pontos de atenção e próximos passos', ajuda: 'O que os Diretores precisam acompanhar ou decidir.' },
];
const RESUMO_ATOS = { auto: 'Auto de Infração', decisao: 'Decisão', recurso: 'Recurso', cumprimento: 'Cumprimento' };

// ---------- texto escrito ----------

// Só os tópicos com texto. Sem nenhum, o caso não tem resumo (null).
function resumoNormalizar(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const resumo = {};
  RESUMO_TOPICOS.forEach((t) => {
    const texto = String(bruto[t.chave] === null || bruto[t.chave] === undefined ? '' : bruto[t.chave]).replace(/\r\n?/g, '\n').trim();
    if (texto) resumo[t.chave] = texto;
  });
  if (!Object.keys(resumo).length) return null;
  if (bruto.atualizado_em) resumo.atualizado_em = String(bruto.atualizado_em);
  if (bruto.atualizado_por) resumo.atualizado_por = String(bruto.atualizado_por);
  return resumo;
}

function resumoDoCaso(rows) {
  const row = (rows || []).find((r) => r && r.resumoCaso);
  return resumoNormalizar(row ? row.resumoCaso : null);
}

// "Principais pontos": uma linha por item, sem o marcador que a pessoa digitou.
function resumoItens(texto) {
  return String(texto || '').split('\n').map((l) => l.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}

// ---------- datas ----------

function resumoMs(valor) {
  if (!valor) return 0;
  const t = String(valor).trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = br ? new Date(+br[3], +br[2] - 1, +br[1]) : (iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : new Date(t));
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function resumoDataBr(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function resumoMsEtapa(row) {
  return resumoMs(row.dataEnvio || row.dataEtapa || row.dataEntrega || row.dataDecisao);
}

// ---------- decisões ----------

// Tipo do ato para o histórico. '' = a etapa não é um ato decisório.
function resumoTipoAto(row) {
  const nome = row && row.etapa;
  if (!nome) return '';
  if (ehAutoInfracao(nome)) return 'auto';
  if (ehAcordao(nome, row.sancao)) return 'decisao';
  if (ehAdmissaoRecurso(nome)) return 'recurso';
  if (typeof arrTipoEtapa === 'function' && arrTipoEtapa(nome) === 'cumprimento') return 'cumprimento';
  return '';
}

function resumoOrgao(row) {
  const n = normStatus(row.etapa);
  if (n.includes('plenario')) return 'Plenário';
  const turma = String(row.turma || '').trim();
  if (turma) return turma;
  return n.includes('presidencia') ? 'Presidência' : '';
}

function resumoResultado(row, tipo, etapas, naoAdmitidos) {
  const finalizada = isFinalizada(row);
  const sancao = String(row.sancao || '').trim();
  if (tipo === 'auto') return sancao ? `Sanção proposta: ${sancao}` : 'Sem sanção proposta';
  if (tipo === 'decisao') {
    if (finalizada) return sancaoDaDecisao(row) || 'Sem sanção';
    return sancao ? `Em julgamento. Sanção prevista: ${sancao}` : 'Aguardando julgamento';
  }
  if (tipo === 'recurso') {
    if (naoAdmitidos.has(String(row.etapa_banco_id))) return 'Recurso não admitido';
    if (etapas.some((r) => r !== row && ehEtapaRecursal(r.etapa) && !ehAdmissaoRecurso(r.etapa))) return 'Recurso admitido';
    return finalizada ? 'Admissão concluída' : 'Admissão em análise';
  }
  const dado = typeof arrNormalizar === 'function' ? arrNormalizar('cumprimento', row.arrecadacao) : null;
  if (!dado) return finalizada ? 'Ordem expedida' : 'Ordem em andamento';
  const pago = dado.multaPaga || 0;
  const pagamento = !dado.multa ? '' : (pago >= dado.multa ? '. Multa paga' : `. Pago ${arrFormatar(pago)}, a receber ${arrFormatar(dado.multa - pago)}`);
  return `${arrMedidas(dado).join(' + ')}${pagamento}`;
}

// Atos decisórios de um caso, do mais antigo para o mais recente.
function resumoDecisoes(rows) {
  const etapas = (rows || []).filter((r) => r && r.etapa && !r.semEtapas);
  const naoAdmitidos = typeof arrRecursosNaoAdmitidos === 'function' ? arrRecursosNaoAdmitidos(etapas) : new Set();
  return etapas.map((row, posicao) => {
    const tipo = resumoTipoAto(row);
    if (!tipo) return null;
    const ms = resumoMsEtapa(row);
    return {
      tipo, tipoRotulo: RESUMO_ATOS[tipo], ato: String(row.etapa), numero: row.semId || !row.id ? '' : String(row.id),
      ms, data: resumoDataBr(ms), orgao: resumoOrgao(row), resultado: resumoResultado(row, tipo, etapas, naoAdmitidos),
      finalizada: isFinalizada(row), doc: /^https?:\/\//i.test(String(row.doc || '')) ? String(row.doc) : '',
      caso: opCaso(row), clube: row.clube || 'Sem clube', ordem: Number(row.ordem) || 0, posicao,
    };
  }).filter(Boolean).sort((a, b) => (a.ordem - b.ordem) || (a.ms - b.ms) || (a.posicao - b.posicao));
}

// Histórico do clube: os atos de todos os casos.
//   'recente' (tela do Dossiê): do mais recente para o mais antigo; ato sem
//             data vai para o fim.
//   'caso'    (PDF do clube): caso a caso, na ordem do número, e dentro do caso
//             na ordem em que os atos aconteceram, para ler o que foi proposto
//             e depois o que foi decidido.
function resumoHistoricoClube(rowsDoClube, ordem = 'recente') {
  const porCaso = new Map();
  (rowsDoClube || []).forEach((r) => { const c = opCaso(r); if (!porCaso.has(c)) porCaso.set(c, []); porCaso.get(c).push(r); });
  const atos = [];
  if (ordem === 'caso') {
    Array.from(porCaso.keys()).sort(compararCaso).forEach((c) => atos.push(...resumoDecisoes(porCaso.get(c))));
    return atos;
  }
  porCaso.forEach((rows) => atos.push(...resumoDecisoes(rows)));
  return atos.sort((a, b) => (!a.ms - !b.ms) || (b.ms - a.ms) || compararCaso(a.caso, b.caso) || (b.ordem - a.ordem));
}

// ---------- ficha automática ----------

function resumoFicha(rows) {
  const lista = (rows || []).filter(Boolean);
  const etapas = lista.filter((r) => r.etapa && !r.semEtapas);
  const primeira = lista[0] || {};
  const caso = opCaso(primeira);
  const clube = opMost(lista, 'clube', 'Sem clube');
  const statusInformado = String((lista.find((r) => r.statusCaso) || {}).statusCaso || '').trim();
  // O status do caso prevalece, como em Processos; indeferimento encerra.
  const finalizado = (typeof casoIndeferido === 'function' && casoIndeferido(etapas))
    || (statusInformado ? normStatus(statusInformado).includes('finalizado') : (etapas.length > 0 && etapas.every(isFinalizada)));
  const atual = etapas.length ? opAtual(etapas) : null;
  const datas = etapas.map(resumoMsEtapa).filter(Boolean).sort((a, b) => a - b);
  const processos = etapas.length ? processosSancionadoresDoCaso({ caso, rows: etapas, clube, serie: opMost(lista, 'serie', ''), origem: opMost(lista, 'origem', '') }) : [];
  const lancamentos = typeof arrLancamentos === 'function' ? arrLancamentos(etapas).filter((l) => l.dado) : [];
  const totais = typeof arrResumo === 'function' ? arrResumo(lancamentos) : { total: 0, aReceber: 0 };
  const prazoMs = !finalizado && atual ? resumoMs(atual.prazoFinal) : 0;
  return {
    caso, clube, casoBancoId: (lista.find((r) => r.caso_banco_id) || {}).caso_banco_id || null,
    serie: opMost(lista, 'serie', ''), origem: opMost(lista, 'origem', ''), periodo: String(primeira.periodo || '').trim(), denunciante: String(primeira.denunciante || '').trim(),
    observacao: String((lista.find((r) => String(r.observacaoCaso || '').trim()) || {}).observacaoCaso || '').trim(),
    status: finalizado ? 'Finalizado' : (statusInformado || 'Em andamento'), finalizado,
    etapaAtual: atual && atual.etapa ? String(atual.etapa) : '', statusEtapa: atual && !finalizado ? String(atual.statusEtapa || '') : '',
    prazo: resumoDataBr(prazoMs), inicio: resumoDataBr(datas[0]), ultima: resumoDataBr(datas[datas.length - 1]), totalEtapas: etapas.length,
    relator: (processos.find((p) => p.relator) || {}).relator || '', relatorRecurso: (processos.find((p) => p.relatorRecurso) || {}).relatorRecurso || '',
    processos: processos.map((p) => ({
      processo: p.processoLabel, situacao: p.situacaoLabel, aplicada: Boolean(p.sancaoAplicada),
      sancao: p.sancaoAplicada || p.sancaoPrevista || '', recurso: p.recursoLabel || '',
    })),
    decisoes: resumoDecisoes(lista),
    valores: {
      arrecadado: totais.total, aReceber: totais.aReceber,
      itens: lancamentos.map((l) => ({ tipo: ARR_TIPOS[l.tipo].rotulo, etapa: l.etapa, arrecadado: l.arrecadado, aReceber: l.aReceber, medidas: l.medidas })),
    },
    resumo: resumoDoCaso(lista),
  };
}

// Fichas de todos os casos de um clube, em ordem de número do caso.
function resumoFichasDoClube(rows, clube) {
  const porCaso = new Map();
  (rows || []).forEach((r) => {
    if (!r || String(r.clube || 'Sem clube') !== String(clube)) return;
    const c = opCaso(r);
    if (!porCaso.has(c)) porCaso.set(c, []);
    porCaso.get(c).push(r);
  });
  return Array.from(porCaso.values()).map(resumoFicha).sort((a, b) => compararCaso(a.caso, b.caso));
}

// ---------- documento (janela e PDF) ----------

function resumoEsc(v) {
  return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const RESUMO_DOC_CSS = `
  @page { size: A4; margin: 16mm 15mm 16mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 28px 32px; font: 11.5pt/1.5 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1c1a16; background: #fff; }
  .topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 2px solid #9a7a14; padding-bottom: 8px; margin-bottom: 18px; }
  .topo b { font: 700 9pt/1 "Segoe UI", Arial, sans-serif; letter-spacing: .18em; color: #9a7a14; text-transform: uppercase; }
  .topo span { font-size: 8.5pt; color: #7a7268; text-align: right; }
  h1 { font: 700 19pt/1.2 Georgia, "Times New Roman", serif; margin: 0 0 4px; }
  .sub { margin: 0 0 16px; color: #5c554b; font-size: 10.5pt; }
  h2 { font: 700 9.5pt/1.2 "Segoe UI", Arial, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #9a7a14; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2ddd6; break-after: avoid; }
  h3 { font: 700 11pt/1.3 "Segoe UI", Arial, sans-serif; margin: 12px 0 3px; break-after: avoid; }
  p { margin: 0 0 8px; white-space: pre-line; }
  ul { margin: 0 0 8px; padding-left: 18px; }
  li { margin-bottom: 3px; }
  .dados { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 18px; margin: 0; }
  .dados div { break-inside: avoid; }
  .dados dt { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #7a7268; }
  .dados dd { margin: 1px 0 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { text-align: left; font: 700 8pt/1.2 "Segoe UI", Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #7a7268; border-bottom: 1px solid #ccc8c0; padding: 5px 8px 5px 0; }
  td { border-bottom: 1px solid #ece8e1; padding: 6px 8px 6px 0; vertical-align: top; }
  tr { break-inside: avoid; }
  td.nw { white-space: nowrap; }
  table.atos { table-layout: fixed; }
  td { overflow-wrap: anywhere; }
  td.obs { white-space: pre-line; }
  tbody.grupo { break-inside: avoid; }
  tr.grupo-titulo td { background: #faf8f4; font-weight: 700; padding: 6px 8px; border-top: 1px solid #ccc8c0; border-bottom: 1px solid #e2ddd6; }
  tr.grupo-titulo .menor { font-weight: 400; margin-left: 6px; }
  .tag { display: inline-block; font: 700 8pt/1.4 "Segoe UI", Roboto, Arial, sans-serif; vertical-align: middle; border: 1px solid #ccc8c0; border-radius: 999px; padding: 1px 7px; color: #5c554b; white-space: nowrap; }
  .tag.ok { border-color: #99d099; color: #267028; background: #eaf7ea; }
  .tag.and { border-color: #99bbed; color: #1a4e8a; background: #eaf1fb; }
  .tag.jul { border-color: #c4aaea; color: #5a3c9a; background: #f0eafb; }
  .tag.rec { border-color: #eebb99; color: #c24a18; background: #fef0e8; }
  .menor { font-size: 9pt; color: #7a7268; }
  .vazio { color: #7a7268; font-style: italic; }
  .caso { break-before: page; padding-top: 2px; }
  .caso:first-of-type { break-before: auto; }
  .rodape { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2ddd6; font-size: 8pt; color: #7a7268; }
  @media print { body { padding: 0; } }
`;

// Cor da etiqueta de situação: finalizado, julgado ou em fase de recurso
// (os dois ainda abertos) ou em andamento.
function resumoTagSituacao(f) {
  const classe = f.finalizado ? 'ok' : ({ julgado: 'jul', 'em-fase-de-recurso': 'rec' }[normStatus(f.status)] || 'and');
  return `<span class="tag ${classe}">${resumoEsc(f.status)}</span>`;
}

function resumoDadoHtml(rotulo, valor) {
  return valor ? `<div><dt>${resumoEsc(rotulo)}</dt><dd>${resumoEsc(valor)}</dd></div>` : '';
}

function resumoTabelaAtosHtml(atos, comCaso) {
  if (!atos.length) return '<p class="vazio">Nenhum ato decisório registrado.</p>';
  const linhas = atos.map((a) => `<tr>
      <td class="nw">${resumoEsc(a.data || 'sem data')}</td>
      ${comCaso ? `<td class="nw">Caso ${resumoEsc(a.caso)}</td>` : ''}
      <td>${resumoEsc(a.ato)}${a.numero ? `<div class="menor">nº ${resumoEsc(a.numero)}</div>` : ''}</td>
      <td>${resumoEsc(a.orgao || '—')}</td>
      <td>${resumoEsc(a.resultado)}</td>
    </tr>`).join('');
  const colunas = comCaso ? [13, 10, 27, 13, 37] : [13, 30, 14, 43];
  return `<table class="atos"><colgroup>${colunas.map((c) => `<col style="width:${c}%">`).join('')}</colgroup><thead><tr><th>Data</th>${comCaso ? '<th>Caso</th>' : ''}<th>Ato</th><th>Órgão</th><th>Resultado</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

// Histórico do PDF do clube: um bloco por caso, com os atos em sequência.
// Agrupa os atos vizinhos do mesmo caso (a lista já vem ordenada por caso).
function resumoHistoricoPorCasoHtml(atos, fichas) {
  if (!atos.length) return '<p class="vazio">Nenhum ato decisório registrado.</p>';
  const fichaDe = new Map((fichas || []).map((f) => [f.caso, f]));
  const grupos = [];
  atos.forEach((a) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.caso === a.caso) ultimo.atos.push(a); else grupos.push({ caso: a.caso, atos: [a] });
  });
  const corpo = grupos.map((g) => {
    const f = fichaDe.get(g.caso);
    const detalhe = f ? ` <span class="menor">${resumoEsc([f.origem, f.status].filter(Boolean).join(' · '))}</span>` : '';
    return `<tbody class="grupo"><tr class="grupo-titulo"><td colspan="4">Caso ${resumoEsc(g.caso)}${detalhe}</td></tr>${g.atos.map((a) => `<tr>
      <td class="nw">${resumoEsc(a.data || 'sem data')}</td>
      <td>${resumoEsc(a.ato)}${a.numero ? `<div class="menor">nº ${resumoEsc(a.numero)}</div>` : ''}</td>
      <td>${resumoEsc(a.orgao || '—')}</td>
      <td>${resumoEsc(a.resultado)}</td>
    </tr>`).join('')}</tbody>`;
  }).join('');
  return `<table class="atos"><colgroup>${[13, 30, 14, 43].map((c) => `<col style="width:${c}%">`).join('')}</colgroup><thead><tr><th>Data</th><th>Ato</th><th>Órgão</th><th>Resultado</th></tr></thead>${corpo}</table>`;
}

function resumoTextoHtml(resumo) {
  if (!resumo) return '';
  return RESUMO_TOPICOS.map((t) => {
    const texto = resumo[t.chave];
    if (!texto) return '';
    const corpo = t.lista ? `<ul>${resumoItens(texto).map((i) => `<li>${resumoEsc(i)}</li>`).join('')}</ul>` : `<p>${resumoEsc(texto)}</p>`;
    return `<h3>${resumoEsc(t.rotulo)}</h3>${corpo}`;
  }).join('');
}

// Corpo de um caso. `titulo` = 'h1' no documento do caso, 'h2' dentro do do clube.
function resumoCasoHtml(ficha, opcoes = {}) {
  const f = ficha;
  const etapaAtual = !f.finalizado && f.etapaAtual ? `${f.etapaAtual}${f.statusEtapa ? ` (${f.statusEtapa})` : ''}` : '';
  const desfecho = f.processos.length ? `<h2>Processos sancionadores</h2><table><thead><tr><th>Processo</th><th>Situação</th><th>Sanção</th><th>Recurso</th></tr></thead><tbody>${f.processos.map((p) => `<tr>
      <td class="nw">${resumoEsc(p.processo)}</td><td>${resumoEsc(p.situacao)}</td>
      <td>${p.sancao ? `${resumoEsc(p.sancao)}${p.aplicada ? '' : ' <span class="menor">(prevista)</span>'}` : '—'}</td>
      <td>${resumoEsc(p.recurso || '—')}</td></tr>`).join('')}</tbody></table>` : '';
  const valores = f.valores.itens.length ? `<h2>Cumprimento e valores</h2><table><thead><tr><th>Etapa</th><th>Tipo</th><th>Medidas</th><th>Arrecadado</th><th>A receber</th></tr></thead><tbody>${f.valores.itens.map((v) => `<tr>
      <td>${resumoEsc(v.etapa)}</td><td>${resumoEsc(v.tipo)}</td><td>${resumoEsc(v.medidas.join(' + ') || '—')}</td>
      <td class="nw">${v.arrecadado ? resumoEsc(arrFormatar(v.arrecadado)) : '—'}</td><td class="nw">${v.aReceber ? resumoEsc(arrFormatar(v.aReceber)) : '—'}</td></tr>`).join('')}</tbody></table>` : '';
  const texto = resumoTextoHtml(f.resumo);
  const tag = resumoTagSituacao(f);
  const cabeca = opcoes.noClube
    ? `<h1 style="font-size:15pt">Caso ${resumoEsc(f.caso)} ${tag}</h1>`
    : `<h1>${resumoEsc(f.clube)} · Caso ${resumoEsc(f.caso)}</h1>`;
  return `<section class="caso">
    ${cabeca}
    <p class="sub">${resumoEsc([f.origem, f.serie ? `Série ${f.serie}` : '', f.periodo ? `Período ${f.periodo}` : ''].filter(Boolean).join(' · '))}</p>
    <dl class="dados">
      ${resumoDadoHtml('Situação', f.status)}
      ${resumoDadoHtml('Etapa atual', etapaAtual)}
      ${resumoDadoHtml('Próximo prazo', f.prazo)}
      ${resumoDadoHtml('Início', f.inicio)}
      ${resumoDadoHtml('Última movimentação', f.ultima)}
      ${resumoDadoHtml('Relator', f.relator)}
      ${resumoDadoHtml('Relator do recurso', f.relatorRecurso)}
      ${resumoDadoHtml('Denunciante', f.denunciante)}
    </dl>
    ${texto ? `<h2>Resumo</h2>${texto}` : ''}
    ${desfecho}
    <h2>Decisões do caso</h2>
    ${resumoTabelaAtosHtml(f.decisoes, false)}
    ${valores}
  </section>`;
}

// Documento completo (HTML autônomo). `modo` = 'caso' ou 'clube'.
function resumoDocumentoHtml(dados) {
  const { modo, clube, fichas, historico, geradoEm, geradoPor } = dados;
  const gerado = `Gerado em ${resumoEsc(geradoEm)}${geradoPor ? ` por ${resumoEsc(geradoPor)}` : ''}`;
  let corpo;
  let titulo;
  if (modo === 'clube') {
    const abertos = fichas.filter((f) => !f.finalizado).length;
    const julgados = fichas.filter((f) => !f.finalizado && normStatus(f.status) === 'julgado').length;
    const emRecurso = fichas.filter((f) => !f.finalizado && normStatus(f.status) === 'em-fase-de-recurso').length;
    titulo = `Resumo dos casos - ${clube}`;
    corpo = `<h1>${resumoEsc(clube)}</h1>
      <p class="sub">${fichas.length} ${fichas.length === 1 ? 'caso' : 'casos'} · ${abertos - julgados - emRecurso} em andamento${julgados ? ` · ${julgados} ${julgados === 1 ? 'julgado' : 'julgados'}` : ''}${emRecurso ? ` · ${emRecurso} em fase de recurso` : ''} · ${fichas.length - abertos} ${fichas.length - abertos === 1 ? 'finalizado' : 'finalizados'}</p>
      <h2>Casos do clube</h2>
      <table class="atos"><colgroup>${[10, 14, 17, 28, 31].map((c) => `<col style="width:${c}%">`).join('')}</colgroup><thead><tr><th>Caso</th><th>Origem</th><th>Situação</th><th>Desfecho</th><th>Observação</th></tr></thead><tbody>${fichas.map((f) => `<tr>
        <td class="nw">Caso ${resumoEsc(f.caso)}</td><td>${resumoEsc(f.origem || '—')}</td>
        <td>${resumoTagSituacao(f)}</td>
        <td>${f.finalizado && f.processos.length ? f.processos.map((p) => `${resumoEsc(p.processo)}: ${resumoEsc(p.situacao)}${p.sancao ? ` (${resumoEsc(p.sancao)})` : ''}`).join('<br>') : '—'}</td>
        <td class="obs">${f.observacao ? resumoEsc(f.observacao) : '—'}</td></tr>`).join('')}</tbody></table>
      <h2>Histórico de decisões</h2>
      ${resumoHistoricoPorCasoHtml(historico, fichas)}
      ${fichas.map((f) => resumoCasoHtml(f, { noClube: true })).join('')}`;
    // No documento do clube, cada caso começa em página nova.
    corpo = corpo.replace('<section class="caso">', '<section class="caso" style="break-before:page">');
  } else {
    const f = fichas[0];
    titulo = `Resumo do caso ${f.caso} - ${f.clube}`;
    corpo = resumoCasoHtml(f);
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${resumoEsc(titulo)}</title><style>${RESUMO_DOC_CSS}</style></head><body>
    <div class="topo"><b>ANRESF · ${modo === 'clube' ? 'Resumo dos casos do clube' : 'Resumo do caso'}</b><span>${gerado}</span></div>
    ${corpo}
    <div class="rodape">Documento gerado pelo Sistema de Controle da ANRESF a partir das etapas cadastradas. Uso interno.</div>
  </body></html>`;
}

// ---------- blocos do Dossiê do clube ----------

function resumoAtualizacaoTxt(resumo) {
  if (!resumo || !resumo.atualizado_em) return '';
  const quando = resumoDataBr(new Date(resumo.atualizado_em).getTime());
  return quando ? `Atualizado em ${quando}${resumo.atualizado_por ? ` por ${resumo.atualizado_por}` : ''}` : '';
}

function resumoBlocosDossie(clube, casoSelecionadoNoDossie) {
  const rows = typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  const fichas = resumoFichasDoClube(rows, clube);
  if (!fichas.length) return '';
  const ficha = fichas.find((f) => f.caso === casoSelecionadoNoDossie) || fichas[0];
  const historico = resumoHistoricoClube(rows.filter((r) => String(r.clube || 'Sem clube') === String(clube)));
  const texto = ficha.resumo
    ? RESUMO_TOPICOS.filter((t) => ficha.resumo[t.chave]).map((t) => `<div class="rsm-topico"><h4>${esc(t.rotulo)}</h4>${t.lista
      ? `<ul>${resumoItens(ficha.resumo[t.chave]).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
      : `<p>${esc(ficha.resumo[t.chave])}</p>`}</div>`).join('')
    : '<div class="op-empty">Este caso ainda não tem resumo escrito. A ficha e o PDF já trazem os dados do sistema.</div>';
  const semResumo = fichas.filter((f) => !f.resumo).length;
  const linhas = historico.map((a) => `<tr>
      <td class="rsm-nw">${esc(a.data || 'sem data')}</td>
      <td class="rsm-nw">${esc(opCasoTitulo(a.caso))}</td>
      <td><span class="op-pill ${a.tipo === 'decisao' ? 'blue' : a.tipo === 'auto' ? 'orange' : a.tipo === 'recurso' ? 'purple' : 'neutral'}">${esc(a.tipoRotulo)}</span></td>
      <td>${esc(a.ato)}${a.numero ? `<span class="rsm-sub">nº ${esc(a.numero)}</span>` : ''}</td>
      <td class="rsm-nw">${esc(a.orgao || '—')}</td>
      <td>${esc(a.resultado)}</td>
      <td>${a.doc ? `<a class="op-doc" href="${esc(a.doc)}" target="_blank" rel="noopener">Documento</a>` : '—'}</td>
    </tr>`).join('');
  return `<section class="op-card rsm-card">
      <div class="op-card-head"><div><h3>Resumo do caso · ${esc(opCasoTitulo(ficha.caso))}</h3><p class="op-muted">${esc(resumoAtualizacaoTxt(ficha.resumo) || 'Texto para encaminhar aos Diretores')}</p></div>
        <div class="rsm-acoes"><button type="button" class="op-btn" data-resumo-editar="${esc(ficha.caso)}">${ficha.resumo ? 'Editar resumo' : 'Escrever resumo'}</button><button type="button" class="op-btn rsm-btn-pdf" data-resumo-abrir="${esc(ficha.caso)}">Ver e gerar PDF</button></div></div>
      <div class="op-card-body rsm-texto">${texto}</div>
    </section>
    <section class="op-card rsm-card">
      <div class="op-card-head"><div><h3>Histórico de decisões do clube</h3><p class="op-muted">${historico.length} ${historico.length === 1 ? 'ato' : 'atos'} em ${fichas.length} ${fichas.length === 1 ? 'caso' : 'casos'}${semResumo ? ` · ${semResumo} sem resumo escrito` : ''}</p></div>
        <div class="rsm-acoes"><button type="button" class="op-btn rsm-btn-pdf" data-resumo-clube="${esc(clube)}">PDF do clube</button></div></div>
      <div class="op-card-body"><div class="rsm-tabela"><table class="rsm-tbl"><thead><tr><th>Data</th><th>Caso</th><th>Tipo</th><th>Ato</th><th>Órgão</th><th>Resultado</th><th>Doc.</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="7"><div class="op-empty">Nenhum ato decisório registrado para este clube.</div></td></tr>'}</tbody></table></div></div>
    </section>`;
}

// ---------- janela ----------

const resumoUI = { aberto: false, modo: 'caso', caso: '', clube: '', editando: false, salvando: false, erro: '' };

function resumoRows() {
  return typeof dadosFluxograma !== 'undefined' && Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
}

function resumoFichaAberta() {
  const rows = resumoRows().filter((r) => opCaso(r) === resumoUI.caso);
  return rows.length ? resumoFicha(rows) : null;
}

function resumoDadosDocumento() {
  const usuario = typeof usuarioAtual === 'function' ? usuarioAtual() : null;
  const base = { geradoEm: resumoDataBr(Date.now()), geradoPor: (usuario && usuario.nome) || '' };
  if (resumoUI.modo === 'clube') {
    const rows = resumoRows();
    return { ...base, modo: 'clube', clube: resumoUI.clube, fichas: resumoFichasDoClube(rows, resumoUI.clube), historico: resumoHistoricoClube(rows.filter((r) => String(r.clube || 'Sem clube') === resumoUI.clube), 'caso') };
  }
  const ficha = resumoFichaAberta();
  return ficha ? { ...base, modo: 'caso', clube: ficha.clube, fichas: [ficha], historico: [] } : null;
}

function resumoRaiz() {
  let raiz = document.querySelector('#resumo-modal');
  if (!raiz) {
    raiz = document.createElement('div');
    raiz.id = 'resumo-modal';
    document.body.appendChild(raiz);
  }
  return raiz;
}

function resumoFormHtml(ficha) {
  const r = ficha.resumo || {};
  return `<form class="rsm-form" id="rsm-form">
      <p class="rsm-dica">Estes quatro tópicos entram no PDF junto com os dados do sistema. Tópico em branco não aparece.</p>
      ${RESUMO_TOPICOS.map((t) => `<label class="rsm-campo"><span>${resumoEsc(t.rotulo)}</span><small>${resumoEsc(t.ajuda)}</small>
        <textarea name="${t.chave}" rows="${t.chave === 'pontos' ? 5 : 4}" maxlength="6000">${resumoEsc(r[t.chave] || '')}</textarea></label>`).join('')}
    </form>`;
}

function resumoRenderJanela() {
  const raiz = resumoRaiz();
  if (!resumoUI.aberto) { raiz.innerHTML = ''; return; }
  const dados = resumoDadosDocumento();
  if (!dados || !dados.fichas.length) { resumoUI.aberto = false; raiz.innerHTML = ''; return; }
  const ficha = dados.fichas[0];
  const ehClube = resumoUI.modo === 'clube';
  const titulo = ehClube ? `${dados.clube} · todos os casos` : `${ficha.clube} · Caso ${ficha.caso}`;
  const semResumo = dados.fichas.filter((f) => !f.resumo).length;
  const nota = ehClube
    ? (semResumo ? `${semResumo} de ${dados.fichas.length} ${dados.fichas.length === 1 ? 'caso' : 'casos'} ${semResumo === 1 ? 'está' : 'estão'} sem resumo escrito. O PDF sai só com os dados do sistema para ${semResumo === 1 ? 'ele' : 'eles'}.` : 'Todos os casos do clube têm resumo escrito.')
    : (ficha.resumo ? (resumoAtualizacaoTxt(ficha.resumo) || 'Resumo escrito.') : 'Este caso ainda não tem resumo escrito. O PDF sai só com os dados do sistema.');
  const editando = resumoUI.editando && !ehClube;
  const notaTexto = editando ? 'Ao salvar, a prévia do PDF é atualizada com o texto.' : nota;
  const acoes = editando
    ? `<button type="button" class="rsm-btn" data-resumo-cancelar ${resumoUI.salvando ? 'disabled' : ''}>Cancelar</button><button type="button" class="rsm-btn primario" data-resumo-salvar ${resumoUI.salvando ? 'disabled' : ''}>${resumoUI.salvando ? 'Salvando…' : 'Salvar resumo'}</button>`
    : `${ehClube ? '' : `<button type="button" class="rsm-btn" data-resumo-modo-editar>${ficha.resumo ? 'Editar resumo' : 'Escrever resumo'}</button>`}<button type="button" class="rsm-btn primario" data-resumo-imprimir>Salvar em PDF ou imprimir</button>`;
  raiz.innerHTML = `<div class="rsm-fundo" data-resumo-fechar><div class="rsm-janela" role="dialog" aria-modal="true" aria-label="Resumo do caso">
      <header class="rsm-cabeca"><div><span class="rsm-rotulo">${ehClube ? 'Resumo do clube' : (editando ? 'Editar resumo do caso' : 'Resumo do caso')}</span><h3>${resumoEsc(titulo)}</h3></div><button type="button" class="rsm-fechar" data-resumo-fechar aria-label="Fechar">×</button></header>
      <div class="rsm-barra"><span class="rsm-nota${!editando && !ehClube && !ficha.resumo ? ' alerta' : ''}">${resumoEsc(notaTexto)}</span><div class="rsm-barra-acoes">${acoes}</div></div>
      ${editando ? `<div class="rsm-erro" id="rsm-erro" role="alert" ${resumoUI.erro ? '' : 'hidden'}>${resumoEsc(resumoUI.erro)}</div>` : ''}
      <div class="rsm-corpo">${editando ? resumoFormHtml(ficha) : '<iframe class="rsm-doc" id="rsm-doc" title="Prévia do documento"></iframe>'}</div>
    </div></div>`;
  if (editando) {
    const primeiro = raiz.querySelector('textarea');
    if (primeiro) primeiro.focus();
  } else {
    const quadro = raiz.querySelector('#rsm-doc');
    // Com o foco dentro da prévia (depois de imprimir, por exemplo), o Esc
    // chega ao documento do quadro: ele também fecha a janela.
    quadro.addEventListener('load', () => {
      try { quadro.contentDocument.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharResumo(); }); } catch (erro) { /* quadro sem acesso: o X fecha */ }
    });
    quadro.srcdoc = resumoDocumentoHtml(dados);
  }
}

function abrirResumoCaso(caso, editar) {
  Object.assign(resumoUI, { aberto: true, modo: 'caso', caso: String(caso), clube: '', editando: Boolean(editar), salvando: false, erro: '' });
  resumoRenderJanela();
}

function abrirResumoClube(clube) {
  Object.assign(resumoUI, { aberto: true, modo: 'clube', caso: '', clube: String(clube), editando: false, salvando: false, erro: '' });
  resumoRenderJanela();
}

function fecharResumo() {
  if (resumoUI.salvando) return;
  resumoUI.aberto = false;
  resumoRenderJanela();
}

// O nome sugerido do arquivo PDF vem do título da página.
function resumoImprimir() {
  const quadro = document.querySelector('#rsm-doc');
  if (!quadro || !quadro.contentWindow) return;
  const tituloAntes = document.title;
  const tituloDoc = quadro.contentDocument && quadro.contentDocument.title;
  if (tituloDoc) document.title = tituloDoc;
  const restaurar = () => { document.title = tituloAntes; };
  quadro.contentWindow.addEventListener('afterprint', restaurar, { once: true });
  setTimeout(restaurar, 60000);
  quadro.contentWindow.focus();
  quadro.contentWindow.print();
}

function resumoMostrarErro(texto) {
  resumoUI.erro = texto || '';
  const el = document.querySelector('#rsm-erro');
  if (el) { el.textContent = resumoUI.erro; el.hidden = !resumoUI.erro; }
}

function resumoTravar(travar) {
  resumoUI.salvando = travar;
  document.querySelectorAll('#resumo-modal [data-resumo-salvar], #resumo-modal [data-resumo-cancelar]').forEach((b) => { b.disabled = travar; });
  const salvar = document.querySelector('#resumo-modal [data-resumo-salvar]');
  if (salvar) salvar.textContent = travar ? 'Salvando…' : 'Salvar resumo';
}

async function resumoSalvar() {
  const form = document.querySelector('#rsm-form');
  const ficha = resumoFichaAberta();
  if (!form || !ficha || resumoUI.salvando) return;
  if (!ficha.casoBancoId) return resumoMostrarErro('Este caso não tem registro no banco. Recarregue a página e tente de novo.');
  const bruto = {};
  RESUMO_TOPICOS.forEach((t) => { bruto[t.chave] = form.elements[t.chave].value; });
  resumoMostrarErro('');
  resumoTravar(true);
  try {
    const resposta = await fetch('/api/casos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'resumo', id: Number(ficha.casoBancoId), resumo: resumoNormalizar(bruto) }) });
    const json = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new Error((json && json.erro) || 'Não foi possível salvar o resumo.');
    const salvo = json && 'resumo' in json ? json.resumo : resumoNormalizar(bruto);
    resumoRows().forEach((r) => { if (String(r.caso_banco_id) === String(ficha.casoBancoId)) r.resumoCaso = salvo; });
    resumoUI.salvando = false;
    resumoUI.editando = false;
    resumoRenderJanela();
    // O Dossiê mostra o texto: refaz se estiver na tela.
    const ativo = document.querySelector('.panel.active-panel');
    if (ativo && ativo.id === 'dossie' && typeof renderDossie === 'function') renderDossie();
  } catch (e) {
    resumoTravar(false);
    resumoMostrarErro(e.message || 'Não foi possível salvar o resumo.');
  }
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (event) => {
    const alvo = event.target;
    if (!alvo || !alvo.closest) return;
    const abrir = alvo.closest('[data-resumo-abrir]');
    if (abrir) { event.preventDefault(); return abrirResumoCaso(abrir.dataset.resumoAbrir, false); }
    const editar = alvo.closest('[data-resumo-editar]');
    if (editar) { event.preventDefault(); return abrirResumoCaso(editar.dataset.resumoEditar, true); }
    const clube = alvo.closest('[data-resumo-clube]');
    if (clube) { event.preventDefault(); return abrirResumoClube(clube.dataset.resumoClube); }
    if (!alvo.closest('#resumo-modal')) return undefined;
    if (alvo.closest('[data-resumo-imprimir]')) return resumoImprimir();
    if (alvo.closest('[data-resumo-modo-editar]')) { resumoUI.editando = true; resumoUI.erro = ''; return resumoRenderJanela(); }
    if (alvo.closest('[data-resumo-cancelar]')) { if (resumoUI.salvando) return undefined; resumoUI.editando = false; resumoUI.erro = ''; return resumoRenderJanela(); }
    if (alvo.closest('[data-resumo-salvar]')) return resumoSalvar();
    // Fechar: o X, ou o clique no fundo (fora da janela) quando não se está editando.
    if (alvo.closest('.rsm-fechar') || (alvo.classList.contains('rsm-fundo') && !resumoUI.editando)) return fecharResumo();
    return undefined;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !resumoUI.aberto) return;
    // Esc não descarta texto digitado: na edição, só o botão Cancelar sai.
    if (resumoUI.editando) return;
    fecharResumo();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESUMO_TOPICOS, resumoNormalizar, resumoItens };
}
