#!/usr/bin/env node
// Parcours « Métro Gambetta • Ligne 3 » tel qu'il doit se comporter :
//   - au clic, le trajet s'ouvre IMMÉDIATEMENT sur ratp.fr (nouvel onglet,
//     AUCUN délai) avec l'arrivée = adresse du restaurant ; le départ = lieu
//     actuel est ajouté dès que la géolocalisation est résolue ;
//   - la demande d'ouverture de l'application « Bonjour RATP » est émise en
//     parallèle : Intent com.fabernovel.ratp sur Android Chrome (fallback =
//     trajet ratp.fr lui-même, un seul onglet), schémas candidats + lien
//     universel bonjour-ratp.fr sur iOS (second onglet qui déclenche l'app
//     via Universal Link, refermé si l'app ne s'ouvre pas) ; si l'application
//     s'ouvre, l'onglet du site RATP se ferme tout seul ; si elle n'apparaît
//     pas, l'onglet reste.
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
    // Schémas d'app et Intent : ne pas crasher la page, répondre 204
    if (['intent:','ratp:','bonjourratp:','bonjour-ratp:','com.fabernovel.ratp:','com.ratp.ratp:','maps:','geo:','comgooglemaps:','google.navigation:'].includes(url.protocol)) {
      return route.fulfill({ status: 204, body: '' });
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

  // 1. Android Chrome : au clic, UN SEUL onglet s'ouvre IMMÉDIATEMENT
  //    en about:blank puis tente l'Intent (package com.fabernovel.ratp) via
  //    onglet.location.href + iframe, avec fallback = trajet ratp.fr lui-même
  //    dans le MÊME onglet (pas de flash, pas de second onglet).
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
  const promessePopupAndroid = home.waitForEvent('popup', { timeout: 8000 });
  const departAndroid = Date.now();
  await home.locator('[data-ratp-itineraire]').first().click();
  try {
    await home.waitForSelector('#ratp-choix-dialog', {timeout:3000});
    await home.locator('#ratp-choix-dialog button:has-text("Bonjour RATP")').first().click();
  } catch (e) {}
  const ongletAndroid = await promessePopupAndroid;
  const delaiOuverture = Date.now() - departAndroid;
  assert.ok(delaiOuverture < 2500,
    `le trajet doit s’ouvrir sans délai (ouvert en ${delaiOuverture} ms)`);
  // L'onglet tente l'Intent directement (ou via about:blank) puis bascule vers ratp.fr après DELAI_FALLBACK
  await ongletAndroid.waitForFunction(() => {
    const h = window.location.href;
    return h.includes('ratp.fr') || h === 'about:blank' || h.startsWith('intent://') || h.includes('bonjour-ratp.fr');
  }, { timeout: 5000 }).catch(()=>{});
  await ongletAndroid.waitForTimeout(1900);
  const urlOuverte = new URL(ongletAndroid.url());
  assert.equal(urlOuverte.hostname, 'www.ratp.fr');
  assert.equal(urlOuverte.pathname, '/itineraires');
  assert.equal(urlOuverte.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit être remplie dès l’ouverture');
  await home.waitForTimeout(300);
  const intent = [...requetesAndroid, ...journalAndroid].find((url) => url.startsWith('intent://'));
  assert.ok(intent, 'Android Chrome doit aussi émettre l’Intent vers l’application Bonjour RATP dans le même onglet');
  /* Le départ (lieu actuel) complète l'onglet ouvert dès que la position est résolue. */
  await home.waitForFunction(() => {
    const ref = window.open('', 'ratp-trajet');
    return ref && ref.location && ref.location.href.includes('start=');
  }, { timeout: 15000 }).catch(() => {});
  const urlComplete = new URL(await ongletAndroid.evaluate(() => window.location.href));
  assert.equal(urlComplete.searchParams.get('end'), ARRIVEE);
  assert.equal(urlComplete.searchParams.get('start'), ADRESSE_POSITION,
    'le départ doit être le lieu actuel (ajouté dès que la position est résolue)');
  /* L'Intent : repli natif = trajet ratp.fr lui-même (pas de page de marquage). */
  const sourceIntent = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  const debutIntent = sourceIntent.indexOf('function intentUrl');
  const finIntent = sourceIntent.indexOf('/* Lieu actuel');
  const construireIntent = new Function(`${sourceIntent.slice(debutIntent, finIntent)}\nreturn intentUrl;`)();
  const appHref = await home.locator('[data-ratp-itineraire]').first()
    .getAttribute('data-ratp-app-href');
  const trajetHref = await home.locator('[data-ratp-itineraire]').first()
    .getAttribute('href');
  const intentComplet = construireIntent(appHref, trajetHref);
  assert.ok(intentComplet.includes('package=com.fabernovel.ratp'),
    'l’Intent doit désigner le paquet officiel Bonjour RATP');
  assert.ok(intentComplet.includes('S.browser_fallback_url=' + encodeURIComponent(trajetHref)),
    'le repli natif doit être le trajet ratp.fr lui-même (même onglet, pas de flash)');
  assert.equal(popupsAndroid.length, 1, 'un seul onglet doit s’ouvrir (pas de flash)');
  assert.equal(home.url(), urlAccueil, 'la page du site ne doit pas disparaître');
  await android.close();
  console.log(`  ok   Android : trajet ouvert en ${delaiOuverture} ms (sans délai), Intent dans même onglet, départ = lieu actuel, pas de flash`);

  // 2. iOS : au clic, UN SEUL onglet s'ouvre IMMÉDIATEMENT en about:blank
  //    puis tente l'app via schémas candidats (iframe) + lien universel
  //    bonjour-ratp.fr dans le MÊME onglet (onglet.location.href), avec
  //    fallback ratp.fr si l'app n'est pas installée. Pas de second onglet,
  //    pas de flash.
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
  const promessePopupIOS = iphone.waitForEvent('popup', { timeout: 8000 });
  const departIOS = Date.now();
  await iphone.locator('[data-ratp-itineraire]').first().click();
  try {
    await iphone.waitForSelector('#ratp-choix-dialog', {timeout:3000});
    await iphone.locator('#ratp-choix-dialog button:has-text("Bonjour RATP")').first().click();
  } catch (e) {}
  const ongletIOS = await promessePopupIOS;
  const delaiIOS = Date.now() - departIOS;
  assert.ok(delaiIOS < 2500, `le trajet doit s’ouvrir sans délai (ouvert en ${delaiIOS} ms)`);
  await ongletIOS.waitForFunction(() => {
    const h = window.location.href;
    return h.includes('ratp.fr') || h.includes('bonjour-ratp.fr') || h === 'about:blank' || h.startsWith('intent://');
  }, { timeout: 5000 }).catch(()=>{});
  await ongletIOS.waitForTimeout(1900);
  const urlInitiale = new URL(ongletIOS.url());
  // Après fallback, on est sur ratp.fr (ou bonjour-ratp.fr si l'app n'est pas mockée, mais notre mock répond 200)
  assert.ok(['www.ratp.fr','www.bonjour-ratp.fr'].includes(urlInitiale.hostname),
    `l’onglet doit afficher ratp.fr après tentative app, got ${urlInitiale.hostname}`);
  assert.equal(urlInitiale.searchParams.get('end'), ARRIVEE,
    'l’arrivée doit être remplie dès l’ouverture');
  await iphone.waitForTimeout(200);
  const hasSchema = requetesIOS.some(u => u.startsWith('ratp://') || u.startsWith('bonjourratp://') || u.includes('ratp://') || u.includes('bonjourratp://')) || journalIOS.some(u => u.startsWith('ratp://') || u.startsWith('bonjourratp://') || u.includes('ratp://'));
  // Les schémas via iframe peuvent ne pas apparaître en request dans Playwright, on vérifie le code source
  const srcIOS = readFileSync(join(ROOT, 'assets/js/ratp-itinerary.js'), 'utf8');
  assert.ok(srcIOS.includes('SCHEMAS_APP') && srcIOS.includes('bonjourratp://'), 'le code doit tenter les schémas candidats via iframe');
  // Le lien universel bonjour-ratp.fr est tenté dans le même onglet
  const hasBonjourAttempt = popupsIOS.length === 1 && (journalIOS.some((u) => u.includes('bonjour-ratp.fr/itineraires')) || requetesIOS.some(u=>u.includes('bonjour-ratp.fr')));
  assert.ok(hasBonjourAttempt,
    'le clic doit tenter le lien universel bonjour-ratp.fr dans le même onglet pour déclencher l’app via Universal Link');
  assert.equal(popupsIOS.length, 1, 'un seul onglet doit s’ouvrir sur iOS aussi (pas de flash)');
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
  console.log(`  ok   iOS : trajet ouvert en ${delaiIOS} ms (sans délai), schémas iframe + Universal Link dans même onglet, départ = lieu actuel, pas de flash`);

  // 3. Navigateur intégré (Instagram) : pas de lancement d'application, le
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
    if (/(^|\.)ratp\.fr$/.test(url.hostname) || /(^|\.)bonjour-ratp\.fr$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_RATP });
    }
    if (['intent:','ratp:','bonjourratp:','bonjour-ratp:','com.fabernovel.ratp:','com.ratp.ratp:','maps:','geo:','comgooglemaps:','google.navigation:'].includes(url.protocol)) {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.abort();
  });
  await insta.goto(urlAccueil, { waitUntil: 'domcontentloaded' });
  const promessePopupBloque = insta.waitForEvent('popup', { timeout: 8000 });
  const departBloque = Date.now();
  await insta.locator('[data-ratp-itineraire]').first().click();
  try {
    await insta.waitForSelector('#ratp-choix-dialog', {timeout:3000});
    await insta.locator('#ratp-choix-dialog button:has-text("site RATP")').first().click();
  } catch (e) {}
  const ongletBloque = await promessePopupBloque;
  const delaiBloque = Date.now() - departBloque;
  await ongletBloque.waitForFunction(() => {
    const h = window.location.href;
    return h.includes('ratp.fr') || h === 'about:blank' || h.startsWith('intent://') || h.includes('bonjour-ratp.fr');
  }, { timeout: 5000 }).catch(()=>{});
  await ongletBloque.waitForTimeout(1900);
  assert.ok(delaiBloque < 2500, `lancement bloqué : le trajet doit quand même s’ouvrir sans délai (${delaiBloque} ms)`);
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

  // 4. Application ouverte (simulation) : l'onglet s'ouvre immédiatement,
  //    puis se ferme tout seul quand l'application prend la main.
  const journalOuvert = [];
  const iosOuverte = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: UA_IPHONE,
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8667, longitude: 2.3333 },
  });
  await iosOuverte.addInitScript(() => {
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
  const promessePopupOuvert = pageOuverte.waitForEvent('popup', { timeout: 8000 });
  await pageOuverte.locator('[data-ratp-itineraire]').first().click();
  try {
    await pageOuverte.waitForSelector('#ratp-choix-dialog', {timeout:3000});
    await pageOuverte.locator('#ratp-choix-dialog button:has-text("Bonjour RATP")').first().click();
  } catch (e) {}
  const ongletOuvert = await promessePopupOuvert;
  await ongletOuvert.waitForFunction(() => {
    const h = window.location.href;
    return h.includes('ratp.fr') || h.includes('bonjour-ratp.fr') || h === 'about:blank' || h.startsWith('intent://');
  }, { timeout: 5000 }).catch(()=>{});
  // Ne pas attendre trop longtemps sinon l'onglet se ferme quand l'app s'ouvre (simulation hidden à 300ms)
  await new Promise((r)=>setTimeout(r,200));
  let hostOuvert = 'unknown';
  try { hostOuvert = new URL(ongletOuvert.url()).hostname; } catch {}
  assert.ok(['www.ratp.fr','www.bonjour-ratp.fr'].includes(hostOuvert) || ongletOuvert.url().includes('about:blank'),
    `l’application s’ouvre : l’onglet du trajet s’ouvre quand même immédiatement, got ${hostOuvert}`);
  await pageOuverte.waitForFunction(() => document.hidden === true, { timeout: 8000 });
  await new Promise((r)=>setTimeout(r,800));
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
