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

async function buscarCamposCasos(supabaseUrl, headers, casos) {
  if (!Array.isArray(casos) || casos.length === 0) return new Map();

  const idsCasos = Array.from(new Set(casos
    .map((caso) => caso.id || caso.caso_banco_id)
    .filter((id) => id !== undefined && id !== null && id !== '')));

  if (idsCasos.length === 0) return new Map();

  const filtroIds = idsCasos.map((id) => String(id).replace(/\)/g, '')).join(',');
  const resposta = await fetch(`${supabaseUrl}/rest/v1/casos?select=id,denunciante,periodo,observacao&id=in.(${encodeURIComponent(filtroIds)})`, {
    method: 'GET',
    headers,
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok || !Array.isArray(dados)) return new Map();

  return new Map(dados.map((caso) => [String(caso.id), {
    denunciante: caso.denunciante ?? null,
    periodo: caso.periodo ?? null,
    observacao: caso.observacao ?? null,
  }]));
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

  const camposPorCaso = await buscarCamposCasos(supabaseUrl, headers, dados);
  const dadosComCamposCaso = Array.isArray(dados)
    ? dados.map((caso) => {
      const campos = camposPorCaso.get(String(caso.id));
      return {
        ...caso,
        denunciante: campos ? campos.denunciante : caso.denunciante,
        periodo: campos ? campos.periodo : caso.periodo,
        observacao: campos ? campos.observacao : caso.observacao,
      };
    })
    : dados;

  return responder(res, 200, dadosComCamposCaso);
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
  if (!corpo.periodo) {
    return responder(res, 400, { erro: 'periodo é obrigatório.' });
  }

  const payload = {
    numero_caso: corpo.numero_caso,
    origem: corpo.origem || null,
    clube: corpo.clube,
    periodo: corpo.periodo,
    serie: corpo.serie || null,
    status_caso: corpo.status_caso,
    observacao: corpo.observacao || null,
  };

  if (corpo.denunciante !== undefined) payload.denunciante = corpo.denunciante || null;
  if (corpo.observacao !== undefined) payload.observacao = corpo.observacao || null;

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
    periodo: corpo.periodo,
    serie: corpo.serie,
    status_caso: corpo.status_caso,
    observacao: corpo.observacao,
  };

  if (corpo.denunciante !== undefined) payload.denunciante = corpo.denunciante || null;
  if (corpo.observacao !== undefined) payload.observacao = corpo.observacao || null;

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

async function supabaseGet(supabaseUrl, headers, caminho) {
  const resposta = await fetch(`${supabaseUrl}/rest/v1/${caminho}`, { method: 'GET', headers });
  const dados = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, dados };
}

