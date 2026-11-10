const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');

// Leitor de .xlsx (importação da base dos indicadores). Dois caminhos:
//   * ida e volta com o gerador do próprio projeto (ZIP sem compressão, textos
//     embutidos na célula);
//   * um .xlsx montado aqui como o Excel grava: compactado (deflate), com
//     textos compartilhados, números, células vazias e caracteres escapados.
const { lerXlsx, lerPlanilhaConsolidada, xlsxColunaDe } = require('../js/xlsx-leitor.js');

const gerador = { console, TextEncoder, Uint8Array };
vm.createContext(gerador);
vm.runInContext(fs.readFileSync('js/anexos.js', 'utf8').split('// --- Preparação e envio')[0], gerador);
vm.runInContext(fs.readFileSync('js/exportar-excel.js', 'utf8').split('// Reproduz a ordenação')[0], gerador);

// ZIP mínimo com entradas compactadas (método 8). O leitor não confere CRC.
function zipCompactado(arquivos) {
  const locais = []; const central = []; let offset = 0;
  arquivos.forEach(([nome, conteudo]) => {
    const nomeBytes = Buffer.from(nome, 'utf8');
    const bruto = Buffer.from(conteudo, 'utf8');
    const dados = zlib.deflateRawSync(bruto);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(bruto.length, 22); local.writeUInt16LE(nomeBytes.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014B50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(dados.length, 20); cd.writeUInt32LE(bruto.length, 24); cd.writeUInt16LE(nomeBytes.length, 28); cd.writeUInt32LE(offset, 42);
    locais.push(local, nomeBytes, dados); central.push(cd, nomeBytes);
    offset += 30 + nomeBytes.length + dados.length;
  });
  const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054B50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamanhoCentral, 12); fim.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locais, ...central, fim]));
}

function xlsxComoExcel(abas, textos) {
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return zipCompactado([
    ['xl/workbook.xml', `${cab}<workbook xmlns:r="x"><sheets>${abas.map((a, i) => `<sheet name="${escapar(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${cab}<Relationships>${abas.map((a, i) => `<Relationship Id="rId${i + 1}" Type="t" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
    ['xl/sharedStrings.xml', `${cab}<sst>${textos.map((t) => (Array.isArray(t) ? `<si>${t.map((p) => `<r><t xml:space="preserve">${escapar(p)}</t></r>`).join('')}</si>` : `<si><t>${escapar(t)}</t></si>`)).join('')}</sst>`],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, `${cab}<worksheet><sheetData>${a.xml}</sheetData></worksheet>`]),
  ]);
}

test('letra da coluna vira índice', () => {
  assert.equal(xlsxColunaDe('A1'), 0);
  assert.equal(xlsxColunaDe('H21841'), 7);
  assert.equal(xlsxColunaDe('AB3'), 27);
});

test('ida e volta com o gerador do projeto: várias abas, textos com caracteres especiais', async () => {
  const bytes = gerador.montarXlsx([
    { nome: 'Primeira', linhas: [['Clube', 'Valor'], ['Grêmio & "Cia" <SAF>', '10'], ['', 'x']] },
    { nome: 'Segunda', linhas: [['a'], ['b']] },
  ]);
  const { abas, linhas } = await lerXlsx(bytes);
  assert.deepEqual(abas, ['Primeira', 'Segunda']);
  assert.deepEqual(linhas.Primeira, [['Clube', 'Valor'], ['Grêmio & "Cia" <SAF>', '10'], [null, 'x']]);
  assert.deepEqual(linhas.Segunda, [['a'], ['b']]);
  const soUma = await lerXlsx(bytes, ['Segunda']);
  assert.deepEqual(Object.keys(soUma.linhas), ['Segunda']);
});

test('arquivo como o Excel grava: compactado, textos compartilhados, números e vazios', async () => {
  const textos = ['Exercício Ano', 'Clube Informante', 'Série', 'Centro de Custo', 'Descrição', 'Valor', 'Classificação', 'Subclassificação',
    'Clube & Cia', 'A', 'Futebol Profissional', ['Mídias digitais e serviços ', '"on demand"'], 'Receitas', 'Mídia', 'Bilheteria'];
  const c = (ref, valor, tipo) => (valor === null ? `<c r="${ref}"/>` : `<c r="${ref}"${tipo ? ` t="${tipo}"` : ''}><v>${valor}</v></c>`);
  const xml = `<row r="1">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => c(`${'ABCDEFGH'[i]}1`, i, 's')).join('')}</row>`
    + `<row r="2">${c('A2', 2025)}${c('B2', 8, 's')}${c('C2', 9, 's')}${c('D2', 10, 's')}${c('E2', 11, 's')}${c('F2', '1234.5')}${c('G2', 12, 's')}${c('H2', 13, 's')}</row>`
    + `<row r="3">${c('A3', 2025)}${c('B3', 8, 's')}${c('C3', 9, 's')}${c('D3', 10, 's')}${c('E3', 14, 's')}${c('F3', null)}${c('G3', 12, 's')}${c('H3', 13, 's')}</row>`
    + `<row r="5">${c('A5', 2024)}${c('B5', 8, 's')}<c r="E5" t="s"><v>14</v></c><c r="F5"><f>1+1</f><v>-7</v></c></row>`;
  const bytes = xlsxComoExcel([{ nome: 'DRE_Consolidado', xml }, { nome: 'Outra', xml: '<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>' }], textos);
  const { linhas, resumo } = await lerPlanilhaConsolidada(bytes);
  assert.deepEqual(resumo.porDemonstracao, { BP: 0, DRE: 3, DMPL: 0, DFC: 0 });
  assert.deepEqual(resumo.abasAusentes, ['BP_Consolidado', 'DMPL_Consolidado', 'DFC_Consolidado']);
  assert.deepEqual(resumo.clubes, ['Clube & Cia']);
  assert.deepEqual(resumo.anos, [2024, 2025]);
  assert.deepEqual(linhas[0], { dem: 'DRE', ano: 2025, clube: 'Clube & Cia', serie: 'A', centro: 'Futebol Profissional', descricao: 'Mídias digitais e serviços "on demand"', classificacao: 'Receitas', subclassificacao: 'Mídia', valor: 1234.5, ordem: 1 });
  assert.equal(linhas[1].valor, null, 'célula vazia = não informado');
  assert.equal(linhas[1].ordem, 2);
  assert.deepEqual([linhas[2].ano, linhas[2].valor, linhas[2].ordem, linhas[2].centro], [2024, -7, 1, ''], 'linha em branco pulada; vale o valor guardado da fórmula');
});

test('mensagens de erro: não é xlsx, sem as abas consolidadas, sem coluna obrigatória', async () => {
  await assert.rejects(() => lerXlsx(new Uint8Array([1, 2, 3])), /não é um \.xlsx válido/);
  const semAbas = gerador.montarXlsx([{ nome: 'Planilha1', linhas: [['a']] }]);
  await assert.rejects(() => lerPlanilhaConsolidada(semAbas), /Não encontrei as abas da base consolidada.*Planilha1/);
  const semColuna = gerador.montarXlsx([{ nome: 'BP_Consolidado', linhas: [['Exercício Ano', 'Clube Informante', 'Descrição'], ['2025', 'X', 'Caixa']] }]);
  await assert.rejects(() => lerPlanilhaConsolidada(semColuna), /não tem a coluna "valor"/);
});
