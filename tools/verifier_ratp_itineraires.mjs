#!/usr/bin/env node
// Parcours « Métro Gambetta • Ligne 3 » tel qu'il doit se comporter :
//   Android  -> l'application est visée (Intent com.fabernovel.ratp) et le
//               trajet est déjà ouvert dans un nouvel onglet sur ratp.fr
//   iOS      -> lien universel Bonjour RATP visé, trajet dans un nouvel onglet
//   aucune page de secours, aucune demande de position
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

  // 1. Android Chrome : Intent visé, trajet ouvert dans un nouvel onglet.
  const journalAndroid = [];
  const android = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
  });
  const home = await android.newPage();
  await poserInterception(android, origin, journalAndroid);
  await home.goto(`${origin}/index.html?lang=fr`, { waitUntil: 'domcontentloaded' });
  const lien = home.locator('[data-ratp-itineraire]').first();
  const avantTap = await lien.evaluate((noeud) => ({
    href: noeud.href, target: noeud.target, appHref: noeud.getAttribute('data-ratp-app-href'),
  }));
  assert.equal(avantTap.href, avantTap.appHref,
    'le lien doit viser l’application Bonjour RATP sur mobile');
  assert.ok(avantTap.href.startsWith('https://www.bonjour-ratp.fr/itineraires/?end='));
  assert.equal(new URL(avantTap.href).searchParams.get('end'), ARRIVEE,
    'l’application doit proposer le restaurant comme arrivée');
  assert.equal(avantTap.target, '', 'le tap ne doit pas ouvrir un onglet vide');
  const depart = Date.now();
  const [ongletTrajet] = await Promise.all([home.waitForEvent('popup'), lien.click()]);
  const delaiTrajet = Date.now() - depart;
  await ongletTrajet.waitForLoadState('domcontentloaded').catch(() => {});
  const trajet = new URL(ongletTrajet.url());
  assert.equal(trajet.hostname, 'www.ratp.fr', 'le trajet doit s’ouvrir sur le site RATP');
  assert.equal(trajet.pathname, '/itineraires');
  assert.equal(trajet.searchParams.get('end'), ARRIVEE,
    'la case arrivée doit être remplie avec 4 Rue Belgrand 75020 Paris');
  assert.ok(delaiTrajet >= 1200,
    `le trajet ne doit venir qu’après la tentative d’application (mesuré : ${delaiTrajet} ms)`);
  assert.ok(!journalAndroid.some((url) => /api-adresse|geolocation/i.test(url)),
    'aucune demande de position ne doit partir du site');
  await android.close();
  console.log(`  ok   Android : application visée au clic, trajet ${delaiTrajet} ms plus tard dans un nouvel onglet`);

  // 2. iOS : lien universel visé, aucun Intent, trajet toujours en nouvel onglet.
  const journalIOS = [];
  const ios = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const iphone = await ios.newPage();
  await poserInterception(ios, origin, journalIOS);
  await iphone.goto(`${origin}/index.html?lang=fr`, { waitUntil: 'domcontentloaded' });
  assert.equal(await iphone.locator('meta[name="apple-itunes-app"]').count(), 0,
    'aucune bannière système ne doit s’afficher dans Safari');
  assert.equal(await iphone.locator('link[href^="itms-apps"], a[href^="itms-apps"]').count(), 0,
    'aucune proposition d’installation ne doit être présente hors clic');
  let popupIOS = null;
  iphone.on('popup', (page) => { popupIOS = page; });
  await iphone.locator('[data-ratp-itineraire]').first().click();
  await iphone.waitForURL((url) => url.hostname === 'www.bonjour-ratp.fr', { timeout: 10000 });
  const lienUniversel = new URL(iphone.url());
  assert.equal(lienUniversel.pathname, '/itineraires/',
    'le clic doit viser le lien universel Bonjour RATP qui ouvre l’application');
  assert.equal(lienUniversel.searchParams.get('end'), ARRIVEE,
    'l’application doit recevoir l’adresse du restaurant en arrivée');
  await iphone.waitForTimeout(2000);
  assert.equal(popupIOS, null,
    'une fois l’application visée, aucun onglet ne doit s’ouvrir en doublon');
  assert.ok(!journalIOS.some((url) => url.startsWith('intent://')),
    'iOS ne doit pas recevoir d’Intent Android');
  assert.ok(!journalIOS.some((url) => /api-adresse|geolocation/i.test(url)),
    'aucune demande de position ne doit partir du site');
  await ios.close();
  console.log('  ok   iOS : le clic propose Bonjour RATP (lien universel, arrivée remplie)');

  // 3. Navigateur intégré : le lancement est bloqué, le trajet s'ouvre seul.
  const journalBloque = [];
  const integre = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0',
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
      /* Les navigateurs intégrés annulent le lancement d'application : la
         navigation n'aboutit pas, la page du site reste affichée. */
      return route.fulfill({ status: 204, body: '' });
    }
    return route.abort();
  });
  await insta.goto(`${origin}/index.html?lang=fr`, { waitUntil: 'domcontentloaded' });
  const departBloque = Date.now();
  const [ongletBloque] = await Promise.all([
    insta.waitForEvent('popup', { timeout: 15000 }),
    insta.locator('[data-ratp-itineraire]').first().click(),
  ]);
  await ongletBloque.waitForLoadState('domcontentloaded').catch(() => {});
  assert.equal(new URL(ongletBloque.url()).hostname, 'www.ratp.fr',
    'lancement bloqué : le trajet doit s’ouvrir dans un nouvel onglet');
  assert.equal(new URL(ongletBloque.url()).searchParams.get('end'), ARRIVEE,
    'l’arrivée doit rester remplie dans ce cas aussi');
  assert.ok(Date.now() - departBloque >= 1200, 'le trajet ne doit venir qu’après la tentative d’application');
  await integre.close();
  console.log('  ok   Navigateur intégré : trajet ouvert automatiquement, arrivée remplie');

  // 4. Intent Android : la construction du script est rejouee telle quelle
  //    (Chromium de bureau n'execute pas les schemes intent:, seul Android le fait).
  const source = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  const debut = source.indexOf('function intentUrl');
  const fin = source.indexOf('document.querySelectorAll');
  assert.ok(debut > 0 && fin > debut, 'la fonction intentUrl doit exister dans le script du site');
  const construireIntent = new Function(`${source.slice(debut, fin)}\nreturn intentUrl;`)();
  const lienApp = 'https://www.bonjour-ratp.fr/itineraires/?end=' + encodeURIComponent(ARRIVEE);
  const retour = 'https://lacollinegambetta.com/index.html';
  const intent = construireIntent(lienApp, retour);
  assert.ok(intent.startsWith(`intent://www.bonjour-ratp.fr/itineraires/?end=${encodeURIComponent(ARRIVEE)}#Intent;`),
    'l’Intent doit viser l’itinéraire Bonjour RATP avec l’arrivée du restaurant');
  assert.ok(intent.includes('scheme=https;package=com.fabernovel.ratp;'),
    'l’Intent doit désigner le paquet officiel Bonjour RATP');
  assert.ok(intent.endsWith(';end'), 'l’Intent doit être clos par ;end');
  assert.ok(intent.includes('S.browser_fallback_url=' + encodeURIComponent(retour)),
    'si l’application manque, Chrome doit revenir au site où le trajet est déjà ouvert');
  console.log('  ok   Intent Android : paquet officiel, arrivée remplie et repli sans page intermédiaire');
} catch (error) {
  console.error(`Échec vérification itinéraires RATP : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
