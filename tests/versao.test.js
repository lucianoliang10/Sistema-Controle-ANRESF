const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

// A versão publicada (versao.json) e a que a página declara (<meta name="versao">)
// precisam ser a mesma, e todo arquivo local de CSS/JS precisa levar ?v=<versão>
// na URL: assim uma versão nova nunca é servida de cache antigo.
test('versao.json, <meta name="versao"> e os ?v= dos arquivos batem', () => {
  const versao = JSON.parse(fs.readFileSync('versao.json', 'utf8')).versao;
  assert.match(versao, /^\d{4}\.\d{2}\.\d{2}-\d+$/);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, new RegExp(`<meta name="versao" content="${versao.replace(/\./g, '\\.')}">`));
  const locais = Array.from(html.matchAll(/(?:<link rel="stylesheet" href|<script src)="((?!https?:\/\/)[^"]+)"/g)).map((m) => m[1]);
  assert.ok(locais.length >= 20, `arquivos locais encontrados: ${locais.length}`);
  const semVersao = locais.filter((u) => !u.endsWith(`?v=${versao}`));
  assert.deepEqual(semVersao, [], 'arquivos sem ?v= da versão atual');
  locais.forEach((u) => assert.ok(fs.existsSync(u.split('?')[0]), `arquivo referenciado não existe: ${u}`));
});

test('vercel.json desliga o cache do index e do versao.json e manda revalidar js/css', () => {
  const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const regra = (src) => cfg.headers.find((h) => h.source === src)?.headers.find((x) => x.key === 'Cache-Control')?.value;
  assert.equal(regra('/'), 'no-store');
  assert.equal(regra('/index.html'), 'no-store');
  assert.equal(regra('/versao.json'), 'no-store');
  assert.equal(regra('/(.*).js'), 'no-cache');
  assert.equal(regra('/(.*).css'), 'no-cache');
});
