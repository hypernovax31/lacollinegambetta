#!/usr/bin/env node
/**
 * Vérifie l’interface du carrousel sans joindre Google.
 * Les commentaires ci-dessous sont des fixtures synthétiques de test,
 * explicitement fictives et jamais incluses dans le site publié.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(ROOT + file, 'utf8');
const source = read('index.html');
const parsed = new JSDOM(source).window.document;
const section = parsed.getElementById('cover-reviews-section');
assert.ok(section, 'bloc de la page de garde absent');

const dom = new JSDOM(`<!doctype html><html lang="fr"><body>${section.outerHTML}</body></html>`, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://lacollinegambetta.com/'
});
const { window } = dom;
const fetchCalls = [];
window.fetch = (url) => {
  fetchCalls.push(String(url));
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      place_id: 'TEST_PLACE_ID',
      cle_api: 'TEST-ONLY-NOT-A-REAL-KEY',
      url: 'https://www.google.com/maps/search/?api=1&query=test'
    })
  });
};
const requestedFields = [];
let sdkScriptLoads = 0;
let sdkLibraryImports = 0;
const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
window.document.head.appendChild = (element) => {
  if (element.dataset && element.dataset.googleReviewsSdk === 'true') {
    sdkScriptLoads += 1;
    const sdkUrl = new URL(element.src);
    assert.equal(sdkUrl.searchParams.get('callback'), '__lcgGoogleReviewsReady');
    assert.equal(sdkUrl.searchParams.get('libraries'), 'places');
    setTimeout(() => {
      window.google = { maps: { importLibrary: (name) => {
        assert.equal(name, 'places');
        sdkLibraryImports += 1;
        return Promise.resolve({
          Place: class {
            fetchFields(options) {
              requestedFields.push(...options.fields);
              this.rating = 4.8;
              this.googleMapsURI = 'https://www.google.com/maps/search/?api=1&query=test-place';
              this.attributions = [];
              // Fixtures artificielles — ne jamais reprendre dans les contenus du site.
              this.reviews = [
                {
                  rating: 5,
                  text: 'TEST ONLY — fixture fictive, pas un avis client.',
                  textLanguageCode: 'fr',
                  originalTextLanguageCode: 'fr',
                  relativePublishTimeDescription: 'il y a quelques jours',
                  visitDateMonth: 8,
                  visitDateYear: 2026,
                  googleMapsURI: 'https://www.google.com/maps/reviews/fixture-1',
                  authorAttribution: {
                    displayName: 'TEST ONLY',
                    uri: 'https://www.google.com/maps/contrib/fixture-1'
                  }
                },
                {
                  rating: 2,
                  text: 'TEST ONLY — deuxième fixture fictive, aucune expérience réelle.',
                  textLanguageCode: 'fr',
                  originalTextLanguageCode: 'fr',
                  relativePublishTimeDescription: 'il y a quelques semaines',
                  visitDateMonth: 7,
                  visitDateYear: 2026,
                  googleMapsURI: 'https://www.google.com/maps/reviews/fixture-2',
                  authorAttribution: { displayName: 'TEST ONLY 2' }
                }
              ];
              return Promise.resolve();
            }
          }
        });
      } } };
      window.__lcgGoogleReviewsReady();
    }, 0);
    return element;
  }
  return originalAppendChild(element);
};
window.eval(read('assets/js/google-reviews.js'));

const button = window.document.getElementById('google-reviews-load');
const status = window.document.getElementById('google-reviews-status');
const position = window.document.getElementById('google-reviews-position');
assert.equal(button.textContent, 'Chargement des avis Google…');
assert.equal(button.hidden, true, 'le bouton de secours ne doit pas remplacer le chargement automatique');
assert.equal(button.disabled, true, 'la requête automatique doit signaler son état');
assert.equal(button.getAttribute('aria-busy'), 'true');
assert.equal(fetchCalls.length, 0, 'la configuration est demandée de façon asynchrone au démarrage');
assert.equal(sdkScriptLoads, 0, 'le SDK attend la lecture de la configuration');
assert.equal(window.document.getElementById('google-reviews-rating').hidden, true);

window.document.documentElement.lang = 'uk';
window.dispatchEvent(new window.CustomEvent('lcg-lang-changed', { detail: { lang: 'uk' } }));
assert.equal(button.textContent, 'Спробувати ще раз');
window.document.documentElement.lang = 'fr';
window.dispatchEvent(new window.CustomEvent('lcg-lang-changed', { detail: { lang: 'fr' } }));

await new Promise((resolve) => setTimeout(resolve, 25));
assert.deepEqual(fetchCalls, ['assets/data/avis-google.json']);
assert.equal(sdkScriptLoads, 1, 'la bibliothèque Google doit démarrer automatiquement');
assert.equal(sdkLibraryImports, 1, 'Places doit être importé sans clic du visiteur');
assert.equal(button.hidden, true, 'le bouton de secours reste masqué lorsque les avis sont chargés');
assert.equal(button.disabled, false);
assert.equal(button.getAttribute('aria-busy'), 'false');
assert.ok(requestedFields.includes('reviews'));
assert.ok(requestedFields.includes('rating'));
assert.equal(requestedFields.includes('userRatingCount'), false, 'le nombre d’avis ne doit plus être demandé ni affiché');
assert.equal(requestedFields.includes('attributions'), false, 'les attributions Place sont disponibles sans les demander dans le masque de champs');
assert.equal(window.document.getElementById('google-reviews-score').textContent, '4,8/5');
assert.equal(window.document.getElementById('google-reviews-count'), null, 'le nombre d’avis doit être absent du bloc');
assert.equal(window.document.getElementById('google-reviews-dots').children.length, 2);
assert.ok(window.document.getElementById('google-reviews-disclosure-text').textContent.includes('sans filtre par note'));
assert.equal(status.textContent, '', 'le statut de chargement ne doit pas se confondre avec le compteur du carrousel');
assert.ok(position.textContent.includes('1 sur 2'));
assert.equal(position.hidden, false);

window.document.getElementById('google-reviews-next').click();
assert.ok(window.document.getElementById('google-reviews-slide').textContent.includes('deuxième fixture fictive'));
assert.ok(position.textContent.includes('2 sur 2'));
assert.ok(window.document.querySelector('.google-reviews-source').href.endsWith('/fixture-2'));
assert.equal(window.document.querySelectorAll('.google-reviews-review-rating, .google-reviews-review-stars').length, 0,
  'les étoiles par avis ne doivent pas doubler la note globale');

console.log('  ok   Carrousel : chargement automatique et navigation vérifiés sur fixtures synthétiques (pas de validation Google en direct)');
window.close();
