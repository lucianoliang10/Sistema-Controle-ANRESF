function responder(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function obterConfigSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar configuradas.');
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return responder(res, 405, { erro: 'Método não permitido. Use GET.' });
  }

  try {
    const { supabaseUrl, headers } = obterConfigSupabase();
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
