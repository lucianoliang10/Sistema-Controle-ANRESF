// Exportação dos casos do painel Processos para Excel (.xlsx), gerada no
// próprio navegador. Reaproveita o montador de ZIP puro (js/anexos.js) para
// empacotar um .xlsx mínimo (Office Open XML), sem dependência externa.
//
// O arquivo sai com duas abas e respeita os filtros ativos na tela (busca,
// filtro rápido, tipo de caso e ordenação):
//   1. "Etapas e tarefas" — cada caso aberto linha por linha, na MESMA ordem da
//      tabela "Histórico do caso selecionado" do painel Fluxograma;
//   2. "Por caso" — uma linha por caso, com as colunas da tabela de Processos.

function xlsxColLetra(indice) {
  let n = indice;
  let letra = '';
  while (n >= 0) {
    letra = String.fromCharCode((n % 26) + 65) + letra;
    n = Math.floor(n / 26) - 1;
  }
  return letra;
}

function xlsxEscape(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// linhas: array de arrays de strings (linha 0 = cabeçalho).
function montarPlanilhaXml(linhas) {
  const partes = linhas.map((celulas, i) => {
    const r = i + 1;
    const estilo = i === 0 ? ' s="1"' : '';
    const cols = celulas.map((valorCelula, c) => {
      const ref = `${xlsxColLetra(c)}${r}`;
      const texto = valorCelula === null || valorCelula === undefined ? '' : String(valorCelula);
      if (texto === '') return `<c r="${ref}"${estilo}/>`;
      return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(texto)}</t></is></c>`;
    }).join('');
    return `<row r="${r}">${cols}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${partes}</sheetData></worksheet>`;
}

// Excel limita o nome da aba a 31 caracteres e proíbe : \ / ? * [ ].
function xlsxNomeAba(nome, indice) {
  const limpo = String(nome || '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return limpo || `Planilha${indice + 1}`;
}

// Aceita uma aba só — montarXlsx(linhas, 'Nome'), forma usada pelos painéis
// Sanções e Julgamentos — ou várias: montarXlsx([{ nome, linhas }, ...]).
// linhas: array de arrays de strings (linha 0 = cabeçalho).
function montarXlsx(abasOuLinhas, nomeAba = 'Dados') {
  const lista = Array.isArray(abasOuLinhas) ? abasOuLinhas : [];
  const ehListaDeAbas = lista.length > 0 && lista.every((item) => item && !Array.isArray(item) && Array.isArray(item.linhas));
  const abas = (ehListaDeAbas ? lista : [{ nome: nomeAba, linhas: lista }])
    .map((aba, i) => ({ nome: xlsxNomeAba(aba.nome, i), linhas: aba.linhas, arquivo: `sheet${i + 1}.xml` }));

  const enc = new TextEncoder();
  const arquivo = (nome, texto) => ({ nome, dados: enc.encode(texto) });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + abas.map((aba) => `<Override PartName="/xl/worksheets/${aba.arquivo}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + `</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  // rId1..rIdN são as abas; o styles.xml vem logo depois.
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>${abas.map((aba, i) => `<sheet name="${xlsxEscape(aba.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + abas.map((aba, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${aba.arquivo}"/>`).join('')
    + `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>`
    + `<borders count="1"><border/></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
    + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `</styleSheet>`;

  const entradas = [
    arquivo('[Content_Types].xml', contentTypes),
    arquivo('_rels/.rels', rels),
    arquivo('xl/workbook.xml', workbook),
    arquivo('xl/_rels/workbook.xml.rels', workbookRels),
    arquivo('xl/styles.xml', styles),
    ...abas.map((aba) => arquivo(`xl/worksheets/${aba.arquivo}`, montarPlanilhaXml(aba.linhas))),
  ];
  return montarZip(entradas); // Uint8Array do .xlsx
}

// Reproduz a ordenação de eventosDoHistorico, porém SEM aplicar filtros da tela.
function eventosCasoParaExport(rows) {
  const eventos = [];
  rows.forEach((row) => {
    const etapaMs = dataOrdenavel(row.dataEnvio || row.dataEtapa) || Number.MAX_SAFE_INTEGER;
    eventos.push({ tipo: 'etapa', ms: etapaMs, etapaRow: row, row });
    const tarefas = typeof tarefasDaEtapa === 'function' ? tarefasDaEtapa(row.etapa_banco_id) : [];
    tarefas.forEach((tarefa) => {
      const dataTarefaBr = isoToBrDate(tarefa.data_inicial) || isoToBrDate(tarefa.data_final);
      const tarefaMs = dataOrdenavel(dataTarefaBr) || Number.MAX_SAFE_INTEGER;
      eventos.push({ tipo: 'tarefa', ms: tarefaMs, tarefa, etapaRow: row });
    });
  });
  return eventos.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms;
    if (a.etapaRow !== b.etapaRow) {
      return (ordemNumero(a.etapaRow) - ordemNumero(b.etapaRow))
        || (Number(a.etapaRow.etapa_banco_id || 0) - Number(b.etapaRow.etapa_banco_id || 0));
    }
    if (a.tipo !== b.tipo) return a.tipo === 'etapa' ? -1 : 1;
    return Number(a.tarefa?.id || 0) - Number(b.tarefa?.id || 0);
  });
}

const EXPORT_CABECALHO = [
  'Caso', 'Clube', 'Origem', 'Série', 'Status do caso',
  'Data', 'Prazo', 'Tipo', 'ID', 'Etapa', 'Responsável', 'Objeto',
  'Observação', 'Conclusão', 'Status', 'Sanção', 'Turma', 'Documento',
];

function metaCaso(rows, campo, fallback) {
  const contagem = new Map();
  rows.forEach((row) => { if (row[campo]) contagem.set(row[campo], (contagem.get(row[campo]) || 0) + 1); });
  const ordenado = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0];
  return ordenado ? ordenado[0] : fallback;
}

// Os casos como o painel Processos os vê: já filtrados e na ordem da tabela.
// Fora do painel (sem macro.js carregado) cai para todos os casos, em ordem
// numérica, com o status derivado das etapas.
function casosParaExport() {
  if (typeof macroComputeCaseMetrics === 'function' && typeof macroCasosFiltrados === 'function') {
    return macroCasosFiltrados(macroComputeCaseMetrics());
  }
  const rowsTodas = Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  return Array.from(groupBy(rowsTodas, (row) => numeroCaso(row)).entries())
    .sort((a, b) => compararCaso(a[0], b[0]))
    .map(([caso, rows]) => ({
      caso,
      titulo: `Caso ${caso}`,
      clube: metaCaso(rows, 'clube', 'Sem clube'),
      origem: metaCaso(rows, 'origem', 'Sem origem'),
      serie: metaCaso(rows, 'serie', '—'),
      status: rows.every((r) => isFinalizada(r)) ? 'Finalizado' : 'Em andamento',
    }));
}

// Algum filtro do painel Processos está ativo? (a ordenação não conta: ela
// não tira caso nenhum do arquivo)
function exportTemFiltroAtivo() {
  const busca = typeof macroBusca === 'string' ? macroBusca.trim() : '';
  const filtro = typeof macroFiltro === 'string' ? macroFiltro : 'todos';
  const tipo = typeof macroTipoCaso === 'string' ? macroTipoCaso : 'todos';
  return busca !== '' || filtro !== 'todos' || tipo !== 'todos';
}

// Aba 1: uma linha por etapa/tarefa, agrupadas por caso. `casos` são os
// resumos de casosParaExport(), na ordem em que devem sair.
function montarLinhasCasosExport(casos = casosParaExport()) {
  const rowsTodas = Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  const grupos = groupBy(rowsTodas, (row) => numeroCaso(row));

  const linhas = [EXPORT_CABECALHO.slice()];
  casos.forEach((resumo) => {
    const rows = grupos.get(String(resumo.caso)) || [];
    const casoTitulo = resumo.titulo || `Caso ${resumo.caso}`;
    const clube = valor(resumo.clube, metaCaso(rows, 'clube', 'Sem clube'));
    const origem = valor(resumo.origem, metaCaso(rows, 'origem', 'Sem origem'));
    const serie = valor(resumo.serie, metaCaso(rows, 'serie', '—'));
    // Mesmo status que a tabela de Processos mostra para o caso.
    const statusCaso = valor(resumo.status, rows.every((r) => isFinalizada(r)) ? 'Finalizado' : 'Em andamento');

    eventosCasoParaExport(rows).forEach((ev) => {
      if (ev.tipo === 'etapa') {
        const row = ev.row;
        // Colunas: Caso, Clube, Origem, Série, Status do caso, Data, Prazo,
        // Tipo, ID, Etapa, Responsável, Objeto, Observação, Conclusão, Status,
        // Sanção, Turma, Documento.
        linhas.push([
          casoTitulo, clube, origem, serie, statusCaso,
          valor(row.dataEnvio || row.dataEtapa, ''), valor(row.prazoFinal, ''),
          'Etapa', documento(row),
          valor(row.etapa, '') + (row.ramo ? ` · Ramo ${row.ramo}` : ''),
          valor(row.responsavel, ''), valor(row.objeto, ''), valor(row.observacao, ''),
          '', valor(row.statusEtapa, ''),
          valor(row.sancao, ''), valor(row.turma, ''), valor(row.doc, ''),
        ]);
      } else {
        const t = ev.tarefa;
        const concluida = typeof tarefaFinalizada === 'function' && tarefaFinalizada(t);
        // Para TAREFAS: a observação da tarefa vira "Objeto" e a conclusão da
        // tarefa vira "Observação" (a coluna Conclusão fica vazia).
        linhas.push([
          casoTitulo, clube, origem, serie, statusCaso,
          valor(isoToBrDate(t.data_inicial), ''), valor(isoToBrDate(t.data_final), ''),
          'Tarefa', '',
          valor(ev.etapaRow.etapa, 'etapa'), valor(t.responsavel, ''),
          valor(t.observacao, ''), valor(t.conclusao, ''),
          '',
          concluida ? 'Finalizado' : valor(t.status_tarefa, 'Pendente'),
          '', '', valor(t.anexo_url, ''),
        ]);
      }
    });
  });
  return linhas;
}

// Aba 2: uma linha por caso — as colunas da tabela de Processos, mais a data
// inicial e o próximo prazo, que a tabela usa para ordenar mas não exibe.
const EXPORT_CABECALHO_RESUMO = [
  'Caso', 'Clube', 'Série', 'Origem', 'Status do caso', 'Etapa atual',
  'Pendência', 'Data inicial', 'Próximo prazo', 'Sanção decidida', 'Observação',
];

// Na tela o traço "—" marca campo vazio; no Excel fica em branco mesmo.
function exportCelula(texto) {
  const s = texto === null || texto === undefined ? '' : String(texto);
  return s === '—' ? '' : s;
}

function montarLinhasResumoCasosExport(casos = casosParaExport()) {
  const linhas = [EXPORT_CABECALHO_RESUMO.slice()];
  casos.forEach((c) => {
    linhas.push([
      c.titulo || `Caso ${c.caso}`, c.clube, c.serie, c.origem, c.status, c.etapaAtual,
      c.pendencia, c.dataInicial, c.proximoPrazo, c.sancao, c.observacaoCaso,
    ].map(exportCelula));
  });
  return linhas;
}

function baixarArquivo(bytes, nomeArquivo, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportarCasosExcel(botao) {
  const textoOriginal = botao ? botao.textContent : '';
  if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
  try {
    if (typeof carregarDadosMacroSeNecessario === 'function') await carregarDadosMacroSeNecessario();
    if (typeof garantirDadosTarefasCarregados === 'function') await garantirDadosTarefasCarregados();
    const filtrado = exportTemFiltroAtivo();
    const casos = casosParaExport();
    if (casos.length === 0) {
      window.alert(filtrado ? 'Nenhum caso atende aos filtros da tela. Limpe os filtros ou ajuste-os antes de exportar.' : 'Não há casos para exportar.');
      return;
    }
    const bytes = montarXlsx([
      { nome: 'Etapas e tarefas', linhas: montarLinhasCasosExport(casos) },
      { nome: 'Por caso', linhas: montarLinhasResumoCasosExport(casos) },
    ]);
    const hoje = new Date().toISOString().slice(0, 10);
    // O nome avisa quando o arquivo não tem todos os casos.
    const nome = `casos-anresf${filtrado ? '-filtrado' : ''}-${hoje}.xlsx`;
    baixarArquivo(bytes, nome, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (erro) {
    console.error('Erro ao exportar casos para Excel:', erro);
    window.alert('Não foi possível gerar o Excel. Tente novamente.');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = textoOriginal; }
  }
}
