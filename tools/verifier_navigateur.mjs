#!/usr/bin/env node
/**
 * Vérifications Chromium des traductions, des vins et du bloc d'avis Google
 * sur petits écrans, en portrait comme en paysage. Les avis de test sont fictifs.
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
const REVIEW_FIXTURE_LONG = 'TEST ONLY — ce commentaire fictif est réservé au test de mise en page. Il contient plusieurs phrases pour contrôler les retours à la ligne, la lisibilité sur petit écran, la place laissée aux commandes tactiles et le rendu du carrousel en portrait et en paysage. Il ne s’agit pas d’un avis client.';
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

  const ratpTactile = await page.locator('#cover-section [data-ratp-itineraire]').evaluate((link) => ({
    href:link.href,target:link.target,appHref:link.getAttribute('data-ratp-app-href'),
  }));
  assert.ok(ratpTactile.href.startsWith('https://www.bonjour-ratp.fr/itineraires/?end='),
    'sur mobile, le lien tactile doit rester un Universal Link HTTPS iOS-compatible');
  assert.equal(ratpTactile.target, '', 'le lien tactile ne doit pas s’ouvrir dans un nouvel onglet');
  assert.equal(ratpTactile.href, ratpTactile.appHref);

  const contexteAndroid=await navigateur.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
  });
  const pageAndroid=await contexteAndroid.newPage();
  await pageAndroid.route('**/*', async (route) => {
    const url=new URL(route.request().url());
    if (url.origin===origineLocale) await route.continue(); else await route.abort();
  });
  await pageAndroid.goto(`${origineLocale}/index.html`,{waitUntil:'domcontentloaded'});
  const hrefAndroid=await pageAndroid.locator('#cover-section [data-ratp-itineraire]').evaluate((link)=>({
    href:link.href,target:link.target,web:link.href.match(/browser_fallback_url=([^;]+);end$/)?.[1],
  }));
  assert.ok(hrefAndroid.href.startsWith('intent://www.bonjour-ratp.fr/itineraires/?end='),
    'Android Chrome doit appeler directement l’Intent Bonjour RATP');
  assert.ok(hrefAndroid.href.includes('#Intent;scheme=https;package=com.fabernovel.ratp;'),
    'l’Intent Android doit désigner le paquet officiel Bonjour RATP');
  const secoursAndroid = new URL(decodeURIComponent(hrefAndroid.web));
  assert.equal(secoursAndroid.origin, origineLocale,
    'si l’app manque, Chrome doit ouvrir la page de secours du site');
  assert.equal(secoursAndroid.pathname, '/ratp-fallback.html');
  assert.equal(secoursAndroid.searchParams.get('source'), 'metro');
  assert.equal(hrefAndroid.target,'');
  await contexteAndroid.close();
  console.log('  ok   Chromium : Universal Link mobile et Intent Android explicite avec secours web');

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
  assert.equal(widgetAccueil.sectionBackground, 'rgb(252, 251, 247)', 'les étoiles, la note et les avis doivent rester sur le même fond crème');
  assert.equal(widgetAccueil.cardBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(widgetAccueil.cardShadow, 'none', 'le bloc ne doit pas avoir d’ombre');
  assert.equal(widgetAccueil.cardBorder, '0px', 'le bloc ne doit pas avoir de cadre');
  assert.equal(widgetAccueil.titlePosition, 'absolute', 'le titre doit rester accessible sans être visible');
  assert.equal(widgetAccueil.titleWidth, '1px');
  assert.equal(widgetAccueil.ratingDisplay, 'grid', 'étoiles et note globale doivent dominer le compteur d’avis');
  assert.equal(widgetAccueil.carouselDisplay, 'grid', 'les commentaires doivent être dans un vrai carrousel');
  assert.ok(widgetAccueil.sectionScroll <= widgetAccueil.sectionWidth + 1, 'le bloc d’avis déborde horizontalement à 320 px');
  assert.ok(widgetAccueil.cardScroll <= widgetAccueil.cardWidth + 1, 'la carte d’avis déborde à 320 px');
  assert.equal(requetesGooglePlaces.filter((path) => path === '/maps/api/js').length, 1,
    'Places doit être demandé automatiquement une seule fois au chargement');
  console.log('  ok   Chromium : avis autochargés au chargement, sans avis statique; secours disponible hors ligne');

  const contexteSurvol=await navigateur.newContext({ viewport:{width:1280,height:800}, deviceScaleFactor:1 });
  const pageSurvol=await contexteSurvol.newPage();
  pageSurvol.setDefaultTimeout(10000);
  await pageSurvol.emulateMedia({ reducedMotion:'no-preference' });
  await pageSurvol.route('**/*', async (route) => {
    const url=new URL(route.request().url());
    if (url.origin===origineLocale) await route.continue();
    else await route.abort();
  });

  const contexteParis=await navigateur.newContext({ viewport:{width:1280,height:800}, deviceScaleFactor:1 });
  const pageParis=await contexteParis.newPage();
  pageParis.setDefaultTimeout(10000);
  await pageParis.route('**/*', async (route) => {
    const url=new URL(route.request().url());
    if (url.origin===origineLocale) await route.continue();
    else await route.abort();
  });
  await pageParis.clock.install({ time:new Date('2026-12-15T12:00:00.000Z') });
  await pageParis.goto(`${origineLocale}/index.html`, { waitUntil:'domcontentloaded' });
  await pageParis.waitForFunction(() => window.__xmas?.active === true &&
    document.getElementById('xmas-snow')?.classList.contains('on'));
  assert.equal(await pageParis.evaluate(() => Number(new Intl.DateTimeFormat('en', {
    timeZone:'Europe/Paris', month:'numeric'
  }).format(new Date()))), 12, 'l’horloge simulée doit bien placer le navigateur en décembre à Paris');
  await contexteParis.close();
  console.log('  ok   Chromium : activation automatique avec l’horloge de décembre à Paris');

  await pageSurvol.goto(`${origineLocale}/index.html?noel=1`, { waitUntil:'domcontentloaded' });
  await pageSurvol.waitForFunction(() => window.__xmas?.active === true &&
    document.getElementById('xmas-snow')?.classList.contains('on'));
  async function verifierNoelVue(vue, attendu) {
    const etat = await pageSurvol.evaluate(() => {
      const neige=document.getElementById('xmas-snow');
      const rect=neige.getBoundingClientRect();
      return {
        active:window.__xmas?.active,
        on:neige.classList.contains('on'),
        display:getComputedStyle(neige).display,
        pointerEvents:getComputedStyle(neige).pointerEvents,
        zIndex:getComputedStyle(neige).zIndex,
        cover:getComputedStyle(document.getElementById('cover-section')).display,
        menu:getComputedStyle(document.getElementById('interior-menu')).display,
        width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight,
      };
    });
    assert.equal(etat.active,true,`l’animation de Noël doit rester active dans la vue ${vue}`);
    assert.equal(etat.on,true,`le canevas de neige doit rester activé dans la vue ${vue}`);
    assert.equal(etat.display,'block');
    assert.equal(etat.pointerEvents,'none','la neige ne doit pas intercepter les clics du menu');
    assert.equal(etat.zIndex,'9970');
    assert.equal(etat.cover,attendu.cover);
    assert.equal(etat.menu,attendu.menu);
    assert.equal(etat.width,etat.viewportWidth,'le canevas doit couvrir toute la largeur dans chaque vue');
    assert.equal(etat.height,etat.viewportHeight,'le canevas doit couvrir toute la hauteur dans chaque vue');
  }
  await verifierNoelVue('page de garde',{cover:'flex',menu:'none'});
  await pageSurvol.evaluate(() => showView('menu'));
  await verifierNoelVue('Menu & Carte',{cover:'none',menu:'block'});
  await pageSurvol.evaluate(() => showView('cover'));
  await verifierNoelVue('retour à la page de garde',{cover:'flex',menu:'none'});
  await pageSurvol.evaluate(() => {
    const reprise=window.__xmas.resume;
    window.__xmasResumeCalls=0;
    window.__xmas.resume=function(){window.__xmasResumeCalls++;return reprise();};
    window.__xmas.pause();
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await pageSurvol.waitForFunction(() => window.__xmasResumeCalls===1);
  await verifierNoelVue('retour de navigation',{cover:'flex',menu:'none'});
  console.log('  ok   Chromium : animation de Noël en couverture, Menu & Carte et reprise au retour');

  const ratpDesktop = await pageSurvol.locator('#cover-section [data-ratp-itineraire]').evaluate((link) => ({
    href:link.href,
    target:link.target,
    appHref:link.getAttribute('data-ratp-app-href'),
  }));
  assert.ok(ratpDesktop.href.startsWith('https://www.ratp.fr/itineraires?end='),
    'sur ordinateur, le fallback web officiel doit recevoir la destination du restaurant');
  assert.equal(new URL(ratpDesktop.href).searchParams.get('end'), '4 Rue Belgrand, 75020 Paris',
    'le fallback web sur ordinateur doit porter l’adresse complète du restaurant');
  assert.equal(ratpDesktop.target, '_blank', 'le fallback web sur ordinateur doit conserver son onglet externe');
  assert.ok(ratpDesktop.appHref.startsWith('https://www.bonjour-ratp.fr/itineraires/?end='));
  const medaillon=pageSurvol.locator('#cover-section .medallion-frame');
  await medaillon.waitFor({ state:'visible' });
  await pageSurvol.waitForFunction(() => {
    const frame=document.querySelector('#cover-section .medallion-frame');
    return document.readyState==='complete' && frame?.classList.contains('is-load-reflection') &&
      getComputedStyle(frame,'::after').animationName==='cover-medallion-gold-reflection';
  });
  const refletAuChargement=await medaillon.evaluate((element)=>({
    readyState:document.readyState,
    classActive:element.classList.contains('is-load-reflection'),
    animation:getComputedStyle(element,'::after').animationName,
    duration:parseFloat(getComputedStyle(element,'::after').animationDuration),
  }));
  assert.equal(refletAuChargement.readyState,'complete','le reflet initial doit attendre la fin du chargement');
  assert.equal(refletAuChargement.classActive,true,'le reflet initial doit être déclenché après load');
  assert.equal(refletAuChargement.animation,'cover-medallion-gold-reflection',
    'le médaillon doit déclencher son reflet doré après le chargement complet');
  assert.ok(refletAuChargement.duration>=1,'le reflet de chargement doit être perceptible');
  await pageSurvol.waitForFunction(() =>
    !document.querySelector('#cover-section .medallion-frame')?.classList.contains('is-load-reflection'));
  await medaillon.hover();
  const refletMedallion=await medaillon.evaluate((element)=>({
    animation:getComputedStyle(element,'::after').animationName,
    duration:parseFloat(getComputedStyle(element,'::after').animationDuration),
  }));
  assert.equal(refletMedallion.animation,'cover-medallion-gold-reflection',
    'le médaillon doit conserver son reflet doré au survol');
  assert.ok(refletMedallion.duration>=1,'le reflet doré au survol doit être perceptible');
  await pageSurvol.emulateMedia({ reducedMotion:'reduce' });
  const animationAvecMouvementReduit=await medaillon.evaluate((element)=>
    getComputedStyle(element,'::after').animationName);
  assert.equal(animationAvecMouvementReduit,'none','le reflet doit respecter la préférence de mouvement réduit');
  await contexteSurvol.close();
  console.log('  ok   Chromium : reflet au chargement complet et au survol, avec respect du mouvement réduit');

  async function mesurerLignesCouverture(largeur, hauteur) {
    await page.setViewportSize({ width:largeur, height:hauteur });
    await page.waitForTimeout(25);
    return page.evaluate(() => {
      const coverPage=document.querySelector('#cover-section .cover-page');
      const footer=document.querySelector('#cover-section .cover-footer');
      const hours=document.querySelector('#cover-section .cover-hours');
      const address=document.querySelector('#cover-section .cover-footer-address');
      const selectors=[
        '.cover-brand', '.cover-brand .leader-title', '.cover-brand h1',
        '.cover-brand .leader-meta', '.cover-brand .menu-leader-subline',
        '.cover-action', '.cover-footer', '.cover-hours', '.cover-hours__range',
        '.cover-footer-address', '.cover-links', '#cover-more .footer-quartier--cover'
      ];
      const find=(selector)=>document.querySelector(selector.startsWith('#')?selector:'#cover-section '+selector);
      const box=(element) => {
        const rect=element.getBoundingClientRect();
        const style=getComputedStyle(element);
        return {
          left:rect.left, top:rect.top, width:rect.width, height:rect.height, center:rect.left+rect.width/2,
          parentWidth:element.parentElement.getBoundingClientRect().width,
          cssWidth:style.width, cssMaxWidth:style.maxWidth,
          textAlign:style.textAlign, whiteSpace:style.whiteSpace
        };
      };
      const pageRect=coverPage.getBoundingClientRect();
      const pageStyle=getComputedStyle(coverPage);
      const hoursStyle=getComputedStyle(hours);
      return {
        pageCenter:pageRect.left+pageRect.width/2,
        pageContentWidth:coverPage.clientWidth-parseFloat(pageStyle.paddingLeft)-parseFloat(pageStyle.paddingRight),
        footerWidth:footer.getBoundingClientRect().width,
        hoursWidth:hours.getBoundingClientRect().width,
        hoursPadding:parseFloat(hoursStyle.paddingLeft)+parseFloat(hoursStyle.paddingRight),
        scheduleCenterDelta:(() => {
          const centers=['[data-hours-days]','[data-hours-range]','[data-hours-status]'].map((selector)=>{
            const rect=document.querySelector('#cover-section '+selector).getBoundingClientRect();
            return rect.top+rect.height/2;
          });
          return Math.max(...centers)-Math.min(...centers);
        })(),
        statusTextLines:(() => {
          const text=document.querySelector('#cover-section [data-hours-status-text]');
          const range=document.createRange();
          range.selectNodeContents(text);
          return range.getClientRects().length;
        })(),
        statusWithinRange:(() => {
          const range=document.querySelector('#cover-section .cover-hours__range').getBoundingClientRect();
          const status=document.querySelector('#cover-section [data-hours-status]').getBoundingClientRect();
          return status.left>=range.left-1 && status.right<=range.right+1;
        })(),
        hoursLineFontSize:parseFloat(getComputedStyle(document.querySelector('#cover-section .cover-hours__range')).fontSize),
        hoursItemFontSizes:[...document.querySelectorAll('#cover-section .cover-hours__range > *')]
          .filter((element)=>getComputedStyle(element).display!=='none')
          .map((element)=>parseFloat(getComputedStyle(element).fontSize)),
        statusFontSize:parseFloat(getComputedStyle(document.querySelector('#cover-section [data-hours-status]')).fontSize),
        addressFontSize:parseFloat(getComputedStyle(document.querySelector('#cover-section .cover-footer-address [data-default-map]')).fontSize),
        metroFontSize:parseFloat(getComputedStyle(document.querySelector('#cover-section [data-ratp-itineraire]')).fontSize),
        metroTarget:document.querySelector('#cover-section [data-ratp-itineraire]').target,
        metroHref:document.querySelector('#cover-section [data-ratp-itineraire]').href,
        metroAppHref:document.querySelector('#cover-section [data-ratp-itineraire]').getAttribute('data-ratp-app-href'),
        neighborhoodOverflow:(() => {
          const nav=document.querySelector('#cover-more .footer-quartier--cover');
          return nav.scrollWidth>nav.clientWidth+1 || [...nav.children].some((item)=>{
            const itemBox=item.getBoundingClientRect();
            const navBox=nav.getBoundingClientRect();
            return itemBox.left<navBox.left-1 || itemBox.right>navBox.right+1;
          });
        })(),
        neighborhoodWidth:document.querySelector('#cover-more .footer-quartier--cover').getBoundingClientRect().width,
        neighborhoodAvailableWidth:(() => {
          const section=document.getElementById('cover-more');
          const style=getComputedStyle(section);
          return section.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
        })(),
        addressChildrenTop:[...address.children].map((element)=>element.getBoundingClientRect().top),
        addressItems:[...address.children].map((element)=>{
          const rect=element.getBoundingClientRect();
          const style=getComputedStyle(element);
          return {left:rect.left,right:rect.right,marginLeft:style.marginLeft,marginRight:style.marginRight};
        }),
        lines:selectors.map((selector)=>({selector,...box(find(selector))}))
      };
    });
  }

  for (const [largeur, hauteur] of [[1365,768], [390,844], [320,640], [300,640], [280,640], [844,390], [667,375]]) {
    const disposition=await mesurerLignesCouverture(largeur, hauteur);
    assert.equal(disposition.metroTarget, '', `le lien app RATP doit naviguer directement sur écran tactile à ${largeur}×${hauteur}px`);
    assert.ok(disposition.metroHref.startsWith('https://www.bonjour-ratp.fr/itineraires/?end='),
      `le lien tactile doit viser Bonjour RATP à ${largeur}×${hauteur}px`);
    assert.equal(new URL(disposition.metroHref).searchParams.get('end'), '4 Rue Belgrand, 75020 Paris',
      `le lien tactile doit porter l’adresse complète du restaurant à ${largeur}×${hauteur}px`);
    assert.equal(disposition.metroAppHref, disposition.metroHref,
      `le handoff tactile ne doit pas perdre l’adresse de destination à ${largeur}×${hauteur}px`);
    assert.equal(disposition.addressFontSize, disposition.metroFontSize, `l’adresse et le métro doivent garder la même taille à ${largeur}×${hauteur}px`);
    assert.ok(Math.abs(disposition.hoursLineFontSize/disposition.addressFontSize-1.2)<.01 &&
      Math.abs(disposition.statusFontSize/disposition.addressFontSize-1.2)<.01 &&
      disposition.hoursItemFontSizes.every((size)=>Math.abs(size/disposition.addressFontSize-1.2)<.01),
      `toute la ligne horaire, badge compris, doit être 1,2× l’adresse à ${largeur}×${hauteur}px ` +
      `(ligne ${disposition.hoursLineFontSize}, badge ${disposition.statusFontSize}, adresse ${disposition.addressFontSize})`);
    assert.equal(disposition.neighborhoodOverflow,false,
      `la ligne « Dans les alentours » déborde ou coupe un lien à ${largeur}×${hauteur}px`);
    assert.ok(disposition.neighborhoodWidth>=disposition.neighborhoodAvailableWidth-2,
      `la ligne « Dans les alentours » n’utilise pas toute la largeur disponible à ${largeur}×${hauteur}px`);
    for (const ligne of disposition.lines) {
      assert.ok(Math.abs(ligne.center-disposition.pageCenter)<=2,
        `${ligne.selector} n’est pas centré sur la couverture à ${largeur}×${hauteur}px`);
      assert.equal(ligne.textAlign, 'center', `${ligne.selector} n’aligne pas son texte au centre à ${largeur}×${hauteur}px`);
    }
    const largeurAttendue=new Map([
      ['.cover-brand', Math.min(disposition.pageContentWidth,1280)],
      ['.cover-footer', Math.min(disposition.pageContentWidth,1320)],
      ['.cover-hours', Math.min(disposition.footerWidth,1100)],
      ['.cover-links', Math.min(disposition.footerWidth,1240)],
      ['#cover-more .footer-quartier--cover', disposition.neighborhoodAvailableWidth],
    ]);
    for (const [selector, largeurLigne] of largeurAttendue) {
      const ligne=disposition.lines.find((element)=>element.selector===selector);
      assert.ok(ligne.width>=largeurLigne-2,
        `${selector} n’utilise pas la largeur disponible à ${largeur}×${hauteur}px (${ligne.width.toFixed(1)}/${largeurLigne.toFixed(1)}px; parent ${ligne.parentWidth.toFixed(1)}, CSS ${ligne.cssWidth}, max ${ligne.cssMaxWidth})`);
    }
    const largeurAdresseAttendue=disposition.hoursWidth-disposition.hoursPadding;
    const adresse=disposition.lines.find((ligne)=>ligne.selector==='.cover-footer-address');
    assert.ok(adresse.width>=largeurAdresseAttendue-2,
      `l’adresse ne s’étale pas sur la ligne à ${largeur}×${hauteur}px`);
    assert.equal(adresse.whiteSpace, 'nowrap', `l’adresse n’est pas conservée sur une seule ligne à ${largeur}×${hauteur}px`);
    const ligneHoraires=disposition.lines.find((element)=>element.selector==='.cover-hours__range');
    assert.ok(ligneHoraires.width>=largeurAdresseAttendue-2,
      `.cover-hours__range n’occupe pas la largeur de la ligne à ${largeur}×${hauteur}px`);
    assert.ok(disposition.scheduleCenterDelta<=1.5,
      `le statut ne suit pas les horaires sur la même ligne à ${largeur}×${hauteur}px`);
    assert.equal(disposition.statusTextLines,1,
      `le statut d’ouverture se coupe sur plusieurs lignes à ${largeur}×${hauteur}px`);
    assert.equal(disposition.statusWithinRange,true,
      `le statut sort de la ligne horaire à ${largeur}×${hauteur}px`);
    const statutsTransitions=await page.evaluate((libelles) => {
      const node=document.querySelector('#cover-section [data-hours-status-text]');
      const original=node.textContent;
      const mesures=libelles.map((libelle) => {
        node.textContent=libelle;
        const centers=['[data-hours-days]','[data-hours-range]','[data-hours-status]'].map((selector)=>{
          const rect=document.querySelector('#cover-section '+selector).getBoundingClientRect();
          return rect.top+rect.height/2;
        });
        const textRange=document.createRange();
        textRange.selectNodeContents(node);
        const lineRect=node.closest('.cover-hours__range').getBoundingClientRect();
        const statusRect=document.querySelector('#cover-section [data-hours-status]').getBoundingClientRect();
        return {
          label:libelle,
          centerDelta:Math.max(...centers)-Math.min(...centers),
          lines:textRange.getClientRects().length,
          inside:statusRect.left>=lineRect.left-1 && statusRect.right<=lineRect.right+1
        };
      });
      node.textContent=original;
      return mesures;
    }, ['Зачиняється','Відчиняється']);
    for (const statut of statutsTransitions) {
      assert.ok(statut.centerDelta<=1.5 && statut.lines===1 && statut.inside,
        `le statut « ${statut.label} » doit rester sur la ligne horaire à ${largeur}×${hauteur}px`);
    }
    assert.equal(Math.max(...disposition.addressChildrenTop)-Math.min(...disposition.addressChildrenTop)<=1, true,
      `l’adresse et le métro ne restent pas sur une seule ligne à ${largeur}×${hauteur}px`);
    const adresseGauche=Math.min(...disposition.addressItems.map((item)=>item.left));
    const adresseDroite=Math.max(...disposition.addressItems.map((item)=>item.right));
    assert.ok(Math.abs((adresseGauche+adresseDroite)/2-disposition.pageCenter)<=2,
      `l’adresse et le métro ne sont pas centrés ensemble à ${largeur}×${hauteur}px`);
    assert.ok(disposition.addressItems.every((item)=>item.marginLeft==='0px' && item.marginRight==='0px'),
      `les liens d’adresse ne doivent pas recevoir de marges automatiques à ${largeur}×${hauteur}px`);
    const ecartsAdresse=disposition.addressItems.slice(1).map((item,index)=>item.left-disposition.addressItems[index].right);
    assert.ok(ecartsAdresse.every((ecart)=>ecart>=-0.5 && ecart<=16),
      `les liens d’adresse sont anormalement espacés à ${largeur}×${hauteur}px (${ecartsAdresse.map((ecart)=>ecart.toFixed(1)).join(', ')}px)`);
  }
  await page.setViewportSize({ width:320, height:640 });
  console.log('  ok   Chromium : lignes de couverture centrées et larges, y compris en paysage mobile');

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
  for (const largeur of [280, 320, 390, 560, 860]) {
    await page.setViewportSize({ width:largeur, height:720 });
    const pied=await page.evaluate(() => {
      const details=document.querySelector('#interior-menu .footer .footer-details');
      const brand=details.querySelector(':scope > span:first-child');
      const links=[...details.querySelectorAll('.footer-details__location > a')];
      const quartier=document.querySelector('#interior-menu .footer .footer-quartier');
      const bounds=(element) => {
        const rect=element.getBoundingClientRect();
        const style=getComputedStyle(element);
        return {
          display:style.display, visibility:style.visibility,
          left:rect.left, right:rect.right, width:rect.width, height:rect.height,
          clientWidth:element.clientWidth, scrollWidth:element.scrollWidth,
        };
      };
      return {
        details:bounds(details), brand:{ text:brand.textContent.trim(), ...bounds(brand) },
        links:links.map((element)=>({ text:element.textContent.trim(), ...bounds(element) })),
        quartier:bounds(quartier),
      };
    });
    assert.ok(pied.details.width>0 && pied.details.scrollWidth<=pied.details.clientWidth+1,
      `le ruban du pied déborde à ${largeur}px (${pied.details.scrollWidth}/${pied.details.clientWidth})`);
    assert.ok(pied.brand.height>0 && pied.brand.display!=='none' && pied.brand.visibility!=='hidden',
      `la marque du pied est masquée à ${largeur}px`);
    assert.equal(pied.links.length,2,`l’adresse et le métro doivent tous deux rester présents à ${largeur}px`);
    for (const lien of pied.links) {
      assert.ok(lien.width>0 && lien.height>0 && lien.display!=='none' && lien.visibility!=='hidden',
        `le lien « ${lien.text} » est masqué à ${largeur}px`);
      assert.ok(lien.scrollWidth<=lien.clientWidth+1 && lien.left>=pied.details.left-1 &&
        lien.right<=pied.details.right+1,
        `le lien « ${lien.text} » est rogné ou hors du pied à ${largeur}px`);
    }
    assert.ok(pied.quartier.width>=pied.details.width-2 &&
      pied.quartier.scrollWidth<=pied.quartier.clientWidth+1,
      `la ligne des alentours n’utilise pas le pied sans débordement à ${largeur}px`);
  }
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
  assert.ok(scriptsDemandes.has('/assets/js/google-reviews.js?v=2026100601'), 'le navigateur n’a pas chargé le carrousel Google');
  console.log('  ok   Chromium mobile : 17 vins, 4 catégories, étiquettes/prix lisibles de 280 à 430 px');
  console.log('  ok   Chromium mobile : tiroirs de dégustation ouverts dans les 4 catégories, sans débordement');
  console.log('  ok   Chromium ukrainien : libellés « 140 мл », tarifs et scripts invalidés réellement rendus');

  // Une seconde page isole le rendu complet avec des fixtures synthétiques,
  // interceptées localement : aucune requête réelle n'est envoyée à Google.
  const pageAvis = await contexte.newPage();
  await pageAvis.setViewportSize({ width: 320, height: 720 });
  await pageAvis.emulateMedia({ reducedMotion:'no-preference' });
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
              this.googleMapsURI = 'https://www.google.com/maps/search/?api=1&query=test-place';
              this.attributions = [{ provider:'TEST ONLY — attribution fictive', providerURI:'https://www.openstreetmap.org/' }];
              this.reviews = [
                {
                  rating:5,
                  text:${JSON.stringify(REVIEW_FIXTURE_LONG)},
                  textLanguageCode:'fr',
                  relativePublishTimeDescription:'il y a quelques jours',
                  googleMapsURI:'https://www.google.com/maps/reviews/fixture-1',
                  authorAttribution:{ displayName:'TEST ONLY — nom fictif de démonstration long pour écran mobile', uri:'https://www.google.com/maps/contrib/fixture-1' }
                },
                {
                  rating:4,
                  text:'TEST ONLY — fixture courte.',
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
  await pageAvis.locator('#google-reviews-rating').scrollIntoViewIfNeeded();
  await pageAvis.waitForFunction(() =>
    document.getElementById('google-reviews-rating')?.classList.contains('is-animating'));
  await pageAvis.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(sdkFictifIntercepte, true);
  const renduAvis = await pageAvis.evaluate(() => ({
    title:document.getElementById('cover-reviews-title').textContent.trim(),
    ratingHidden:document.getElementById('google-reviews-rating').hidden,
    score:document.getElementById('google-reviews-score').textContent,
    reviewCountPresent:document.getElementById('google-reviews-count') !== null,
    stars:document.getElementById('google-reviews-stars').getAttribute('aria-label'),
    ratingAnimationTriggered:document.getElementById('google-reviews-rating').classList.contains('is-animating'),
    starsAnimation:getComputedStyle(document.getElementById('google-reviews-stars')).animationName,
    starsFillAnimation:getComputedStyle(document.getElementById('google-reviews-stars-fill')).animationName,
    starsCometAnimation:getComputedStyle(document.getElementById('google-reviews-stars-fill'),'::before').animationName,
    starsGlintAnimation:getComputedStyle(document.getElementById('google-reviews-stars-fill'),'::after').animationName,
    scoreAnimation:getComputedStyle(document.getElementById('google-reviews-score')).animationName,
    starsAnimationRunning:[...document.getElementById('google-reviews-stars').getAnimations()]
      .some((animation)=>animation.animationName==='google-review-constellation-ignite' && animation.playState==='running'),
    starsFillAnimationRunning:[...document.getElementById('google-reviews-stars-fill').getAnimations()]
      .some((animation)=>animation.animationName==='google-review-gold-trace' && animation.playState==='running'),
    scoreAnimationRunning:[...document.getElementById('google-reviews-score').getAnimations()]
      .some((animation)=>animation.animationName==='google-review-score-reveal' && animation.playState==='running'),
    quote:document.querySelector('.google-reviews-quote').textContent,
    carousel:getComputedStyle(document.getElementById('google-reviews-carousel')).display,
    previousHidden:document.getElementById('google-reviews-previous').hidden,
    nextHidden:document.getElementById('google-reviews-next').hidden,
    dots:document.getElementById('google-reviews-dots').children.length,
    rotationHidden:document.getElementById('google-reviews-rotation').hidden,
    rotationLabel:document.getElementById('google-reviews-rotation').getAttribute('aria-label'),
    rotationDisabled:document.getElementById('google-reviews-rotation').disabled,
    position:document.getElementById('google-reviews-position').textContent,
  }));
  assert.equal(renduAvis.title, 'Avis Google');
  assert.equal(renduAvis.ratingHidden, false);
  assert.equal(renduAvis.score, '4,8/5');
  assert.equal(renduAvis.reviewCountPresent, false, 'le nombre d’avis ne doit pas apparaître dans le bloc');
  assert.equal(renduAvis.stars, 'Note moyenne Google : 4,8 sur 5');
  assert.equal(renduAvis.ratingAnimationTriggered, true, 'l’animation de la note doit attendre son entrée dans l’écran');
  assert.equal(renduAvis.starsAnimation, 'google-review-constellation-ignite', 'les étoiles doivent s’allumer avec un mouvement maîtrisé');
  assert.equal(renduAvis.starsFillAnimation, 'google-review-gold-trace', 'le remplissage doré doit se tracer sans déformer les étoiles');
  assert.equal(renduAvis.starsCometAnimation, 'google-review-comet-core', 'un éclat doit traverser la constellation dorée');
  assert.equal(renduAvis.starsGlintAnimation, 'google-review-gold-glint', 'un reflet doré doit parcourir les étoiles actives');
  assert.equal(renduAvis.scoreAnimation, 'google-review-score-reveal', 'la note doit apparaître après les étoiles');
  assert.equal(renduAvis.starsAnimationRunning, true, 'l’apparition des étoiles doit être visible quand le bloc entre dans l’écran');
  assert.equal(renduAvis.starsFillAnimationRunning, true, 'le remplissage des étoiles doit être actif quand le bloc entre dans l’écran');
  assert.equal(renduAvis.scoreAnimationRunning, true, 'l’apparition de la note doit être active avec l’animation des étoiles');
  assert.equal(renduAvis.quote, REVIEW_FIXTURE_LONG,
    'tous les caractères de l’avis le plus long doivent rester accessibles, sans troncature');
  assert.equal(renduAvis.carousel, 'grid');
  assert.equal(renduAvis.previousHidden, false);
  assert.equal(renduAvis.nextHidden, false);
  assert.equal(renduAvis.dots, 2);
  assert.equal(renduAvis.rotationHidden, false, 'le contrôle de rotation doit apparaître avec plusieurs avis');
  assert.equal(renduAvis.rotationLabel, 'Mettre en pause le défilement automatique des avis');
  assert.equal(renduAvis.rotationDisabled, false);
  assert.ok(renduAvis.position.includes('1 sur 2'));

  async function attendreAnimationsAvis() {
    await pageAvis.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await pageAvis.waitForFunction(() => {
      const viewport=document.getElementById('google-reviews-viewport');
      const slide=document.querySelector('.google-reviews-slide');
      return [...viewport.getAnimations(), ...slide.getAnimations()]
        .every((animation)=>animation.playState==='finished' || animation.playState==='idle');
    }, undefined, { polling:20, timeout:2000 });
  }
  async function mesurerMiseEnPage(largeur, hauteur) {
    await pageAvis.setViewportSize({ width:largeur, height:hauteur });
    await attendreAnimationsAvis();
    return pageAvis.evaluate(() => {
      const section = document.getElementById('cover-reviews-section');
      const card = document.querySelector('.google-reviews-card');
      const carousel = document.getElementById('google-reviews-carousel');
      const viewport = document.getElementById('google-reviews-viewport');
      const slide = document.querySelector('.google-reviews-slide');
      const quote = document.querySelector('.google-reviews-quote');
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { width:box.width, height:box.height };
      };
      const previous = document.getElementById('google-reviews-previous');
      const next = document.getElementById('google-reviews-next');
      const dot = document.querySelector('.google-reviews-dot');
      return {
        overflows:[section, card, carousel, viewport]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.id || element.className),
        quoteWithinViewport:(() => {
          const quoteBox=quote.getBoundingClientRect();
          const viewportBox=document.getElementById('google-reviews-viewport').getBoundingClientRect();
          return quoteBox.left >= viewportBox.left - 1 && quoteBox.right <= viewportBox.right + 1;
        })(),
        height:section.getBoundingClientRect().height,
        sectionWidth:rect(section).width,
        cardWidth:rect(card).width,
        viewportHeight:rect(viewport).height,
        viewportMinHeight:parseFloat(getComputedStyle(viewport).minHeight),
        slideHeight:rect(slide).height,
        slideFits:slide.getBoundingClientRect().height<=viewport.clientHeight+1,
        slideAnimation:getComputedStyle(slide).animationName,
        viewportTransitionDuration:getComputedStyle(viewport).transitionDuration,
        cardDisplay:getComputedStyle(card).display,
        cardColumns:getComputedStyle(card).gridTemplateColumns,
        carouselAreas:getComputedStyle(carousel).gridTemplateAreas,
        landscape:matchMedia('(orientation:landscape)').matches,
        quoteWidth:rect(quote).width,
        quoteFontSize:parseFloat(getComputedStyle(quote).fontSize),
        cardTextAlign:getComputedStyle(card).textAlign,
        quoteTextAlign:getComputedStyle(quote).textAlign,
        metaJustify:getComputedStyle(document.querySelector('.google-reviews-meta')).justifyContent,
        individualReviewSourceLinks:document.querySelectorAll('.google-reviews-source').length,
        authorNamesLinked:[...document.querySelectorAll('.google-reviews-author')]
          .filter((name)=>name.closest('a')).length,
        authorProfileLinks:document.querySelectorAll('.google-reviews-author-profile').length,
        globalGoogleMapsLinks:[...document.querySelectorAll('#google-reviews-all, #google-reviews-maps')]
          .filter((link)=>link.tagName==='A' && link.href.startsWith('https://www.google.com/maps/')).length,
        googleDateFontSize:parseFloat(getComputedStyle(document.querySelector('.google-reviews-date')).fontSize),
        googleDisclosureFontSize:parseFloat(getComputedStyle(document.getElementById('google-reviews-disclosure')).fontSize),
        googlePolicyFontSize:parseFloat(getComputedStyle(document.getElementById('google-reviews-policy')).fontSize),
        googleAllReviewsFontSize:parseFloat(getComputedStyle(document.getElementById('google-reviews-all')).fontSize),
        disclosureTextAlign:getComputedStyle(document.getElementById('google-reviews-disclosure')).textAlign,
        footerJustify:getComputedStyle(document.querySelector('.google-reviews-footer')).justifyContent,
        summaryCentered:(() => {
          const heading=document.querySelector('.google-reviews-heading').getBoundingClientRect();
          const rating=document.getElementById('google-reviews-rating').getBoundingClientRect();
          return Math.abs((heading.left + heading.width / 2) - (rating.left + rating.width / 2)) < 1;
        })(),
        summaryStacked:(() => {
          const stars=document.getElementById('google-reviews-stars').getBoundingClientRect();
          const score=document.getElementById('google-reviews-score').getBoundingClientRect();
          return stars.bottom<=score.top+1 && Math.abs((stars.left+stars.width/2)-(score.left+score.width/2))<1;
        })(),
        summaryCommentCenterDeltaY:(() => {
          const rating=document.getElementById('google-reviews-rating').getBoundingClientRect();
          const slideBox=slide.getBoundingClientRect();
          return rating.top+rating.height/2-(slideBox.top+slideBox.height/2);
        })(),
        quoteLineClamp:getComputedStyle(quote).webkitLineClamp || 'none',
        quoteDisplay:getComputedStyle(quote).display,
        quoteOverflowY:getComputedStyle(quote).overflowY,
        averageStarsWidth:rect(document.getElementById('google-reviews-stars')).width,
        averageStarsImage:getComputedStyle(document.getElementById('google-reviews-stars')).backgroundImage,
        averageStarsFillImage:getComputedStyle(document.getElementById('google-reviews-stars-fill')).backgroundImage,
        averageStarsFontSize:parseFloat(getComputedStyle(document.getElementById('google-reviews-stars')).fontSize),
        averageScoreFontSize:parseFloat(getComputedStyle(document.getElementById('google-reviews-score')).fontSize),
        starsBeforeScore:document.getElementById('google-reviews-stars').getBoundingClientRect().left <
          document.getElementById('google-reviews-score').getBoundingClientRect().left,
        reviewCountAbsent:document.getElementById('google-reviews-count')===null,
        duplicateReviewStars:document.querySelectorAll('.google-reviews-review-rating, .google-reviews-review-stars').length,
        navTargets:[rect(previous), rect(next)],
        rotationTarget:rect(document.getElementById('google-reviews-rotation')),
        navCentersY:[previous, next].map((element) => {
          const box=element.getBoundingClientRect();
          const carouselBox=carousel.getBoundingClientRect();
          return box.top - carouselBox.top + box.height / 2;
        }),
        dotTarget:dot ? rect(dot) : null,
      };
    });
  }

  function verifierCentrageAvis(layoutAvis, contexte) {
    assert.equal(layoutAvis.cardTextAlign, 'center', `le bloc n’est pas centré ${contexte}`);
    assert.equal(layoutAvis.quoteTextAlign, 'center', `le commentaire n’est pas centré ${contexte}`);
    assert.equal(layoutAvis.quoteDisplay, 'block', `l’avis doit rester dans un bloc de texte intégral ${contexte}`);
    assert.ok(!layoutAvis.quoteLineClamp || layoutAvis.quoteLineClamp === 'none',
      `le commentaire est tronqué par un line-clamp ${contexte}`);
    assert.notEqual(layoutAvis.quoteOverflowY, 'hidden', `le texte intégral est masqué verticalement ${contexte}`);
    assert.equal(layoutAvis.metaJustify, 'center', `l’auteur et la date ne sont pas centrés ${contexte}`);
    assert.equal(layoutAvis.individualReviewSourceLinks, 0, `un lien individuel vers un avis est encore affiché ${contexte}`);
    assert.equal(layoutAvis.authorNamesLinked, 0, `un nom d’auteur est encore cliquable ${contexte}`);
    assert.equal(layoutAvis.authorProfileLinks, 1, `le profil auteur requis par Google manque ${contexte}`);
    assert.equal(layoutAvis.globalGoogleMapsLinks, 1, `seul le lien « Tous les avis » doit rester cliquable ${contexte}`);
    assert.ok(layoutAvis.googleDateFontSize<=10 && layoutAvis.googleDisclosureFontSize<=10 &&
      layoutAvis.googlePolicyFontSize<=10 && layoutAvis.googleAllReviewsFontSize<=10,
      `les lignes d’information Google ne sont pas assez compactes ${contexte}`);
    assert.equal(layoutAvis.disclosureTextAlign, 'center', `la notice n’est pas centrée ${contexte}`);
    assert.equal(layoutAvis.footerJustify, 'center', `les liens du pied ne sont pas centrés ${contexte}`);
    assert.ok(layoutAvis.rotationTarget.width >= 44 && layoutAvis.rotationTarget.height >= 44,
      `le contrôle pause/reprise est trop petit ${contexte}`);
    assert.equal(layoutAvis.summaryCentered, true, `la note globale n’est pas centrée ${contexte}`);
    assert.ok(layoutAvis.cardWidth>=layoutAvis.sectionWidth-32,
      `le bloc d’avis n’utilise pas toute la largeur disponible ${contexte}`);
    assert.ok(layoutAvis.viewportMinHeight<=(layoutAvis.landscape?56:96)+.1,
      `la réserve verticale du carrousel n’est pas resserrée ${contexte} (${layoutAvis.viewportMinHeight}px)`);
    assert.equal(layoutAvis.slideFits, true, `le carrousel ne s’adapte pas à la hauteur du commentaire ${contexte}`);
    assert.ok(parseFloat(layoutAvis.viewportTransitionDuration)>=.3,
      `la hauteur du carrousel n’est pas animée avec fluidité ${contexte}`);
  }

  async function verifierAnimationCarrousel(name, contexte) {
    await pageAvis.evaluate(() => new Promise(requestAnimationFrame));
    const animation = await pageAvis.locator('.google-reviews-slide').evaluate((element, animationName) => {
      const active = element.getAnimations().find((item) => item.animationName === animationName);
      return active ? { name:active.animationName, state:active.playState, duration:active.effect.getTiming().duration } : null;
    }, name);
    assert.ok(animation && animation.state === 'running' && animation.duration >= 400,
      `la transition ${name} doit être réellement visible (${contexte}; ${JSON.stringify(animation)})`);
  }

  async function verifierStabiliteFleches(layoutInitial, largeur, hauteur, contexte) {
    assert.ok(Math.abs(layoutInitial.navCentersY[0] - layoutInitial.navCentersY[1]) <= 1,
      `les deux flèches ne sont pas au même niveau ${contexte}`);
    await pageAvis.getByRole('button', { name:'Avis suivant' }).click();
    await pageAvis.waitForFunction(() =>
      document.getElementById('google-reviews-position')?.textContent.includes('2 sur 2'));
    await verifierAnimationCarrousel('google-review-enter-next', contexte);
    const layoutSuivant = await mesurerMiseEnPage(largeur, hauteur);
    assert.ok(layoutSuivant.navCentersY.every((y, index) => Math.abs(y - layoutInitial.navCentersY[index]) <= 1),
      `les flèches changent de niveau vertical en passant à l’avis suivant ${contexte} (${layoutInitial.navCentersY.map((y) => y.toFixed(1)).join('/')} → ${layoutSuivant.navCentersY.map((y) => y.toFixed(1)).join('/')})`);
    assert.ok(Math.abs(layoutSuivant.viewportHeight-layoutInitial.viewportHeight)<=1,
      `la hauteur du carrousel change entre deux avis ${contexte} (${layoutInitial.viewportHeight}px → ${layoutSuivant.viewportHeight}px)`);
    assert.ok(Math.abs(layoutSuivant.height-layoutInitial.height)<=1,
      `la hauteur du bloc complet change entre deux avis ${contexte} (${layoutInitial.height}px → ${layoutSuivant.height}px)`);
    assert.ok(layoutInitial.slideHeight > layoutSuivant.slideHeight + 5,
      `les fixtures ne vérifient pas deux commentaires de longueurs différentes ${contexte}`);
    assert.ok(layoutInitial.viewportHeight+1>=Math.max(layoutInitial.slideHeight,layoutSuivant.slideHeight),
      `le cadre fixe ne réserve pas la place nécessaire à l’avis le plus long ${contexte}`);
    assert.ok(layoutInitial.slideFits && layoutSuivant.slideFits,
      `le texte ou les attributions sont coupés dans le carrousel ${contexte}`);
    assert.equal(layoutSuivant.slideAnimation, 'google-review-enter-next',
      `le défilement vers l’avis suivant n’est pas animé ${contexte}`);
    await pageAvis.getByRole('button', { name:'Avis précédent' }).click();
    await pageAvis.waitForFunction(() =>
      document.getElementById('google-reviews-position')?.textContent.includes('1 sur 2'));
    await verifierAnimationCarrousel('google-review-enter-previous', contexte);
    await attendreAnimationsAvis();
    const animationRetour=await pageAvis.locator('.google-reviews-slide').evaluate((element)=>getComputedStyle(element).animationName);
    assert.equal(animationRetour, 'google-review-enter-previous', `le retour à l’avis précédent n’est pas animé ${contexte}`);
  }

  for (const [largeur, hauteur] of [[280,640], [320,568], [375,667], [390,844], [430,932]]) {
    const layoutAvis = await mesurerMiseEnPage(largeur, hauteur);
    verifierCentrageAvis(layoutAvis, `en portrait à ${largeur}px`);
    assert.deepEqual(layoutAvis.overflows, [], `le bloc ou le carrousel déborde en portrait à ${largeur}px`);
    assert.equal(layoutAvis.quoteWithinViewport, true, `le commentaire dépasse le cadre en portrait à ${largeur}px`);
    assert.equal(layoutAvis.landscape, false, `le test portrait est dans la mauvaise orientation à ${largeur}px`);
    assert.ok(layoutAvis.quoteWidth >= largeur - 48, `le commentaire manque de largeur à ${largeur}px`);
    assert.ok(layoutAvis.quoteFontSize >= 14.5, `le texte est trop petit en portrait (${layoutAvis.quoteFontSize}px à ${largeur}px)`);
    assert.ok(layoutAvis.averageStarsWidth > 20, `les étoiles de la note moyenne sont invisibles à ${largeur}px`);
    assert.ok(layoutAvis.averageStarsImage.includes('data:image/svg+xml') && layoutAvis.averageStarsFillImage.includes('data:image/svg+xml'),
      `la note globale n’a pas ses étoiles dorées à ${largeur}px`);
    assert.ok(layoutAvis.averageStarsFontSize >= 20 && layoutAvis.averageScoreFontSize >= 22,
      `les étoiles et la note globale ne sont pas assez mises en avant à ${largeur}px`);
    assert.ok(layoutAvis.starsBeforeScore && layoutAvis.reviewCountAbsent,
      `la note globale n’est pas affichée sans compteur à ${largeur}px`);
    assert.equal(layoutAvis.duplicateReviewStars, 0, `des étoiles par avis doublent la note globale à ${largeur}px`);
    assert.ok(layoutAvis.navTargets.every((target) => target.width >= 44 && target.height >= 44),
      `les commandes du carrousel sont trop petites en portrait à ${largeur}px`);
    assert.ok(layoutAvis.dotTarget && layoutAvis.dotTarget.height >= 40,
      `les commandes de position sont trop petites en portrait à ${largeur}px`);
    await verifierStabiliteFleches(layoutAvis, largeur, hauteur, `en portrait à ${largeur}px`);
  }
  for (const [largeur, hauteur] of [[568,320], [667,375], [844,390]]) {
    const layoutAvis = await mesurerMiseEnPage(largeur, hauteur);
    verifierCentrageAvis(layoutAvis, `en paysage à ${largeur}×${hauteur}px`);
    assert.deepEqual(layoutAvis.overflows, [], `le bloc ou le carrousel déborde en paysage à ${largeur}×${hauteur}px`);
    assert.equal(layoutAvis.quoteWithinViewport, true, `le commentaire dépasse le cadre en paysage à ${largeur}×${hauteur}px`);
    assert.equal(layoutAvis.landscape, true, `le test paysage est dans la mauvaise orientation à ${largeur}×${hauteur}px`);
    assert.equal(layoutAvis.cardDisplay, 'grid', `la disposition paysage en colonnes n’est pas activée à ${largeur}×${hauteur}px`);
    assert.ok(!layoutAvis.quoteLineClamp || layoutAvis.quoteLineClamp === 'none',
      `le commentaire complet doit rester visible en paysage à ${largeur}×${hauteur}px`);
    assert.ok(layoutAvis.quoteWidth > 200, `le commentaire manque de largeur en paysage à ${largeur}px`);
    assert.ok(layoutAvis.averageStarsFontSize >= 17 && layoutAvis.averageScoreFontSize >= 19,
      `la note globale est reléguée en paysage à ${largeur}px`);
    assert.equal(layoutAvis.summaryStacked, true, `les étoiles doivent être au-dessus de la note en paysage à ${largeur}px`);
    assert.ok(Math.abs(layoutAvis.summaryCommentCenterDeltaY)<=6,
      `la colonne étoiles/note n’est pas centrée sur les commentaires en paysage à ${largeur}px (écart ${layoutAvis.summaryCommentCenterDeltaY.toFixed(1)}px)`);
    assert.ok(layoutAvis.starsBeforeScore && layoutAvis.reviewCountAbsent && layoutAvis.duplicateReviewStars === 0,
      `la note globale doit rester sans compteur en paysage à ${largeur}px`);
    assert.ok(layoutAvis.navTargets.every((target) => target.width >= 44 && target.height >= 44),
      `les commandes du carrousel sont trop petites en paysage à ${largeur}px`);
    assert.ok(layoutAvis.dotTarget && layoutAvis.dotTarget.height >= 36,
      `les commandes de position sont trop petites en paysage à ${largeur}px`);
    await verifierStabiliteFleches(layoutAvis, largeur, hauteur, `en paysage à ${largeur}×${hauteur}px`);
  }
  await pageAvis.getByRole('button', { name:'Avis suivant' }).click();
  await pageAvis.waitForFunction(() =>
    document.getElementById('google-reviews-position')?.textContent.includes('2 sur 2'));
  await pageAvis.emulateMedia({ reducedMotion:'reduce' });
  const mouvementsReduits=await pageAvis.evaluate(() => ({
    stars:getComputedStyle(document.getElementById('google-reviews-stars')).animationName,
    starsFill:getComputedStyle(document.getElementById('google-reviews-stars-fill')).animationName,
    starsComet:getComputedStyle(document.getElementById('google-reviews-stars-fill'),'::before').animationName,
    starsGlint:getComputedStyle(document.getElementById('google-reviews-stars-fill'),'::after').animationName,
    score:getComputedStyle(document.getElementById('google-reviews-score')).animationName,
    slide:getComputedStyle(document.querySelector('.google-reviews-slide')).animationName,
  }));
  assert.deepEqual(mouvementsReduits, { stars:'none', starsFill:'none', starsComet:'none', starsGlint:'none', score:'none', slide:'none' },
    'les animations doivent respecter prefers-reduced-motion');
  console.log('  ok   Chromium : note, étoiles, commentaires et carrousel responsives (fixtures synthétiques uniquement)');

  await contexte.close();
} finally {
  if (navigateur) await navigateur.close();
  if (serveur) await new Promise((resolveClose) => serveur.server.close(resolveClose));
}
