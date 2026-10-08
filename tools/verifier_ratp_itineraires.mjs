#!/usr/bin/env node
// Parcours « Métro Gambetta • Ligne 3 » tel qu'il doit se comporter :
//   - au clic, le mobile est invité à ouvrir l'application « Bonjour RATP »
//     (schéma ratp:// sur iOS, Intent com.fabernovel.ratp sur Android Chrome) ;
//   - si l'application n'est pas là, le trajet s'ouvre dans un NOUVEL onglet
//     sur ratp.fr (arrivée remplie) — la page du site n'est jamais écrasée ;
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
const PAGE_RATP = '<!doctype html><html lang="fr"><title>Itinéraires RATP</title><body>fixture locale</body></html>';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_INTEGRE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0';

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
   envoyé à ratp.fr ni à bonjour-ratp.fr pendant le contrôle. */
async function poserInterception(contexte, origineLocale, journal) {
  await contexte.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origineLocale) return route.continue();
    journal.push(url.href);
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

  // 1. Android Chrome : l'Intent est émis au clic (repli natif = trajet RATP),
  //    le site n'ajoute rien d'autre : pas de nouvel onglet JS, la page reste.
  const journalAndroid = [];
  const android = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: UA_ANDROID,
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
  await home.waitForTimeout(3200);
  /* Chromium tronque la requête intent:// émise (le fragment #Intent;… n'y
     figure pas) : on vérifie la partie visible, et la construction complète est
     re-jouée depuis le script du site. */
  const intent = requetesAndroid.find((url) => url.startsWith('intent://'));
  assert.ok(intent, 'Android Chrome doit viser l’application Bonjour RATP via un Intent');
  assert.ok(intent.startsWith('intent://www.bonjour-ratp.fr/itineraires/?end='),
    'l’Intent doit viser l’itinéraire Bonjour RATP');
  assert.ok(intent.includes(encodeURIComponent(ARRIVEE).replace(/%20/g, '+')) || intent.includes(ARRIVEE),
    'l’Intent doit viser l’itinéraire avec l’arrivée du restaurant');
  const sourceIntent = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  const debutIntent = sourceIntent.indexOf('function intentUrl');
  const finIntent = sourceIntent.indexOf('document.querySelectorAll');
  const construireIntent = new Function(`${sourceIntent.slice(debutIntent, finIntent)}\nreturn intentUrl;`)();
  const intentComplet = construireIntent(appHref, trajetOrigine);
  assert.ok(intentComplet.includes('package=com.fabernovel.ratp'),
    'l’Intent doit désigner le paquet officiel Bonjour RATP');
  assert.ok(intentComplet.includes('S.browser_fallback_url='),
    'l’Intent doit prévoir un repli natif (le trajet RATP) si l’application est absente');
  const parametres = intentComplet.split('#Intent;')[1].split(';');
  const repli = parametres.find((p) => p.startsWith('S.browser_fallback_url='));
  const urlRepli = new URL(decodeURIComponent(repli.slice('S.browser_fallback_url='.length)));
  assert.equal(urlRepli.hostname, 'www.ratp.fr');
  assert.equal(urlRepli.searchParams.get('end'), ARRIVEE,
    'le repli natif doit ouvrir le trajet avec l’arrivée remplie');
  assert.equal(popupsAndroid.length, 0,
    'le site n’ajoute aucun onglet : c’est l’Intent natif qui gère le repli');
  assert.equal(home.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  assert.equal(await home.locator('.footer-details__metro-site').count(), 0,
    'et c’est tout : aucun lien manuel');
  assert.ok(!journalAndroid.some((url) => /api-adresse|geolocation/i.test(url)),
    'aucune demande de position ne doit partir du site');
  await android.close();
  console.log('  ok   Android : Intent émis au clic (repli natif = trajet), le site n’ajoute rien');

  // 2. iOS : le clic émet le schéma ratp:// (demande « Ouvrir dans Bonjour
  //    RATP ? »), et si l'application n'est pas là, le trajet s'ouvre dans un
  //    NOUVEL onglet — la page du site n'est pas écrasée.
  const journalIOS = [];
  const ios = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_IPHONE,
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
  assert.ok(requetesIOS.includes('ratp://'),
    'le clic doit émettre le schéma ratp:// — c’est lui qui déclenche la demande « Ouvrir dans Bonjour RATP ? »');
  assert.equal(popupsIOS.length, 0, 'aucun onglet ne doit s’ouvrir au clic');
  assert.equal(iphone.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  const [ongletTrajet] = await Promise.all([
    iphone.waitForEvent('popup', { timeout: 10000 }),
    iphone.waitForTimeout(2600),
  ]);
  await ongletTrajet.waitForLoadState('domcontentloaded').catch(() => {});
  const trajetIOS = new URL(ongletTrajet.url());
  assert.equal(trajetIOS.hostname, 'www.ratp.fr',
    'sans application, le trajet doit s’ouvrir sur ratp.fr');
  assert.equal(trajetIOS.pathname, '/itineraires');
  assert.equal(trajetIOS.searchParams.get('end'), ARRIVEE,
    'la case arrivée doit être remplie avec 4 Rue Belgrand 75020 Paris');
  assert.ok(Date.now() - departIOS >= 2000,
    'le trajet ne doit venir qu’après la demande d’ouverture');
  assert.equal(iphone.url(), urlAccueil,
    'le nouvel onglet ne doit pas écraser la page du site du restaurant');
  assert.equal(await iphone.locator('.footer-details__metro-site').count(), 0,
    'et c’est tout : aucun lien manuel');
  assert.ok(!journalIOS.some((url) => url.startsWith('intent://')),
    'iOS ne doit pas recevoir d’Intent Android');
  assert.ok(!journalIOS.some((url) => /api-adresse|geolocation/i.test(url)),
    'aucune demande de position ne doit partir du site');
  await ios.close();
  console.log('  ok   iOS : demande d’ouverture au clic, trajet en nouvel onglet si pas d’application, page intacte');

  // 3. Navigateur intégré (Instagram) : les lancements sont bloqués, le
  //    trajet s'ouvre dans un nouvel onglet, la page du site reste.
  const journalBloque = [];
  const integre = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_INTEGRE,
  });
  const insta = await integre.newPage();
  await integre.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    journalBloque.push(url.href);
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
    insta.waitForEvent('popup', { timeout: 10000 }),
    insta.waitForTimeout(3200),
  ]);
  await ongletBloque.waitForLoadState('domcontentloaded').catch(() => {});
  assert.equal(new URL(ongletBloque.url()).hostname, 'www.ratp.fr',
    'lancement bloqué : le trajet doit s’ouvrir dans un nouvel onglet');
  assert.equal(new URL(ongletBloque.url()).searchParams.get('end'), ARRIVEE,
    'l’arrivée doit rester remplie dans ce cas aussi');
  assert.equal(insta.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  await integre.close();
  console.log('  ok   Navigateur intégré : trajet en nouvel onglet, page du site intacte');

  // 4. Application ouverte (simulation) : la page passe en arrière-plan,
  //    aucun onglet ne s'ouvre, aucun lien manuel n'est ajouté.
  const iosOuverte = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_IPHONE,
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
  await poserInterception(iosOuverte, origin, []);
  const popupsOuverts = [];
  pageOuverte.on('popup', (page) => popupsOuverts.push(page));
  await pageOuverte.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  await pageOuverte.locator('[data-ratp-itineraire]').first().click();
  await pageOuverte.waitForTimeout(3200);
  assert.equal(popupsOuverts.length, 0,
    'l’application s’est ouverte : aucun onglet ne doit s’ouvrir');
  assert.equal(await pageOuverte.locator('.footer-details__metro-site').count(), 0,
    'l’application s’est ouverte : et c’est tout, aucun lien manuel');
  await iosOuverte.close();
  console.log('  ok   Application ouverte : la page passe en arrière-plan, rien d’autre ne se passe');
} catch (error) {
  console.error(`Échec vérification itinéraires RATP : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
