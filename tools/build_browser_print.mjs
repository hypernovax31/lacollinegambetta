#!/usr/bin/env node
/**
 * Build the printable card from the real website with Chromium.
 *
 * Unlike the former ImageMagick renderer, this script loads index.html,
 * waits for the website fonts, lets the page build its nine print pages, and
 * exports the exact print DOM to a PDF plus one high-resolution JPG per page.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'print-assets');
const STAGE = join(ROOT, '.browser-print');
const PDF_NAME = 'carte-menus-boissons-a4.pdf';
const PAGE_COUNT = 9;
const JPG_WIDTH = 2480;
const JPG_HEIGHT = 3508;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
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
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/index.html` });
    });
  });
}

function normalizeJpgs(directory) {
  // Chromium rounds physical CSS pixels differently on alternating pages.
  // Normalize only the raster deliverables; the PDF remains native browser
  // output and keeps its vector text and embedded website fonts.
  const convert = spawnSync('which', ['convert'], { encoding: 'utf8' });
  if (convert.status !== 0) {
    console.warn('ImageMagick not available; JPGs keep Chromium dimensions.');
    return false;
  }
  for (let i = 1; i <= PAGE_COUNT; i += 1) {
    const filename = `page-${String(i).padStart(2, '0')}.jpg`;
    const source = join(directory, filename);
    const normalized = join(directory, `.${filename}`);
    const result = spawnSync('convert', [source, '-resize', `${JPG_WIDTH}x${JPG_HEIGHT}!`, '-quality', '95', normalized], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Could not normalize ${filename}: ${result.stderr}`);
    rmSync(source, { force: true });
    renameSync(normalized, source);
  }
  return true;
}

function validateJpgs(directory, strict = true) {
  const identify = spawnSync('identify', ['-format', '%wx%h\n', ...Array.from({ length: PAGE_COUNT }, (_, i) => join(directory, `page-${String(i + 1).padStart(2, '0')}.jpg`))], { encoding: 'utf8' });
  if (identify.status !== 0) {
    console.warn('identify not available; JPG dimensions were not checked.');
    return;
  }
  const dimensions = identify.stdout.trim().split(/\s+/);
  const expected = `${JPG_WIDTH}x${JPG_HEIGHT}`;
  if (dimensions.length !== PAGE_COUNT || dimensions.some((size) => size !== expected)) {
    const message = `Unexpected JPG dimensions: ${dimensions.join(', ')}`;
    if (strict) throw new Error(message);
    console.warn(`${message}; continuing because ImageMagick is unavailable.`);
  }
}

async function main() {
  if (!existsSync(join(ROOT, 'index.html'))) throw new Error('index.html not found');
  mkdirSync(OUT, { recursive: true });
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  const { server, url } = await startStaticServer();
  let browser;
  try {
    // @sparticuz/chromium ships the browser and its shared libraries in npm.
    // Force its AL2023 bundle locally so this build does not depend on a
    // system Chrome installation or on apt packages being available.
    process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
    setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
    const executablePath = await chromiumBinary.executablePath();
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      // Use the site's desktop breakpoint while keeping the printed page A4.
      // This preserves the two/three-column menu layouts in the print DOM.
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 3.125,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('700 24px Cinzel'),
        document.fonts.load('500 16px Montserrat'),
      ]);
    });
    await page.emulateMedia({ media: 'print' });
    await page.waitForFunction((count) => document.querySelectorAll('.print-page').length === count, PAGE_COUNT);

    const info = await page.evaluate(() => ({
      pages: document.querySelectorAll('.print-page').length,
      fontStatus: document.fonts.status,
      cinzel: document.fonts.check('700 24px Cinzel'),
      montserrat: document.fonts.check('500 16px Montserrat'),
    }));
    console.log(`website print DOM: ${info.pages} pages; fonts=${info.fontStatus}; Cinzel=${info.cinzel}; Montserrat=${info.montserrat}`);

    await page.pdf({
      path: join(STAGE, PDF_NAME),
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    const pages = page.locator('.print-page');
    for (let i = 0; i < PAGE_COUNT; i += 1) {
      const filename = `page-${String(i + 1).padStart(2, '0')}.jpg`;
      await pages.nth(i).screenshot({
        path: join(STAGE, filename),
        type: 'jpeg',
        quality: 95,
        scale: 'device',
        animations: 'disabled',
      });
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  const jpgsNormalized = normalizeJpgs(STAGE);
  validateJpgs(STAGE, jpgsNormalized);

  // Replace the tracked deliverables only after the browser completed every
  // page and all JPGs passed validation.
  renameSync(join(STAGE, PDF_NAME), join(OUT, PDF_NAME));
  for (let i = 1; i <= PAGE_COUNT; i += 1) {
    const filename = `page-${String(i).padStart(2, '0')}.jpg`;
    renameSync(join(STAGE, filename), join(OUT, filename));
  }
  rmSync(STAGE, { recursive: true, force: true });
  console.log(`generated browser PDF and ${PAGE_COUNT} JPGs in ${OUT}`);
}

main().catch((error) => {
  console.error(`Browser print failed: ${error.message}`);
  console.error('Run npm install to install the bundled Chromium runtime.');
  process.exitCode = 1;
});
