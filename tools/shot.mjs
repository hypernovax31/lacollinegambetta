#!/usr/bin/env node
/**
 * Capture d'écran d'un onglet du site, pour contrôle visuel pendant le travail.
 *
 *   node tools/shot.mjs --tab boissons --width 1440 --out /tmp/shots/boissons.png
 *   node tools/shot.mjs --tab cocktails --width 390 --out /tmp/shots/cocktails-mobile.png
 *
 * Utilitaire de développement : il ne fait partie d'aucun build.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};

const TAB = String(flag('tab', 'boissons'));
const WIDTH = Number(flag('width', 1440));
const HEIGHT = Number(flag('height', 1200));
const OUT = String(flag('out', `/tmp/shots/${TAB}-${WIDTH}.png`));
const SELECTOR = flag('selector', '');
const FULL = argv.includes('--full');

function startStaticServer() {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent((request.url || '/').split('?')[0]);
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
    response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

async function main() {
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  const browser = await chromium.launch({
    headless: true,
    executablePath: await chromiumBinary.executablePath(),
    args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const { server, port } = await startStaticServer();
  try {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
    await installLocalFonts(context, ROOT);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.evaluate((tab) => {
      if (typeof showView === 'function') showView('menu');
      const button = [...document.querySelectorAll('.nav-btn')]
        .find((b) => (b.getAttribute('onclick') || '').includes(`'${tab}'`));
      if (button && typeof showMenuSection === 'function') {
        showMenuSection(tab, button);
      } else {
        document.querySelectorAll('.menu-section').forEach((s) => s.classList.remove('active'));
        document.getElementById(tab)?.classList.add('active');
      }
      const interior = document.getElementById('interior-menu');
      if (interior) interior.style.display = 'block';
      const cover = document.getElementById('cover-section');
      if (cover) cover.style.display = 'none';
    }, TAB);
    await page.evaluate(() => document.fonts.ready);
    await checkPageFonts(page);
    await page.waitForTimeout(300);
    mkdirSync(dirname(OUT), { recursive: true });
    if (SELECTOR && SELECTOR !== true) {
      const el = await page.locator(String(SELECTOR)).first();
      await el.screenshot({ path: OUT });
    } else {
      await page.screenshot({ path: OUT, fullPage: FULL });
    }
    console.log(`écrit : ${OUT}`);
  } finally {
    server.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
