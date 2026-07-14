// Controle de acesso do site (Supabase Auth via /api/login).
// Carregado ANTES dos demais scripts para interceptar as chamadas /api/.

const AUTH_STORAGE = 'anresf_auth';

function authLer() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE) || 'null');
  } catch (erro) {
    return null;
  }
}

function authGravar(dados) {
  localStorage.setItem(AUTH_STORAGE, JSON.stringify(dados));
}

function authLimpar() {
  localStorage.removeItem(AUTH_STORAGE);
}

function authAutenticado() {
  const dados = authLer();
  return Boolean(dados && dados.access_token);
}

// --- Interceptação do fetch: injeta o token nas chamadas /api/ (exceto /api/login) ---
const fetchOriginal = window.fetch.bind(window);

function ehChamadaApiProtegida(url) {
  const caminho = String(url || '');
  return caminho.startsWith('/api/') && !caminho.startsWith('/api/login');
}

async function renovarSessao() {
  const dados = authLer();
  if (!dados || !dados.refresh_token) return false;
  try {
    const resposta = await fetchOriginal('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: dados.refresh_token }),
    });
    if (!resposta.ok) return false;
    const novo = await resposta.json();
    authGravar(novo);
    return true;
  } catch (erro) {
    return false;
  }
}

window.fetch = async function (recurso, opcoes = {}) {
  const url = typeof recurso === 'string' ? recurso : (recurso && recurso.url) || '';

  if (!ehChamadaApiProtegida(url)) {
    return fetchOriginal(recurso, opcoes);
  }

  const comToken = (token) => {
    const headers = new Headers(opcoes.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...opcoes, headers };
  };

  const dados = authLer();
  let resposta = await fetchOriginal(recurso, comToken(dados && dados.access_token));

  // Token expirado: tenta renovar uma vez e repete a chamada.
  if (resposta.status === 401) {
    const renovou = await renovarSessao();
    if (renovou) {
      const atual = authLer();
      resposta = await fetchOriginal(recurso, comToken(atual && atual.access_token));
    }
    if (resposta.status === 401) {
      authLimpar();
      mostrarLogin('Sua sessão expirou. Faça login novamente.');
    }
  }

  return resposta;
};

// --- Overlay de login ---
function mostrarLogin(mensagem) {
  const overlay = document.querySelector('#auth-overlay');
  if (overlay) {
    overlay.removeAttribute('hidden');
    document.body.classList.add('auth-bloqueado');
  }
  const feedback = document.querySelector('#auth-feedback');
  if (feedback) {
    feedback.textContent = mensagem || '';
    feedback.className = mensagem ? 'auth-feedback erro' : 'auth-feedback';
  }
}

function esconderLogin() {
  const overlay = document.querySelector('#auth-overlay');
  if (overlay) overlay.setAttribute('hidden', '');
  document.body.classList.remove('auth-bloqueado');
}

async function submeterLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.email.value.trim();
  const password = form.password.value;
  const feedback = document.querySelector('#auth-feedback');
  const botao = form.querySelector('button[type="submit"]');

  if (feedback) { feedback.textContent = 'Entrando...'; feedback.className = 'auth-feedback'; }
  if (botao) botao.disabled = true;

  try {
    const resposta = await fetchOriginal('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dados = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new Error((dados && dados.erro) || 'Não foi possível entrar.');
    }

    authGravar(dados);
    // Recarrega para que todos os painéis carreguem já autenticados.
    window.location.reload();
  } catch (erro) {
    if (feedback) { feedback.textContent = erro.message; feedback.className = 'auth-feedback erro'; }
    if (botao) botao.disabled = false;
  }
}

function sair() {
  authLimpar();
  window.location.reload();
}

function iniciarAuth() {
  const dados = authLer();
  const emailEl = document.querySelector('#auth-email-atual');
  if (emailEl && dados && dados.usuario) emailEl.textContent = dados.usuario.email || '';

  document.querySelector('#auth-form')?.addEventListener('submit', submeterLogin);
  document.querySelector('#auth-sair')?.addEventListener('click', sair);

  if (authAutenticado()) {
    esconderLogin();
  } else {
    mostrarLogin('');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarAuth);
} else {
  iniciarAuth();
}
