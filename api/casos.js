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

async function listarCasos(req, res) {
  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(false);
  const resposta = await fetch(`${supabaseUrl}/rest/v1/v_lista_casos?select=*`, {
    method: 'GET',
    headers,
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    return responder(res, resposta.status, {
      erro: 'Erro ao buscar lista de casos no Supabase.',
      detalhe: dados,
    });
  }

  return responder(res, 200, dados);
}

async function criarCaso(corpo, res) {
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

  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(true);
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
}

async function editarCaso(corpo, res) {
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

  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(true);
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
}

const { exigirAutenticacao } = require('./_auth');

module.exports = async function handler(req, res) {
  try {
    if (!(await exigirAutenticacao(req, res, responder))) return;

    if (req.method === 'GET') {
      return await listarCasos(req, res);
    }

    if (req.method !== 'POST') {
      return responder(res, 405, { erro: 'Método não permitido. Use GET ou POST.' });
    }

    const corpo = obterCorpo(req);

    if (corpo.acao === 'editar') return await editarCaso(corpo, res);
    if (corpo.acao === 'criar' || !corpo.acao) return await criarCaso(corpo, res);

    return responder(res, 400, { erro: 'acao inválida. Use "criar" ou "editar".' });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao processar casos.',
      detalhe: erro.message,
    });
  }
};
