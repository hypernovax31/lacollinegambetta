#!/usr/bin/env node
/* Contrôle du choix de langue au premier chargement — les scénarios réels
   d'un appareil : langue du navigateur (navigator.languages), pays deviné par
   l'adresse IP (appel réseau simulé), langue déjà choisie, `?lang=` dans
   l'adresse. L'ordre attendu est celui du code :
       ?lang=  →  localStorage['lcg-lang']  →  navigator.languages  →  IP  →  en
   Usage : node tools/check-lang.mjs
   Sortie : exit 1 dès qu'un scénario ne se comporte pas comme prévu. */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '../node_modules/playwright/index.mjs';
import chromiumBinary, { setupLambdaEnvironment } from '../node_modules/@sparticuz/chromium/build/index.js';
import { carteChromiumArgs } from './chromium-args.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = normalize(join(ROOT, relative));
  if (!file.startsWith(`${ROOT}/`) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
const browser = await chromium.launch({ headless: true, executablePath: await chromiumBinary.executablePath(), args: [...carteChromiumArgs(), '--no-sandbox', '--disable-dev-shm-usage'] });

/* `attendu` : la langue que l'appareil décrit doit voir s'afficher.
   `cc: ''` = pays indisponible (les deux services tombent).

   Deux règles du site se lisent dans ces attentes :
     • l'anglais de l'appareil est écarté — beaucoup de téléphones sont
       réglés EN sans que ce soit la langue de l'usager — et l'on retient la
       première AUTRE langue de navigator.languages avant d'interroger le
       pays : [en, ja] donne ja, sans aucune requête réseau ;
     • l'anglais seul (ou une écriture non servie : ru, th) fait interroger
       le pays de l'opérateur, puis retomber sur l'anglais. */
const scenarios = [
  { name: 'appareil fr', langs: ['fr-FR', 'fr'], cc: null, url: '', attendu: 'fr' },
  { name: 'appareil en seul, IP au Japon', langs: ['en-US', 'en'], cc: 'JP', url: '', attendu: 'ja', note: 'anglais seul → pays' },
  { name: 'appareil en puis ja', langs: ['en-US', 'ja-JP'], cc: null, url: '', attendu: 'ja', note: 'anglais écarté, ja retenu' },
  { name: 'appareil ja', langs: ['ja-JP'], cc: null, url: '', attendu: 'ja' },
  { name: 'appareil ru, IP en France', langs: ['ru-RU'], cc: 'FR', url: '', attendu: 'fr', note: 'ru n’est pas servi → pays' },
  { name: 'appareil th, IP muette', langs: ['th-TH'], cc: '', url: '', attendu: 'en', note: 'rien de connu → anglais' },
  { name: 'appareil en seul, IP muette', langs: ['en-GB', 'en'], cc: '', url: '', attendu: 'en', note: 'repli final' },
  { name: '?lang=de l’emporte', langs: ['ja-JP'], cc: 'JP', url: '?lang=de', attendu: 'de' },
  { name: 'choix mémorisé l’emporte', langs: ['ja-JP'], cc: 'JP', url: '', stored: 'es', attendu: 'es' },
  { name: 'appareil en puis nl', langs: ['en-GB', 'nl-NL'], cc: null, url: '', attendu: 'nl' },
  { name: 'RTL : appareil ar', langs: ['ar'], cc: null, url: '', attendu: 'ar', rtl: true },
  { name: 'RTL : IP en Arabie saoudite', langs: ['en'], cc: 'SA', url: '', attendu: 'ar', rtl: true, note: 'le pays pose aussi dir=rtl' },
];

const echecs = [];
for (const sc of scenarios) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript(({ langs, cc }) => {
    Object.defineProperty(navigator, 'languages', { get: () => langs, configurable: true });
    Object.defineProperty(navigator, 'language', { get: () => langs[0], configurable: true });
    const realFetch = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/ipwho\.is|geojs\.io/.test(url)) {
        if (!cc) return Promise.reject(new Error('réseau indisponible'));
        const body = /ipwho/.test(url) ? { country_code: cc } : { country: cc };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return realFetch ? realFetch(input, init) : Promise.reject(new Error('pas de fetch'));
    };
  }, { langs: sc.langs, cc: sc.cc });
  if (sc.stored) await context.addInitScript(l => { try { localStorage.setItem('lcg-lang', l); } catch (e) {} }, sc.stored);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html${sc.url}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600); /* laisse tomber la découverte IP (délai 2 s) */
  const out = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    checked: [...document.querySelectorAll('.lang-option')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.lang),
    premierOnglet: document.querySelector('.nav-btn') ? document.querySelector('.nav-btn').textContent.trim() : null,
  }));
  const ok = out.lang === sc.attendu && (!out.checked.length || out.checked[0] === sc.attendu) && (!sc.rtl || out.dir === 'rtl');
  if (!ok) echecs.push({ scenario: sc.name, attendu: sc.attendu, obtenu: out });
  console.log(`${ok ? '✓' : '✗'} ${sc.name.padEnd(30)} → ${out.lang}${out.dir === 'rtl' ? ' (rtl)' : ''}${sc.note ? `  — ${sc.note}` : ''}`);
  await context.close();
}
await browser.close();
server.close();
if (echecs.length) {
  console.log('\n✗ échec :');
  for (const e of echecs) console.log(`  · ${e.scenario} : attendu « ${e.attendu} », obtenu « ${e.obtenu.lang} » (coché : ${e.obtenu.checked.join(', ') || '—'}, dir ${e.obtenu.dir})`);
}
console.log(echecs.length ? '' : `\n✔ détection de langue : les ${scenarios.length} scénarios d’appareil se comportent comme prévu.`);
process.exit(echecs.length ? 1 : 0);
