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

const { exigirAutenticacao } = require('./_auth');

// Gera uma URL de upload assinada. O arquivo em si é enviado direto do
// navegador para o Supabase Storage (não passa por esta função), então não
// há limite de tamanho imposto pela Vercel — apenas o limite do bucket.
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

    const nomeSanitizado = String(corpo.nome_arquivo).replace(/[^a-zA-Z0-9._-]/g, '_');
    const caminho = `${Date.now()}-${nomeSanitizado}`;

    const { supabaseUrl, supabaseKey } = getSupabaseConfig();
    const resposta = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${BUCKET_ANEXOS}/${caminho}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok || !dados?.url) {
      return responder(res, resposta.status || 500, {
        erro: 'Erro ao criar URL de upload no Supabase Storage.',
        detalhe: dados,
      });
    }

    // dados.url = "/object/upload/sign/{bucket}/{caminho}?token=..."
    return responder(res, 201, {
      signedUrl: `${supabaseUrl}/storage/v1${dados.url}`,
      publicUrl: `${supabaseUrl}/storage/v1/object/public/${BUCKET_ANEXOS}/${caminho}`,
      caminho,
    });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao preparar upload do anexo.',
      detalhe: erro.message,
    });
  }
};
