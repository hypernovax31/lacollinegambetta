#!/usr/bin/env node
/**
 * Mesure des hauteurs de blocs, dans la carte elle-même.
 *
 *   node tools/measure_carte.mjs        → tools/carte-metrics.json
 *
 * Deux documents, un seul rendu :
 *   1. index.html, à la largeur de composition (data-carte-viewport) : on relève
 *      la largeur naturelle du flux de chaque onglet — c'est elle que la feuille
 *      devra retrouver avant mise à l'échelle — et le nombre de blocs, pour
 *      vérifier que le générateur n'en a pas perdu en route.
 *   2. carte-measure.html, écrit par tools/build_carte.py avec la CSS exacte des
 *      feuilles (mêmes règles propres au papier, même imbrication
 *      .carte-flow > .tab-flow > blocs), sans découpage et sans transformation :
 *      chaque bloc y est mesuré à la largeur trouvée en 1.
 *
 * Mesurer le site seul serait faux dès que la carte ajoute une règle — les
 * cocktails en une colonne, par exemple. La mesure porte l'empreinte
 * (index.html + CSS de carte) ; build_carte.py la compare et re-mesure tout seul.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOC = join(ROOT, 'carte-measure.html');
const OUT = join(ROOT, 'tools', 'carte-metrics.json');

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

const attr = (html, name) => (html.match(new RegExp(`data-carte-${name}="([^"]+)"`)) || [])[1];

async function main() {
  if (!existsSync(DOC)) {
    throw new Error(`${DOC} introuvable — lancer d'abord : python3 tools/build_carte.py`);
  }
  const docHtml = readFileSync(DOC, 'utf8');
  const viewport = Number(attr(docHtml, 'viewport')) || Number(process.argv.find((a, i) => process.argv[i - 1] === '--width')) || 1180;
  const indexHash = attr(docHtml, 'index-hash');
  const cssHash = attr(docHtml, 'css-hash');

  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: await chromiumBinary.executablePath(),
    args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: viewport, height: 1400 } });
    await installLocalFonts(context, ROOT);

    // 1) le site, pour la largeur de composition et la garde du nombre de blocs
    const site = await context.newPage();
    await site.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
    await site.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('400 24px Cinzel'),
        document.fonts.load('700 18px Cinzel'),
        document.fonts.load('400 14px Montserrat'),
      ]);
      if (typeof window.showView === 'function') window.showView('menu');
    });
    await site.waitForTimeout(250);
    const fonts = await checkPageFonts(site);
    const siteInfo = await site.evaluate(async () => {
      // Chaque onglet doit être rendu pour être mesuré : le site n'affiche que
      // l'onglet actif, les autres sont à display:none (largeur 0).
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = {};
      for (const sec of document.querySelectorAll('.menu-section')) {
        const before = sec.className;
        document.querySelectorAll('.menu-section').forEach((x) => x.classList.remove('active'));
        sec.classList.add('active');
        await raf();
        const flow = sec.querySelector('.tab-flow');
        if (flow) {
          out[sec.id] = {
            flow_width: +flow.getBoundingClientRect().width.toFixed(2),
            blocks: flow.children.length,
          };
        }
        sec.className = before;
      }
      return out;
    });
    await site.close();

    // 2) la carte, à plat : hauteurs de blocs
    const doc = await context.newPage();
    await doc.goto(`http://127.0.0.1:${port}/carte-measure.html`, { waitUntil: 'networkidle' });
    await doc.evaluate(async () => { await document.fonts.ready; });

    const ids = Object.keys(siteInfo);
    const widths = ids.map((id) => siteInfo[id].flow_width);
    if (!ids.length || widths.some((w) => w < 300)) {
      throw new Error(`largeur de flux aberrante sur le site (${widths.join(', ')}) : `
        + 'les onglets ne sont pas rendus, la mesure serait fausse.');
    }
    const base = Math.min(...widths);
    await doc.addStyleTag({ content: `html.carte-measure { --carte-base-w: ${base}px; }` });
    await doc.waitForTimeout(200);

    const sections = await doc.evaluate((ids) => {
      const out = {};
      for (const id of ids) {
        const sec = document.querySelector(`.carte-measure-sec[data-sec="${id}"]`);
        if (!sec) throw new Error(`carte-measure.html : section ${id} absente`);
        const flow = sec.querySelector('.tab-flow');
        const cs = getComputedStyle(flow);
        const gap = parseFloat(cs.rowGap || '0') || 0;
        const blocks = [...flow.querySelectorAll(':scope > [data-block]')].map((el) => ({
          i: Number(el.getAttribute('data-block')),
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').replace('data-block', '').trim().slice(0, 44),
          h: +el.getBoundingClientRect().height.toFixed(2),
        })).sort((a, b) => a.i - b.i);
        out[id] = { flow_width: +flow.getBoundingClientRect().width.toFixed(2), gap, blocks };
      }
      return out;
    }, ids);

    for (const [id, info] of Object.entries(siteInfo)) {
      const mine = sections[id].blocks.length;
      if (mine !== info.blocks) {
        throw new Error(`${id} : ${mine} blocs dans le document de mesure, ${info.blocks} sur le site — `
          + 'le générateur perd ou double un bloc (commentaires, texte nu).');
      }
      if (Math.abs(sections[id].flow_width - base) > 1) {
        throw new Error(`${id} : le flux de carte-measure.html fait ${sections[id].flow_width} px au lieu de ${base} px — `
          + 'la largeur de composition n’a pas été appliquée.');
      }
      const zero = sections[id].blocks.filter((b) => b.h < 4);
      if (zero.length) {
        throw new Error(`${id} : ${zero.length} bloc(s) mesuré(s) à ~0 px (affichés nulle part ?) — `
          + 'la CSS de la carte ne reproduit pas le site.');
      }
    }

    const metrics = {
      generator: 'tools/measure_carte.mjs',
      index_hash: indexHash || createHash('sha256').update(readFileSync(join(ROOT, 'index.html'), 'utf8')).digest('hex').slice(0, 16),
      css_hash: cssHash || null,
      viewport,
      base_width: base,
      fonts,
      sections,
    };
    const total = Object.values(sections).reduce((a, s) => a + s.blocks.reduce((x, b) => x + b.h + s.gap, -s.gap), 0);
    console.log(`mesure @${viewport} px · flux ${base} px · ${Object.keys(sections).length} onglets · `
      + `${Object.values(sections).reduce((a, s) => a + s.blocks.length, 0)} blocs · `
      + `${Math.round(total)} px cumulés · fontes ${fonts.join(', ')}`);
    for (const [id, s] of Object.entries(sections)) {
      console.log(`  ${id.padEnd(9)} gap ${String(s.gap).padStart(2)} — ${s.blocks.map((b) => Math.round(b.h)).join(' + ')}`
        + ` = ${Math.round(s.blocks.reduce((a, b) => a + b.h, 0))}`);
    }
    if (process.argv.includes('--print')) return;
    writeFileSync(OUT, `${JSON.stringify(metrics, null, 1)}\n`);
    console.log(`écrit : ${OUT.replace(`${ROOT}/`, '')} (index ${metrics.index_hash}, css ${metrics.css_hash})`);
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
