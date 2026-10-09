#!/usr/bin/env node
// Parcours « Métro Gambetta • Ligne 3 » tel qu'il doit se comporter :
//   - au clic, le trajet s'ouvre IMMÉDIATEMENT sur ratp.fr (nouvel onglet,
//     AUCUN délai) avec l'arrivée = adresse du restaurant ; le départ = lieu
//     actuel est ajouté dès que la géolocalisation est résolue ;
//   - la demande d'ouverture de l'application « Bonjour RATP » est émise en
//     parallèle (schémas candidats sur iOS, Intent com.fabernovel.ratp sur
//     Android Chrome) : si l'application s'ouvre, l'onglet du site RATP se
//     ferme tout seul ; si elle n'apparaît pas, l'onglet reste.
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
   envoyé à ratp.fr, à bonjour-ratp.fr ni à l'API Adresse pendant le contrôle.
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

  // 1. Android Chrome : au clic, l'onglet ratp.fr s'ouvre IMMÉDIATEMENT
  //    (sans délai) avec l'arrivée remplie, et l'Intent est émis en parallèle.
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
  const promessePopupAndroid = home.waitForEvent('popup', { timeout: 5000 });
  const departAndroid = Date.now();
  await home.locator('[data-ratp-itineraire]').first().click();
  const ongletAndroid = await promessePopupAndroid;
  const delaiOuverture = Date.now() - departAndroid;
  await ongletAndroid.waitForLoadState('domcontentloaded').catch(() => {});
  const urlOuverte = new URL(ongletAndroid.url());
  assert.ok(delaiOuverture < 1500,
    `le trajet doit s’ouvrir sans délai (ouvert en ${delaiOuverture} ms)`);
  assert.equal(urlOuverte.hostname, 'www.ratp.fr');
  assert.equal(urlOuverte.pathname, '/itineraires');
  assert.equal(urlOuverte.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit être remplie dès l’ouverture');
  await home.waitForTimeout(400);
  const intent = requetesAndroid.find((url) => url.startsWith('intent://'));
  assert.ok(intent, 'Android Chrome doit aussi émettre l’Intent vers l’application Bonjour RATP');
  /* Le départ (lieu actuel) complète l'onglet ouvert dès que la position est résolue. */
  await home.waitForFunction(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref && ref.location && ref.location.href.includes('start=');
  }, { timeout: 15000 }).catch(() => {});
  const urlComplete = new URL(await ongletAndroid.evaluate(() => window.location.href));
  assert.equal(urlComplete.searchParams.get('end'), ARRIVEE);
  assert.equal(urlComplete.searchParams.get('start'), ADRESSE_POSITION,
    'le départ doit être le lieu actuel (ajouté dès que la position est résolue)');
  /* L'Intent : repli natif = page courante marquée ?ratp=1 (pas de page d'erreur). */
  const sourceIntent = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  const debutIntent = sourceIntent.indexOf('function intentUrl');
  const finIntent = sourceIntent.indexOf('/* Lieu actuel');
  const construireIntent = new Function(`${sourceIntent.slice(debutIntent, finIntent)}\nreturn intentUrl;`)();
  const appHref = await home.locator('[data-ratp-itineraire]').first()
    .getAttribute('data-ratp-app-href');
  const repliAttendu = new URL(urlAccueil);
  repliAttendu.searchParams.set('ratp', '1');
  const intentComplet = construireIntent(appHref, repliAttendu.href);
  assert.ok(intentComplet.includes('package=com.fabernovel.ratp'),
    'l’Intent doit désigner le paquet officiel Bonjour RATP');
  assert.ok(intentComplet.includes('S.browser_fallback_url=' + encodeURIComponent(repliAttendu.href)),
    'le repli natif doit marquer la page (?ratp=1), jamais une page d’erreur');
  await android.close();
  console.log(`  ok   Android : trajet ouvert en ${delaiOuverture} ms (sans délai), Intent émis en parallèle, départ = lieu actuel`);

  // 2. Android, application absente (simulation du repli natif ?ratp=1) : la
  //    page se recharge marquée, l'URL est nettoyée, et l'onglet du trajet
  //    (ouvert au clic, retrouvé par son nom) reçoit le départ.
  const journalRetour = [];
  const androidRetour = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: UA_ANDROID,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  const pageRetour = await androidRetour.newPage();
  await poserInterception(androidRetour, origin, journalRetour);
  /* L'onglet du trajet, ouvert au clic précédent (simulé ici). */
  const ongletPrecedent = await androidRetour.newPage();
  await ongletPrecedent.goto(`${origin}/index.html?lang=fr`, { waitUntil: 'domcontentloaded' });
  await ongletPrecedent.evaluate((url) => { window.open(url, 'ratp-trajet'); },
    'https://www.ratp.fr/itineraires?end=' + encodeURIComponent(ARRIVEE));
  await pageRetour.goto(`${origin}/index.html?lang=fr&ratp=1`, { waitUntil: 'domcontentloaded' });
  await pageRetour.waitForFunction(() => !window.location.search.includes('ratp=1'), { timeout: 5000 });
  assert.ok(!pageRetour.url().includes('ratp=1'), 'le marqueur ?ratp=1 doit être nettoyé');
  const refRetrouvee = await pageRetour.evaluate(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref ? ref.location.href : null;
  });
  await pageRetour.waitForFunction(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref && ref.location.href.includes('start=');
  }, { timeout: 15000 });
  const urlRetrouvee = new URL(await pageRetour.evaluate(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref.location.href;
  }));
  assert.equal(urlRetrouvee.hostname, 'www.ratp.fr');
  assert.equal(urlRetrouvee.searchParams.get('end'), ARRIVEE);
  assert.equal(urlRetrouvee.searchParams.get('start'), ADRESSE_POSITION,
    'l’onglet du trajet doit recevoir le départ (lieu actuel) même après le repli Android');
  assert.ok(journalRetour.some((url) => url.includes('api-adresse.data.gouv.fr/reverse/')),
    'la position doit être convertie en adresse via la Base Adresse Nationale');
  await androidRetour.close();
  console.log('  ok   Android sans application : ?ratp=1 nettoyé, onglet du trajet complété (départ = lieu actuel)');

  // 3. iOS : au clic, l'onglet ratp.fr s'ouvre IMMÉDIATEMENT (sans délai)
  //    avec l'arrivée remplie, les schémas candidats sont émis en parallèle,
  //    et le départ complète l'onglet dès que la position est résolue.
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
  const promessePopupIOS = iphone.waitForEvent('popup', { timeout: 5000 });
  const departIOS = Date.now();
  await iphone.locator('[data-ratp-itineraire]').first().click();
  const ongletIOS = await promessePopupIOS;
  const delaiIOS = Date.now() - departIOS;
  await ongletIOS.waitForLoadState('domcontentloaded').catch(() => {});
  assert.ok(delaiIOS < 1500, `le trajet doit s’ouvrir sans délai (ouvert en ${delaiIOS} ms)`);
  const urlInitiale = new URL(ongletIOS.url());
  assert.equal(urlInitiale.hostname, 'www.ratp.fr');
  assert.equal(urlInitiale.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit être remplie dès l’ouverture');
  await iphone.waitForTimeout(400);
  assert.ok(requetesIOS.includes('ratp://') && requetesIOS.includes('bonjourratp://'),
    'le clic doit émettre les deux schémas candidats — c’est le schéma déclaré par l’application qui déclenche « Ouvrir dans Bonjour RATP ? »');
  assert.equal(iphone.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  /* Le départ complète l'onglet ouvert dès que la position est résolue. */
  await iphone.waitForFunction(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref && ref.location && ref.location.href.includes('start=');
  }, { timeout: 15000 });
  const urlCompleteIOS = new URL(await ongletIOS.evaluate(() => window.location.href));
  assert.equal(urlCompleteIOS.searchParams.get('end'), ARRIVEE);
  assert.equal(urlCompleteIOS.searchParams.get('start'), ADRESSE_POSITION,
    'le départ doit être le lieu actuel de l’utilisateur');
  assert.ok(journalIOS.some((url) => url.includes('api-adresse.data.gouv.fr/reverse/')),
    'la position doit être convertie en adresse via la Base Adresse Nationale');
  assert.ok(!journalIOS.some((url) => url.startsWith('intent://')),
    'iOS ne doit pas recevoir d’Intent Android');
  await ios.close();
  console.log(`  ok   iOS : trajet ouvert en ${delaiIOS} ms (sans délai), schémas émis en parallèle, départ = lieu actuel`);

  // 4. Navigateur intégré (Instagram) : pas de lancement d'application, le
  //    trajet s'ouvre immédiatement avec arrivée puis départ.
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
  await insta.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  const promessePopupBloque = insta.waitForEvent('popup', { timeout: 5000 });
  const departBloque = Date.now();
  await insta.locator('[data-ratp-itineraire]').first().click();
  const ongletBloque = await promessePopupBloque;
  const delaiBloque = Date.now() - departBloque;
  await ongletBloque.waitForLoadState('domcontentloaded').catch(() => {});
  assert.ok(delaiBloque < 1500, `lancement bloqué : le trajet doit quand même s’ouvrir sans délai (${delaiBloque} ms)`);
  assert.equal(new URL(ongletBloque.url()).searchParams.get('end'), ARRIVEE);
  await insta.waitForFunction(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref && ref.location && ref.location.href.includes('start=');
  }, { timeout: 15000 });
  const urlBloque = new URL(await ongletBloque.evaluate(() => window.location.href));
  assert.equal(urlBloque.searchParams.get('start'), ADRESSE_POSITION);
  assert.equal(insta.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  await integre.close();
  console.log(`  ok   Navigateur intégré : trajet ouvert en ${delaiBloque} ms malgré le blocage, départ = lieu actuel`);

  // 5. Application ouverte (simulation) : l'onglet s'ouvre immédiatement,
  //    puis se ferme tout seul quand l'application prend la main.
  const journalOuvert = [];
  const iosOuverte = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_IPHONE,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  await iosOuverte.addInitScript(() => {
    /* Simule l'ouverture de l'application peu après le clic : la page passe
       en arrière-plan. */
    window.__applicationOuverte = false;
    Object.defineProperty(document, 'hidden', { get: () => window.__applicationOuverte });
    Object.defineProperty(document, 'visibilityState', {
      get: () => (window.__applicationOuverte ? 'hidden' : 'visible'),
    });
    window.addEventListener('click', () => {
      setTimeout(() => {
        window.__applicationOuverte = true;
        document.dispatchEvent(new Event('visibilitychange'));
      }, 300);
    }, true);
  });
  const pageOuverte = await iosOuverte.newPage();
  await poserInterception(iosOuverte, origin, journalOuvert);
  const popupsOuverts = [];
  pageOuverte.on('popup', (page) => popupsOuverts.push(page));
  await pageOuverte.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  const promessePopupOuvert = pageOuverte.waitForEvent('popup', { timeout: 5000 });
  await pageOuverte.locator('[data-ratp-itineraire]').first().click();
  const ongletOuvert = await promessePopupOuvert;
  assert.equal(new URL(ongletOuvert.url()).hostname, 'www.ratp.fr',
    'l’application s’ouvre : l’onglet du trajet s’ouvre quand même immédiatement');
  /* L'application prend la main (page cachée) -> l'onglet du site RATP se
     ferme tout seul. On suit la fermeture via la référence du popup. */
  await pageOuverte.waitForFunction(() => document.hidden === true, { timeout: 8000 });
  await pageOuverte.waitForTimeout(600);
  assert.ok(ongletOuvert.isClosed(),
    'l’application s’est ouverte : l’onglet du site RATP doit se fermer tout seul');
  await iosOuverte.close();
  console.log('  ok   Application ouverte : onglet du trajet ouvert immédiatement, puis fermé quand l’app prend la main');
} catch (error) {
  console.error(`Échec vérification itinéraires RATP : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
