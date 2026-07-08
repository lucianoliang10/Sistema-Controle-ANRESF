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

function getSupabaseHeaders() {
  const { supabaseKey } = getSupabaseConfig();
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
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
      return responder(res, 400, { erro: 'id é obrigatório. Não é permitido excluir etapa sem id.' });
    }
    if (!ehNumero(corpo.id)) {
      return responder(res, 400, { erro: 'id deve ser número.' });
    }

    const { supabaseUrl } = getSupabaseConfig();
    const headers = getSupabaseHeaders();

    const respostaDependentes = await fetch(`${supabaseUrl}/rest/v1/etapas?ramo_origem_id=eq.${encodeURIComponent(corpo.id)}&select=id`, {
      method: 'GET',
      headers,
    });
    const dependentes = await respostaDependentes.json().catch(() => []);
    if (Array.isArray(dependentes) && dependentes.length > 0) {
      return responder(res, 409, {
        erro: 'Esta etapa é a origem de uma ramificação e não pode ser excluída. Exclua ou reatribua a ramificação primeiro.',
      });
    }

    const resposta = await fetch(`${supabaseUrl}/rest/v1/etapas?id=eq.${encodeURIComponent(corpo.id)}`, {
      method: 'DELETE',
      headers,
    });

    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => null);
      return responder(res, resposta.status, {
        erro: 'Erro ao excluir etapa no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 200, { sucesso: true });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao excluir etapa.',
      detalhe: erro.message,
    });
  }
};
