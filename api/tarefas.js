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

async function listarTarefas(req, res) {
  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(false);
  const resposta = await fetch(`${supabaseUrl}/rest/v1/v_tarefas?select=*&order=data_final.asc.nullslast`, {
    method: 'GET',
    headers,
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    return responder(res, resposta.status, {
      erro: 'Erro ao buscar tarefas no Supabase.',
      detalhe: dados,
    });
  }

  return responder(res, 200, dados);
}

async function criarTarefa(corpo, res) {
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
}

async function editarTarefa(corpo, res) {
  if (corpo.id === undefined || corpo.id === null || corpo.id === '') {
    return responder(res, 400, { erro: 'id é obrigatório. Não é permitido atualizar tarefa sem id.' });
  }
  if (!ehNumero(corpo.id)) {
    return responder(res, 400, { erro: 'id deve ser número.' });
  }
  if (corpo.status_tarefa && !['Pendente', 'Concluída'].includes(corpo.status_tarefa)) {
    return responder(res, 400, { erro: 'status_tarefa inválido.' });
  }

  const payload = {
    data_inicial: corpo.data_inicial,
    data_final: corpo.data_final,
    observacao: corpo.observacao,
    responsavel: corpo.responsavel,
    status_tarefa: corpo.status_tarefa,
  };

  Object.keys(payload).forEach((chave) => {
    if (payload[chave] === undefined) delete payload[chave];
  });

  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(true);
  const resposta = await fetch(`${supabaseUrl}/rest/v1/tarefas?id=eq.${encodeURIComponent(corpo.id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    return responder(res, resposta.status, {
      erro: 'Erro ao editar tarefa no Supabase.',
      detalhe: dados,
    });
  }

  return responder(res, 200, dados);
}

async function excluirTarefa(corpo, res) {
  if (corpo.id === undefined || corpo.id === null || corpo.id === '') {
    return responder(res, 400, { erro: 'id é obrigatório. Não é permitido excluir tarefa sem id.' });
  }
  if (!ehNumero(corpo.id)) {
    return responder(res, 400, { erro: 'id deve ser número.' });
  }

  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders();

  const resposta = await fetch(`${supabaseUrl}/rest/v1/tarefas?id=eq.${encodeURIComponent(corpo.id)}`, {
    method: 'DELETE',
    headers,
  });

  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null);
    return responder(res, resposta.status, {
      erro: 'Erro ao excluir tarefa no Supabase.',
      detalhe: dados,
    });
  }

  return responder(res, 200, { sucesso: true });
}

const { exigirAutenticacao } = require('./_auth');

module.exports = async function handler(req, res) {
  try {
    if (!(await exigirAutenticacao(req, res, responder))) return;

    if (req.method === 'GET') {
      return await listarTarefas(req, res);
    }

    if (req.method !== 'POST') {
      return responder(res, 405, { erro: 'Método não permitido. Use GET ou POST.' });
    }

    const corpo = obterCorpo(req);

    if (corpo.acao === 'editar') return await editarTarefa(corpo, res);
    if (corpo.acao === 'excluir') return await excluirTarefa(corpo, res);
    if (corpo.acao === 'criar' || !corpo.acao) return await criarTarefa(corpo, res);

    return responder(res, 400, { erro: 'acao inválida. Use "criar", "editar" ou "excluir".' });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao processar tarefas.',
      detalhe: erro.message,
    });
  }
};
