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

function mascararUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const partes = hostname.split('.');
    const primeiroSegmento = partes[0] || '';
    const prefixo = primeiroSegmento.slice(0, 3) || '***';
    partes[0] = `${prefixo}***`;
    return `${parsedUrl.protocol}//${partes.join('.')}`;
  } catch (erro) {
    return 'URL inválida ou não mascarável';
  }
}

const { exigirAutenticacao } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return responder(res, 405, { erro: 'Método não permitido. Use GET.' });
  }

  const temUrl = Boolean(process.env.SUPABASE_URL);
  const temKey = Boolean(process.env.SUPABASE_SERVICE_KEY);

  try {
    if (!(await exigirAutenticacao(req, res, responder))) return;

    const { supabaseUrl } = getSupabaseConfig();
    const supabaseUrlMascarada = mascararUrl(supabaseUrl);

    return responder(res, 200, {
      temUrl,
      temKey,
      supabaseUrlNormalizada: supabaseUrlMascarada,
      urlCasos: `${supabaseUrlMascarada}/rest/v1/v_lista_casos?select=*`,
      urlDataFluxograma: `${supabaseUrlMascarada}/rest/v1/v_data_fluxograma?select=*`,
    });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro ao calcular configuração segura do Supabase.',
      detalhe: erro.message,
      temUrl,
      temKey,
    });
  }
};