async function supabaseInsert(supabaseUrl, headers, tabela, payload) {
  const resposta = await fetch(`${supabaseUrl}/rest/v1/${tabela}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const dados = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, dados };
}

// Normalização e tipo-base da etapa (espelha o front: tudo antes do " - ").
// Usado para renumerar os IDs das etapas na duplicação, respeitando a unicidade
// de ID por tipo (Acórdão - PSS/PSO, Decisão da Presidência - …, etc.).
function normStatusServer(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
}
function tipoBaseEtapaServer(nome) {
  return normStatusServer(String(nome || '').split(/\s+[-–—]\s+/)[0]);
}

// Duplica um caso: cria uma cópia do caso (com um novo numero_caso, para não
// se fundir com o original no fluxograma), de todas as suas etapas e de todas
// as tarefas dessas etapas. As referências internas de ramificação
// (ramo_origem_id) são remapeadas para as novas etapas. Os IDs das etapas são
// RENUMERADOS para o próximo ID vago de cada tipo (duplicação inteligente).
async function duplicarCaso(corpo, res) {
  if (!ehNumero(corpo.id)) {
    return responder(res, 400, { erro: 'id do caso é obrigatório e deve ser número.' });
  }

  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(false);
  const headersRep = getSupabaseHeaders(true);
  const idOriginal = corpo.id;

  // 1) Caso original
  const orig = await supabaseGet(supabaseUrl, headers, `casos?id=eq.${encodeURIComponent(idOriginal)}&select=*`);
  if (!orig.ok) return responder(res, orig.status, { erro: 'Erro ao buscar o caso original.', detalhe: orig.dados });
  if (!Array.isArray(orig.dados) || orig.dados.length === 0) {
    return responder(res, 404, { erro: 'Caso não encontrado.' });
  }
  const original = orig.dados[0];

  // 2) Novo numero_caso = maior existente + 1
  const maxRes = await supabaseGet(supabaseUrl, headers, 'casos?select=numero_caso&order=numero_caso.desc&limit=1');
  const maiorNumero = Array.isArray(maxRes.dados) && maxRes.dados[0] ? Number(maxRes.dados[0].numero_caso) || 0 : 0;
  const novoNumero = maiorNumero + 1;

  // 3) Novo caso
  const novoCasoRes = await supabaseInsert(supabaseUrl, headersRep, 'casos', {
    numero_caso: novoNumero,
    origem: original.origem,
    clube: original.clube,
    denunciante: original.denunciante,
    periodo: original.periodo,
    serie: original.serie,
    status_caso: original.status_caso,
    observacao: original.observacao,
  });
  if (!novoCasoRes.ok || !Array.isArray(novoCasoRes.dados) || !novoCasoRes.dados[0]) {
    return responder(res, novoCasoRes.status || 500, { erro: 'Erro ao duplicar o caso.', detalhe: novoCasoRes.dados });
  }
  const novoCaso = novoCasoRes.dados[0];

  // 4) Etapas do caso original
  const etapasRes = await supabaseGet(supabaseUrl, headers, `etapas?caso_id=eq.${encodeURIComponent(idOriginal)}&select=*&order=ordem.asc`);
  if (!etapasRes.ok) return responder(res, etapasRes.status, { erro: 'Erro ao buscar etapas do caso.', detalhe: etapasRes.dados });
  const etapas = Array.isArray(etapasRes.dados) ? etapasRes.dados : [];

  // Renumeração inteligente dos IDs das etapas: para cada tipo (texto antes do
  // primeiro " - ") e ano, achamos o menor ID vago para atribuir às cópias, de
  // modo que a duplicata não colida com os IDs já existentes no sistema.
  const todasRes = await supabaseGet(supabaseUrl, headers, 'etapas?select=nome_etapa,id_etapa');
  const usadosPorTipo = new Map(); // `${tipoBase}|${ano}` -> Set<number>
  (Array.isArray(todasRes.dados) ? todasRes.dados : []).forEach((e) => {
    const m = String(e.id_etapa || '').match(/^\s*(\d+)\s*\/\s*(\d{4})\s*$/);
    if (!m) return;
    const chave = `${tipoBaseEtapaServer(e.nome_etapa)}|${m[2]}`;
    if (!usadosPorTipo.has(chave)) usadosPorTipo.set(chave, new Set());
    usadosPorTipo.get(chave).add(Number(m[1]));
  });
  function novoIdEtapa(nome, idAntigo) {
    const m = String(idAntigo || '').match(/^\s*(\d+)\s*\/\s*(\d{4})\s*$/);
    if (!m) return idAntigo || null; // mantém IDs fora do padrão NNN/AAAA
    const ano = m[2];
    const chave = `${tipoBaseEtapaServer(nome)}|${ano}`;
    if (!usadosPorTipo.has(chave)) usadosPorTipo.set(chave, new Set());
    const usados = usadosPorTipo.get(chave);
    let n = 1;
    while (usados.has(n)) n += 1;
    usados.add(n); // reserva para não repetir entre etapas do mesmo tipo/ano
    return `${String(n).padStart(3, '0')}/${ano}`;
  }

  const mapaEtapas = {}; // id antigo -> id novo
  let totalEtapas = 0;
  let totalTarefas = 0;

  if (etapas.length > 0) {
    // Insere as etapas sem ramo_origem_id (para não apontar para ids antigos).
    const payloadEtapas = etapas.map((e) => ({
      caso_id: novoCaso.id,
      nome_etapa: e.nome_etapa,
      ordem: e.ordem,
      objeto: e.objeto,
      id_etapa: novoIdEtapa(e.nome_etapa, e.id_etapa),
      data_etapa: e.data_etapa,
      prazo: e.prazo,
      observacao: e.observacao,
      sancao: e.sancao,
      turma: e.turma,
      responsavel: e.responsavel,
      doc: e.doc,
      ramo: e.ramo,
      ramo_origem_id: null,
      status_etapa: e.status_etapa,
    }));
    const novasEtapasRes = await supabaseInsert(supabaseUrl, headersRep, 'etapas', payloadEtapas);
    if (!novasEtapasRes.ok || !Array.isArray(novasEtapasRes.dados)) {
      return responder(res, novasEtapasRes.status || 500, { erro: 'Erro ao duplicar as etapas.', detalhe: novasEtapasRes.dados });
    }
    const novasEtapas = novasEtapasRes.dados;
    // PostgREST devolve a representação na mesma ordem em que foi inserida.
    etapas.forEach((e, i) => { if (novasEtapas[i]) mapaEtapas[e.id] = novasEtapas[i].id; });
    totalEtapas = novasEtapas.length;

    // Remapeia ramo_origem_id nas novas etapas (ramificações internas do caso).
    for (let i = 0; i < etapas.length; i += 1) {
      const origem = etapas[i].ramo_origem_id;
      const novaId = novasEtapas[i] && novasEtapas[i].id;
      if (origem && mapaEtapas[origem] && novaId) {
        await fetch(`${supabaseUrl}/rest/v1/etapas?id=eq.${encodeURIComponent(novaId)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ ramo_origem_id: mapaEtapas[origem] }),
        });
      }
    }

    // 5) Tarefas de todas as etapas originais
    const idsAntigos = etapas.map((e) => e.id).join(',');
    const tarefasRes = await supabaseGet(supabaseUrl, headers, `tarefas?etapa_id=in.(${idsAntigos})&select=*`);
    const tarefas = Array.isArray(tarefasRes.dados) ? tarefasRes.dados : [];
    if (tarefas.length > 0) {
      const payloadTarefas = tarefas
        .filter((t) => mapaEtapas[t.etapa_id])
        .map((t) => ({
          etapa_id: mapaEtapas[t.etapa_id],
          data_inicial: t.data_inicial,
          data_final: t.data_final,
          observacao: t.observacao,
          responsavel: t.responsavel,
          anexo_url: t.anexo_url,
          anexo_nome: t.anexo_nome,
          conclusao: t.conclusao,
          status_tarefa: t.status_tarefa,
        }));
      if (payloadTarefas.length > 0) {
        const novasTarefasRes = await supabaseInsert(supabaseUrl, headersRep, 'tarefas', payloadTarefas);
        if (!novasTarefasRes.ok) {
          return responder(res, novasTarefasRes.status || 500, { erro: 'Erro ao duplicar as tarefas.', detalhe: novasTarefasRes.dados });
        }
        totalTarefas = Array.isArray(novasTarefasRes.dados) ? novasTarefasRes.dados.length : payloadTarefas.length;
      }
    }
  }

  return responder(res, 201, {
    sucesso: true,
    caso: novoCaso,
    numero_caso: novoNumero,
    etapas: totalEtapas,
    tarefas: totalTarefas,
  });
}

