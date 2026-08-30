#!/usr/bin/env node
/**
 * Build the downloadable A4 menu (carte-a4.pdf) from carte.html.
 *
 * Loads the A4 card (same content and styles as the website), waits for the
 * web fonts, emulates the print media (each page is a real A4 portrait sheet)
 * and exports the result as a PDF. The website header's download button links
 * to this file so visitors get the A4 menu as a PDF.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts, assertPdfFonts } from './local-fonts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_NAME = 'carte-a4.pdf';
const STAGE = join(ROOT, '.carte-pdf');
const PAGE_COUNT = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

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
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/carte.html` });
    });
  });
}

async function main() {
  if (!existsSync(join(ROOT, 'carte.html'))) {
    throw new Error('carte.html not found — run "python3 tools/build_carte.py" first');
  }
  rmSync(STAGE, { recursive: true, force: true });

  const { server, url } = await startStaticServer();
  let browser;
  try {
    // @sparticuz/chromium ships the browser and its shared libraries in npm.
    process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
    setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
    const executablePath = await chromiumBinary.executablePath();
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      // A4 portrait at 96 dpi keeps the fixed 210 mm page geometry 1:1.
      viewport: { width: 900, height: 1273 },
      deviceScaleFactor: 2,
    });
    // Cinzel et Montserrat sont servies par node_modules/@fontsource : sans ces
    // fichiers (ou sans réseau), Chromium composerait en Open Sans et le PDF
    // n'aurait plus la police du site.
    await installLocalFonts(context, ROOT);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('700 29pt Cinzel'),
        document.fonts.load('800 29pt Cinzel'),
        document.fonts.load('400 10px Montserrat'),
      ]);
    });
    const info = await page.evaluate(() => ({
      pages: document.querySelectorAll('#print-document .print-page').length,
    }));
    if (info.pages !== PAGE_COUNT) {
      throw new Error(`expected ${PAGE_COUNT} A4 pages in carte.html, found ${info.pages}`);
    }
    const fonts = await checkPageFonts(page);
    console.log(`carte A4: ${info.pages} pages; polices chargées = ${fonts.join(', ')}`);

    // Print media: every .print-page-frame is a 210 mm x 297 mm sheet.
    await page.emulateMedia({ media: 'print' });
    const out = join(STAGE, OUT_NAME);
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    const embedded = assertPdfFonts(out);
    console.log(`polices embarquées dans le PDF : ${embedded.join(', ')}`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  renameSync(join(STAGE, OUT_NAME), join(ROOT, OUT_NAME));
  rmSync(STAGE, { recursive: true, force: true });
  console.log(`generated ${OUT_NAME} in ${ROOT}`);
}

main().catch((error) => {
  console.error(`Carte A4 PDF failed: ${error.message}`);
  console.error('Run npm install to install the bundled Chromium runtime.');
  process.exitCode = 1;
});
