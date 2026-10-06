#!/usr/bin/env node
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

  const android = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
  });
  const home = await android.newPage();
  await home.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await home.goto(`${origin}/index.html?lang=fr`, { waitUntil: 'domcontentloaded' });
  const handoff = await home.locator('[data-ratp-itineraire]').first().evaluate((link) => link.href);
  assert.ok(handoff.startsWith('intent://www.bonjour-ratp.fr/itineraires/?end='), 'Android Chrome doit tenter l’Intent Bonjour RATP');
  assert.ok(handoff.includes('#Intent;scheme=https;package=com.fabernovel.ratp;'), 'l’Intent doit viser le paquet officiel de Bonjour RATP');
  const fallbackParameter = handoff.match(/S\.browser_fallback_url=([^;]+);end$/)?.[1];
  assert.ok(fallbackParameter, 'l’Intent Android doit contenir une page de secours');
  const fallback = new URL(decodeURIComponent(fallbackParameter));
  assert.equal(fallback.pathname, '/ratp-fallback.html');
  assert.equal(fallback.searchParams.get('source'), 'metro');
  assert.equal(fallback.searchParams.get('lang'), 'fr');
  await android.close();
  console.log('  ok   Android Chrome : Intent Bonjour RATP et page de secours localisée');

  const geolocated = await browser.newContext();
  await geolocated.grantPermissions(['geolocation'], { origin });
  await geolocated.setGeolocation({ latitude: 48.8566, longitude: 2.3522, accuracy: 25 });
  const page = await geolocated.newPage();
  let reverseRequest;
  let ratpRequest;
  await page.route('https://api-adresse.data.gouv.fr/reverse/**', async (route) => {
    reverseRequest = new URL(route.request().url());
    // Réponse synthétique réservée à ce test de flux; aucune donnée de test n'est présentée comme réelle.
    await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { label: 'Rue de la Banque 75002 Paris' }, geometry: { type: 'Point', coordinates: [2.35, 48.85] } }],
    }) });
  });
  await page.route('https://www.ratp.fr/itineraires/**', async (route) => {
    ratpRequest = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<title>RATP test</title>' });
  });
  await page.goto(`${origin}/ratp-fallback.html?source=metro&lang=fr`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.hostname === 'www.ratp.fr', { timeout: 10000 });
  assert.ok(reverseRequest, 'l’autorisation doit déclencher le reverse géocodage');
  assert.equal(reverseRequest.searchParams.get('lat'), '48.8566');
  assert.equal(reverseRequest.searchParams.get('lon'), '2.3522');
  assert.ok(ratpRequest, 'un trajet RATP doit être ouvert après conversion en adresse');
  const segments = decodeURIComponent(ratpRequest.pathname.replace(/^\/itineraires\//, '')).split('&');
  assert.equal(segments[0], 'Rue de la Banque 75002 Paris');
  assert.equal(segments[1], '4 Rue Belgrand 75020 Paris');
  assert.ok(!ratpRequest.href.includes('48.8566') && !ratpRequest.href.includes('2.3522'), 'les coordonnées ne doivent pas être transmises dans l’URL RATP');
  await geolocated.close();
  console.log('  ok   Géolocalisation autorisée : reverse géocodage puis itinéraire RATP avec deux adresses');

  const denied = await browser.newContext();
  await denied.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(_success, failure) { failure({ code: 1, message: 'permission denied' }); },
    } });
  });
  const fallbackPage = await denied.newPage();
  let manualRatpRequest;
  await fallbackPage.route('https://api-adresse.data.gouv.fr/**', (route) => route.abort());
  await fallbackPage.route('https://www.ratp.fr/itineraires/**', async (route) => {
    manualRatpRequest = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<title>RATP test</title>' });
  });
  await fallbackPage.goto(`${origin}/ratp-fallback.html?source=metro&lang=ar`, { waitUntil: 'domcontentloaded' });
  await fallbackPage.waitForFunction(() =>
    document.getElementById('ratp-use-location')?.textContent === 'أعد محاولة تحديد موقعي' &&
    !document.getElementById('ratp-use-location')?.disabled);
  assert.equal(await fallbackPage.locator('html').getAttribute('dir'), 'rtl', 'l’arabe doit rester dans son écriture RTL');
  assert.equal(await fallbackPage.locator('html').getAttribute('lang'), 'ar');
  assert.equal(await fallbackPage.locator('#ratp-no-position').getAttribute('target'), '_blank');
  assert.ok((await fallbackPage.locator('#ratp-no-position').getAttribute('href')).includes('4+Rue+Belgrand%2C+75020+Paris'));
  await fallbackPage.locator('#ratp-departure').fill('Rue de la Banque 75002 Paris');
  await fallbackPage.locator('#ratp-manual-form button[type="submit"]').click();
  await fallbackPage.waitForURL((url) => url.hostname === 'www.ratp.fr', { timeout: 10000 });
  assert.ok(manualRatpRequest);
  const manualSegments = decodeURIComponent(manualRatpRequest.pathname.replace(/^\/itineraires\//, '')).split('&');
  assert.equal(manualSegments[0], 'Rue de la Banque 75002 Paris');
  assert.equal(manualSegments[1], '4 Rue Belgrand 75020 Paris');
  await denied.close();
  console.log('  ok   Refus de localisation : saisie manuelle et arrivée restaurant conservées');
} catch (error) {
  console.error(`Échec vérification RATP : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
