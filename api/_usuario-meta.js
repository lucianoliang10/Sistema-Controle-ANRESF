// Nome do usuário a partir do user_metadata do Supabase Auth. O cadastro é
// feito à mão no painel do Supabase, então a chave do nome varia ("nome",
// "Nome", "name", "full_name", "Display Name"…): aceita qualquer grafia.
// Arquivo com "_" na frente: a Vercel não o publica como rota.

const CHAVES_NOME = ['nome', 'name', 'fullname', 'nomecompleto', 'displayname'];

function chaveNormalizada(chave) {
  return String(chave || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nomeDoMetadado(meta) {
  const entradas = Object.entries(meta && typeof meta === 'object' ? meta : {});
  for (const alvo of CHAVES_NOME) {
    const achada = entradas.find(([k, v]) => chaveNormalizada(k) === alvo && typeof v === 'string' && v.trim());
    if (achada) return achada[1].trim();
  }
  return '';
}

// "marina.fernandes@anresf.org.br" -> "Marina Fernandes". Usado só quando o
// cadastro não tem nome, para a pessoa não aparecer como "usuário".
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function nomeDoEmail(email) {
  const local = String(email || '').split('@')[0];
  const partes = local.split(/[._\-+]+|\d+/).map((p) => p.trim()).filter(Boolean);
  return partes
    .map((p, i) => (i > 0 && PARTICULAS.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');
}

module.exports = { nomeDoMetadado, nomeDoEmail };
