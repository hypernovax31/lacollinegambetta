#!/usr/bin/env node
/**
 * Inventaire des libellés de contenance (4 cl, 12 cl, 1 L…) et de leur rendu réel.
 *
 *   node tools/audit-mesures.mjs [--width 1440]
 *
 * Parcourt tous les onglets, repère chaque nœud de texte contenant une mesure,
 * et relève la police, la graisse, le style, la casse, la taille et la couleur
 * effectivement calculées. Sert à vérifier que « toutes les mesures se
 * ressemblent » — sans se fier à la lecture de la feuille de style.
 *
 * Utilitaire de développement : il ne fait partie d'aucun build.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TABS = ['entrees', 'plats', 'menus', 'boissons', 'cocktails', 'vins', 'desserts'];
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
const WIDTH = Number(flag('width', 1440));

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
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 1200 } });
    await installLocalFonts(context, ROOT);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await checkPageFonts(page);

    const rows = [];
    for (const tab of TABS) {
      await page.evaluate((t) => {
        showView('menu');
        const button = [...document.querySelectorAll('.nav-btn')]
          .find((b) => (b.getAttribute('onclick') || '').includes(`'${t}'`));
        if (button) showMenuSection(t, button);
      }, tab);
      await page.waitForTimeout(120);
      const found = await page.evaluate((t) => {
        const MEASURE = /\b\d+(?:[.,]\d+)?\s*(?:cl|CL|Cl|cL|ml|mL|ML|l|L)\b/;
        const section = document.getElementById(t);
        if (!section) return [];
        const out = [];
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = (n.nodeValue || '').trim();
          if (!text || !MEASURE.test(text)) continue;
          const el = n.parentElement;
          if (!el || seen.has(el)) continue;
          seen.add(el);
          const cs = getComputedStyle(el);
          out.push({
            tab: t,
            text,
            tag: el.tagName.toLowerCase(),
            cls: el.className || '',
            path: (() => {
              const parts = [];
              for (let p = el; p && p !== section; p = p.parentElement) {
                parts.unshift(p.tagName.toLowerCase() + (p.className ? '.' + String(p.className).trim().split(/\s+/).join('.') : ''));
              }
              return parts.slice(-2).join(' > ');
            })(),
            font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
            weight: cs.fontWeight,
            style: cs.fontStyle,
            size: cs.fontSize,
            color: cs.color,
            transform: cs.textTransform,
            spacing: cs.letterSpacing,
            rendered: el.innerText ? el.innerText.trim().slice(0, 40) : text,
          });
        }
        // étiquettes de colonnes injectées en ::before (mode petit écran)
        for (const el of section.querySelectorAll('[data-label]')) {
          const label = el.getAttribute('data-label') || '';
          if (!MEASURE.test(label)) continue;
          const cs = getComputedStyle(el, '::before');
          if (cs.content === 'none' || cs.display === 'none') continue;
          out.push({
            tab: t, text: `::before "${label}"`, tag: el.tagName.toLowerCase(),
            cls: el.className || '', path: 'data-label',
            font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
            weight: cs.fontWeight, style: cs.fontStyle, size: cs.fontSize,
            color: cs.color, transform: cs.textTransform, spacing: cs.letterSpacing,
            rendered: label,
          });
        }
        return out;
      }, tab);
      rows.push(...found);
    }

    const key = (r) => `${r.font}|${r.weight}|${r.style}|${r.size}|${r.color}|${r.transform}`;
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(key(r))) groups.set(key(r), []);
      groups.get(key(r)).push(r);
    }
    console.log(`\n${rows.length} libellés de mesure — ${groups.size} formats distincts à ${WIDTH} px\n`);
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [k, list] of sorted) {
      const [font, weight, style, size, color, transform] = k.split('|');
      console.log(`── ${list.length}×  ${font} ${weight} ${style} ${size} ${color} transform:${transform}`);
      const byPath = new Map();
      for (const r of list) {
        const p = `${r.tab} · ${r.path}`;
        if (!byPath.has(p)) byPath.set(p, []);
        byPath.get(p).push(r.text);
      }
      for (const [p, texts] of byPath) {
        console.log(`     ${p} → ${[...new Set(texts)].slice(0, 4).join(' / ')}${texts.length > 4 ? ' …' : ''}`);
      }
    }
    console.log('');
  } finally {
    server.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
