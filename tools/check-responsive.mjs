#!/usr/bin/env node
/**
 * Contrôle responsive de La Colline Gambetta — « aucun intitulé ne chevauche son prix ».
 *
 *   node tools/check-responsive.mjs
 *       Balaye 1300 → 320 px, onglet par onglet, et signale :
 *         • « chevauchement »  : encre d'un intitulé sur l'encre de son prix ;
 *         • « prix hors écran » : un prix rejeté hors de la fenêtre ;
 *         • « défilement horizontal » : la page plus large que l'écran ;
 *         • « serre » : un intitulé qui doit se couper en deux, ou dont le prix
 *           est retombé sur sa propre ligne, alors que l'onglet est encore en
 *           mode « côte à côte » (= repère de bascule trop bas).
 *       Sortie ≠ 0 si un onglet échoue.
 *
 *   node tools/check-responsive.mjs --breakpoints
 *       Calcule, pour chaque onglet, les deux repères de bascule :
 *         wide : en dessous, l'onglet passe d'une colonne double à une colonne ;
 *         rows : en dessous, le prix passe sous son intitulé (mode petit écran).
 *       --write les écrit dans index.html (marqueurs @stack-wide / @stack-rows).
 *
 * Options communes : --tabs entrees,boissons --step 8 --min 320 --max 1300
 *                    --margin 3 --json /tmp/rapport.json [--remote-fonts]
 *
 * Les mesures exigent les vraies fontes du site (Cinzel, Montserrat) : elles
 * sont lues automatiquement dans node_modules/@fontsource (npm install les
 * pose). Sans elles, les largeurs de texte — donc les repères — seraient
 * fausses ; --remote-fonts force au contraire le passage par Google Fonts.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const INDEX = join(ROOT, 'index.html');
const TABS = ['entrees', 'plats', 'desserts', 'menus', 'boissons', 'vins', 'cocktails'];
const KINDS = ['wide', 'rows'];
/* « menus » : formules, menu du jour, petit déjeuner = prix déjà sous l'intitulé. */
const STACKED_BY_DESIGN = new Set(['menus']);
/* Conteneurs multi-colonnes neutralisés quand on mesure le repère « rows ». */
const COLUMN_SELECTORS = [
  '.food-card-grid', '.food-card-grid--wide', '.price-list--cols', '.hh-list--cols',
  '.offer-grid', '.special-grid', '.choice-grid', '.duo-grid', '.menus-duo',
];

const rawArgs = process.argv.slice(2);
const argv = {};
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (!a.startsWith('--')) continue;
  const body = a.slice(2);
  const eq = body.indexOf('=');
  if (eq > -1) argv[body.slice(0, eq)] = body.slice(eq + 1);
  else if (rawArgs[i + 1] !== undefined && !rawArgs[i + 1].startsWith('--')) argv[body] = rawArgs[++i];
  else argv[body] = true;
}
const STEP = Number(argv.step ?? 8);
const MIN = Number(argv.min ?? 320);
const MAX = Number(argv.max ?? 1300);
const MARGIN = Number(argv.margin ?? 3);
const TAB_LIST = (argv.tabs ? String(argv.tabs).split(',') : TABS).filter(Boolean);

/* ------------------------------------------------------------------ serveur */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};
const markerRe = kind => new RegExp(`(/\\* @stack-${kind} [a-zà-ÿ]+ \\*/\\s*\\n@media screen and \\(max-width: )\\d+px(\\))`, 'g');

/**
 * @param {{zeroBreakpoints?: boolean, singleColumn?: boolean}} mode
 *  - zeroBreakpoints : neutralise les bascules (max-width: 0) pour voir le rendu
 *    « intitulé à gauche, prix à droite » à TOUTES les largeurs ;
 *  - singleColumn : force une colonne partout (mesure du repère « rows »).
 */
