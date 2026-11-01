#!/usr/bin/env node
/* Audit des textes statiques et des catalogues dynamiques, sans accès réseau. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'ja', 'ko', 'pl', 'tr', 'uk', 'hi'];
const PAGES = ['index.html', 'reservation.html', 'mentions-legales.html', 'confidentialite.html', '404.html'];
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
// Noms propres, appellations et marques : ne pas inventer de traduction.
const NEUTRAL = new Set([
  'LA COLLINE GAMBETTA', 'La Colline Gambetta', '✦ La Colline Gambetta ✦',
  'Google Maps', 'Jack Daniel’s', 'Bas-Armagnac VSOP', 'Heineken',
  '4 rue Belgrand, 75020 Paris, France',
  'lacolline.gambetta', 'lacollinegambetta.com', 'Fanta / Sprite / Fuze Tea',
  'Johnnie Walker', 'Get 27 / 31, Baileys, Malibu', 'Amaretto, Fernet-Branca',
  '1664 Blanc', 'Corona', 'LA COLLINE WMMI', 'Paris · 107 479 107',
  'FR21 107479107', 'Mohamed Bouaza', 'GitHub Pages', 'GitHub, Inc.',
  '88 Colin P Kelly Jr St', 'docs.github.com/fr/pages', 'FormSubmit', 'Web3Forms', 'CNIL',
]);
const isNeutral = s => NEUTRAL.has(s) || !/[\p{L}\p{N}]/u.test(s)
  || /^[\d\s.,:+%€×/–—−()²³°-]+$/u.test(s)
  || /^(?:cl|ml|l|L|g|kg|m|km)$/.test(s)
  || /^(?:https?:\/\/|www\.|[^\s@]+@[^\s@]+$)/.test(s)
  || s.split('/').every(part => /^\s*\d+(?:[.,]\d+)?\s*(?:cl|ml|l|L|g|kg|m|km|€|%)\s*$/u.test(part));
let catalogs = 0;
function walk(n, fn, ancestors = []) {
  if (!n || typeof n !== 'object') return;
  if (n.type) fn(n, ancestors);
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) value.forEach(v => walk(v, fn, [...ancestors, n]));
    else if (value && typeof value === 'object') walk(value, fn, [...ancestors, n]);
  }
}
const key = p => p.key && (p.key.name || p.key.value);
function auditCatalogs(code, file) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  walk(ast, (n, ancestors) => {
    if (n.type !== 'ObjectExpression') return;
    const keys = n.properties.map(key);
    const languages = keys.filter(k => ['fr', ...LANGS].includes(k));
    if (!(languages.includes('fr') && languages.length >= 2) && languages.length < 10) return;
    catalogs++;
    // Ces cinq langues ont leurs propres branches grammaticales avant le tableau latin.
    const guests = file === 'reservation.html' && ancestors.some(a => a.type === 'FunctionDeclaration' && a.id.name === 'formatGuestQuantity');
    for (const lang of LANGS) {
      if (guests && ['ar', 'zh', 'ja', 'ko', 'hi'].includes(lang)) {
        const fn = ancestors.find(a => a.type === 'FunctionDeclaration' && a.id.name === 'formatGuestQuantity');
        assert(code.slice(fn.start, n.start).includes("lang === '" + lang + "'"), `${file}: branche ${lang}`);
        continue;
      }
      assert(keys.includes(lang), `${file}: langue absente ${lang}`);
    }
    // Les messages dynamiques doivent avoir les mêmes champs dans chaque langue.
    const fr = n.properties.find(p => key(p) === 'fr');
    if (!fr || fr.value.type !== 'ObjectExpression') return;
    const fields = fr.value.properties.map(key);
    for (const lang of LANGS) {
      const value = n.properties.find(p => key(p) === lang)?.value;
      if (!value || value.type !== 'ObjectExpression') continue;
      for (const field of fields) assert(value.properties.some(p => key(p) === field), `${file}: ${lang}.${field} absent`);
    }
  });
}
for (const file of PAGES) {
  const html = read(file);
  const dom = new JSDOM(html, { url: 'https://lacollinegambetta.com/' + file, runScripts: 'outside-only' });
  const w = dom.window;
  const originalTitle = w.document.title;
  const description = w.document.querySelector('meta[name="description"]');
  const originalDescription = description.content;
  const source = [norm(originalTitle), norm(originalDescription)];
  const walker = w.document.createTreeWalker(w.document.body, w.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement.closest('script,style,noscript,code,pre,textarea,.lang-menu,.legal-lang-menu,.foldall')) continue;
    if (norm(n.nodeValue)) source.push(norm(n.nodeValue));
  }
  for (const el of w.document.querySelectorAll('[aria-label],[title],[placeholder],[alt],[data-label]')) {
    if (el.closest('.lang-menu,.legal-lang-menu')) continue;
    for (const a of ['aria-label', 'title', 'placeholder', 'alt', 'data-label']) {
      if (norm(el.getAttribute(a))) source.push(norm(el.getAttribute(a)));
    }
  }
  w.eval(read('assets/js/i18n-common.js'));
  const main = ['index.html', 'reservation.html'].includes(file);
  let engine = read(main ? 'assets/js/i18n.js' : 'assets/js/legal-i18n.js');
  if (!main) engine = engine.replace('window.__setLegalLang =', 'window.__auditDicts = DICTS; window.__setLegalLang =');
  w.eval(engine);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const dicts = main ? w.__i18nDicts : w.__auditDicts;
  for (const lang of LANGS) {
    const dict = new Map(Object.entries(dicts[lang]).map(([k, v]) => [norm(k), v]));
    for (const s of new Set(source)) {
      // Les titres de distance et les choix horaires sont reformattés par leurs moteurs dédiés.
      if (/^À [\d\s.,]+ (?:m|km) du restaurant$/.test(s) || /^\d{1,2}h\d{2}(?:\s*[–—-]\s*\d{1,2}h\d{2})?$/.test(s)) continue;
      assert(dict.has(s) || isNeutral(s), `${file} [${lang}] texte sans traduction : ${s}`);
    }
    (main ? w.__setLang : w.__setLegalLang)(lang);
    assert.equal(w.document.title, dict.get(norm(originalTitle)));
    assert.equal(description.content, dict.get(norm(originalDescription)));
    if (file === '404.html') {
      const image = w.document.querySelector('img[alt]');
      assert.equal(image.alt, dict.get('Médaillon de La Colline Gambetta'));
      assert.notEqual(image.alt, 'Médaillon de La Colline Gambetta');
    }
  }
  (main ? w.__setLang : w.__setLegalLang)('fr');
  assert.equal(w.document.title, originalTitle);
  assert.equal(description.content, originalDescription);
  if (file === '404.html') assert.equal(w.document.querySelector('img[alt]').alt, 'Médaillon de La Colline Gambetta');
  for (const script of w.document.querySelectorAll('script:not([src])')) {
    if (!script.type || script.type === 'text/javascript') auditCatalogs(script.textContent, file);
  }
  dom.window.close();
  console.log('✓ Couverture des textes et attributs :', file, '× 14 langues + retour français');
}
for (const file of fs.readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js'))) auditCatalogs(read('assets/js/' + file), file);
assert(catalogs >= 31, "Tous les catalogues dynamiques doivent être audités");
console.log(`✓ ${catalogs} catalogues multilingues vérifiés (réservations, horaires, avis, itinéraires, fêtes…).`);
