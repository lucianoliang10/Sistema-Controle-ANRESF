// Helper de autenticação compartilhado pelas rotas da API.
// O prefixo "_" faz a Vercel tratar este arquivo como módulo auxiliar,
// não como um endpoint/serverless function.

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

function extrairToken(req) {
  const cabecalho = req.headers.authorization || req.headers.Authorization || '';
  if (typeof cabecalho !== 'string') return '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
}

// Valida o access token do usuário chamando o endpoint de auth do Supabase.
// Retorna o objeto do usuário autenticado, ou null se o token for inválido/ausente.
async function verificarAutenticacao(req) {
  const token = extrairToken(req);
  if (!token) return null;

  try {
    const { supabaseUrl, supabaseKey } = getSupabaseConfig();
    const resposta = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resposta.ok) return null;
    const usuario = await resposta.json().catch(() => null);
    return usuario && usuario.id ? usuario : null;
  } catch (erro) {
    return null;
  }
}

// Aplica a checagem e responde 401 se não autenticado.
// Retorna true quando a requisição pode prosseguir.
async function exigirAutenticacao(req, res, responder) {
  const usuario = await verificarAutenticacao(req);
  if (!usuario) {
    responder(res, 401, { erro: 'Não autenticado. Faça login para continuar.' });
    return false;
  }
  return true;
}

module.exports = { verificarAutenticacao, exigirAutenticacao };
