#!/usr/bin/env node
/**
 * Mesure de l'aération : rendu réel de carte.html, avec les mêmes fontes que
 * le PDF (installLocalFonts). Pour chaque feuille de contenu :
 *   - flowH  : hauteur rendue du flux (px, échelle appliquée)
 *   - rows   : nombre de RANGÉES de lignes qui recevront l'interligne
 *              (rangées distinctes du quadrillage : une grille à deux colonnes
 *              compte une rangée pour deux lignes)
 *   - titles : nombre de titres de panneau (panel__head)
 *   - bases  : padding verticaux effectifs des lignes (contrôle : la CSS
 *              d'aération compose sur ces bases)
 * Sortie : un objet JSON par feuille, sur stdout.
 *
 *   node tools/aerate_carte.mjs   →  [ {page, kind, fit, flowH, rows, titles, bases}, … ]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary from '@sparticuz/chromium';
import { carteChromiumArgs } from './chromium-args.mjs';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

function startStaticServer() {
  const server = createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent((request.url || '/').split('?')[0]); } catch { response.writeHead(400).end(); return; }
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
  const viewport = Number(process.argv.find((a, i) => process.argv[i - 1] === '--width')) || 1180;
  const { server, port } = await startStaticServer();
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  const browser = await chromium.launch({
    headless: true,
    executablePath: await chromiumBinary.executablePath(),
    args: [...carteChromiumArgs(), '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: viewport, height: 1400 } });
    await installLocalFonts(context, ROOT);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/carte.html`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await checkPageFonts(page);
    const out = await page.evaluate(() => {
      const ZONE = 842.86; // ZONE_H_PX du générateur (223,3 mm)
      const res = [];
      for (const p of document.querySelectorAll('.print-page')) {
        const flow = p.querySelector('.carte-flow');
        if (!flow) { res.push({ page: +p.dataset.page, kind: 'cover' }); continue; }
        const kind = ([...p.classList].find((c) => c.startsWith('print-page--')) || '').replace('print-page--', '');
        const fit = parseFloat(flow.style.getPropertyValue('--carte-fit') || '1');
        let rows = 0, titles = 0;
        const bases = {};
        for (const panel of flow.querySelectorAll('.tab-flow > article, .tab-flow > div')) {
          if (!panel.querySelector('.panel__head')) continue;
          titles += 1;
          const wines = panel.querySelectorAll('.wine-table tbody tr');
          const lines = panel.querySelectorAll('article.price-line, article.hh-line, article.food-card');
          const items = wines.length ? wines : lines;
          if (items.length) {
            const tops = new Set();
            for (const el of items) tops.add(Math.round(el.getBoundingClientRect().top));
            rows += tops.size;
            // la base du padding : la ligne (article) ou la cellule (tr de vins)
            const probe = wines.length ? panel.querySelector('.wine-table td') : items[0];
            const cs = getComputedStyle(probe);
            bases[probe.tagName.toLowerCase()] = parseFloat(cs.paddingTop) || 0;
          }
        }
        res.push({
          page: +p.dataset.page, kind, fit: +fit.toFixed(4),
          flowH: +flow.getBoundingClientRect().height.toFixed(2),
          zone: ZONE, rows, titles, bases,
        });
      }
      return res;
    });
    console.log(JSON.stringify(out));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
