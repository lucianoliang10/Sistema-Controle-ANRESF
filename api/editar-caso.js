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

    if (corpo.id === undefined || corpo.id === null || corpo.id === '') {
      return responder(res, 400, { erro: 'id é obrigatório. Não é permitido atualizar caso sem id.' });
    }
    if (!ehNumero(corpo.id)) {
      return responder(res, 400, { erro: 'id deve ser número.' });
    }

    const payload = {
      numero_caso: corpo.numero_caso,
      origem: corpo.origem,
      clube: corpo.clube,
      serie: corpo.serie,
      status_caso: corpo.status_caso,
    };

    Object.keys(payload).forEach((chave) => {
      if (payload[chave] === undefined) delete payload[chave];
    });

    const { supabaseUrl, headers } = obterConfigSupabase(true);
    const resposta = await fetch(`${supabaseUrl}/rest/v1/casos?id=eq.${encodeURIComponent(corpo.id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao editar caso no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 200, dados);
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao editar caso.',
      detalhe: erro.message,
    });
  }
};
