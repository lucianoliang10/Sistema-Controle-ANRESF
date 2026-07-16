// Utilitários de anexo compartilhados (etapa e tarefa).
// Quando mais de um arquivo é selecionado, os arquivos são compactados num
// único .zip no próprio navegador (sem dependência externa) e é esse .zip que
// sobe para o storage. Assim o link salvo continua sendo um só, e clicar nele
// baixa o .zip com todos os documentos.
//
// O upload vai direto do navegador para o Supabase Storage, usando uma URL
// assinada gerada por /api/upload-anexo. Como o arquivo não passa pela função
// serverless, não há limite de tamanho da Vercel — só o limite do bucket.

// --- ZIP (método "store", sem compressão) ------------------------------------
const ANEXO_CRC_TABELA = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function anexoCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) {
    c = ANEXO_CRC_TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function nomesUnicos(arquivos) {
  const vistos = new Map();
  return arquivos.map((f) => {
    const nome = f.nome;
    if (!vistos.has(nome)) {
      vistos.set(nome, 1);
      return { ...f, nome };
    }
    const n = vistos.get(nome) + 1;
    vistos.set(nome, n);
    const ponto = nome.lastIndexOf('.');
    const base = ponto > 0 ? nome.slice(0, ponto) : nome;
    const ext = ponto > 0 ? nome.slice(ponto) : '';
    return { ...f, nome: `${base} (${n})${ext}` };
  });
}

// arquivos: [{ nome, dados: Uint8Array }] -> Uint8Array do .zip
function montarZip(arquivosOriginais) {
  const arquivos = nomesUnicos(arquivosOriginais);
  const enc = new TextEncoder();
  const u16 = (arr, v) => arr.push(v & 0xFF, (v >>> 8) & 0xFF);
  const u32 = (arr, v) => arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);

  const locais = [];
  const central = [];
  let offset = 0;

  arquivos.forEach((f) => {
    const nomeBytes = enc.encode(f.nome);
    const dados = f.dados;
    const crc = anexoCrc32(dados);
    const tam = dados.length;

    // Bit 11 (0x0800) do "general purpose bit flag" marca os nomes como UTF-8;
    // sem ele o Windows lê os bytes como CP437 e mostra acentos/ç embaralhados.
    const lh = [];
    u32(lh, 0x04034b50); u16(lh, 20); u16(lh, 0x0800); u16(lh, 0); u16(lh, 0); u16(lh, 0x21);
    u32(lh, crc); u32(lh, tam); u32(lh, tam); u16(lh, nomeBytes.length); u16(lh, 0);
    const lhBytes = new Uint8Array(lh);
    locais.push(lhBytes, nomeBytes, dados);

    const ch = [];
    u32(ch, 0x02014b50); u16(ch, 20); u16(ch, 20); u16(ch, 0x0800); u16(ch, 0); u16(ch, 0); u16(ch, 0x21);
    u32(ch, crc); u32(ch, tam); u32(ch, tam); u16(ch, nomeBytes.length);
    u16(ch, 0); u16(ch, 0); u16(ch, 0); u16(ch, 0); u32(ch, 0); u32(ch, offset);
    central.push(new Uint8Array(ch), nomeBytes);

    offset += lhBytes.length + nomeBytes.length + dados.length;
  });

  const centralInicio = offset;
  const centralTam = central.reduce((s, p) => s + p.length, 0);

  const fim = [];
  u32(fim, 0x06054b50); u16(fim, 0); u16(fim, 0);
  u16(fim, arquivos.length); u16(fim, arquivos.length);
  u32(fim, centralTam); u32(fim, centralInicio); u16(fim, 0);

  const partes = [...locais, ...central, new Uint8Array(fim)];
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  partes.forEach((p) => { saida.set(p, pos); pos += p.length; });
  return saida;
}

// --- Preparação e envio ------------------------------------------------------
// Recebe a FileList (ou array de File). Devolve { blob, nome, tipo } ou null.
// 1 arquivo -> ele mesmo; 2+ -> um .zip com todos.
async function prepararArquivoAnexo(fileList, nomeZipBase) {
  const arquivos = Array.from(fileList || []);
  if (arquivos.length === 0) return null;

  if (arquivos.length === 1) {
    const f = arquivos[0];
    return { blob: f, nome: f.name, tipo: f.type || 'application/octet-stream', quantidade: 1 };
  }

  const entradas = [];
  for (const f of arquivos) {
    const buffer = new Uint8Array(await f.arrayBuffer());
    entradas.push({ nome: f.name, dados: buffer });
  }
  const zipBytes = montarZip(entradas);
  return {
    blob: new Blob([zipBytes], { type: 'application/zip' }),
    nome: `${nomeZipBase}.zip`,
    tipo: 'application/zip',
    quantidade: arquivos.length,
  };
}

async function enviarArquivoParaStorage(prep) {
  // 1) Pede à função serverless uma URL de upload assinada (a chave fica no servidor).
  const resposta = await fetch('/api/upload-anexo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome_arquivo: prep.nome, tipo_arquivo: prep.tipo }),
  });
  const dados = await tratarRespostaApi(resposta, 'Erro ao preparar o envio do anexo.');
  if (!dados?.signedUrl) throw new Error('Não foi possível obter a URL de upload do anexo.');

  // 2) Envia o arquivo direto ao Supabase Storage (sem passar pela Vercel).
  // O endpoint de upload assinado espera multipart/form-data (mesmo formato do
  // supabase-js). NÃO definimos Content-Type: o navegador põe o boundary certo.
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', prep.blob, prep.nome);

  let envio;
  try {
    envio = await fetch(dados.signedUrl, {
      method: 'PUT',
      headers: { 'x-upsert': 'true' },
      body: form,
    });
  } catch (erroRede) {
    console.error('Anexo: falha de rede/CORS no upload ao storage.', erroRede);
    throw new Error(`Não foi possível enviar o anexo (falha de rede ou CORS): ${erroRede.message || erroRede}`);
  }

  if (!envio.ok) {
    const detalhe = await envio.text().catch(() => '');
    console.error('Anexo: storage recusou o upload.', envio.status, detalhe);
    throw new Error(`O storage recusou o anexo (HTTP ${envio.status}).${detalhe ? ` ${detalhe}` : ''}`);
  }

  return dados.publicUrl || null;
}
