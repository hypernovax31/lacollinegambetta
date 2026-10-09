#!/usr/bin/env node
// Parcours « Métro Gambetta • Ligne 3 » tel qu'il doit se comporter :
//   - au clic, le mobile est invité à ouvrir l'application « Bonjour RATP »
//     (schéma ratp:// sur iOS, Intent com.fabernovel.ratp sur Android Chrome) ;
//   - si l'utilisateur refuse ou n'a pas l'application, une nouvelle page ou
//     un nouvel onglet s'ouvre sur ratp.fr avec le LIEU ACTUEL de
//     l'utilisateur en départ (?start=) et l'adresse du restaurant en arrivée
//     (?end=4 Rue Belgrand 75020 Paris) ;
//   - la position n'est demandée que quand le site RATP doit s'ouvrir ;
//   - et c'est tout : aucun lien manuel, aucune page intermédiaire.
// A lancer avec : node tools/verifier_ratp_itineraires.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { carteChromiumArgs } from './chromium-args.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const ARRIVEE = '4 Rue Belgrand 75020 Paris';
const ADRESSE_POSITION = '12 Rue de la Paix, 75002 Paris';
const PAGE_RATP = '<!doctype html><html lang="fr"><title>Itinéraires RATP</title><body>fixture locale</body></html>';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_INTEGRE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0';
const REVERSE_BAN = JSON.stringify({
  features: [{ properties: { label: ADRESSE_POSITION } }],
});

function startServer() {
  const server = createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = normalize(join(ROOT, relative));
    if (!file.startsWith(`${ROOT}/`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(readFileSync(file));
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

/* Toutes les requêtes externes sont interceptées localement : rien n'est
   envoyé à ratp.fr, à bonjour-ratp.fr ni à l'API政府 pendant le contrôle.
   La Base Adresse Nationale renvoie une adresse fixture. */
async function poserInterception(contexte, origineLocale, journal) {
  await contexte.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origineLocale) return route.continue();
    journal.push(url.href);
    if (url.hostname === 'api-adresse.data.gouv.fr') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: REVERSE_BAN });
    }
    if (/(^|\.)ratp\.fr$/.test(url.hostname) || /(^|\.)bonjour-ratp\.fr$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_RATP });
    }
    return route.abort();
  });
}