function transformIndex(html, mode) {
  let out = html;
  if (mode.zeroBreakpoints) for (const kind of KINDS) out = out.replace(markerRe(kind), '$10px$2');
  if (mode.singleColumn) {
    const scoped = COLUMN_SELECTORS.map(sel => `html:not(.carte-doc) #interior-menu .menu-section ${sel}`).join(',\n  ');
    out = out.replace('</head>', `<style id="probe-single-column">\n@media screen {\n  ${scoped} {\n    grid-template-columns: 1fr !important;\n  }\n}\n</style></head>`);
  }
  return out;
}

function serve(root, mode = {}) {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')));
    if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('Not found'); return;
    }
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    if (/index\.html$/.test(file) && (mode.zeroBreakpoints || mode.singleColumn)) {
      res.writeHead(200, { 'Content-Type': type });
      res.end(transformIndex(readFileSync(file, 'utf8'), mode));
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    createReadStream(file).pipe(res);
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}/index.html#menu-nav-anchor` }));
  });
}

/* --------------------------------------------------------------------- sonde */
/* Exécutée dans la page — doit rester autonome (Playwright la sérialise). */
function inspect(context) {
  const EPS = 0.6;   // px d'encre toléré entre deux textes
  const MINV = 2;    // px de recouvrement vertical qui compte
  const section = document.getElementById(context.tab);
  if (!section) return { error: `onglet #${context.tab} introuvable` };
  const issues = [];
  const text = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44);
  const ink = el => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return Array.from(r.getClientRects()).filter(b => b.width > 0.5 && b.height > 0.5);
  };
  const sameBand = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > MINV;
  const HEAD_ROWS = '.beer-table__head, .hh-head, .wine-table thead tr, .accent-band, .day-option';
  const INLINE_ROWS = '.food-card__head, .price-line__row, .beer-row, .hh-line__row, .wine-table tbody tr, .day-lines div';
  const cellsOf = row => {
    const out = [];
    const walk = el => {
      const kids = Array.from(el.children).filter(k => k.textContent.trim());
      if (kids.length) kids.forEach(walk);
      else if (el.textContent.trim()) out.push(el);
    };
    Array.from(row.children)
      .filter(c => !c.matches('.price-line__dots, .hh-line__dots') && c.getAttribute('aria-hidden') !== 'true')
      .forEach(walk);
    return out;
  };
  const labelOf = row => row.querySelector('.wine-name, .price-line__name, .hh-line__name, .beer-row__name, h5, :scope > *');
  /* Le mode « l'un sous l'autre » est-il déjà actif pour cette ligne ? */
  const spansWholeRow = el => {
    const cs = getComputedStyle(el);
    return cs.gridColumnEnd === '-1' && cs.gridColumnStart === '1';
  };
  const isStacked = row => {
    if (row.classList.contains('food-card__head') || row.classList.contains('price-line__row')) return getComputedStyle(row).flexDirection === 'column';
    if (row.classList.contains('beer-row')) return spansWholeRow(row.querySelector('.beer-row__name') || row.firstElementChild);
    if (row.classList.contains('hh-line__row')) return spansWholeRow(row.querySelector('.hh-line__name') || row.firstElementChild);
    if (row.closest('.wine-table')) return spansWholeRow(row.querySelector('.wine-name') || row.firstElementChild);
    return null;
  };
  const lineCount = rects => {
    const tops = [];
    for (const b of rects) if (!tops.some(t => Math.abs(t - b.top) < Math.max(4, b.height * 0.45))) tops.push(b.top);
    return tops.length;
  };

  // 1) tout onglet : deux textes ne doivent jamais se recouvrir
  for (const row of section.querySelectorAll(`${INLINE_ROWS}, ${HEAD_ROWS}`)) {
    const cells = cellsOf(row);
    if (cells.length < 2) continue;
    const rects = cells.map(ink);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        for (const a of rects[i]) for (const b of rects[j]) {
          const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          if (overlap > EPS && sameBand(a, b)) {
            issues.push({ kind: 'chevauchement', row: row.className, label: text(cells[i]), price: text(cells[j]), px: +overlap.toFixed(1) });
          }
        }
      }
    }
  }
  // 2) lignes « côte à côte » : le prix doit rester sur la ligne de son intitulé,
  //    sur une seule ligne des deux côtés
  let total = 0;
  let stacked = 0;
  for (const row of section.querySelectorAll(INLINE_ROWS)) {
    const cells = cellsOf(row);
    if (cells.length < 2) continue;
    total++;
    const label = labelOf(row);
    if (label) { const i = cells.indexOf(label); if (i > 0) { cells.splice(i, 1); cells.unshift(label); } }
    const state = isStacked(row);
    if (state) { stacked++; continue; }
    const mine = ink(cells[0]);
    const others = cells.slice(1).flatMap(ink);
    const sharesBand = others.some(b => mine.some(nr => sameBand(nr, b)));
    if (!sharesBand || lineCount(mine) > 1) {
      issues.push({ kind: 'serre', row: row.className, label: text(cells[0]), price: text(cells[1]) });
    }
  }
  // 3) rien hors de l'écran, pas de défilement horizontal
  const vw = window.innerWidth;
  for (const el of section.querySelectorAll('.price-line__price, .food-card__head strong, .beer-row__price, .beer-row__hh, .hh-line__price, .hh-line__hh, .wine-table td:not(.wine-name)')) {
    if (!el.textContent.trim()) continue;
    for (const b of ink(el)) {
      if (b.right > vw - 0.5 || b.left < 0.5) {
        issues.push({ kind: 'prix hors écran', row: (el.closest('[class]') || {}).className, label: text(el), px: +(b.right - vw).toFixed(1) });
        break;
      }
    }
  }
  if (document.documentElement.scrollWidth > vw + 1) {
    issues.push({ kind: 'défilement horizontal', px: document.documentElement.scrollWidth - vw });
  }
  return { issues, total, stacked, viewport: vw };
}

