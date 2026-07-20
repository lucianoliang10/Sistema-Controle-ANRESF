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

async function buscarTurmasEtapas(supabaseUrl, headers, dadosFluxograma) {
  if (!Array.isArray(dadosFluxograma) || dadosFluxograma.length === 0) return new Map();

  const idsEtapas = Array.from(new Set(dadosFluxograma
    .map((linha) => linha.etapa_banco_id)
    .filter((id) => id !== undefined && id !== null && id !== '')));

  if (idsEtapas.length === 0) return new Map();

  const filtroIds = idsEtapas.map((id) => String(id).replace(/\)/g, '')).join(',');
  const resposta = await fetch(`${supabaseUrl}/rest/v1/etapas?select=id,turma&id=in.(${encodeURIComponent(filtroIds)})`, {
    method: 'GET',
    headers,
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok || !Array.isArray(dados)) return new Map();

  return new Map(dados.map((etapa) => [String(etapa.id), etapa.turma ?? null]));
}

async function listarEtapas(req, res) {
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

  const turmasPorEtapa = await buscarTurmasEtapas(supabaseUrl, headers, dados);
  const dadosComTurma = Array.isArray(dados)
    ? dados.map((linha) => ({
      ...linha,
      turma: turmasPorEtapa.has(String(linha.etapa_banco_id))
        ? turmasPorEtapa.get(String(linha.etapa_banco_id))
        : linha.turma,
    }))
    : dados;

  return responder(res, 200, dadosComTurma);
}

async function criarEtapa(corpo, res) {
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
    turma: corpo.turma || null,
    doc: corpo.doc || null,
    ramo: corpo.ramo ?? '',
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
}

async function editarEtapa(corpo, res) {
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
    turma: corpo.turma,
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
}

async function excluirEtapa(corpo, res) {
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
}

const { exigirAutenticacao } = require('./_auth');

module.exports = async function handler(req, res) {
  try {
    if (!(await exigirAutenticacao(req, res, responder))) return;

    if (req.method === 'GET') {
      return await listarEtapas(req, res);
    }

    if (req.method !== 'POST') {
      return responder(res, 405, { erro: 'Método não permitido. Use GET ou POST.' });
    }

    const corpo = obterCorpo(req);

    if (corpo.acao === 'editar') return await editarEtapa(corpo, res);
    if (corpo.acao === 'excluir') return await excluirEtapa(corpo, res);
    if (corpo.acao === 'criar' || !corpo.acao) return await criarEtapa(corpo, res);

    return responder(res, 400, { erro: 'acao inválida. Use "criar", "editar" ou "excluir".' });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao processar etapas.',
      detalhe: erro.message,
    });
  }
};
