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

function getSupabaseHeaders(preferRepresentation) {
  const { supabaseKey } = getSupabaseConfig();
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  if (preferRepresentation) {
    headers.Prefer = 'return=representation';
  }

  return headers;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return responder(res, 405, { erro: 'Método não permitido. Use GET.' });
  }

  try {
    const { supabaseUrl } = getSupabaseConfig();
    const headers = getSupabaseHeaders(false);
    const resposta = await fetch(`${supabaseUrl}/rest/v1/v_data_fluxograma?select=*`, {
      method: 'GET',
      headers,
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao buscar dados do fluxograma no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 200, dados);
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao buscar dados do fluxograma.',
      detalhe: erro.message,
    });
  }
};
