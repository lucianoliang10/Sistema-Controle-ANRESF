function responder(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!rawUrl || !supabaseKey) {
    throw new Error('Variáveis de ambiente do Supabase não configuradas.');
  }

  const supabaseUrl = rawUrl
    .trim()
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');

  return { supabaseUrl, supabaseKey };
}

function obterCorpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

const BUCKET_ANEXOS = 'etapas-anexos';
const TAMANHO_MAXIMO_BYTES = 4 * 1024 * 1024;

const { exigirAutenticacao } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return responder(res, 405, { erro: 'Método não permitido. Use POST.' });
  }

  try {
    if (!(await exigirAutenticacao(req, res, responder))) return;

    const corpo = obterCorpo(req);

    if (!corpo.nome_arquivo) {
      return responder(res, 400, { erro: 'nome_arquivo é obrigatório.' });
    }
    if (!corpo.conteudo_base64) {
      return responder(res, 400, { erro: 'conteudo_base64 é obrigatório.' });
    }

    const base64Limpo = String(corpo.conteudo_base64).replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Limpo, 'base64');

    if (buffer.length === 0) {
      return responder(res, 400, { erro: 'Arquivo vazio.' });
    }
    if (buffer.length > TAMANHO_MAXIMO_BYTES) {
      return responder(res, 400, { erro: 'Arquivo excede o limite de 4MB.' });
    }

    const nomeSanitizado = String(corpo.nome_arquivo).replace(/[^a-zA-Z0-9._-]/g, '_');
    const caminho = `${Date.now()}-${nomeSanitizado}`;

    const { supabaseUrl, supabaseKey } = getSupabaseConfig();
    const resposta = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET_ANEXOS}/${caminho}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/pdf',
      },
      body: buffer,
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao enviar anexo ao Supabase Storage.',
        detalhe: dados,
      });
    }

    const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET_ANEXOS}/${caminho}`;
    return responder(res, 201, { url, caminho });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao enviar anexo.',
      detalhe: erro.message,
    });
  }
};
