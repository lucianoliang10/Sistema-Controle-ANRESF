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

    if (corpo.caso_id === undefined || corpo.caso_id === null || corpo.caso_id === '') {
      return responder(res, 400, { erro: 'caso_id é obrigatório.' });
    }
    if (!ehNumero(corpo.caso_id)) {
      return responder(res, 400, { erro: 'caso_id deve ser número.' });
    }
    if (!corpo.nome_etapa) {
      return responder(res, 400, { erro: 'nome_etapa é obrigatório.' });
    }
    if (corpo.ordem === undefined || corpo.ordem === null || corpo.ordem === '') {
      return responder(res, 400, { erro: 'ordem é obrigatória.' });
    }
    if (!ehNumero(corpo.ordem)) {
      return responder(res, 400, { erro: 'ordem deve ser número.' });
    }
    if (!corpo.status_etapa) {
      return responder(res, 400, { erro: 'status_etapa é obrigatório.' });
    }

    const payload = {
      caso_id: corpo.caso_id,
      nome_etapa: corpo.nome_etapa,
      ordem: corpo.ordem,
      objeto: corpo.objeto || null,
      id_etapa: corpo.id_etapa || null,
      data_etapa: corpo.data_etapa || null,
      prazo: corpo.prazo || null,
      observacao: corpo.observacao || null,
      sancao: corpo.sancao || null,
      doc: corpo.doc || null,
      ramo: corpo.ramo || null,
      ramo_origem_id: corpo.ramo_origem_id || null,
      status_etapa: corpo.status_etapa,
    };

    const { supabaseUrl } = getSupabaseConfig();
    const headers = getSupabaseHeaders(true);
    const resposta = await fetch(`${supabaseUrl}/rest/v1/etapas`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao criar etapa no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 201, dados);
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao criar etapa.',
      detalhe: erro.message,
    });
  }
};