/* --------------------------------------------------------------------- harnais */
async function withPage(mode, run) {
  const { server, url } = await serve(ROOT, mode);
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: await chromiumBinary.executablePath(),
      args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    if (!argv['remote-fonts']) await installLocalFonts(ctx, ROOT);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready.catch(() => {}));
    try {
      await checkPageFonts(page);   // document.fonts.check() ment en repli système : on regarde les fontes réellement chargées
    } catch (e) {
      throw new Error(`${e.message}\n  (sinon : npm install, puis relancer la mesure)`);
    }
    await page.evaluate(() => {
      const menu = document.getElementById('interior-menu');
      if (menu) menu.style.display = 'block';
      const cover = document.getElementById('cover-section');
      if (cover) cover.style.display = 'none';
    });
    return await run(page);
  } finally {
    if (browser) await browser.close();
    await new Promise(done => server.close(done));
  }
}

const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Dernière (plus grande) largeur où un incident est relevé, + échantillon. */
async function onset(page, tab, from, to, step) {
  let last = 0;
  let sample = null;
  for (let w = from; w <= to; w += step) {
    await page.setViewportSize({ width: w, height: 900 });
    await settle(page);
    const res = await page.evaluate(inspect, { tab });
    if (res.error) throw new Error(res.error);
    if (res.issues.length) {
      last = w;
      const kinds = {};
      for (const i of res.issues) (kinds[i.kind] ??= []).push(i);
      sample = {
        kinds: Object.keys(kinds).join(' + '),
        n: res.issues.length,
        first: kinds.serre?.[0] || kinds.chevauchement?.[0] || res.issues[0],
      };
    }
  }
  if (last && last < to - step) { // raffinement au pixel
    for (let w = last + 1; w <= Math.min(last + step, to); w++) {
      await page.setViewportSize({ width: w, height: 900 });
      await settle(page);
      const res = await page.evaluate(inspect, { tab });
      if (!res.issues.length) break;
      last = w;
    }
  }
  // un incident relevé jusqu'au bout du balayage = seuil hors plage, à ne pas écrire
  return { onset: last, sample, saturated: last > 0 && last >= to - step };
}

