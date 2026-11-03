// Test du rendu réel des intitulés, notes, tiroirs et galeries, pas seulement des clés.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const LANGS = ['en', 'es', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'ja', 'ko', 'pl', 'tr', 'uk', 'hi'];
const norm = s => s.replace(/\s+/g, ' ').trim();
// Noms propres/marque, mots réellement identiques dans la langue cible, pas de plats français génériques.
const SAME = new Set(['Nutella', 'Burger La Colline']);
const SECTIONS = ['entrees', 'plats', 'desserts', 'crepes'];
async function check(width, galleryFirst, initialLang) {
  const dom = new JSDOM(html, { url: 'https://lacollinegambetta.com/?lang=' + initialLang, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.innerWidth = width;
  // Le focus visuel relève du test navigateur, pas du calcul CSS coûteux de jsdom.
  w.HTMLElement.prototype.focus = function () {};
  w.matchMedia = q => ({ matches: q.includes('min-width: 721px') && width >= 721, addEventListener() {}, addListener() {} });
  w.requestAnimationFrame = () => 1;
  w.cancelAnimationFrame = () => {};
  const cards = [...w.document.querySelectorAll(SECTIONS.map(id => '#' + id + ' .food-card').join(','))];
  assert.equal(cards.length, 66, 'Les 66 fiches du menu doivent être vérifiées');
  function parts(el) {
    const out = [], walker = w.document.createTreeWalker(el, w.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) out.push(walker.currentNode.nodeValue);
    return out;
  }
  const records = cards.map(card => ({ card, title: norm(card.querySelector('h5').textContent), titleParts: parts(card.querySelector('h5')), notes: [...card.querySelectorAll('.food-card__note')].map(n => norm(n.textContent)), price: norm(card.querySelector('strong').textContent) }));
  const gallery = [...w.document.querySelectorAll('script:not([src])')].find(s => s.textContent.includes('function syncPhotoToggleLabels()'));
  assert(gallery, 'Le vrai script des tiroirs et de la visionneuse est requis');
  w.eval(read('assets/js/i18n-common.js'));
  if (galleryFirst) {
    w.eval(gallery.textContent);
    await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  w.eval(read('assets/js/i18n.js'));
  if (!galleryFirst) w.eval(gallery.textContent);
  // Respecter le cycle DOMContentLoaded réel, sans le déclencher deux fois.
  await new Promise(resolve => w.document.readyState === 'loading' ? w.document.addEventListener('DOMContentLoaded', resolve, { once: true }) : resolve());
  assert.equal(w.document.querySelectorAll('.food-card__toggle').length, 66);
  const display = value => norm(w.LCGLocalizeDisplayDigits(w.LCGKeepMeasuresTogether(value), w.document.documentElement.lang));
  function expected(key, lang, titleParts) {
    if (lang === 'fr') return display(key);
    const value = w.__i18nDicts[lang][key];
    if (!value && titleParts && titleParts.length > 1) {
      return norm(titleParts.map(raw => {
        const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!m[2]) return raw;
        const translated = w.__i18nDicts[lang][norm(m[2])];
        assert(translated, `${lang} : fragment absent ${m[2]}`);
        return m[1] + display(translated) + m[3];
      }).join(''));
    }
    assert(value, `${lang} : traduction absente de ${key}`);
    assert(norm(value) !== key || SAME.has(key) || lang === 'nl' && key === 'Salade', `${lang} : faux positif, traduction restée française : ${key}`);
    return display(value);
  }
  // Sans aucun clic au globe : vérifier le texte dès le chargement d'un lien traduit.
  assert.equal(w.document.documentElement.lang, initialLang);
  for (const { card, title, titleParts } of records) {
    assert.equal(norm(card.querySelector('h5').textContent), expected(title, initialLang, titleParts));
    assert.equal(card.querySelector('.food-card__toggle').getAttribute('aria-label'), w.__i18nDicts[initialLang]['Voir les photos']);
  }
  for (const wine of w.document.querySelectorAll('.wine-row[data-wine-pairing]')) {
    assert.equal(norm(wine.querySelectorAll('.wine-detail-value')[1].textContent), expected(norm(wine.dataset.winePairing), initialLang), 'Traduction des accords dès le chargement');
  }
  // Toutes les langues, puis les mêmes en sens inverse pour détecter les nœuds détachés.
  for (const lang of [...LANGS, ...LANGS.slice().reverse(), 'fr']) {
    w.__setLang(lang);
    for (const { card, title, titleParts, notes, price } of records) {
      assert.equal(norm(card.querySelector('h5').textContent), expected(title, lang, titleParts), `${lang} : titre affiché ${title}`);
      const actualNotes = [...card.querySelectorAll('.food-card__note')].map(n => norm(n.textContent));
      assert.deepEqual(actualNotes, notes.map(key => expected(key, lang)), `${lang} : notes de ${title}`);
      assert.equal(norm(card.querySelector('strong').textContent), display(price), 'Prix conservé');
      const img = card.querySelector('img');
      assert.equal(norm(img.alt), expected(title, lang, titleParts), 'Texte alternatif de la photo');
      const btn = card.querySelector('.food-card__toggle');
      // En mobile : chaque tiroir s'ouvre avec ses propres notes traduites.
      // En bureau : chaque photo s'ouvre avec son titre, son texte et son alt traduits.
      btn.click();
      if (width >= 721) {
        assert(w.document.querySelector('.lightbox.is-open'));
        assert.equal(norm(w.document.querySelector('.lightbox__title').textContent), expected(title, lang, titleParts));
        assert.equal(norm(w.document.querySelector('.lightbox__img').alt), expected(title, lang, titleParts));
        assert.equal(norm(w.document.querySelector('.lightbox__note').textContent), notes.map(key => expected(key, lang)).join(' · '));
        // La galerie déjà ouverte doit suivre un changement de langue.
        if (card === records[0].card) {
          const other = lang === 'en' ? 'ar' : 'en';
          w.__setLang(other);
          assert.equal(norm(w.document.querySelector('.lightbox__title').textContent), expected(title, other, titleParts));
          w.__setLang(lang);
        }
        w.document.querySelector('.lightbox__close').click();
      } else {
        assert(card.classList.contains('food-card--open'));
        btn.click();
      }
    }
    // Vérifier également les plats dans les recommandations des 17 vins.
    const wines = [...w.document.querySelectorAll('.wine-row[data-wine-pairing]')];
    assert.equal(wines.length, 17);
    for (const wine of wines) {
      const source = norm(wine.dataset.winePairing);
      const value = wine.querySelectorAll('.wine-detail-value')[1];
      assert(value);
      assert.equal(norm(value.textContent), expected(source, lang), `${lang} : accord mets/vin`);
    }
  }
  dom.window.close();
  console.log(`✓ ${width}px, galerie ${galleryFirst ? 'avant' : 'après'} i18n : 66 fiches, 17 accords, 14 langues aller-retour + français.`);
}
(async () => {
  await check(390, true, 'en');
  await check(1440, false, 'ja');
})().catch(error => { console.error(error); process.exitCode = 1; });
