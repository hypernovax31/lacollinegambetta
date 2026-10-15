/* npm run test:navigation : liens réels, isolation du stockage et fêtes. */
const { JSDOM } = require('jsdom');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const script = readFileSync('assets/js/navigation-context.js', 'utf8');
function run(path, saved, referrer, blocked) {
  const dom = new JSDOM('<a id="home" href="index.html">Accueil</a><a id="book" href="reservation.html">Réserver</a><a id="menu" href="index.html#crepes">Crêpes</a><a id="pdf" href="Carte_LaCollineGambetta.pdf">PDF</a><a id="external" href="https://tenon.aphp.fr">Tenon</a>', {
    url: 'https://lacollinegambetta.com/' + path, runScripts: 'outside-only', ...(referrer ? { referrer } : {})
  });
  if (saved) dom.window.sessionStorage.setItem('lcg-cover-context-v1', saved);
  if (blocked) Object.defineProperty(dom.window, 'sessionStorage', { get() { throw Error('blocked'); } });
  dom.window.eval(readFileSync('assets/js/fetes-medaillon.js', 'utf8'));
  dom.window.eval(script);
  const url = id => new URL(dom.window.document.getElementById(id).href);
  return { dom, url };
}
let first = run('?halloween=1&lang=en');
assert.equal(first.url('book').searchParams.get('halloween'), '1');
assert.equal(first.url('book').searchParams.get('lang'), 'en');
const saved = first.dom.window.sessionStorage.getItem('lcg-cover-context-v1');
let back = run('reservation.html?halloween=1&lang=en', saved);
assert.equal(back.url('home').search, '?halloween=1&lang=en');
assert.equal(back.url('home').hash, '#cover-section');
assert.equal(back.url('menu').hash, '#crepes');
assert.equal(back.url('pdf').search, '');
assert.equal(back.url('external').href, 'https://tenon.aphp.fr/');
for (const page of ['mentions-legales.html','confidentialite.html','404.html']) {
  const test = run(page, saved);
  assert.equal(test.url('home').searchParams.get('halloween'), '1');
  test.dom.window.close();
}
let disabled = run('reservation.html?halloween=0', saved);
assert.equal(disabled.url('home').searchParams.get('halloween'), '0');
let fresh = run('index.html', saved);
assert.equal(fresh.url('home').search, '');
let ref = run('reservation.html', null, 'https://lacollinegambetta.com/?fete=paques');
assert.equal(ref.url('home').searchParams.get('fete'), 'paques');
let noStorage = run('reservation.html?noel=1', null, null, true);
assert.equal(noStorage.url('home').searchParams.get('noel'), '1');
back.dom.window.dispatchEvent(new back.dom.window.CustomEvent('lcg-lang-changed', { detail: { lang: 'es' } }));
assert.equal(back.url('home').searchParams.get('lang'), 'es');
for (const test of [first, back, disabled, fresh, ref, noStorage]) test.dom.window.close();
// Vérifie les 14 fêtes et chacun des raccourcis du registre, y compris =0.
let catalog = run('index.html');
let count = 0;
for (const festival of catalog.dom.window.FeteMedaillon.fetes) {
  for (const key of new Set([festival.id, ...festival.alias])) {
    for (const value of ['1', '0', 'oui']) {
      const entry = run('?' + key + '=' + value);
      assert.equal(entry.url('book').searchParams.get(key), value);
      const target = run('reservation.html' + entry.url('book').search);
      assert.equal(target.url('home').searchParams.get(key), value);
      entry.dom.window.close(); target.dom.window.close(); count++;
    }
  }
  for (const page of ['reservation.html', 'mentions-legales.html', 'confidentialite.html', '404.html']) {
    const target = run(page + '?fete=' + festival.id);
    assert.equal(target.url('home').searchParams.get('fete'), festival.id);
    target.dom.window.close();
  }
}
catalog.dom.window.close();
console.log(count + ' scénarios de raccourcis de fête vérifiés.');
console.log('Navigation : couverture, fêtes, langue, pages séparées et stockage bloqué OK.');
