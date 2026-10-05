#!/usr/bin/env node
/**
 * Vérifications Chromium des pieds de page traduits et de l'affichage des vins
 * sur téléphone : plusieurs largeurs étroites et tiroirs de dégustation.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { carteChromiumArgs } from './chromium-args.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

function lancerServeur() {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = normalize(join(ROOT, relative));
    if (!file.startsWith(`${ROOT}/`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

let serveur;
let navigateur;
try {
  serveur = await lancerServeur();
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  navigateur = await chromium.launch({
    headless: true,
    executablePath: await chromiumBinary.executablePath(),
    args: [...carteChromiumArgs(), '--no-sandbox', '--disable-dev-shm-usage'],
  });

  const contexte = await navigateur.newContext({
    viewport: { width: 320, height: 640 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await contexte.newPage();
  page.setDefaultTimeout(10000);

  const origineLocale = serveur.origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origineLocale) {
      await route.continue();
      return;
    }
    await route.abort();
  });

  const scriptsDemandes = new Set();
  const requetesGooglePlaces = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/assets\/js\/(localized-digits|i18n|google-reviews)\.js$/.test(url.pathname)) {
      scriptsDemandes.add(`${url.pathname}?${url.searchParams.toString()}`);
    }
    if (url.hostname === 'maps.googleapis.com') requetesGooglePlaces.push(url.pathname);
  });

  await page.goto(`${origineLocale}/index.html?lang=uk`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__i18nReady === true && document.documentElement.lang === 'uk');
  await page.waitForFunction(() =>
    document.getElementById('google-reviews-load')?.textContent.trim() === 'Спробувати ще раз');
  const widgetAccueil = await page.evaluate(() => ({
    heading: document.getElementById('cover-reviews-title')?.textContent.trim(),
    button: document.getElementById('google-reviews-load')?.textContent.trim(),
    buttonDisabled: document.getElementById('google-reviews-load')?.disabled,
    buttonBusy: document.getElementById('google-reviews-load')?.getAttribute('aria-busy'),
    visible: getComputedStyle(document.getElementById('cover-reviews-section')).display !== 'none',
    sectionBackground: getComputedStyle(document.getElementById('cover-reviews-section')).backgroundColor,
    cardBackground: getComputedStyle(document.querySelector('.google-reviews-card')).backgroundColor,
    cardShadow: getComputedStyle(document.querySelector('.google-reviews-card')).boxShadow,
    cardBorder: getComputedStyle(document.querySelector('.google-reviews-card')).borderTopWidth,
    titlePosition: getComputedStyle(document.getElementById('cover-reviews-title')).position,
    titleWidth: getComputedStyle(document.getElementById('cover-reviews-title')).width,
    ratingDisplay: (() => {
      const summary = document.getElementById('google-reviews-rating');
      summary.hidden = false;
      return getComputedStyle(summary).display;
    })(),
    carouselDisplay: (() => {
      const carousel = document.getElementById('google-reviews-carousel');
      carousel.hidden = false;
      return getComputedStyle(carousel).display;
    })(),
    staticQuotes: document.querySelectorAll('#google-reviews-slide blockquote').length,
    sectionWidth: document.getElementById('cover-reviews-section').clientWidth,
    sectionScroll: document.getElementById('cover-reviews-section').scrollWidth,
    cardWidth: document.querySelector('.google-reviews-card').clientWidth,
    cardScroll: document.querySelector('.google-reviews-card').scrollWidth,
  }));
  assert.deepEqual({ heading:widgetAccueil.heading, button:widgetAccueil.button, visible:widgetAccueil.visible, staticQuotes:widgetAccueil.staticQuotes }, {
    heading: 'Відгуки Google',
    button: 'Спробувати ще раз',
    visible: true,
    staticQuotes: 0,
  });
  assert.equal(widgetAccueil.buttonDisabled, false, 'le bouton de secours doit être actif après un échec');
  assert.equal(widgetAccueil.buttonBusy, 'false');
  assert.equal(widgetAccueil.sectionBackground, 'rgba(0, 0, 0, 0)', 'le fond du bloc doit rester transparent');
  assert.equal(widgetAccueil.cardBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(widgetAccueil.cardShadow, 'none', 'le bloc ne doit pas avoir d’ombre');
  assert.equal(widgetAccueil.cardBorder, '0px', 'le bloc ne doit pas avoir de cadre');
  assert.equal(widgetAccueil.titlePosition, 'absolute', 'le titre doit rester accessible sans être visible');
  assert.equal(widgetAccueil.titleWidth, '1px');
  assert.equal(widgetAccueil.ratingDisplay, 'flex', 'note, étoiles et nombre d’avis doivent rester groupés');
  assert.equal(widgetAccueil.carouselDisplay, 'grid', 'les commentaires doivent être dans un vrai carrousel');
  assert.ok(widgetAccueil.sectionScroll <= widgetAccueil.sectionWidth + 1, 'le bloc d’avis déborde horizontalement à 320 px');
  assert.ok(widgetAccueil.cardScroll <= widgetAccueil.cardWidth + 1, 'la carte d’avis déborde à 320 px');
  assert.equal(requetesGooglePlaces.filter((path) => path === '/maps/api/js').length, 1,
    'Places doit être demandé automatiquement une seule fois au chargement');
  console.log('  ok   Chromium : avis autochargés au chargement, sans avis statique; secours disponible hors ligne');
  const piedUk = await page.evaluate(() => {
    const nav = document.querySelector('.footer .footer-quartier');
    const metro = document.querySelector('.footer-details__metro');
    const adresse = document.querySelector('.footer-address-link');
    const brand = document.querySelector('.footer .footer-details > span:first-child');
    return {
      aria: nav?.getAttribute('aria-label'),
      lieux: [...(nav?.querySelectorAll('a') || [])].map((link) => link.textContent.trim()),
      distance: nav?.querySelector('a')?.title,
      metro: metro?.textContent.trim(),
      address: adresse?.textContent.trim(),
      brand: brand?.textContent.trim(),
    };
  });
  assert.equal(piedUk.aria, 'Поблизу');
  assert.deepEqual(piedUk.lieux, [
    'Мерія 20-го округу', 'Театр «Ла Коллін»', 'Кладовище Пер-Лашез',
    'Культурний центр «Карре-де-Бодуен»', 'Парк Бельвіль', 'Батаклан',
    'Зимовий цирк', 'Опера Бастилії',
  ]);
  assert.equal(piedUk.distance, 'За 100 м від ресторану');
  assert.equal(piedUk.metro, 'метро Ґамбетта • Лінія 3');
  assert.equal(piedUk.address, '4 ВУЛ. БЕЛЬГРАН, 75020 ПАРИЖ');
  assert.equal(piedUk.brand, 'ЛА КОЛЛІН ҐАМБЕТТА');
  console.log('  ok   Chromium ukrainien : adresse, métro et navigation de proximité en cyrillique');

  const requetesAvantMenu = requetesGooglePlaces.length;
  await page.evaluate(() => {
    showView('menu');
    const bouton = [...document.querySelectorAll('.nav-btn')].find((node) => /вина/i.test(node.textContent));
    showMenuSection('vins', bouton);
  });
  await page.waitForFunction(() => document.querySelectorAll('#vins .wine-row').length === 17);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('cover-reviews-section')).display), 'none');
  assert.equal(requetesGooglePlaces.length, requetesAvantMenu, 'ouvrir le menu ne doit pas relancer le chargement Places');
  const categories = ['Червоне вино', 'Біле вино', 'Рожеве вино', 'Ігристі'];
  const tailles = [280, 320, 360, 375, 390, 420, 430];
  for (const largeur of tailles) {
    await page.setViewportSize({ width: largeur, height: 720 });
    await page.waitForTimeout(25);
    const rendu = await page.evaluate(() => {
      const section = document.getElementById('vins');
      const sectionRect = section.getBoundingClientRect();
      const rows = [...section.querySelectorAll('.wine-row')];
      const erreurs = [];
      for (const row of rows) {
        if (row.scrollWidth > row.clientWidth + 1) {
          erreurs.push(`débordement rangée ${row.querySelector('.wine-name')?.textContent.trim()}`);
        }
        if (row.getBoundingClientRect().right > sectionRect.right + 1) {
          erreurs.push(`débordement droite ${row.querySelector('.wine-name')?.textContent.trim()}`);
        }
        for (const cell of row.querySelectorAll(':scope > td:not(.wine-name):not(.wine-no):not(.wine-detail-cell)')) {
          if (cell.scrollWidth > cell.clientWidth + 1) {
            erreurs.push(`libellé/prix rogné ${cell.getAttribute('data-label')}: ${cell.scrollWidth}/${cell.clientWidth}`);
          }
          if (!cell.getAttribute('data-label') || !cell.textContent.trim()) {
            erreurs.push('contenance ou tarif vide');
          }
        }
      }
      const premier = rows[0];
      const premiereCellule = premier.querySelector(':scope > td:nth-of-type(3)');
      const textesPrix = [...rows[0].querySelectorAll(':scope > td:not(.wine-name):not(.wine-no):not(.wine-detail-cell)')]
        .map((cell) => cell.textContent.trim());
      return {
        sectionLargeur: section.clientWidth,
        sectionScroll: section.scrollWidth,
        categories: [...section.querySelectorAll('.panel__title')].map((title) => title.textContent.trim()),
        rowCount: rows.length,
        erreurs,
        grilles: rows.slice(0, 14).map((row) => getComputedStyle(row).gridTemplateColumns.split(/\s+/).length),
        premierLibelle: premiereCellule.getAttribute('data-label').replace(/\s+/g, ' ').trim(),
        premiersPrix: textesPrix,
      };
    });
    assert.deepEqual(rendu.categories, categories, `catégories ukrainiennes à ${largeur}px`);
    assert.equal(rendu.rowCount, 17, `tous les vins doivent rester présents à ${largeur}px`);
    assert.ok(rendu.sectionScroll <= rendu.sectionLargeur + 1, `la section déborde à ${largeur}px`);
    assert.deepEqual(rendu.erreurs, [], `contenu rogné ou débordement à ${largeur}px`);
    assert.equal(rendu.premierLibelle, '140 мл');
    assert.deepEqual(rendu.premiersPrix, ['5,20', '9,90', '18,90', '22,90']);
    if (largeur <= 420) {
      assert.ok(rendu.grilles.slice(0, 14).every((colonnes) => colonnes === 3), `mise en page deux colonnes absente à ${largeur}px`);
    }
  }

  // Ouvre aussi un tiroir de dégustation dans chaque catégorie au format le
  // plus exigeant : les accordéons ne doivent pas recréer de débordement.
  await page.setViewportSize({ width: 280, height: 720 });
  for (let index = 0; index < categories.length; index += 1) {
    const rangee = page.locator('#vins .panel').nth(index).locator('.wine-row').first();
    await rangee.scrollIntoViewIfNeeded();
    await rangee.click();
    await page.waitForFunction((panelIndex) =>
      document.querySelectorAll('#vins .panel')[panelIndex]
        ?.querySelector('.wine-row')?.getAttribute('aria-expanded') === 'true',
    index, { polling: 10, timeout: 2000 });
    const detail = await page.evaluate((panelIndex) => {
      const row = document.querySelectorAll('#vins .panel')[panelIndex].querySelector('.wine-row');
      const cell = row.querySelector('.wine-detail-cell');
      return {
        open: row.getAttribute('aria-expanded'),
        hidden: cell.getAttribute('aria-hidden'),
        width: cell.clientWidth,
        scroll: cell.scrollWidth,
        right: cell.getBoundingClientRect().right,
        rowRight: row.getBoundingClientRect().right,
        text: cell.textContent.trim(),
      };
    }, index);
    assert.equal(detail.open, 'true');
    assert.equal(detail.hidden, 'false');
    assert.ok(detail.width > 0 && detail.scroll <= detail.width + 1, `tiroir ${categories[index]} rogné à 280 px`);
    assert.ok(detail.right <= detail.rowRight + 1, `tiroir ${categories[index]} déborde sa carte à 280 px`);
    assert.ok(detail.text.length > 40, `texte de dégustation ${categories[index]} absent`);
  }
  assert.ok(scriptsDemandes.has('/assets/js/localized-digits.js?v=2026100501'), 'le navigateur a servi l’ancienne version des chiffres');
  assert.ok(scriptsDemandes.has('/assets/js/i18n.js?v=2026100502'), 'le navigateur a servi l’ancienne version i18n');
  assert.ok(scriptsDemandes.has('/assets/js/google-reviews.js?v=2026100506'), 'le navigateur n’a pas chargé le carrousel Google');
  console.log('  ok   Chromium mobile : 17 vins, 4 catégories, étiquettes/prix lisibles de 280 à 430 px');
  console.log('  ok   Chromium mobile : tiroirs de dégustation ouverts dans les 4 catégories, sans débordement');
  console.log('  ok   Chromium ukrainien : libellés « 140 мл », tarifs et scripts invalidés réellement rendus');

  // Une seconde page isole le rendu complet avec des fixtures synthétiques,
  // interceptées localement : aucune requête réelle n'est envoyée à Google.
  const pageAvis = await contexte.newPage();
  await pageAvis.setViewportSize({ width: 320, height: 720 });
  let sdkFictifIntercepte = false;
  await pageAvis.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origineLocale) {
      if (url.pathname === '/assets/data/avis-google.json') {
        await route.fulfill({
          status:200,
          contentType:'application/json; charset=utf-8',
          body:JSON.stringify({
            place_id:'TEST_PLACE_ID',
            cle_api:'TEST-ONLY-NOT-A-REAL-KEY',
            url:'https://www.google.com/maps/search/?api=1&query=test'
          }),
        });
      } else {
        await route.continue();
      }
      return;
    }
    if (url.hostname === 'maps.googleapis.com' && url.pathname === '/maps/api/js') {
      sdkFictifIntercepte = true;
      await route.fulfill({
        status:200,
        contentType:'application/javascript; charset=utf-8',
        body:`window.google = { maps: { importLibrary: function (name) {
          if (name !== 'places') return Promise.reject(new Error('fixture library'));
          return Promise.resolve({ Place: class {
            constructor(options) { this.id = options.id; }
            fetchFields() {
              this.rating = 4.8;
              this.userRatingCount = 28;
              this.googleMapsURI = 'https://www.google.com/maps/search/?api=1&query=test-place';
              this.attributions = [];
              this.reviews = [
                {
                  rating:5,
                  text:'TEST ONLY — commentaire synthétique pour vérifier la mise en page responsive.',
                  textLanguageCode:'fr',
                  relativePublishTimeDescription:'il y a quelques jours',
                  googleMapsURI:'https://www.google.com/maps/reviews/fixture-1',
                  authorAttribution:{ displayName:'TEST ONLY', uri:'https://www.google.com/maps/contrib/fixture-1' }
                },
                {
                  rating:4,
                  text:'TEST ONLY — deuxième commentaire fictif destiné au test du carrousel.',
                  textLanguageCode:'fr',
                  relativePublishTimeDescription:'il y a quelques semaines',
                  googleMapsURI:'https://www.google.com/maps/reviews/fixture-2',
                  authorAttribution:{ displayName:'TEST ONLY 2' }
                }
              ];
              return Promise.resolve();
            }
          } });
        } } };
        window.__lcgGoogleReviewsReady();`,
      });
      return;
    }
    await route.abort();
  });
  await pageAvis.goto(`${origineLocale}/index.html?lang=fr`, { waitUntil:'domcontentloaded' });
  await pageAvis.waitForFunction(() =>
    document.querySelector('#google-reviews-slide article') &&
    document.getElementById('google-reviews-position')?.textContent.includes('1 sur 2'));
  assert.equal(sdkFictifIntercepte, true);
  const renduAvis = await pageAvis.evaluate(() => ({
    title:document.getElementById('cover-reviews-title').textContent.trim(),
    ratingHidden:document.getElementById('google-reviews-rating').hidden,
    score:document.getElementById('google-reviews-score').textContent,
    count:document.getElementById('google-reviews-count').textContent,
    stars:document.getElementById('google-reviews-stars').getAttribute('aria-label'),
    quote:document.querySelector('.google-reviews-quote').textContent,
    carousel:getComputedStyle(document.getElementById('google-reviews-carousel')).display,
    previousHidden:document.getElementById('google-reviews-previous').hidden,
    nextHidden:document.getElementById('google-reviews-next').hidden,
    dots:document.getElementById('google-reviews-dots').children.length,
    position:document.getElementById('google-reviews-position').textContent,
  }));
  assert.equal(renduAvis.title, 'Avis Google');
  assert.equal(renduAvis.ratingHidden, false);
  assert.equal(renduAvis.score, '4,8/5');
  assert.equal(renduAvis.count, '28 avis');
  assert.equal(renduAvis.stars, 'Note moyenne Google : 4,8 sur 5');
  assert.ok(renduAvis.quote.startsWith('TEST ONLY'));
  assert.equal(renduAvis.carousel, 'grid');
  assert.equal(renduAvis.previousHidden, false);
  assert.equal(renduAvis.nextHidden, false);
  assert.equal(renduAvis.dots, 2);
  assert.ok(renduAvis.position.includes('1 sur 2'));

  for (const largeur of [280, 320, 390, 430]) {
    await pageAvis.setViewportSize({ width:largeur, height:720 });
    const layoutAvis = await pageAvis.evaluate(() => {
      const ids = ['cover-reviews-section', 'google-reviews-card', 'google-reviews-carousel', 'google-reviews-viewport'];
      return {
        overflows:ids.filter((id) => {
          const element = id === 'google-reviews-card'
            ? document.querySelector('.google-reviews-card')
            : document.getElementById(id);
          return element.scrollWidth > element.clientWidth + 1;
        }),
        height:document.getElementById('cover-reviews-section').getBoundingClientRect().height,
      };
    });
    assert.deepEqual(layoutAvis.overflows, [], `le bloc ou le carrousel déborde à ${largeur}px`);
    assert.ok(layoutAvis.height <= 280, `le bloc reste trop haut (${layoutAvis.height}px à ${largeur}px)`);
  }
  await pageAvis.getByRole('button', { name:'Avis suivant' }).click();
  await pageAvis.waitForFunction(() =>
    document.getElementById('google-reviews-position')?.textContent.includes('2 sur 2'));
  console.log('  ok   Chromium : note, étoiles, commentaires et carrousel responsives (fixtures synthétiques uniquement)');

  await contexte.close();
} finally {
  if (navigateur) await navigateur.close();
  if (serveur) await new Promise((resolveClose) => serveur.server.close(resolveClose));
}
