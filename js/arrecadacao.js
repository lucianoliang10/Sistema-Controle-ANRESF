// Arrecadação: valores que os procedimentos geram para a Agência.
//
// Três tipos de etapa carregam esse dado (o tipo sai do NOME da etapa):
//   * "Plano de Recuperação e Sustentabilidade (PRS)" → taxa do PRS;
//   * "Admissão de Recurso"                           → preparo do recurso;
//   * "Ordem de Cumprimento"                          → medidas aplicadas pelo
//     descumprimento: multa em reais (com o quanto já foi pago), transferban,
//     dedução de pontos e exclusão do PARF-B.
//
// O dado fica na coluna `arrecadacao` (jsonb) da etapa:
//   taxa/preparo → { valor }
//   cumprimento  → { multa, multaPaga, transferban, pontos, parfb }
// Só dinheiro que ENTROU conta como arrecadado: a taxa, o preparo e a parte
// paga da multa. Multa aplicada e ainda não paga aparece como "a receber".

const ARR_TIPOS = {
  prs: { rotulo: 'Taxa do PRS', campo: 'Valor arrecadado com a taxa do PRS', ajuda: 'Taxa recolhida pelo clube para o Plano de Recuperação e Sustentabilidade.' },
  recurso: { rotulo: 'Preparo de recurso', campo: 'Valor arrecadado com o preparo', ajuda: 'Preparo recolhido pelo clube para a admissão do recurso.' },
  cumprimento: { rotulo: 'Ordem de cumprimento', campo: '', ajuda: 'Marque o que foi aplicado ao clube pelo descumprimento. Dá para marcar mais de uma medida.' },
};
const ARR_ORDEM_TIPOS = ['prs', 'recurso', 'cumprimento'];

