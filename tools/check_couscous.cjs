// Vérifie le bloc Couscous, ses photos, les prix et les 14 traductions.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async function () {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
    url: 'https://lacollinegambetta.com/?lang=fr', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.eval(fs.readFileSync('assets/js/i18n-common.js', 'utf8'));
  const copy = {};
  w.LCGMergeCommonTranslations(copy);
  const panel = w.document.querySelector('#plats .panel--couscous');
  assert.ok(panel);
  assert.equal(panel.previousElementSibling.querySelector('h4').textContent, 'Pâtes');
  const cards = [...panel.querySelectorAll('.food-card')];
  assert.equal(cards.length, 6);
  const names = ['Poulet','Merguez','Brochette d’agneau','Bœuf','Végétarien','La Colline'];
  const prices = ['15,60','15,60','16,50','16,50','13,50','22,90'];
  const note = 'Semoule fine, légumes mijotés et bouillon maison.';
  const signatureNote = "Poulet, agneau et bœuf. Semoule fine, légumes mijotés et bouillon maison.";
  const subtitle = 'À déguster chaque vendredi et samedi (midi et soir).';
  cards.forEach((card, i) => {
    assert.equal(card.querySelector('h5').textContent, names[i]);
    assert.equal(card.querySelector('strong').textContent, prices[i]);
    assert.equal(card.querySelector('.food-card__note').textContent, i === 5 ? signatureNote : note);
    assert.ok(fs.existsSync(card.dataset.photo.split('?')[0]));
    assert.ok(fs.statSync(card.dataset.photo.split('?')[0]).size < 500000, 'Photo optimisée');
  });
  w.eval(fs.readFileSync('assets/js/i18n.js', 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 10));
  for (const lang of Object.keys(copy)) {
    w.__setLang(lang);
    assert.equal(panel.querySelector('h4').textContent, copy[lang].Couscous);
    assert.equal(panel.querySelector('.panel__subtitle').textContent, copy[lang][subtitle]);
    cards.forEach((card, i) => {
      assert.equal(card.querySelector('h5').textContent, copy[lang][names[i]]);
      assert.equal(card.querySelector('.food-card__note').textContent, copy[lang][i === 5 ? signatureNote : note]);
    });
  }
  w.__setLang('fr');
  assert.equal(panel.querySelector('.panel__subtitle').textContent, subtitle);
  cards.forEach((card, i) => assert.equal(card.querySelector('h5').textContent, names[i]));
  dom.window.close();
  console.log('Couscous : ordre, 6 plats, prix, photos et 14 langues + retour français OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
