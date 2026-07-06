function responder(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function obterConfigSupabase(preferRepresentation) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar configuradas.');
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  if (preferRepresentation) {
    headers.Prefer = 'return=representation';
  }

  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), headers };
}

function obterCorpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function ehNumero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return responder(res, 405, { erro: 'Método não permitido. Use POST.' });
  }

  try {
    const corpo = obterCorpo(req);

    if (corpo.numero_caso === undefined || corpo.numero_caso === null || corpo.numero_caso === '') {
      return responder(res, 400, { erro: 'numero_caso é obrigatório.' });
    }
    if (!ehNumero(corpo.numero_caso)) {
      return responder(res, 400, { erro: 'numero_caso deve ser número.' });
    }
    if (!corpo.clube) {
      return responder(res, 400, { erro: 'clube é obrigatório.' });
    }
    if (!corpo.status_caso) {
      return responder(res, 400, { erro: 'status_caso é obrigatório.' });
    }

    const payload = {
      numero_caso: corpo.numero_caso,
      origem: corpo.origem || null,
      clube: corpo.clube,
      serie: corpo.serie || null,
      status_caso: corpo.status_caso,
    };

    const { supabaseUrl, headers } = obterConfigSupabase(true);
    const resposta = await fetch(`${supabaseUrl}/rest/v1/casos`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao criar caso no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 201, dados);
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao criar caso.',
      detalhe: erro.message,
    });
  }
};
