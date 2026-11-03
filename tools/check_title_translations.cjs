// Inventaire de tous les titres, rubriques, boissons et onglets des cinq pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LANGS = ['en','es','de','it','pt','nl','ar','zh','uk','ja','ko','pl','tr','hi'];
const PAGES = ['index.html','reservation.html','mentions-legales.html','confidentialite.html','404.html'];
const SELECTOR = 'title,h1,h2,h3,h4,h5,h6,[role="heading"],.panel__title,.price-line__name,.hh-line__name,.beer-row__name,.wine-name,.menu-nav a,.menu-nav button,.offer-card__badge,.special-card__badge,.crepe-formula-card__label,.day-option__label';
const norm = s => s.replace(/\s+/g, ' ').trim();
// Marques et noms internationaux : ces seules exceptions ne représentent pas des plats génériques.
const PROPER = new Set(['COLLINE GAMBETTA','Fanta / Sprite / Fuze Tea','Jack Daniel’s','Johnnie Walker','Bas-Armagnac VSOP','Get 27 / 31, Baileys, Malibu','Amaretto, Fernet-Branca','Heineken','1664 Blanc','Corona','Mojito','Mai Tai','Piña Colada','Strawberry Colada','Cuba Libre','Tequila Sunrise','Spritz','Suze Tonic','St-Germain Spritz','Moscow Mule','London Mule','Gin Fizz','Cosmopolitan','Sex on the Beach','Bloody Mary','Aviation','Margarita','Black Russian','Madeleine','Virgin Colline','Virgin Colada','Bora Bora','Virgin Mojito','Virgin Bloody Mary','Nutella','Burger La Colline']);
// Appellations et cuvées commerciales : garder leur dénomination officielle.
for (const name of ['Bordeaux AOP — Château la Gabarre','Côtes du Rhône AOP Bio — Les 3 Garçons','Brouilly AOP — Réserve de Beauvoisie','Saint-Pourçain AOP — La Ficelle','Pic Saint-Loup AOP — Puech de Fourques','Crozes-Hermitage AOP — Chante Passo','Gigondas AOP Bio — Pierre Amadieu, Romane Machotte','Petit Chablis AOP — La Revire','Côtes de Provence AOP Bio — Romain Desbastides','Champagne H. Richard — Cuvée Henri','Champagne Nicolas Feuillatte — Brut Réserve Exclusive','Prosecco Spumante Il Poggio — Blanc de Noirs Extra Dry']) PROPER.add(name);
// Orthographe effectivement commune au français et à la langue cible.
const SHARED = {en:['Omelettes','Burgers','Couscous','Whiskies','Mules & fizz','Desserts','Vodka'],es:['Café','Vodka'],de:['Couscous','Desserts','Vodka','Grog'],it:['Vodka'],pt:['Café','Vodka'],nl:['Burgers','Couscous','Salades','Mules & fizz','Vodka','Grog'],pl:['Grog'],tr:['Grog']};
let total = 0;
for (const file of PAGES) {
  const dom = new JSDOM(read(file), {url:'https://lacollinegambetta.com/' + file + '?lang=fr',runScripts:'outside-only'});
  const w = dom.window;
  const records = [...w.document.querySelectorAll(SELECTOR)].filter(el => !el.closest('.lang-menu,.legal-lang-menu')).map(el => {
    const parts = [], walker = w.document.createTreeWalker(el,w.NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    return {el, parts, original:el.textContent, key:norm(el.textContent)};
  }).filter(r=>r.key);
  w.eval(read('assets/js/i18n-common.js'));
  const main = file === 'index.html' || file === 'reservation.html';
  w.eval(read('assets/js/' + (main?'i18n':'legal-i18n') + '.js'));
  const dicts = {};
  w.LCGMergeCommonTranslations(dicts);
  const set = main ? w.__setLang : w.__setLegalLang;
  for (const lang of LANGS) {
    set(lang);
    const ds = main ? w.__i18nDicts[lang] : null;
    for (const r of records) {
      if (main) {
        const expected = norm(r.parts.map(raw => {
          const m=raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
          const key=norm(m[2]);
          return m[1]+(ds[key]??key)+m[3];
        }).join(''));
        const localized = w.LCGLocalizeDisplayDigits ? w.LCGLocalizeDisplayDigits(expected,lang) : expected;
        assert.equal(norm(r.el.textContent),norm(localized),`${file} [${lang}] titre affiché : ${r.key}`);
        if(norm(r.el.textContent) === r.key && /\p{L}/u.test(r.key)) {
          assert(PROPER.has(r.key) || SHARED[lang]?.includes(r.key), `${file} [${lang}] titre encore français : ${r.key}`);
        }
      } else {
        assert(norm(r.el.textContent) !== r.key || PROPER.has(r.key),`${file} [${lang}] titre encore français : ${r.key}`);
      }
    }
    // Ces intitulés avaient été abusivement exemptés en tant que noms propres.
    if(file==='index.html') for(const key of ['La Colline','La Colline Royale']) {
      assert(dicts[lang][key] && dicts[lang][key] !== key, `${lang} : intitulé explicite requis pour ${key}`);
    }
  }
  set('fr');
  for(const r of records) assert.equal(norm(r.el.textContent),norm(r.original),'Retour français : '+r.key);
  total+=records.length;
  console.log(`✓ ${file} : ${records.length} titres/onglets/intitulés × 14 langues + français.`);
  dom.window.close();
}
console.log(`✓ Inventaire total : ${total} titres (exceptions limitées aux marques et mots communs documentés).`);
