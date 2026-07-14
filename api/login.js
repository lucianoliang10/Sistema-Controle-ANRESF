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

function obterCorpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

// Faz login (email/senha) ou renova a sessão (refresh_token) no Supabase Auth.
// Toda a comunicação com o Supabase acontece no servidor: a chave nunca vai ao navegador.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return responder(res, 405, { erro: 'Método não permitido. Use POST.' });
  }

  try {
    const corpo = obterCorpo(req);
    const usarRefresh = Boolean(corpo.refresh_token);

    if (!usarRefresh) {
      if (!corpo.email || !corpo.password) {
        return responder(res, 400, { erro: 'E-mail e senha são obrigatórios.' });
      }
    }

    const { supabaseUrl, supabaseKey } = getSupabaseConfig();
    const grantType = usarRefresh ? 'refresh_token' : 'password';
    const payload = usarRefresh
      ? { refresh_token: corpo.refresh_token }
      : { email: String(corpo.email).trim(), password: corpo.password };

    const resposta = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const mensagem = usarRefresh
        ? 'Sessão expirada. Faça login novamente.'
        : 'E-mail ou senha inválidos.';
      return responder(res, 401, { erro: mensagem, detalhe: dados?.error_description || dados?.msg });
    }

    // Devolve só o necessário ao cliente.
    return responder(res, 200, {
      access_token: dados.access_token,
      refresh_token: dados.refresh_token,
      expires_in: dados.expires_in,
      expires_at: dados.expires_at,
      usuario: dados.user ? { id: dados.user.id, email: dados.user.email } : null,
    });
  } catch (erro) {
    return responder(res, 500, { erro: 'Erro interno ao autenticar.', detalhe: erro.message });
  }
};