// Exclui um caso por completo: primeiro as tarefas de todas as suas etapas,
// depois as etapas e por fim o próprio caso (respeitando as FKs).
async function excluirCaso(corpo, res) {
  if (!ehNumero(corpo.id)) {
    return responder(res, 400, { erro: 'id do caso é obrigatório e deve ser número.' });
  }

  const { supabaseUrl } = getSupabaseConfig();
  const headers = getSupabaseHeaders(false);
  const id = corpo.id;

  // 1) Etapas do caso
  const etapasRes = await supabaseGet(supabaseUrl, headers, `etapas?caso_id=eq.${encodeURIComponent(id)}&select=id`);
  if (!etapasRes.ok) return responder(res, etapasRes.status, { erro: 'Erro ao buscar etapas do caso.', detalhe: etapasRes.dados });
  const idsEtapas = (Array.isArray(etapasRes.dados) ? etapasRes.dados : []).map((e) => e.id);

  // 2) Tarefas dessas etapas
  if (idsEtapas.length > 0) {
    const rDelTar = await fetch(`${supabaseUrl}/rest/v1/tarefas?etapa_id=in.(${idsEtapas.join(',')})`, { method: 'DELETE', headers });
    if (!rDelTar.ok) {
      const d = await rDelTar.json().catch(() => null);
      return responder(res, rDelTar.status, { erro: 'Erro ao excluir tarefas do caso.', detalhe: d });
    }
  }

  // 3) Etapas do caso
  const rDelEtapas = await fetch(`${supabaseUrl}/rest/v1/etapas?caso_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
  if (!rDelEtapas.ok) {
    const d = await rDelEtapas.json().catch(() => null);
    return responder(res, rDelEtapas.status, { erro: 'Erro ao excluir etapas do caso.', detalhe: d });
  }

  // 4) O próprio caso
  const rDelCaso = await fetch(`${supabaseUrl}/rest/v1/casos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
  if (!rDelCaso.ok) {
    const d = await rDelCaso.json().catch(() => null);
    return responder(res, rDelCaso.status, { erro: 'Erro ao excluir o caso.', detalhe: d });
  }

  return responder(res, 200, { sucesso: true, etapas: idsEtapas.length });
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
    if (corpo.acao === 'duplicar') return await duplicarCaso(corpo, res);
    if (corpo.acao === 'excluir') return await excluirCaso(corpo, res);
    if (corpo.acao === 'criar' || !corpo.acao) return await criarCaso(corpo, res);

    return responder(res, 400, { erro: 'acao inválida. Use "criar", "editar", "duplicar" ou "excluir".' });
  } catch (erro) {
    return responder(res, 500, {
      erro: 'Erro interno ao processar casos.',
      detalhe: erro.message,
    });
  }
};
