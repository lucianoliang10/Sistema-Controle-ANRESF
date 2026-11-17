// ID de etapa. O padrão é "NNN/AAAA" (ex.: 021/2026). Uma etapa COMPLEMENTAR
// reaproveita o número da etapa de origem com uma letra: "021-A/2026",
// "021-B/2026"… (ex.: um segundo ofício de intimação sobre o mesmo assunto).
//
// Estas funções são a fonte única da leitura do ID: sugestão de ID vago,
// Controle de IDs e duplicação de caso (api/casos.js repete a mesma regra).

// "021/2026", "021-A/2026", "021A/2026" ou "21 - a / 2026" -> partes do ID.
// Devolve null para o que não segue o padrão.
function idEtapaLer(texto) {
  const m = String(texto === null || texto === undefined ? '' : texto).match(/^\s*(\d+)\s*(?:[-–—]\s*)?([A-Za-z]{1,2})?\s*\/\s*(\d{4})\s*$/);
  if (!m) return null;
  return { numero: Number(m[1]), sufixo: (m[2] || '').toUpperCase(), ano: Number(m[3]) };
}

function idEtapaMontar(numero, sufixo, ano) {
  return `${String(numero).padStart(3, '0')}${sufixo ? `-${String(sufixo).toUpperCase()}` : ''}/${ano}`;
}

// Deixa o ID complementar na forma padrão ("021a/2026" -> "021-A/2026"). O
// resto fica como foi digitado.
function idEtapaNormalizar(texto) {
  const limpo = String(texto === null || texto === undefined ? '' : texto).trim();
  const p = idEtapaLer(limpo);
  return p && p.sufixo ? idEtapaMontar(p.numero, p.sufixo, p.ano) : limpo;
}

// ID da etapa de origem de uma complementar ("021-A/2026" -> "021/2026").
// '' quando o ID não é de etapa complementar.
function idEtapaOrigem(texto) {
  const p = idEtapaLer(texto);
  return p && p.sufixo ? idEtapaMontar(p.numero, '', p.ano) : '';
}

// Posição da letra: '' = 0, A = 1 … Z = 26, AA = 27…
function idEtapaOrdemSufixo(sufixo) {
  return String(sufixo || '').toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
}

// Número para ordenar IDs: ano, depois número, depois a letra. Assim
// "021-A/2026" fica logo depois de "021/2026". Fora do padrão -> Infinity.
function idEtapaChaveOrdem(texto) {
  const p = idEtapaLer(texto);
  return p ? p.ano * 1e8 + p.numero * 1000 + idEtapaOrdemSufixo(p.sufixo) : Infinity;
}

// Próxima letra livre para uma complementar, dadas as letras já usadas.
function idEtapaProximoSufixo(usados) {
  const set = new Set(Array.from(usados || []).map((s) => String(s || '').toUpperCase()).filter(Boolean));
  for (let n = 1; n <= 26 * 27; n += 1) {
    const letra = n <= 26 ? String.fromCharCode(64 + n) : String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));
    if (!set.has(letra)) return letra;
  }
  return '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { idEtapaLer, idEtapaMontar, idEtapaNormalizar, idEtapaOrigem, idEtapaOrdemSufixo, idEtapaChaveOrdem, idEtapaProximoSufixo };
}