function readThresholds() {
  const html = readFileSync(INDEX, 'utf8');
  const out = {};
  for (const kind of KINDS) {
    out[kind] = {};
    for (const m of html.matchAll(new RegExp(`/\\* @stack-${kind} ([a-zà-\\u00ff]+) \\*/\\s*\\n@media screen and \\(max-width: (\\d+)px\\)`, 'g'))) {
      out[kind][m[1]] = Number(m[2]);
    }
  }
  return out;
}

function writeThresholds(values) {
  let html = readFileSync(INDEX, 'utf8');
  for (const [kind, perTab] of Object.entries(values)) {
    for (const [tab, px] of Object.entries(perTab)) {
      const re = new RegExp(`(/\\* @stack-${kind} ${tab} \\*/\\s*\\n@media screen and \\(max-width: )\\d+px(\\))`);
      if (!re.test(html)) {
        if (px > 0) console.warn(`⚠ index.html n'a pas de bloc « @stack-${kind} ${tab} » : à écrire à la main (valeur mesurée ${px}px).`);
        continue;
      }
      html = html.replace(re, `$1${px}px$2`);
    }
  }
  writeFileSync(INDEX, html);
}

const describe = (i) => {
  if (!i) return '';
  if (i.kind === 'défilement horizontal') return `page débordant de ${i.px}px`;
  let out = '« ' + (i.label || i.row || '?') + ' »';
  if (i.price) out += ` ⇄ « ${i.price} »`;
  if (i.px) out += ` (${i.px}px)`;
  return out;
};

/* --------------------------------------------------------------------- modes */
async function breakpoints() {
  const step = Number(argv.step ?? 8);
  const rowsMax = Math.min(MAX, 900);   // au-delà, une seule colonne ne peut plus serrer : gain de temps
  const rows = await withPage({ zeroBreakpoints: true, singleColumn: true }, async (page) => {
    const out = {};
    for (const tab of TAB_LIST) {
      if (STACKED_BY_DESIGN.has(tab)) { out[tab] = { onset: 0, skip: true }; continue; }
      await page.evaluate(id => document.querySelectorAll('.menu-section').forEach(s => s.classList.toggle('active', s.id === id)), tab);
      out[tab] = await onset(page, tab, MIN, rowsMax, step);
    }
    return out;
  });
  const wide = await withPage({ zeroBreakpoints: true }, async (page) => {
    const out = {};
    for (const tab of TAB_LIST) {
      if (STACKED_BY_DESIGN.has(tab)) { out[tab] = { onset: 0, skip: true }; continue; }
      await page.evaluate(id => document.querySelectorAll('.menu-section').forEach(s => s.classList.toggle('active', s.id === id)), tab);
      out[tab] = await onset(page, tab, Math.max(MIN, 700), MAX, step);
    }
    return out;
  });
  const values = { wide: {}, rows: {} };
  const warns = [];
  console.log('\nRepères de bascule par onglet (largeur max, mesurés sur le contenu réel) :');
  for (const tab of TAB_LIST) {
    if (STACKED_BY_DESIGN.has(tab)) { console.log(`  ${tab.padEnd(10)} — aucune bascule : le prix est déjà sous l'intitulé à toutes les largeurs`); continue; }
    const r = Math.min((rows[tab]?.onset ?? 0) + MARGIN, MAX);
    const wl = Math.min((wide[tab]?.onset ?? 0) + MARGIN, MAX);
    if (rows[tab]?.saturated || (wide[tab]?.saturated && wl > r)) {
      warns.push(`${tab} : le serrage ne s'arrête pas avant la fin du balayage (${rows[tab]?.saturated ? rowsMax : MAX}px) — relancer avec --max plus grand, repère non écrit.`);
      continue;   // ni rows ni wide : mieux vaut 0px (mode actuel) qu'un repère faux toujours actif
    }
    values.rows[tab] = r;
    values.wide[tab] = wl > r ? wl : 0;   // pas besoin de règle « une colonne » si rien ne serre en 2 colonnes
    console.log(`  ${tab.padEnd(10)} lignes empilées ≤ ${String(r + 'px').padEnd(8)}  ${values.wide[tab] ? `une colonne ≤ ${values.wide[tab]}px` : 'deux colonnes sans risque'}`);
    if (rows[tab]?.sample) console.log(`  ${''.padEnd(10)}   empilage déclenché par : ${rows[tab].sample.kinds} ×${rows[tab].sample.n} — ${describe(rows[tab].sample.first)}`);
    if (values.wide[tab] && wide[tab]?.sample) console.log(`  ${''.padEnd(10)}   colonnes forcées par : ${wide[tab].sample.kinds} ×${wide[tab].sample.n} — ${describe(wide[tab].sample.first)}`);
  }
  for (const w of warns) console.warn(`⚠ ${w}`);
  if (argv.write) {
    writeThresholds(values);
    console.log('\n✔ repères écrits dans index.html — relancer sans --write pour valider : node tools/check-responsive.mjs');
  } else {
    console.log('\n(ajouter --write pour écrire ces repères dans index.html)');
  }
}

