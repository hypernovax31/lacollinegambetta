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
    setTimeout(() => {
      window.google = { maps: { importLibrary: (name) => {
        assert.equal(name, 'places');
        sdkLibraryImports += 1;
        return Promise.resolve({
          Place: class {
            fetchFields(options) {
              requestedFields.push(...options.fields);
              this.rating = 4.8;
              this.userRatingCount = 28;
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
      element.dispatchEvent(new window.Event('load'));
    }, 0);
    return element;
  }
  return originalAppendChild(element);
};
window.eval(read('assets/js/google-reviews.js'));

const button = window.document.getElementById('google-reviews-load');
const status = window.document.getElementById('google-reviews-status');
assert.equal(button.textContent, 'Afficher les avis Google');
assert.equal(button.disabled, false, 'le bouton doit être prêt quand son script est initialisé');
assert.equal(button.getAttribute('aria-busy'), 'false');
assert.equal(fetchCalls.length, 0, 'Google ne doit pas être appelé avant une demande');
assert.equal(sdkScriptLoads, 0, 'la bibliothèque Google ne doit pas être chargée avant le clic');
assert.equal(window.document.getElementById('google-reviews-rating').hidden, true);

window.document.documentElement.lang = 'uk';
window.dispatchEvent(new window.CustomEvent('lcg-lang-changed', { detail: { lang: 'uk' } }));
assert.equal(button.textContent, 'Показати відгуки Google');
window.document.documentElement.lang = 'fr';
window.dispatchEvent(new window.CustomEvent('lcg-lang-changed', { detail: { lang: 'fr' } }));

button.click();
assert.equal(button.disabled, true, 'un seul chargement doit être en cours');
assert.equal(button.getAttribute('aria-busy'), 'true');
await new Promise((resolve) => setTimeout(resolve, 25));
assert.deepEqual(fetchCalls, ['assets/data/avis-google.json']);
assert.equal(sdkScriptLoads, 1, 'une seule action doit aussi initialiser Google');
assert.equal(sdkLibraryImports, 1, 'Places doit être importé sans second clic');
assert.equal(button.hidden, true, 'les avis doivent apparaître après un seul clic');
assert.equal(button.getAttribute('aria-busy'), 'false');
assert.ok(requestedFields.includes('reviews'));
assert.ok(requestedFields.includes('rating'));
assert.equal(window.document.getElementById('google-reviews-score').textContent, '4,8/5');
assert.equal(window.document.getElementById('google-reviews-count').textContent, '28 avis');
assert.equal(window.document.getElementById('google-reviews-dots').children.length, 2);
assert.ok(window.document.getElementById('google-reviews-disclosure-text').textContent.includes('sans filtre de note'));
assert.ok(status.textContent.includes('1 sur 2'));

window.document.getElementById('google-reviews-next').click();
assert.ok(window.document.getElementById('google-reviews-slide').textContent.includes('deuxième fixture fictive'));
assert.ok(status.textContent.includes('2 sur 2'));
assert.ok(window.document.querySelector('.google-reviews-source').href.endsWith('/fixture-2'));
assert.ok(window.document.querySelector('.google-reviews-review-rating span:last-child').textContent === '2/5');

console.log('  ok   Carrousel : un clic initialise Places et affiche les avis, sans requête avant action; navigation vérifiée sur fixtures synthétiques (pas de validation Google en direct)');
window.close();
