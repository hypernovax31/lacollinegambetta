#!/usr/bin/env node
/**
 * Mesure de la carte : hauteurs réelles de chaque bloc, telles que le site les
 * rend, pour que tools/build_carte.py reparte le contenu sur des feuilles A4
 * sans rien couper ni rétrécir.
 *
 *   node tools/measure_carte.mjs          → tools/carte-metrics.json
 *
 * On ne mesure pas une maquette : on ouvre index.html, à la largeur de
 * composition retenue pour la carte (1180 px = le grand écran du site, deux
 * colonnes), onglet par onglet, avec les vraies fontes. Les hauteurs sortent
 * à la largeur du flux, donc directement comparables à ce que la feuille
 * imprimera après mise à l'échelle.
 *
 * Le fichier porte l'empreinte sha256 de index.html : si un libellé change,
 * l'empreinte change, et build_carte.py relance cette mesure au lieu de
 * pagger sur des chiffres périmés.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'tools', 'carte-metrics.json');
const SECTIONS = ['entrees', 'plats', 'desserts', 'menus', 'boissons', 'vins', 'cocktails'];
const BASE_WIDTH = Number(process.argv.find((a, i) => process.argv[i - 1] === '--width') || 1180);
const NO_WRITE = process.argv.includes('--print');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
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
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

async function main() {
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  const { server, port } = await startStaticServer();
  const executablePath = await chromiumBinary.executablePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: BASE_WIDTH, height: 1400 } });
    await installLocalFonts(context, ROOT);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('400 24px Cinzel'),
        document.fonts.load('700 18px Cinzel'),
        document.fonts.load('400 14px Montserrat'),
      ]);
      if (typeof window.showView === 'function') window.showView('menu');
    });
    const fonts = await checkPageFonts(page);
    await page.waitForTimeout(250);

    const result = await page.evaluate(async (ids) => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sections = {};
      for (const id of ids) {
        const sec = document.getElementById(id);
        if (!sec) throw new Error(`#${id} introuvable dans index.html`);
        const before = sec.className;
        document.querySelectorAll('.menu-section').forEach((x) => x.classList.remove('active'));
        sec.classList.add('active');
        await raf();
        const flow = sec.querySelector('.tab-flow');
        if (!flow) throw new Error(`#${id} .tab-flow introuvable`);
        const cs = getComputedStyle(flow);
        const gap = parseFloat(cs.rowGap || '0') || 0;
        const blocks = [...flow.children].filter((el) => {
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden';
        }).map((el, i) => {
          const r = el.getBoundingClientRect();
          const cls = (el.getAttribute('class') || '').trim();
          const titre = el.querySelector('.panel__title, .accent-band strong, h4, h5');
          return {
            i,
            tag: el.tagName.toLowerCase(),
            cls,
            titre: (titre?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
            h: +r.height.toFixed(2),
            w: +r.width.toFixed(2),
          };
        });
        sections[id] = {
          flow_width: +flow.getBoundingClientRect().width.toFixed(2),
          gap,
          column_gap: parseFloat(cs.columnGap || '0') || 0,
          blocks,
        };
        sec.className = before;
        await raf();
      }
      return sections;
    }, SECTIONS);

    const indexHash = createHash('sha256').update(readFileSync(join(ROOT, 'index.html'), 'utf8')).digest('hex').slice(0, 16);
    const metrics = { generator: basename(process.argv[1] || 'measure_carte.mjs'), index_hash: indexHash, viewport: BASE_WIDTH, fonts, sections: result };
    const total = Object.values(result).reduce((a, s) => a + s.blocks.reduce((x, b) => x + b.h + s.gap, -s.gap), 0);
    console.log(`mesure @${BASE_WIDTH} px · ${SECTIONS.length} onglets · `
      + `${SECTIONS.reduce((a, id) => a + result[id].blocks.length, 0)} blocs · `
      + `${Math.round(total)} px de hauteur cumulée`);
    for (const id of SECTIONS) {
      const s = result[id];
      console.log(`  ${id.padEnd(9)} flux ${s.flow_width} px, gap ${s.gap} — ${s.blocks.map((b) => Math.round(b.h)).join(' + ')} = ${Math.round(s.blocks.reduce((a, b) => a + b.h, 0))}`);
    }
    if (!NO_WRITE) {
      writeFileSync(OUT, `${JSON.stringify(metrics, null, 1)}\n`);
      console.log(`écrit : ${basename(OUT)} (empreinte ${indexHash})`);
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

main().catch((error) => {
  console.error(`Mesure de carte impossible : ${error.message}`);
  console.error('Rappel : npm install (Playwright + Chromium + fontes @fontsource).');
  process.exitCode = 1;
});
