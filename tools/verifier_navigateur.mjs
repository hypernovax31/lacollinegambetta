#!/usr/bin/env node
/**
 * Parcours Chromium des comportements qui ont posé problème sur téléphone :
 * un retour Places tardif, le balayage réel du carrousel et les quatre familles
 * de vins en ukrainien, sur des largeurs étroites. Le SDK externe est remplacé
 * par une réponse différée déterministe ; le HTML, les scripts, le CSS et les
 * interactions testés sont ceux du site, dans un vrai navigateur.
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

const configTest = {
  place_id: 'ChIJ_TEST', cle_api: 'CLE_DE_TEST', publie: true,
  note: 4.6, nombre_avis: 128,
  url: 'https://www.google.com/maps/search/?api=1&query=La%20Colline%20Gambetta',
  avis: [],
};

const scriptPlacesDiffere = `
  window.google = { maps: { importLibrary: function (nom) {
    window.__placesLibraryDemandee = nom;
    return Promise.resolve({ Place: class {
      constructor(options) { this.id = options.id; }
      fetchFields(options) {
        window.__placesFieldsDemandes = options.fields;
        return new Promise((resolve) => window.setTimeout(() => {
          Object.assign(this, {
            rating: 4.8, userRatingCount: 57,
            googleMapsURI: 'https://www.google.com/maps/?cid=test-live',
            attributions: [],
            reviews: [
              { rating: 5, text: 'Terrasse agréable et accueil chaleureux.',
                googleMapsURI: 'https://www.google.com/maps/reviews/test-1',
                authorAttribution: { displayName: 'Olena Petrenko' } },
              { rating: 4, text: 'Très bonne adresse, même sans date de visite.',
                googleMapsURI: 'https://www.google.com/maps/reviews/test-2',
                authorAttribution: { displayName: 'Taras Koval' } }
            ]
          });
          resolve();
        }, 140));
      }
    } });
  } } };
`;

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

  // Raccourcit uniquement le délai de secours de 8 s, afin de tester le même
  // chemin de course rapidement, sans retarder la suite de huit secondes.
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = function (callback, delay, ...args) {
      return original(callback, delay === 8000 ? 20 : delay, ...args);
    };
  });

  const origineLocale = serveur.origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'maps.googleapis.com' && url.pathname === '/maps/api/js') {
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: scriptPlacesDiffere });
      return;
    }
    if (url.origin === origineLocale && url.pathname === '/assets/data/avis-google.json') {
      await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(configTest) });
      return;
    }
    if (url.origin === origineLocale) {
      await route.continue();
      return;
    }
    await route.abort();
  });

  const scriptsDemandes = new Set();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/assets\/js\/(localized-digits|i18n)\.js$/.test(url.pathname)) {
      scriptsDemandes.add(`${url.pathname}?${url.searchParams.toString()}`);
    }
  });

  await page.goto(`${origineLocale}/index.html?lang=uk`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__i18nReady === true && document.documentElement.lang === 'uk');
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

  // Le secours apparaît après 20 ms, puis la réponse Places arrive à 140 ms.
  // Ce contrôle échoue avec l'ancien Promise.race qui ignorait la réponse tardive.
  await page.waitForFunction(() => {
    const bloc = document.getElementById('cover-reviews');
    const carousel = document.getElementById('cover-reviews-carousel');
    return bloc && !bloc.hidden &&
      document.getElementById('cover-reviews-note')?.textContent === '4,6/5' &&
      carousel?.hidden === true;
  }, null, { polling: 5, timeout: 5000 });
  await page.waitForFunction(() => {
    const bloc = document.getElementById('cover-reviews');
    const carousel = document.getElementById('cover-reviews-carousel');
    return bloc && !bloc.hidden &&
      document.getElementById('cover-reviews-note')?.textContent === '4,8/5' &&
      document.getElementById('cover-reviews-count')?.textContent.includes('57 avis Google') &&
      carousel?.hidden === false;
  }, null, { polling: 10, timeout: 5000 });

  let etatAvis = await page.evaluate(() => ({
    library: window.__placesLibraryDemandee,
    fields: window.__placesFieldsDemandes,
    authors: [...document.querySelectorAll('#cover-reviews .cover-reviews__slide:not([data-carousel-clone]) .cover-reviews__author')]
      .map((node) => node.textContent.trim()),
    count: document.querySelectorAll('#cover-reviews .cover-reviews__slide:not([data-carousel-clone])').length,
    mapsHref: document.getElementById('cover-reviews-maps')?.href,
  }));
  assert.equal(etatAvis.library, 'places');
  assert.ok(['rating', 'userRatingCount', 'googleMapsURI', 'reviews', 'attributions'].every((field) => etatAvis.fields.includes(field)));
  assert.deepEqual(etatAvis.authors, ['Olena', 'Taras'], 'les clients doivent être affichés par prénom uniquement');
  assert.equal(etatAvis.count, 2, 'les deux commentaires Places doivent construire les deux diapositives');
  assert.match(etatAvis.mapsHref, /google\.com\/maps/);
  console.log('  ok   Chromium : Places tardif remplace le secours et affiche les deux vrais états du bandeau');

  // Geste tactile envoyé au navigateur Chromium (pas un clic sur le bouton).
  const viewportAvis = page.locator('#cover-reviews-viewport');
  await viewportAvis.scrollIntoViewIfNeeded();
  const boiteAvis = await viewportAvis.boundingBox();
  assert.ok(boiteAvis && boiteAvis.width > 100, 'zone tactile du carrousel introuvable');
  const session = await contexte.newCDPSession(page);
  const y = Math.round(boiteAvis.y + boiteAvis.height / 2);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x: Math.round(boiteAvis.x + boiteAvis.width * 0.85), y }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ id: 1, x: Math.round(boiteAvis.x + boiteAvis.width * 0.15), y }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() =>
    document.querySelector('#cover-reviews .cover-reviews__slide[aria-hidden="false"] .cover-reviews__author')?.textContent === 'Taras',
  null, { polling: 10, timeout: 2000 });
  assert.equal(await page.locator('#cover-reviews-status').textContent(), 'Avis 2 sur 2');
  await page.waitForTimeout(380);
  await page.locator('#cover-reviews-next').click();
  await page.waitForFunction(() =>
    document.querySelector('#cover-reviews .cover-reviews__slide[aria-hidden="false"] .cover-reviews__author')?.textContent === 'Olena',
  null, { polling: 10, timeout: 2000 });
  assert.equal(await page.locator('#cover-reviews-status').textContent(), 'Avis 1 sur 2');
  console.log('  ok   Chromium mobile : vrai balayage tactile et boucle du dernier avis au premier');

  await page.evaluate(() => {
    showView('menu');
    const bouton = [...document.querySelectorAll('.nav-btn')].find((node) => /вина/i.test(node.textContent));
    showMenuSection('vins', bouton);
  });
  await page.waitForFunction(() => document.querySelectorAll('#vins .wine-row').length === 17);
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
  console.log('  ok   Chromium mobile : 17 vins, 4 catégories, étiquettes/prix lisibles de 280 à 430 px');
  console.log('  ok   Chromium mobile : tiroirs de dégustation ouverts dans les 4 catégories, sans débordement');
  console.log('  ok   Chromium ukrainien : libellés « 140 мл », tarifs et scripts invalidés réellement rendus');

  await contexte.close();
} finally {
  if (navigateur) await navigateur.close();
  if (serveur) await new Promise((resolveClose) => serveur.server.close(resolveClose));
}