async function verify() {
  const thresholds = readThresholds();
  const failed = [];
  await withPage({}, async (page) => {
    for (const tab of TAB_LIST) {
      await page.evaluate(id => document.querySelectorAll('.menu-section').forEach(s => s.classList.toggle('active', s.id === id)), tab);
      let scans = 0;
      const seen = [];
      for (let w = MAX; w >= MIN; w -= STEP) {
        scans++;
        await page.setViewportSize({ width: w, height: 900 });
        await settle(page);
        const res = await page.evaluate(inspect, { tab });
        if (res.error) throw new Error(res.error);
        if (res.issues.length) seen.push({ width: w, total: res.total, stacked: res.stacked, issues: res.issues });
      }
      const hard = seen.filter(s => s.issues.some(i => i.kind !== 'serre'));
      const tight = seen.filter(s => s.issues.some(i => i.kind === 'serre'));
      const label = `empilage ≤ ${thresholds.rows?.[tab] ?? 0}px, une colonne ≤ ${thresholds.wide?.[tab] ?? 0}px`;
      if (hard.length) {
        const widest = Math.max(...hard.map(h => h.width));
        const first = hard.find(h => h.width === widest);
        console.log(`✗ ${tab.padEnd(10)} (${label}) — ${hard.length}/${scans} largeurs en difficulté, jusqu'à ${widest}px`);
        console.log(`             ${JSON.stringify(first.issues.slice(0, 3))}`);
        failed.push(tab);
      } else if (tight.length) {
        console.log(`! ${tab.padEnd(10)} (${label}) — zéro chevauchement, mais encore serré jusqu'à ${Math.max(...tight.map(s => s.width))}px → repère à remonter`);
        failed.push(tab);
      } else {
        console.log(`✓ ${tab.padEnd(10)} (${label}) — zéro chevauchement, zéro débordement, ${scans} largeurs de ${MAX} à ${MIN}px`);
      }
      if (argv.json) writeFileSync(`${argv.json}.${tab}.json`, JSON.stringify(seen, null, 1));
    }
  });
  if (failed.length) { console.error(`\n✗ échec : ${failed.join(', ')} — recalculer : node tools/check-responsive.mjs --breakpoints --write`); process.exit(1); }
  console.log(`\n✔ aucun intitulé ne chevauche un prix, sur ${TAB_LIST.length} onglets, de ${MAX} à ${MIN} px.`);
}

if (argv.breakpoints) await breakpoints();
else await verify();