let server;
let browser;
try {
  server = await startServer();
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  browser = await chromium.launch({
    headless: true,
    executablePath: await chromiumBinary.executablePath(),
    args: [...carteChromiumArgs(), '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const urlAccueil = `${origin}/index.html?lang=fr`;

  // 1. Android Chrome : l'Intent est émis au clic, avec en repli natif la
  //    page courante marquée ?ratp=1. Le site n'ajoute rien d'autre.
  const journalAndroid = [];
  const android = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: UA_ANDROID,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  const home = await android.newPage();
  await poserInterception(android, origin, journalAndroid);
  const requetesAndroid = [];
  const popupsAndroid = [];
  home.on('request', (requete) => requetesAndroid.push(requete.url()));
  home.on('popup', (page) => popupsAndroid.push(page));
  await home.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  /* Le trajet RATP d'origine est lu dans le HTML servi (le script réécrit
     ensuite le href du lien pour viser l'application). */
  const reponse = await home.request.get(urlAccueil);
  const sourcePage = await reponse.text();
  const matchLien = sourcePage.match(/<a[^>]*data-ratp-itineraire[^>]*>/);
  assert.ok(matchLien, 'le lien métro doit exister dans la page');
  const matchTrajet = matchLien[0].match(/href="(https:\/\/www\.ratp\.fr[^"]*)"/);
  assert.ok(matchTrajet, 'le lien doit porter le trajet RATP dans son href');
  const trajetOrigine = matchTrajet[1].replace(/&amp;/g, '&');
  const appHref = await home.locator('[data-ratp-itineraire]').first()
    .getAttribute('data-ratp-app-href');
  await home.locator('[data-ratp-itineraire]').first().click();
  await home.waitForTimeout(800);
  /* Chromium tronque la requête intent:// émise (le fragment #Intent;… n'y
     figure pas) : on vérifie la partie visible, et la construction complète est
     re-jouée depuis le script du site. */
  const intent = requetesAndroid.find((url) => url.startsWith('intent://'));
  assert.ok(intent, 'Android Chrome doit viser l’application Bonjour RATP via un Intent');
  assert.ok(intent.startsWith('intent://www.bonjour-ratp.fr/itineraires/?end='),
    'l’Intent doit viser l’itinéraire Bonjour RATP');
  const sourceIntent = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  const debutIntent = sourceIntent.indexOf('function intentUrl');
  const finIntent = sourceIntent.indexOf('/* Lieu actuel');
  const construireIntent = new Function(`${sourceIntent.slice(debutIntent, finIntent)}\nreturn intentUrl;`)();
  /* Le repli natif est la page courante marquée ?ratp=1 (même origine). */
  const repliAttendu = new URL(urlAccueil);
  repliAttendu.searchParams.set('ratp', '1');
  const intentComplet = construireIntent(appHref, repliAttendu.href);
  assert.ok(intentComplet.includes('package=com.fabernovel.ratp'),
    'l’Intent doit désigner le paquet officiel Bonjour RATP');
  assert.ok(intentComplet.includes('S.browser_fallback_url='),
    'l’Intent doit prévoir un repli natif si l’application est absente');
  const parametres = intentComplet.split('#Intent;')[1].split(';');
  const repli = parametres.find((p) => p.startsWith('S.browser_fallback_url='));
  const urlRepli = new URL(decodeURIComponent(repli.slice('S.browser_fallback_url='.length)));
  assert.equal(urlRepli.origin, origin, 'le repli natif doit rester sur le site');
  assert.equal(urlRepli.searchParams.get('ratp'), '1',
    'le repli natif doit marquer la page (?ratp=1) pour ouvrir le site RATP ensuite');
  assert.equal(popupsAndroid.length, 0,
    'le site n’ajoute aucun onglet : c’est l’Intent natif qui gère le repli');
  assert.ok(!journalAndroid.some((url) => url.includes('api-adresse.data.gouv.fr')),
    'tant que l’application n’est pas écartée, aucune position n’est demandée');
  await android.close();
  console.log('  ok   Android : Intent émis au clic (repli natif ?ratp=1), le site n’ajoute rien');

  // 2. Android, application absente (simulation du repli natif) : Chrome a
  //    rechargé la page avec ?ratp=1 -> le site RATP s'ouvre (nouvelle page)
  //    avec le lieu actuel en départ et le restaurant en arrivée.
  const journalRetour = [];
  const androidRetour = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: UA_ANDROID,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  const pageRetour = await androidRetour.newPage();
  await poserInterception(androidRetour, origin, journalRetour);
  const urlRetour = `${origin}/index.html?lang=fr&ratp=1`;
  await pageRetour.goto(urlRetour, { waitUntil: 'domcontentloaded' });
  await pageRetour.waitForURL((url) => url.hostname === 'www.ratp.fr', { timeout: 15000 });
  const urlRATP = new URL(pageRetour.url());
  assert.equal(urlRATP.pathname, '/itineraires');
  assert.equal(urlRATP.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit être l’adresse du restaurant');
  assert.equal(urlRATP.searchParams.get('start'), ADRESSE_POSITION,
    'le départ doit être le lieu actuel de l’utilisateur (reverse géocodé)');
  assert.ok(journalRetour.some((url) => url.includes('api-adresse.data.gouv.fr/reverse/')),
    'la position doit être convertie en adresse via la Base Adresse Nationale');
  await androidRetour.close();
  console.log('  ok   Android sans application : page ratp.fr ouverte, départ = lieu actuel, arrivée = restaurant');

  // 3. Android, application absente et géolocalisation refusée : le site
  //    RATP s'ouvre avec seulement l'arrivée remplie.
  const journalRefus = [];
  const androidRefus = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: UA_ANDROID,
    permissions: [],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  const pageRefus = await androidRefus.newPage();
  await androidRefus.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    journalRefus.push(url.href);
    if (url.hostname === 'api-adresse.data.gouv.fr') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: REVERSE_BAN });
    }
    if (/(^|\.)ratp\.fr$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_RATP });
    }
    return route.abort();
  });
  /* Refus de la géolocalisation : la permission n'est pas accordée, donc
     getCurrentPosition appelle son callback d'erreur et le départ reste vide. */
  await pageRefus.goto(`${origin}/index.html?lang=fr&ratp=1`, { waitUntil: 'domcontentloaded' });
  await pageRefus.waitForURL((url) => url.hostname === 'www.ratp.fr', { timeout: 20000 });
  const urlRefus = new URL(pageRefus.url());
  assert.equal(urlRefus.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit rester remplie même sans position');
  assert.equal(urlRefus.searchParams.get('start'), null,
    'sans position, le départ reste vide (l’internaute le saisit)');
  await androidRefus.close();
  console.log('  ok   Android sans position : page ratp.fr ouverte, arrivée seule remplie');

  // 4. iOS : le clic émet le schéma ratp:// (demande « Ouvrir dans Bonjour
  //    RATP ? ») ; si l'application ne s'ouvre pas (refus ou absente), le
  //    trajet s'ouvre dans un NOUVEL onglet avec départ = lieu actuel et
  //    arrivée = restaurant — la page du site n'est pas écrasée.
  const journalIOS = [];
  const ios = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_IPHONE,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  const iphone = await ios.newPage();
  await poserInterception(ios, origin, journalIOS);
  const requetesIOS = [];
  const popupsIOS = [];
  iphone.on('request', (requete) => requetesIOS.push(requete.url()));
  iphone.on('popup', (page) => popupsIOS.push(page));
  await iphone.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  assert.equal(await iphone.locator('meta[name="apple-itunes-app"]').count(), 0,
    'aucune bannière système ne doit s’afficher dans Safari');
  const departIOS = Date.now();
  await iphone.locator('[data-ratp-itineraire]').first().click();
  await iphone.waitForTimeout(500);
  assert.ok(requetesIOS.includes('ratp://') && requetesIOS.includes('bonjourratp://'),
    'le clic doit émettre les deux schémas candidats (ratp:// et bonjourratp://) — c’est le schéma déclaré par l’application qui déclenche « Ouvrir dans Bonjour RATP ? »');
  assert.equal(popupsIOS.length, 0, 'aucun onglet ne doit s’ouvrir au clic');
  assert.ok(!journalIOS.some((url) => url.includes('api-adresse.data.gouv.fr')),
    'la position ne doit pas être demandée tant que l’application peut s’ouvrir');
  const [ongletTrajet] = await Promise.all([
    iphone.waitForEvent('popup', { timeout: 15000 }),
    iphone.waitForTimeout(2600),
  ]);
  await ongletTrajet.waitForLoadState('domcontentloaded').catch(() => {});
  const trajetIOS = new URL(ongletTrajet.url());
  assert.equal(trajetIOS.hostname, 'www.ratp.fr',
    'sans application, le trajet doit s’ouvrir sur ratp.fr');
  assert.equal(trajetIOS.pathname, '/itineraires');
  assert.equal(trajetIOS.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit être l’adresse du restaurant');
  assert.equal(trajetIOS.searchParams.get('start'), ADRESSE_POSITION,
    'le départ doit être le lieu actuel de l’utilisateur');
  assert.ok(Date.now() - departIOS >= 1800,
    'le trajet ne doit venir qu’après la demande d’ouverture');
  assert.equal(iphone.url(), urlAccueil,
    'le nouvel onglet ne doit pas écraser la page du site du restaurant');
  assert.ok(journalIOS.some((url) => url.includes('api-adresse.data.gouv.fr/reverse/')),
    'la position doit être convertie en adresse via la Base Adresse Nationale');
  assert.equal(await iphone.locator('.footer-details__metro-site').count(), 0,
    'et c’est tout : aucun lien manuel');
  assert.ok(!journalIOS.some((url) => url.startsWith('intent://')),
    'iOS ne doit pas recevoir d’Intent Android');
  await ios.close();
  console.log('  ok   iOS : demande d’ouverture au clic, nouvel onglet ratp.fr (départ = lieu actuel, arrivée = restaurant)');

  // 5. Navigateur intégré (Instagram) : les lancements sont bloqués, le
  //    trajet s'ouvre dans un nouvel onglet avec départ et arrivée.
  const journalBloque = [];
  const integre = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_INTEGRE,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  const insta = await integre.newPage();
  await integre.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    journalBloque.push(url.href);
    if (url.hostname === 'api-adresse.data.gouv.fr') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: REVERSE_BAN });
    }
    if (/(^|\.)ratp\.fr$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_RATP });
    }
    if (/(^|\.)bonjour-ratp\.fr$/.test(url.hostname)) {
      /* Les navigateurs intégrés annulent le lancement d'application. */
      return route.fulfill({ status: 204, body: '' });
    }
    return route.abort();
  });
  const popupsBloque = [];
  insta.on('popup', (page) => popupsBloque.push(page));
  await insta.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  await insta.locator('[data-ratp-itineraire]').first().click();
  const [ongletBloque] = await Promise.all([
    insta.waitForEvent('popup', { timeout: 15000 }),
    insta.waitForTimeout(3200),
  ]);
  await ongletBloque.waitForLoadState('domcontentloaded').catch(() => {});
  const trajetBloque = new URL(ongletBloque.url());
  assert.equal(trajetBloque.hostname, 'www.ratp.fr',
    'lancement bloqué : le trajet doit s’ouvrir sur ratp.fr');
  assert.equal(trajetBloque.searchParams.get('end'), ARRIVEE);
  assert.equal(trajetBloque.searchParams.get('start'), ADRESSE_POSITION,
    'le départ doit être le lieu actuel aussi dans ce cas');
  assert.equal(insta.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  await integre.close();
  console.log('  ok   Navigateur intégré : nouvel onglet ratp.fr, départ = lieu actuel, page du site intacte');

  // 6. Application ouverte (simulation) : la page passe en arrière-plan,
  //    aucun onglet ne s'ouvre, aucune position n'est demandée.
  const journalOuvert = [];
  const iosOuverte = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_IPHONE,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  await iosOuverte.addInitScript(() => {
    /* Simule l'ouverture de l'application : la page passe en arrière-plan. */
    window.__applicationOuverte = false;
    Object.defineProperty(document, 'hidden', { get: () => window.__applicationOuverte });
    Object.defineProperty(document, 'visibilityState', {
      get: () => (window.__applicationOuverte ? 'hidden' : 'visible'),
    });
    window.addEventListener('click', () => {
      window.__applicationOuverte = true;
      document.dispatchEvent(new Event('visibilitychange'));
    }, true);
  });
  const pageOuverte = await iosOuverte.newPage();
  await poserInterception(iosOuverte, origin, journalOuvert);
  const popupsOuverts = [];
  pageOuverte.on('popup', (page) => popupsOuverts.push(page));
  await pageOuverte.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  await pageOuverte.locator('[data-ratp-itineraire]').first().click();
  await pageOuverte.waitForTimeout(4000);
  assert.equal(popupsOuverts.length, 0,
    'l’application s’est ouverte : aucun onglet ne doit s’ouvrir');
  assert.equal(await pageOuverte.locator('.footer-details__metro-site').count(), 0,
    'l’application s’est ouverte : et c’est tout, aucun lien manuel');
  assert.ok(!journalOuvert.some((url) => url.includes('api-adresse.data.gouv.fr')),
    'l’application s’est ouverte : aucune position ne doit être demandée');
  await iosOuverte.close();
  console.log('  ok   Application ouverte : la page passe en arrière-plan, aucune position demandée, rien d’autre');
} catch (error) {
  console.error(`Échec vérification itinéraires RATP : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
