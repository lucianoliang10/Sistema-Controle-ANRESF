// Leitor mínimo de .xlsx, no próprio navegador e sem biblioteca externa. Par do
// gerador de js/exportar-excel.js. Serve para importar a planilha consolidada
// das demonstrações financeiras (painel Indicadores › Base de dados).
//
// Um .xlsx é um ZIP com XML dentro. Aqui:
//   1. lê o diretório central do ZIP e descompacta só as partes pedidas
//      (DecompressionStream 'deflate-raw', nativo do navegador);
//   2. lê os textos compartilhados (xl/sharedStrings.xml);
//   3. lê as abas pedidas, devolvendo matriz de valores (texto ou número).
// Fórmulas não são calculadas: vale o valor guardado na célula.

function xlsxU16(bytes, pos) { return bytes[pos] | (bytes[pos + 1] << 8); }
function xlsxU32(bytes, pos) { return (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0; }

// Diretório central do ZIP: nome → { metodo, tamanhoCompactado, posicaoLocal }.
function xlsxLerDiretorioZip(bytes) {
  // O registro de fim do diretório central fica no fim do arquivo (assinatura PK\x05\x06).
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { fim = i; break; }
  }
  if (fim < 0) throw new Error('O arquivo não é um .xlsx válido (não é um ZIP).');
  const total = xlsxU16(bytes, fim + 10);
  let pos = xlsxU32(bytes, fim + 16);
  const dec = new TextDecoder('utf-8');
  const entradas = new Map();
  for (let n = 0; n < total; n += 1) {
    if (xlsxU32(bytes, pos) !== 0x02014B50) throw new Error('O arquivo .xlsx está corrompido (diretório do ZIP).');
    const metodo = xlsxU16(bytes, pos + 10);
    const tamanhoCompactado = xlsxU32(bytes, pos + 20);
    const tamanhoNome = xlsxU16(bytes, pos + 28);
    const tamanhoExtra = xlsxU16(bytes, pos + 30);
    const tamanhoComentario = xlsxU16(bytes, pos + 32);
    const posicaoLocal = xlsxU32(bytes, pos + 42);
    const nome = dec.decode(bytes.subarray(pos + 46, pos + 46 + tamanhoNome));
    entradas.set(nome, { metodo, tamanhoCompactado, posicaoLocal });
    pos += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

async function xlsxLerEntradaZip(bytes, entrada) {
  const p = entrada.posicaoLocal;
  if (xlsxU32(bytes, p) !== 0x04034B50) throw new Error('O arquivo .xlsx está corrompido (entrada do ZIP).');
  const inicio = p + 30 + xlsxU16(bytes, p + 26) + xlsxU16(bytes, p + 28);
  const dados = bytes.subarray(inicio, inicio + entrada.tamanhoCompactado);
  if (entrada.metodo === 0) return dados; // sem compressão
  if (entrada.metodo !== 8) throw new Error('O arquivo .xlsx usa uma compressão não suportada.');
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir arquivos .xlsx. Atualize o navegador.');
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

function xlsxDesescapar(texto) {
  if (texto.indexOf('&') < 0) return texto;
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xlsxAtributo(tag, nome) {
  const m = tag.match(new RegExp(`(?:^|\\s)${nome}="([^"]*)"`));
  return m ? xlsxDesescapar(m[1]) : '';
}

// Junta todos os <t> de um trecho (texto simples ou em vários "runs").
function xlsxTextoDe(trecho) {
  let texto = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m = re.exec(trecho);
  while (m) { texto += xlsxDesescapar(m[1]); m = re.exec(trecho); }
  return texto;
}

function xlsxLerTextosCompartilhados(xml) {
  const textos = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m = re.exec(xml);
  while (m) {
    // <rPh> é anotação fonética (não faz parte do texto).
    textos.push(m[1] ? xlsxTextoDe(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '')) : '');
    m = re.exec(xml);
  }
  return textos;
}

// "AB12" → índice da coluna (A = 0).
function xlsxColunaDe(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

// XML de uma aba → matriz [linha][coluna]. Texto vira string; número, Number;
// célula vazia, null. Linhas inteiramente vazias no meio são mantidas.
function xlsxLerAba(xml, textos) {
  const linhas = [];
  const reLinha = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  const reCelula = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let ml = reLinha.exec(xml);
  while (ml) {
    const numero = Number(xlsxAtributo(ml[1], 'r')) || (linhas.length + 1);
    const linha = [];
    reCelula.lastIndex = 0;
    let mc = reCelula.exec(ml[2]);
    let proxima = 0;
    while (mc) {
      const ref = xlsxAtributo(mc[1], 'r');
      const coluna = ref ? xlsxColunaDe(ref) : proxima;
      proxima = coluna + 1;
      const tipo = xlsxAtributo(mc[1], 't');
      const corpo = mc[2] || '';
      let valor = null;
      if (tipo === 'inlineStr') {
        valor = xlsxTextoDe(corpo);
      } else {
        const mv = corpo.match(/<v>([\s\S]*?)<\/v>/);
        if (mv) {
          const bruto = xlsxDesescapar(mv[1]);
          if (tipo === 's') valor = textos[Number(bruto)] ?? '';
          else if (tipo === 'str' || tipo === 'e') valor = bruto;
          else if (tipo === 'b') valor = bruto === '1';
          else valor = bruto === '' ? null : Number(bruto);
        }
      }
      while (linha.length < coluna) linha.push(null);
      linha[coluna] = valor;
      mc = reCelula.exec(ml[2]);
    }
    while (linhas.length < numero - 1) linhas.push([]);
    linhas[numero - 1] = linha;
    ml = reLinha.exec(xml);
  }
  return linhas;
}

// Lê um .xlsx (ArrayBuffer ou Uint8Array). Sem `abasDesejadas`, lê todas.
// Devolve { abas: [nomes na ordem do arquivo], linhas: { nome: matriz } }.
async function lerXlsx(dadosArquivo, abasDesejadas) {
  const bytes = dadosArquivo instanceof Uint8Array ? dadosArquivo : new Uint8Array(dadosArquivo);
  const zip = xlsxLerDiretorioZip(bytes);
  const dec = new TextDecoder('utf-8');
  const texto = async (nome) => {
    const entrada = zip.get(nome);
    return entrada ? dec.decode(await xlsxLerEntradaZip(bytes, entrada)) : '';
  };

  const workbook = await texto('xl/workbook.xml');
  if (!workbook) throw new Error('O arquivo não é uma planilha Excel (.xlsx).');
  const rels = await texto('xl/_rels/workbook.xml.rels');
  const alvos = new Map();
  (rels.match(/<Relationship\b[^>]*>/g) || []).forEach((tag) => alvos.set(xlsxAtributo(tag, 'Id'), xlsxAtributo(tag, 'Target')));
  const abas = (workbook.match(/<sheet\b[^>]*>/g) || []).map((tag) => {
    const alvo = alvos.get(xlsxAtributo(tag, 'r:id')) || '';
    return { nome: xlsxAtributo(tag, 'name'), caminho: alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}` };
  });

  const querer = Array.isArray(abasDesejadas) && abasDesejadas.length ? new Set(abasDesejadas) : null;
  const textos = xlsxLerTextosCompartilhados(await texto('xl/sharedStrings.xml'));
  const linhas = {};
  for (const aba of abas) {
    if (querer && !querer.has(aba.nome)) continue;
    linhas[aba.nome] = xlsxLerAba(await texto(aba.caminho), textos);
  }
  return { abas: abas.map((a) => a.nome), linhas };
}

// ---------- planilha consolidada das demonstrações ----------

// Abas esperadas e o nome das colunas em cada uma (linha 1 = cabeçalho).
const XLSX_DEMONSTRACOES = [
  { dem: 'BP', aba: 'BP_Consolidado', rotulo: 'Balanço patrimonial' },
  { dem: 'DRE', aba: 'DRE_Consolidado', rotulo: 'DRE' },
  { dem: 'DMPL', aba: 'DMPL_Consolidado', rotulo: 'DMPL' },
  { dem: 'DFC', aba: 'DFC_Consolidado', rotulo: 'Fluxo de caixa' },
];
const XLSX_COLUNAS = {
  ano: 'exercício ano', clube: 'clube informante', serie: 'série', centro: 'centro de custo',
  descricao: 'descrição', valor: 'valor', classificacao: 'classificação', subclassificacao: 'subclassificação',
};

function xlsxLimpo(valor) {
  return valor === null || valor === undefined ? '' : String(valor).replace(/\s+/g, ' ').trim();
}

// Matriz de uma aba consolidada → linhas da base. `ordem` é a posição da
// rubrica dentro do clube/ano, para o painel mostrar na ordem do modelo.
function xlsxLinhasDaDemonstracao(dem, matriz) {
  const cabecalho = (matriz[0] || []).map((c) => xlsxLimpo(c).toLowerCase());
  const col = {};
  Object.entries(XLSX_COLUNAS).forEach(([campo, nome]) => { col[campo] = cabecalho.indexOf(nome); });
  const faltando = ['ano', 'clube', 'descricao', 'valor'].filter((campo) => col[campo] < 0);
  if (faltando.length) {
    throw new Error(`A aba ${dem}_Consolidado não tem a coluna "${faltando.map((f) => XLSX_COLUNAS[f]).join('", "')}" na primeira linha.`);
  }
  const pegar = (linha, campo) => (col[campo] >= 0 ? linha[col[campo]] : null);
  const ordem = new Map();
  const linhas = [];
  for (let i = 1; i < matriz.length; i += 1) {
    const linha = matriz[i] || [];
    const clube = xlsxLimpo(pegar(linha, 'clube'));
    const ano = Number(pegar(linha, 'ano'));
    const descricao = xlsxLimpo(pegar(linha, 'descricao'));
    if (!clube || !Number.isFinite(ano) || !descricao) continue; // linha em branco ou de rodapé
    const bruto = pegar(linha, 'valor');
    const numero = bruto === null || bruto === '' ? null : Number(bruto);
    const chave = `${ano}|${clube}`;
    ordem.set(chave, (ordem.get(chave) || 0) + 1);
    linhas.push({
      dem, ano, clube, serie: xlsxLimpo(pegar(linha, 'serie')), centro: xlsxLimpo(pegar(linha, 'centro')),
      descricao, classificacao: xlsxLimpo(pegar(linha, 'classificacao')), subclassificacao: xlsxLimpo(pegar(linha, 'subclassificacao')),
      valor: Number.isFinite(numero) ? numero : null, ordem: ordem.get(chave),
    });
  }
  return linhas;
}

// Lê a planilha consolidada inteira. Devolve as linhas e um resumo para a
// conferência antes de importar.
async function lerPlanilhaConsolidada(dadosArquivo) {
  const { abas, linhas: porAba } = await lerXlsx(dadosArquivo, XLSX_DEMONSTRACOES.map((d) => d.aba));
  const faltam = XLSX_DEMONSTRACOES.filter((d) => !porAba[d.aba]);
  if (faltam.length === XLSX_DEMONSTRACOES.length) {
    throw new Error(`Não encontrei as abas da base consolidada (${XLSX_DEMONSTRACOES.map((d) => d.aba).join(', ')}). Abas do arquivo: ${abas.join(', ') || 'nenhuma'}.`);
  }
  const linhas = [];
  const porDemonstracao = {};
  XLSX_DEMONSTRACOES.forEach((d) => {
    const lista = porAba[d.aba] ? xlsxLinhasDaDemonstracao(d.dem, porAba[d.aba]) : [];
    porDemonstracao[d.dem] = lista.length;
    lista.forEach((l) => linhas.push(l));
  });
  if (!linhas.length) throw new Error('A planilha não tem nenhuma linha de dados nas abas consolidadas.');
  const clubes = Array.from(new Set(linhas.map((l) => l.clube))).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  const anos = Array.from(new Set(linhas.map((l) => l.ano))).sort((a, b) => a - b);
  return {
    linhas,
    resumo: { total: linhas.length, porDemonstracao, clubes, anos, abasAusentes: faltam.map((d) => d.aba) },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { lerXlsx, lerPlanilhaConsolidada, xlsxLinhasDaDemonstracao, xlsxLerAba, xlsxLerTextosCompartilhados, xlsxColunaDe, XLSX_DEMONSTRACOES };
}
