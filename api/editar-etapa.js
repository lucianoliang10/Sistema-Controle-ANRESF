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

    if (corpo.id === undefined || corpo.id === null || corpo.id === '') {
      return responder(res, 400, { erro: 'id é obrigatório. Não é permitido atualizar etapa sem id.' });
    }
    if (!ehNumero(corpo.id)) {
      return responder(res, 400, { erro: 'id deve ser número.' });
    }

    const payload = {
      caso_id: corpo.caso_id,
      nome_etapa: corpo.nome_etapa,
      ordem: corpo.ordem,
      objeto: corpo.objeto,
      id_etapa: corpo.id_etapa,
      data_etapa: corpo.data_etapa,
      prazo: corpo.prazo,
      observacao: corpo.observacao,
      sancao: corpo.sancao,
      doc: corpo.doc,
      ramo: corpo.ramo,
      ramo_origem_id: corpo.ramo_origem_id,
      status_etapa: corpo.status_etapa,
    };

    Object.keys(payload).forEach((chave) => {
      if (payload[chave] === undefined) delete payload[chave];
    });

    const { supabaseUrl } = getSupabaseConfig();
    const headers = getSupabaseHeaders(true);
    const resposta = await fetch(`${supabaseUrl}/rest/v1/etapas?id=eq.${encodeURIComponent(corpo.id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao editar etapa no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 200, dados);
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao editar etapa.',
      detalhe: erro.message,
    });
  }
};