function arrNorm(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Tipo de arrecadação de uma etapa, pelo nome. '' = a etapa não arrecada.
function arrTipoEtapa(nomeEtapa) {
  const n = arrNorm(nomeEtapa);
  if (!n) return '';
  if (n.includes('ordem') && n.includes('cumprimento')) return 'cumprimento';
  if (n.includes('admiss') && n.includes('recurs')) return 'recurso';
  if ((n.includes('recuperacao') && n.includes('sustentabilidade')) || n.split(' ').includes('prs')) return 'prs';
  return '';
}

// "20.000,00", "R$ 20000", "20000,5" -> número; vazio ou inválido -> null.
function arrLerValor(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) && texto >= 0 ? texto : null;
  let t = String(texto === null || texto === undefined ? '' : texto).replace(/\s|R\$/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function arrFormatar(valor) {
  const n = Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Para preencher um campo de texto: "20.000,00" (sem o R$).
function arrParaCampo(valor) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Limpa o que veio do formulário ou do banco. Devolve null quando não há nada
// informado (a etapa fica "sem valor informado").
function arrNormalizar(tipo, bruto) {
  if (!ARR_TIPOS[tipo] || !bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  if (tipo !== 'cumprimento') {
    const valor = arrLerValor(bruto.valor);
    return valor === null ? null : { valor };
  }
  const multa = arrLerValor(bruto.multa);
  const pontos = Number.isFinite(Number(bruto.pontos)) && Number(bruto.pontos) > 0 ? Math.round(Number(bruto.pontos)) : null;
  const saida = {};
  if (multa !== null && multa > 0) {
    saida.multa = multa;
    // O pago nunca passa do valor da multa.
    saida.multaPaga = Math.min(arrLerValor(bruto.multaPaga) || 0, multa);
  }
  if (bruto.transferban) saida.transferban = true;
  if (pontos) saida.pontos = pontos;
  if (bruto.parfb) saida.parfb = true;
  return Object.keys(saida).length ? saida : null;
}

function arrDaLinha(row) {
  return arrNormalizar(arrTipoEtapa(row && row.etapa), row && row.arrecadacao);
}

// Medidas de uma ordem de cumprimento, em texto curto.
function arrMedidas(dado) {
  if (!dado) return [];
  const m = [];
  if (dado.multa) m.push(`Multa de ${arrFormatar(dado.multa)}`);
  if (dado.transferban) m.push('Transferban');
  if (dado.pontos) m.push(`Dedução de ${dado.pontos} ${dado.pontos === 1 ? 'ponto' : 'pontos'}`);
  if (dado.parfb) m.push('Exclusão do PARF-B');
  return m;
}

function arrMsData(row) {
  const t = String((row && (row.dataEnvio || row.dataEtapa)) || '').trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const d = br ? new Date(+br[3], +br[2] - 1, +br[1]) : (t ? new Date(t) : null);
  return d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

// Recurso NÃO admitido: quando a "Admissão de Recurso" é a ÚLTIMA etapa de um
// caso finalizado, o recurso foi recusado e o caso parou ali. Não há preparo a
// arrecadar. Devolve os ids (etapa_banco_id) dessas etapas.
// Caso em andamento não entra: a decisão sobre o recurso ainda pode vir.
const ARR_NAO_ADMITIDO = 'Recurso não admitido';
function arrRecursosNaoAdmitidos(rows) {
  const casos = new Map(); // caso -> { finalizado, ultima }
  (Array.isArray(rows) ? rows : []).forEach((row, posicao) => {
    if (!row || !row.etapa_banco_id) return;
    const chave = String(row.caso_banco_id || row.caso_id || row.casoRaiz || row.numero_caso || '');
    if (!chave) return;
    if (!casos.has(chave)) casos.set(chave, { finalizado: false, ultima: null });
    const caso = casos.get(chave);
    if (arrNorm(row.statusCaso).includes('finalizado')) caso.finalizado = true;
    const atual = { row, ordem: Number(row.ordem) || 0, data: arrMsData(row), posicao };
    const u = caso.ultima;
    if (!u || atual.ordem > u.ordem || (atual.ordem === u.ordem && (atual.data > u.data || (atual.data === u.data && posicao > u.posicao)))) caso.ultima = atual;
  });
  const ids = new Set();
  casos.forEach((caso) => {
    if (caso.finalizado && caso.ultima && arrTipoEtapa(caso.ultima.row.etapa) === 'recurso') ids.add(String(caso.ultima.row.etapa_banco_id));
  });
  return ids;
}

// Um lançamento por etapa que arrecada. `arrecadado` é o dinheiro que entrou;
// `aReceber` é multa aplicada e ainda não paga; `semValor` é etapa em que
// ninguém informou nada ainda.
function arrLancamentos(rows) {
  const naoAdmitidos = arrRecursosNaoAdmitidos(rows);
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const tipo = arrTipoEtapa(row && row.etapa);
    if (!tipo || !row.etapa_banco_id) return null;
    const dado = arrNormalizar(tipo, row.arrecadacao);
    const multa = dado && dado.multa ? dado.multa : 0;
    const naoAdmitido = tipo === 'recurso' && naoAdmitidos.has(String(row.etapa_banco_id));
    const arrecadado = !dado ? 0 : (tipo === 'cumprimento' ? (dado.multaPaga || 0) : dado.valor);
    return {
      // naoAdmitido: recurso recusado, sem preparo a cobrar (não é pendência).
      row, tipo, dado, naoAdmitido, semValor: !dado && !naoAdmitido, arrecadado, multa, aReceber: tipo === 'cumprimento' ? Math.max(multa - arrecadado, 0) : 0,
      caso: String(row.casoRaiz || row.numero_caso || row.caso_banco_id || ''), clube: row.clube || 'Sem clube',
      etapa: row.etapa, data: arrMsData(row), medidas: tipo === 'cumprimento' ? arrMedidas(dado) : [],
    };
  }).filter(Boolean);
}

function arrMesChave(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function arrResumo(lancamentos) {
  const porTipo = {};
  ARR_ORDEM_TIPOS.forEach((t) => { porTipo[t] = { etapas: 0, informadas: 0, arrecadado: 0, semValor: 0, naoAdmitidos: 0 }; });
  const meses = new Map();
  const medidas = { ordens: 0, multas: 0, multaAplicada: 0, multaPaga: 0, transferban: 0, pontos: 0, parfb: 0 };
  let total = 0; let aReceber = 0; let semValor = 0;
  lancamentos.forEach((l) => {
    const p = porTipo[l.tipo];
    p.etapas += 1;
    if (l.naoAdmitido) p.naoAdmitidos += 1;
    if (!l.dado) { if (l.semValor) { semValor += 1; p.semValor += 1; } return; }
    p.informadas += 1; p.arrecadado += l.arrecadado;
    total += l.arrecadado; aReceber += l.aReceber;
    if (l.arrecadado > 0) {
      const k = arrMesChave(l.data) || 'sem-data';
      if (!meses.has(k)) meses.set(k, { chave: k, total: 0, prs: 0, recurso: 0, cumprimento: 0 });
      meses.get(k).total += l.arrecadado; meses.get(k)[l.tipo] += l.arrecadado;
    }
    if (l.tipo === 'cumprimento') {
      medidas.ordens += 1;
      if (l.dado.multa) { medidas.multas += 1; medidas.multaAplicada += l.dado.multa; medidas.multaPaga += l.dado.multaPaga || 0; }
      if (l.dado.transferban) medidas.transferban += 1;
      if (l.dado.pontos) medidas.pontos += l.dado.pontos;
      if (l.dado.parfb) medidas.parfb += 1;
    }
  });
  const porMes = Array.from(meses.values()).sort((a, b) => (a.chave === 'sem-data') - (b.chave === 'sem-data') || a.chave.localeCompare(b.chave));
  return { total, aReceber, semValor, porTipo, porMes, medidas, lancamentos: lancamentos.length };
}

// ---------- bloco do formulário de etapa ----------
// Fica nos formulários de nova etapa e de edição (Fluxograma) e na janela de
// lançamento do painel Arrecadação. Aparece só nas etapas que arrecadam.

function arrBlocoHtml() {
  return `
          <fieldset class="full arr-bloco" data-arr-bloco hidden>
            <legend data-arr-titulo>Arrecadação</legend>
            <p class="arr-ajuda" data-arr-ajuda></p>
            <div class="arr-campos" data-arr-campos></div>
            <p class="arr-resumo" data-arr-resumo hidden></p>
          </fieldset>`;
}

function arrEsc(v) {
  return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function arrCamposHtml(tipo, dado) {
  const d = dado || {};
  if (tipo !== 'cumprimento') {
    return `<label class="arr-campo"><span>${arrEsc(ARR_TIPOS[tipo].campo)} (R$)</span><input type="text" inputmode="decimal" autocomplete="off" data-arr="valor" value="${arrEsc(arrParaCampo(d.valor))}" placeholder="Ex.: 20.000,00"></label>`;
  }
  const medida = (chave, rotulo, marcado, detalhe = '') => `<div class="arr-medida${marcado ? ' ativa' : ''}" data-arr-medida="${chave}">
      <label class="arr-chave"><input type="checkbox" data-arr-marca="${chave}"${marcado ? ' checked' : ''}><span>${rotulo}</span></label>
      ${detalhe ? `<div class="arr-detalhe"${marcado ? '' : ' hidden'}>${detalhe}</div>` : ''}
    </div>`;
  const multa = `<label class="arr-campo"><span>Valor da multa (R$)</span><input type="text" inputmode="decimal" autocomplete="off" data-arr="multa" value="${arrEsc(arrParaCampo(d.multa))}" placeholder="Ex.: 100.000,00"></label>
      <label class="arr-campo"><span>Quanto já foi pago (R$)</span><input type="text" inputmode="decimal" autocomplete="off" data-arr="multaPaga" value="${arrEsc(d.multa ? arrParaCampo(d.multaPaga || 0) : '')}" placeholder="0,00 se ainda não pagou"></label>
      <button type="button" class="arr-mini" data-arr-pago-total>Pago integralmente</button>`;
  const pontos = `<label class="arr-campo"><span>Pontos deduzidos</span><input type="number" min="1" step="1" data-arr="pontos" value="${arrEsc(d.pontos || '')}" placeholder="Ex.: 3"></label>`;
  return `<div class="arr-medidas">
      ${medida('multa', 'Multa em reais', Boolean(d.multa), multa)}
      ${medida('transferban', 'Transferban', Boolean(d.transferban))}
      ${medida('pontos', 'Dedução de pontos', Boolean(d.pontos), pontos)}
      ${medida('parfb', 'Exclusão do PARF-B', Boolean(d.parfb))}
    </div>`;
}

// Lê o bloco. Devolve null quando a etapa não arrecada ou nada foi informado.
function lerBlocoArrecadacao(raiz) {
  const bloco = raiz && raiz.querySelector ? raiz.querySelector('[data-arr-bloco]') : null;
  const tipo = bloco ? bloco.dataset.arrTipo || '' : '';
  if (!bloco || !tipo) return null;
  const campo = (nome) => { const el = bloco.querySelector(`[data-arr="${nome}"]`); return el ? el.value : ''; };
  const marcado = (nome) => { const el = bloco.querySelector(`[data-arr-marca="${nome}"]`); return Boolean(el && el.checked); };
  if (tipo !== 'cumprimento') return arrNormalizar(tipo, { valor: campo('valor') });
  return arrNormalizar(tipo, {
    multa: marcado('multa') ? campo('multa') : null, multaPaga: marcado('multa') ? campo('multaPaga') : null,
    transferban: marcado('transferban'), pontos: marcado('pontos') ? campo('pontos') : null, parfb: marcado('parfb'),
  });
}

// Valor digitado que o sistema não entende (para avisar antes de gravar).
function arrErroDoBloco(raiz) {
  const bloco = raiz && raiz.querySelector ? raiz.querySelector('[data-arr-bloco]') : null;
  if (!bloco || !bloco.dataset.arrTipo) return '';
  const ruim = Array.from(bloco.querySelectorAll('input[type="text"][data-arr]')).find((el) => !el.closest('[hidden]') && el.value.trim() && arrLerValor(el.value) === null);
  if (ruim) return 'Valor não reconhecido na arrecadação. Use só números, como 20.000,00.';
  const multaMarcada = bloco.querySelector('[data-arr-marca="multa"]');
  if (multaMarcada && multaMarcada.checked && !arrLerValor(bloco.querySelector('[data-arr="multa"]').value)) return 'Informe o valor da multa, ou desmarque "Multa em reais".';
  const pontosMarcado = bloco.querySelector('[data-arr-marca="pontos"]');
  if (pontosMarcado && pontosMarcado.checked && !(Number(bloco.querySelector('[data-arr="pontos"]').value) > 0)) return 'Informe quantos pontos foram deduzidos, ou desmarque "Dedução de pontos".';
  return '';
}

function atualizarResumoArrecadacao(raiz) {
  const bloco = raiz && raiz.querySelector ? raiz.querySelector('[data-arr-bloco]') : null;
  const resumo = bloco ? bloco.querySelector('[data-arr-resumo]') : null;
  if (!bloco || !resumo) return;
  const tipo = bloco.dataset.arrTipo || '';
  const dado = lerBlocoArrecadacao(raiz);
  let texto = '';
  if (tipo && dado) {
    if (tipo !== 'cumprimento') texto = `Arrecadado: ${arrFormatar(dado.valor)}`;
    else {
      const pago = dado.multa ? ` · pago ${arrFormatar(dado.multaPaga || 0)}${dado.multa > (dado.multaPaga || 0) ? `, a receber ${arrFormatar(dado.multa - (dado.multaPaga || 0))}` : ''}` : '';
      texto = `${arrMedidas(dado).join(' + ')}${pago}`;
    }
  }
  resumo.textContent = texto;
  resumo.hidden = !texto;
}

// Mostra/esconde e monta o bloco conforme o nome da etapa. `dado` (opcional)
// preenche os campos; sem ele, os campos só são refeitos se o tipo mudou.
// `naoAdmitido` (opcional) avisa que o recurso foi recusado; fica guardado no
// bloco até ser informado de novo.
function atualizarBlocoArrecadacao(raiz, nomeEtapa, dado, naoAdmitido) {
  const bloco = raiz && raiz.querySelector ? raiz.querySelector('[data-arr-bloco]') : null;
  if (!bloco) return;
  const tipo = arrTipoEtapa(nomeEtapa);
  const mudou = bloco.dataset.arrTipo !== tipo;
  bloco.dataset.arrTipo = tipo;
  bloco.hidden = !tipo;
  if (!tipo) { bloco.querySelector('[data-arr-campos]').innerHTML = ''; return; }
  bloco.querySelector('[data-arr-titulo]').textContent = `Arrecadação · ${ARR_TIPOS[tipo].rotulo}`;
  if (naoAdmitido !== undefined) bloco.dataset.arrNaoAdmitido = naoAdmitido ? '1' : '';
  const recusado = tipo === 'recurso' && bloco.dataset.arrNaoAdmitido === '1';
  bloco.classList.toggle('arr-recusado', recusado);
  bloco.querySelector('[data-arr-ajuda]').textContent = recusado
    ? 'O caso foi finalizado nesta etapa: o recurso não foi admitido, então não há preparo a arrecadar. Deixe o valor em branco.'
    : ARR_TIPOS[tipo].ajuda;
  if (dado !== undefined || mudou) bloco.querySelector('[data-arr-campos]').innerHTML = arrCamposHtml(tipo, arrNormalizar(tipo, dado));
  atualizarResumoArrecadacao(raiz);
}

// Liga os eventos do bloco. `nomeDaEtapa` devolve o nome atual (no formulário
// de etapa ele vem do campo "nome_etapa"). Idempotente.
function ligarBlocoArrecadacao(raiz, nomeDaEtapa) {
  if (!raiz || raiz.dataset.arrLigado) return;
  raiz.dataset.arrLigado = '1';
  raiz.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.name === 'nome_etapa' && nomeDaEtapa) atualizarBlocoArrecadacao(raiz, nomeDaEtapa());
    if (t && t.dataset && 'arr' in t.dataset) atualizarResumoArrecadacao(raiz);
  });
  raiz.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.name === 'nome_etapa' && nomeDaEtapa) atualizarBlocoArrecadacao(raiz, nomeDaEtapa());
    if (!t || !t.dataset || !('arrMarca' in t.dataset)) return;
    const medida = t.closest('[data-arr-medida]');
    if (medida) {
      medida.classList.toggle('ativa', t.checked);
      const detalhe = medida.querySelector('.arr-detalhe');
      if (detalhe) { detalhe.hidden = !t.checked; if (t.checked) { const campo = detalhe.querySelector('input'); if (campo) campo.focus(); } }
    }
    atualizarResumoArrecadacao(raiz);
  });
  raiz.addEventListener('click', (e) => {
    const botao = e.target && e.target.closest ? e.target.closest('[data-arr-pago-total]') : null;
    if (!botao) return;
    e.preventDefault();
    const bloco = botao.closest('[data-arr-bloco]');
    const multa = arrLerValor(bloco.querySelector('[data-arr="multa"]').value);
    if (multa !== null) bloco.querySelector('[data-arr="multaPaga"]').value = arrParaCampo(multa);
    atualizarResumoArrecadacao(raiz);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ARR_TIPOS, ARR_ORDEM_TIPOS, arrTipoEtapa, arrLerValor, arrFormatar, arrParaCampo, arrNormalizar, arrDaLinha, arrMedidas, arrRecursosNaoAdmitidos, arrLancamentos, arrResumo, arrMesChave, arrCamposHtml };
}
