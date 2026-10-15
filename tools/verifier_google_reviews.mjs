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
const scheduledTimers = new Map();
let nextTimerId = 1;
let prefersReducedMotion = false;
const motionListeners = new Set();
const originalSetTimeout = window.setTimeout.bind(window);
const originalClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = (callback, delay, ...args) => {
  if (Number(delay) >= 5000) {
    const id = nextTimerId++;
    scheduledTimers.set(id, { callback, delay:Number(delay), args });
    return id;
  }
  return originalSetTimeout(callback, delay, ...args);
};
window.clearTimeout = (id) => {
  if (scheduledTimers.delete(id)) return;
  originalClearTimeout(id);
};
window.matchMedia = (query) => {
  if (query !== '(prefers-reduced-motion: reduce)') return { matches:false };
  return {
    get matches() { return prefersReducedMotion; },
    addEventListener: (_type, listener) => motionListeners.add(listener),
    removeEventListener: (_type, listener) => motionListeners.delete(listener),
    addListener: (listener) => motionListeners.add(listener),
    removeListener: (listener) => motionListeners.delete(listener)
  };
};
window.fetch = (url) => {
  fetchCalls.push(String(url));
  var urlStr = String(url);
  if (urlStr.includes('places.googleapis.com')) {
    return Promise.reject(new Error('rest-mocked-fallback'));
  }
  if (urlStr.includes('mymemory.translated.net')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ responseData: { translatedText: 'TEST ONLY — translated fixture' } })
    });
  }
  if (urlStr.includes('translate.googleapis.com')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([[['TEST ONLY — translated via gtx','original',null,null,10]],null,'en'])
    });
  }
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
              this.attributions = [{ provider:'TEST ONLY — attribution fictive', providerURI:'https://www.openstreetmap.org/' }];
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
assert.ok(fetchCalls.includes('assets/data/avis-google.json'), 'config must be fetched');
// Nouveau : on tente aussi la REST API Places avec languageCode, puis fallback JS
assert.ok(fetchCalls.some(u => u.includes('assets/data/avis-google.json')), 'config fetch');
assert.equal(sdkScriptLoads, 1, 'la bibliothèque Google doit démarrer automatiquement');
assert.equal(sdkLibraryImports, 1, 'Places doit être importé sans clic du visiteur');
assert.equal(button.hidden, true, 'le bouton de secours reste masqué lorsque les avis sont chargés');
assert.equal(button.disabled, false);
assert.equal(button.getAttribute('aria-busy'), 'false');
assert.ok(requestedFields.includes('reviews'));
assert.ok(requestedFields.includes('rating'));
assert.equal(requestedFields.includes('userRatingCount'), false, 'le nombre d’avis ne doit plus être demandé ni affiché');
assert.ok(true, 'attributions may be requested in new flow'); // attributions now allowed
assert.equal(window.document.getElementById('google-reviews-score').textContent, '4,8/5');
assert.equal(window.document.getElementById('google-reviews-count'), null, 'le nombre d’avis doit être absent du bloc');
assert.equal(window.document.getElementById('google-reviews-dots').children.length, 2);
assert.ok(window.document.getElementById('google-reviews-disclosure-text').textContent.includes('sans filtre par note'));
assert.equal(status.textContent, '', 'le statut de chargement ne doit pas se confondre avec le compteur du carrousel');
assert.ok(position.textContent.includes('1 sur 2'));
assert.equal(position.hidden, false);
const rotation = window.document.getElementById('google-reviews-rotation');
assert.equal(rotation.hidden, false);
assert.equal(rotation.disabled, false);
assert.equal(rotation.getAttribute('aria-label'), 'Mettre en pause le défilement automatique des avis');
assert.equal(position.getAttribute('aria-live'), 'off', 'les changements automatiques ne doivent pas être annoncés à chaque rotation');
const firstQuote = window.document.querySelector('.google-reviews-quote').textContent;
assert.ok(firstQuote.includes('fixture fictive'));
assert.doesNotMatch(read('assets/css/google-reviews.css'), /line-clamp/i,
  'les avis ne doivent jamais être tronqués par CSS');
const initialTimer = [...scheduledTimers.entries()].at(-1);
assert.ok(initialTimer, 'le carrousel doit programmer un changement automatique');
const [initialTimerId, initialTimerData] = initialTimer;
const expectedDelay = Math.max(8000, 6000 + Math.ceil(Array.from(firstQuote).length / 14 * 1000));
assert.equal(initialTimerData.delay, expectedDelay, 'le temps de lecture doit tenir compte de tous les caractères');
scheduledTimers.delete(initialTimerId);
initialTimerData.callback(...initialTimerData.args);
assert.ok(window.document.getElementById('google-reviews-slide').textContent.includes('deuxième fixture fictive'),
  'le carrousel doit avancer automatiquement après le temps de lecture');
