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

    if (corpo.etapa_id === undefined || corpo.etapa_id === null || corpo.etapa_id === '') {
      return responder(res, 400, { erro: 'etapa_id é obrigatório.' });
    }
    if (!ehNumero(corpo.etapa_id)) {
      return responder(res, 400, { erro: 'etapa_id deve ser número.' });
    }
    if (!corpo.responsavel) {
      return responder(res, 400, { erro: 'responsavel é obrigatório.' });
    }

    const payload = {
      etapa_id: corpo.etapa_id,
      data_inicial: corpo.data_inicial || null,
      data_final: corpo.data_final || null,
      observacao: corpo.observacao || null,
      responsavel: corpo.responsavel,
      status_tarefa: 'Pendente',
    };

    const { supabaseUrl } = getSupabaseConfig();
    const headers = getSupabaseHeaders(true);
    const resposta = await fetch(`${supabaseUrl}/rest/v1/tarefas`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      return responder(res, resposta.status, {
        erro: 'Erro ao criar tarefa no Supabase.',
        detalhe: dados,
      });
    }

    return responder(res, 201, dados);
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao criar tarefa.',
      detalhe: erro.message,
    });
  }
};
