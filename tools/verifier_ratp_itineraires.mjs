#!/usr/bin/env node
// Parcours « Métro Gambetta • Ligne 3 » tel qu'il doit se comporter :
//   - au clic, l'application est DEMANDÉE (schéma ratp:// sur iOS, Intent
//     com.fabernovel.ratp sur Android Chrome) ;
//   - la page du site ne disparaît JAMAIS au profit de ratp.fr : aucun onglet
//     ne s'ouvre tout seul, aucune navigation automatique ;
//   - si l'application ne s'ouvre pas (annulée ou absente), un lien manuel
//     « Ouvrir le trajet sur ratp.fr » (traduit) apparaît à côté de la mention,
//     et c'est un second clic volontaire qui ouvre le site RATP en nouvel onglet.
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

  // 1. Android Chrome : l'Intent est émis au clic, la page du site reste,
  //    aucun onglet ne s'ouvre tout seul.
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
  const lienAndroid = home.locator('[data-ratp-itineraire]').first();
  /* Le script réécrit le href du lien au chargement (il vise l'application) :
     le trajet RATP d'origine est lu dans le code source de la page. */
  const avantTap = await lienAndroid.evaluate((noeud) => ({
    target: noeud.target, appHref: noeud.getAttribute('data-ratp-app-href'),
  }));
  /* Le script a déjà réécrit le href du lien (il vise l'application) : le
     trajet RATP d'origine est lu dans le HTML servi, avant réécriture. */
  const reponse = await home.request.get(urlAccueil);
  const sourcePage = await reponse.text();
  const matchLien = sourcePage.match(/<a[^>]*data-ratp-itineraire[^>]*>/);
  assert.ok(matchLien, 'le lien métro doit exister dans la page');
  const matchTrajet = matchLien[0].match(/href="(https:\/\/www\.ratp\.fr[^"]*)"/);
  assert.ok(matchTrajet, 'le lien doit porter le trajet RATP dans son href');
  const trajetOrigine = matchTrajet[1].replace(/&amp;/g, '&');
  assert.equal(new URL(avantTap.appHref).searchParams.get('end'), ARRIVEE,
    'l’application doit proposer le restaurant comme arrivée');
  assert.equal(new URL(trajetOrigine).searchParams.get('end'), ARRIVEE,
    'le trajet RATP doit proposer le restaurant comme arrivée');
  await lienAndroid.click();
  await home.waitForTimeout(600);
  /* Chromium tronque la requête intent:// émise (le fragment #Intent;… n’y
     figure pas) : on vérifie la partie visible ici, et la construction complète
     est re-jouée depuis le script du site dans le bloc 5 ci-dessous. */
  const intent = requetesAndroid.find((url) => url.startsWith('intent://'));
  assert.ok(intent, 'Android Chrome doit viser l’application Bonjour RATP via un Intent');
  assert.ok(intent.startsWith('intent://www.bonjour-ratp.fr/itineraires/?end='),
    'l’Intent doit viser l’itinéraire Bonjour RATP');
  assert.ok(intent.includes(encodeURIComponent(ARRIVEE).replace(/%20/g, '+')) ||
            intent.includes(ARRIVEE),
    'l’Intent doit viser l’itinéraire Bonjour RATP avec l’arrivée du restaurant');
  const sourceIntent = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  const debutIntent = sourceIntent.indexOf('function intentUrl');
  const finIntent = sourceIntent.indexOf('/* Lien « Ouvrir le trajet');
  const construireIntent = new Function(`${sourceIntent.slice(debutIntent, finIntent)}\nreturn intentUrl;`)();
  const intentComplet = construireIntent(avantTap.appHref, trajetOrigine);
  assert.ok(intentComplet.includes('package=com.fabernovel.ratp'),
    'l’Intent doit désigner le paquet officiel Bonjour RATP');
  assert.ok(intentComplet.includes('S.browser_fallback_url='),
    'l’Intent doit prévoir un repli (le trajet RATP) si l’application est absente');
  const parametres = intentComplet.split('#Intent;')[1].split(';');
  const repli = parametres.find((p) => p.startsWith('S.browser_fallback_url='));
  const urlRepli = new URL(decodeURIComponent(repli.slice('S.browser_fallback_url='.length)));
  assert.equal(urlRepli.hostname, 'www.ratp.fr');
  assert.equal(urlRepli.searchParams.get('end'), ARRIVEE,
    'le repli natif doit ouvrir le trajet avec l’arrivée remplie');
  await home.waitForTimeout(3000);
  assert.equal(home.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  assert.equal(popupsAndroid.length, 0, 'aucun onglet ne doit s’ouvrir tout seul');
  assert.equal(await home.locator('.footer-details__metro-site').count(), 0,
    'sur Android, c’est l’Intent qui gère le repli : aucun lien manuel ajouté');
  assert.ok(!journalAndroid.some((url) => /api-adresse|geolocation/i.test(url)),
    'aucune demande de position ne doit partir du site');
  await android.close();
  console.log('  ok   Android : Intent émis au clic, page du site intacte, aucun onglet ouvert');

  // 2. iOS : le schéma est émis au clic (demande « Ouvrir dans Bonjour RATP ? »),
  //    la page du site reste, et si l'application ne s'ouvre pas, un lien manuel
  //    « Ouvrir le trajet sur ratp.fr » apparaît (second clic volontaire).
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
  await iphone.locator('[data-ratp-itineraire]').first().click();
  await iphone.waitForTimeout(500);
  assert.ok(requetesIOS.includes('ratp://'),
    'le clic doit émettre le schéma ratp:// — c’est lui qui déclenche la demande « Ouvrir dans Bonjour RATP ? »');
  assert.equal(popupsIOS.length, 0, 'aucun onglet ne doit s’ouvrir au clic');
  assert.equal(iphone.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  await iphone.waitForTimeout(2600);
  assert.equal(popupsIOS.length, 0,
    'l’application ne s’est pas ouverte : le site RATP ne doit PAS s’ouvrir tout seul');
  assert.equal(iphone.url(), urlAccueil, 'la page du site est toujours là');
  const lienSite = iphone.locator('.footer-details__metro-site');
  assert.equal(await lienSite.count(), 1,
    'un lien manuel « Ouvrir le trajet sur ratp.fr » doit être proposé');
  assert.equal(new URL(await lienSite.getAttribute('href')).hostname, 'www.ratp.fr');
  assert.equal(new URL(await lienSite.getAttribute('href')).searchParams.get('end'), ARRIVEE,
    'le lien manuel doit ouvrir le trajet avec l’arrivée remplie');
  assert.equal(await lienSite.getAttribute('target'), '_blank');
  assert.equal((await lienSite.textContent()).trim(), 'Ouvrir le trajet sur ratp.fr',
    'le libellé du lien manuel est « Ouvrir le trajet sur ratp.fr »');
  assert.equal(await iphone.locator('.footer-details__metro').count(), 1,
    'la mention du métro reste en place');
  assert.ok(!journalIOS.some((url) => url.startsWith('intent://')),
    'iOS ne doit pas recevoir d’Intent Android');
  assert.ok(!journalIOS.some((url) => /api-adresse|geolocation/i.test(url)),
    'aucune demande de position ne doit partir du site');
  // Second clic volontaire : le trajet s'ouvre dans un nouvel onglet.
  const [ongletManuel] = await Promise.all([iphone.waitForEvent('popup'), lienSite.click()]);
  await ongletManuel.waitForLoadState('domcontentloaded').catch(() => {});
  const trajetManuel = new URL(ongletManuel.url());
  assert.equal(trajetManuel.hostname, 'www.ratp.fr');
  assert.equal(trajetManuel.searchParams.get('end'), ARRIVEE);
  assert.equal(iphone.url(), urlAccueil, 'la page du site reste affichée');
  await ios.close();
  console.log('  ok   iOS : demande d’ouverture au clic, page intacte, lien « Ouvrir le trajet sur ratp.fr » en repli manuel');

  // 3. Navigateur intégré (Instagram) : les lancements sont bloqués, la page
  //    du site reste et le lien manuel est proposé — jamais d'ouverture auto.
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
  await insta.waitForTimeout(3200);
  assert.equal(popupsBloque.length, 0,
    'lancement bloqué : aucun onglet ne doit s’ouvrir tout seul');
  assert.equal(insta.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  assert.equal(await insta.locator('.footer-details__metro-site').count(), 1,
    'lancement bloqué : le lien manuel « Ouvrir le trajet sur ratp.fr » est proposé');
  await integre.close();
  console.log('  ok   Navigateur intégré : page du site intacte, lien manuel proposé, aucune ouverture forcée');

  // 4. Application ouverte (simulation) : la page passe en arrière-plan,
  //    aucun lien manuel n'est ajouté, aucun onglet ne s'ouvre.
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
  assert.equal(popupsOuverts.length, 0, 'l’application s’est ouverte : aucun onglet ne doit s’ouvrir');
  assert.equal(await pageOuverte.locator('.footer-details__metro-site').count(), 0,
    'l’application s’est ouverte : aucun lien manuel ne doit apparaître');
  await iosOuverte.close();
  console.log('  ok   Application ouverte : la page du site passe en arrière-plan, rien d’autre ne se passe');

  console.log('  ok   Intent Android : paquet officiel, arrivée remplie, repli natif sans page intermédiaire');
} catch (error) {
  console.error(`Échec vérification itinéraires RATP : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