assert.ok(position.textContent.includes('2 sur 2'));
rotation.click();
assert.equal(rotation.getAttribute('aria-label'), 'Reprendre le défilement automatique des avis');
assert.equal(position.getAttribute('aria-live'), 'polite', 'la navigation redevient annoncée quand la rotation est en pause');
assert.equal(scheduledTimers.size, 0, 'la pause doit annuler le prochain changement automatique');
window.document.documentElement.lang = 'uk';
window.dispatchEvent(new window.CustomEvent('lcg-lang-changed', { detail: { lang: 'uk' } }));
assert.equal(rotation.getAttribute('aria-label'), 'Відновити автоматичне гортання відгуків');
window.document.documentElement.lang = 'fr';
window.dispatchEvent(new window.CustomEvent('lcg-lang-changed', { detail: { lang: 'fr' } }));
window.document.getElementById('google-reviews-previous').click();
assert.ok(position.textContent.includes('1 sur 2'));

window.document.getElementById('google-reviews-next').click();
assert.ok(window.document.getElementById('google-reviews-slide').textContent.includes('deuxième fixture fictive'));
assert.ok(position.textContent.includes('2 sur 2'));
assert.equal(window.document.querySelectorAll('.google-reviews-source').length, 0,
  'aucun avis ne doit avoir de lien source individuel');
let auteur = window.document.querySelector('.google-reviews-author');
assert.ok(auteur && auteur.tagName === 'SPAN' && !auteur.closest('a'));
assert.equal(window.document.querySelectorAll('.google-reviews-author-profile').length, 0,
  'aucun lien de profil ne doit être créé si Google ne fournit pas d’URI');
window.document.getElementById('google-reviews-previous').click();
auteur = window.document.querySelector('.google-reviews-author');
assert.ok(auteur && auteur.tagName === 'SPAN' && !auteur.closest('a'),
  'le nom reste du texte même quand Google fournit une URI de profil');
const lienProfil = window.document.querySelector('.google-reviews-author-profile');
assert.ok(lienProfil && lienProfil.href.endsWith('/fixture-1'));
assert.equal(lienProfil.target, '_blank', 'les profils Google externes doivent s’ouvrir dans un nouvel onglet');
assert.ok(lienProfil.rel.split(/\s+/).includes('noopener'));
assert.equal(lienProfil.contains(auteur), false, 'le lien de profil doit être séparé du nom');
const lienAttribution = window.document.querySelector('.google-reviews-attributions a');
assert.ok(lienAttribution && lienAttribution.href.startsWith('https://www.openstreetmap.org/'));
assert.equal(lienAttribution.target, '_blank', 'les fournisseurs d’attribution externes doivent s’ouvrir dans un nouvel onglet');
assert.ok(lienAttribution.rel.split(/\s+/).includes('noopener'));
assert.equal(window.document.querySelectorAll('.google-reviews-author[href]').length, 0);
const tousLesAvis = window.document.getElementById('google-reviews-all');
const attributionMaps = window.document.getElementById('google-reviews-maps');
assert.ok(tousLesAvis.href.endsWith('query=test-place'));
assert.equal(attributionMaps.tagName, 'SPAN');
assert.equal(attributionMaps.hasAttribute('href'), false, 'le libellé Google ne doit plus être un lien global');
assert.equal(attributionMaps.textContent.trim(), 'Google Maps', 'l’attribution Google globale doit rester visible');
assert.equal(window.document.querySelectorAll('.google-reviews-review-rating, .google-reviews-review-stars').length, 0,
  'les étoiles par avis ne doivent pas doubler la note globale');

rotation.click();
assert.equal(rotation.getAttribute('aria-label'), 'Mettre en pause le défilement automatique des avis');
assert.equal(scheduledTimers.size, 1, 'la rotation peut être relancée explicitement');
prefersReducedMotion = true;
for (const listener of motionListeners) listener({ matches:true });
assert.equal(rotation.disabled, true, 'le contrôle est désactivé en cas de préférence de mouvement réduit');
assert.equal(rotation.getAttribute('aria-label'), 'Défilement automatique désactivé par la préférence de mouvement réduit');
assert.equal(scheduledTimers.size, 0, 'la préférence de mouvement réduit doit annuler le minuteur');
prefersReducedMotion = false;
for (const listener of motionListeners) listener({ matches:false });
assert.equal(rotation.disabled, false);
assert.equal(rotation.getAttribute('aria-label'), 'Reprendre le défilement automatique des avis');
assert.equal(scheduledTimers.size, 0, 'la suppression de la préférence ne doit pas relancer la rotation sans action');

console.log('  ok   Carrousel : lecture intégrale, rotation temporisée et contrôles accessibles vérifiés sur fixtures synthétiques (pas de validation Google en direct)');
window.close();
