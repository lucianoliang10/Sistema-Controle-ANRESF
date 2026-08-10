// Lista de usuários do sistema (nome/perfil), para popular a sugestão de
// "Responsável" nos formulários. Lê da Admin API do Supabase Auth (server-side,
// a service key nunca vai ao navegador).
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

function nomeUsuario(user) {
  const meta = user.user_metadata || {};
  return meta.nome || meta.name || meta.full_name || meta.display_name || '';
}

function perfilUsuario(user) {
  const meta = user.user_metadata || {};
  return meta.perfil || meta.role || meta.papel || meta.cargo || '';
}

async function listarUsuarios(req, res) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  // Admin API paginada; buscamos as primeiras páginas (até 1000 usuários).
  const usuarios = [];
  for (let page = 1; page <= 10; page += 1) {
    const resposta = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=100`, {
      method: 'GET',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      return responder(res, resposta.status, { erro: 'Erro ao listar usuários no Supabase.', detalhe: dados });
    }
    const lista = Array.isArray(dados) ? dados : (dados && Array.isArray(dados.users) ? dados.users : []);
    lista.forEach((user) => {
      const nome = nomeUsuario(user);
      usuarios.push({ nome, email: user.email || '', perfil: perfilUsuario(user) });
    });
    if (lista.length < 100) break;
  }

  // Só nomes preenchidos e sem duplicatas, ordenados.
  const vistos = new Set();
  const limpos = usuarios
    .filter((u) => u.nome && !vistos.has(u.nome.toLowerCase()) && vistos.add(u.nome.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return responder(res, 200, limpos);
}

const { exigirAutenticacao } = require('./_auth');

module.exports = async function handler(req, res) {
  try {
    if (!(await exigirAutenticacao(req, res, responder))) return;
    if (req.method !== 'GET') {
      return responder(res, 405, { erro: 'Método não permitido. Use GET.' });
    }
    return await listarUsuarios(req, res);
  } catch (erro) {
    return responder(res, 500, { erro: 'Erro interno ao listar usuários.', detalhe: erro.message });
  }
};
