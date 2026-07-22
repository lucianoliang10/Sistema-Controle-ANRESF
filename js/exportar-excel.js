// Exportação de todos os casos para Excel (.xlsx), gerada no próprio navegador.
// Reaproveita o montador de ZIP puro (js/anexos.js) para empacotar um .xlsx
// mínimo (Office Open XML), sem dependência externa. Cada caso é aberto linha
// por linha (etapa/tarefa) na MESMA ordem da tabela "Histórico do caso
// selecionado" do painel Fluxograma.

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

function montarXlsx(linhas, nomeAba = 'Dados') {
  const enc = new TextEncoder();
  const arquivo = (nome, texto) => ({ nome, dados: enc.encode(texto) });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + `</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets><sheet name="${xlsxEscape(nomeAba).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
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
    arquivo('xl/worksheets/sheet1.xml', montarPlanilhaXml(linhas)),
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
  'Data', 'Tipo', 'ID', 'Etapa', 'Responsável', 'Objeto',
  'Observação', 'Conclusão', 'Prazo', 'Status', 'Sanção', 'Turma', 'Documento',
];

function metaCaso(rows, campo, fallback) {
  const contagem = new Map();
  rows.forEach((row) => { if (row[campo]) contagem.set(row[campo], (contagem.get(row[campo]) || 0) + 1); });
  const ordenado = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0];
  return ordenado ? ordenado[0] : fallback;
}

function montarLinhasCasosExport() {
  const rowsTodas = Array.isArray(dadosFluxograma) ? dadosFluxograma : [];
  const grupos = groupBy(rowsTodas, (row) => numeroCaso(row));
  const chaves = Array.from(grupos.keys()).sort(compararCaso);

  const linhas = [EXPORT_CABECALHO.slice()];
  chaves.forEach((chave) => {
    const rows = grupos.get(chave) || [];
    const casoTitulo = `Caso ${chave}`;
    const clube = metaCaso(rows, 'clube', 'Sem clube');
    const origem = metaCaso(rows, 'origem', 'Sem origem');
    const serie = metaCaso(rows, 'serie', '—');
    const statusCaso = rows.every((r) => isFinalizada(r)) ? 'Finalizado' : 'Em andamento';

    eventosCasoParaExport(rows).forEach((ev) => {
      if (ev.tipo === 'etapa') {
        const row = ev.row;
        linhas.push([
          casoTitulo, clube, origem, serie, statusCaso,
          valor(row.dataEnvio || row.dataEtapa, ''), 'Etapa', documento(row),
          valor(row.etapa, '') + (row.ramo ? ` · Ramo ${row.ramo}` : ''),
          valor(row.responsavel, ''), valor(row.objeto, ''), valor(row.observacao, ''),
          '', valor(row.prazoFinal, ''), valor(row.statusEtapa, ''),
          valor(row.sancao, ''), valor(row.turma, ''), valor(row.doc, ''),
        ]);
      } else {
        const t = ev.tarefa;
        const concluida = typeof tarefaFinalizada === 'function' && tarefaFinalizada(t);
        linhas.push([
          casoTitulo, clube, origem, serie, statusCaso,
          valor(isoToBrDate(t.data_inicial), ''), 'Tarefa', '',
          valor(ev.etapaRow.etapa, 'etapa'), valor(t.responsavel, ''), '',
          valor(t.observacao, ''), valor(t.conclusao, ''),
          valor(isoToBrDate(t.data_final), ''),
          concluida ? 'Finalizado' : valor(t.status_tarefa, 'Pendente'),
          '', '', valor(t.anexo_url, ''),
        ]);
      }
    });
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
    const linhas = montarLinhasCasosExport();
    if (linhas.length <= 1) {
      window.alert('Não há casos para exportar.');
      return;
    }
    const bytes = montarXlsx(linhas, 'Casos');
    const hoje = new Date().toISOString().slice(0, 10);
    baixarArquivo(bytes, `casos-anresf-${hoje}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (erro) {
    console.error('Erro ao exportar casos para Excel:', erro);
    window.alert('Não foi possível gerar o Excel. Tente novamente.');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = textoOriginal; }
  }
}
