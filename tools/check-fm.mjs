/* Contrôle du bloc « Formules » (onglet Menus) — deux exigences de la carte :
   1. le début de chaque ligne d'une liste « au choix » est sur UNE SEULE
      verticale (l'étoile en tête, le texte ensuite, y compris les précisions
      « Parfum au choix » qui suivent le nom) ;
   2. aucun texte ne sort de sa carte ni de son propre cadre, dans TOUTES les
      langues (les libellés étrangers sont plus longs que les français).
   Usage : node tools/check-fm.mjs [--langs fr,de] [--widths 390,900] [--json p]
   Sortie : exit 1 dès qu'un diagnostic est relevé. */
import { chromium } from '../node_modules/playwright/index.mjs';
import chromiumBinary, { setupLambdaEnvironment } from '../node_modules/@sparticuz/chromium/build/index.js';
import { carteChromiumArgs } from './chromium-args.mjs';
import { installLocalFonts } from './local-fonts.mjs';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ARGS = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = ARGS.indexOf(`--${name}`);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : dflt;
};
const LANGS = arg('langs', 'fr,en,es,de,it,pt,nl,ar,zh,uk,ja,ko,pl,tr,hi').split(',').map(s => s.trim()).filter(Boolean);
const WIDTHS = arg('widths', '320,390,560,900').split(',').map(Number).filter(Boolean);
const JSON_OUT = arg('json', '');

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
  const f = normalize(join(ROOT, rel));
  if (!f.startsWith(ROOT + '/') || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end('x'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
const browser = await chromium.launch({
  headless: true,
  executablePath: await chromiumBinary.executablePath(),
  args: [...carteChromiumArgs(), '--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
await installLocalFonts(ctx, ROOT);
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready.catch(() => {}));
await page.evaluate(() => {
  if (typeof showView === 'function') showView('menu');
  const m = document.getElementById('interior-menu'); if (m) m.style.display = 'block';
  const c = document.getElementById('cover-section'); if (c) c.style.display = 'none';
  const b = [...document.querySelectorAll('.menu-nav .nav-btn')].find(x => (x.getAttribute('onclick') || '').includes("'menus'"));
  if (b) showMenuSection('menus', b);
});

/* Mesure : débordements + alignement des débuts de ligne. */
function inspect() {
  const issues = [];
  const rnd = n => +n.toFixed(1);
  const cards = [...document.querySelectorAll('#menus .fm > article, #menus .fm .fmb-choice')];
  for (const card of cards) {
    const c = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const inner = { left: c.left + padL, right: c.right - padR };
    const who = card.className.replace(/\s+/g, '.');
    /* Le texte ne sort pas de la carte. */
    for (const el of card.querySelectorAll('li, em, strong, span, p, h3, h4, h5, td')) {
      if (!el.textContent.trim()) continue;
      if (getComputedStyle(el).position === 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      if (r.right > inner.right + 1 || r.left < inner.left - 1) {
        issues.push({ kind: 'débordement', card: who, el: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 40), px: rnd(Math.max(r.right - inner.right, inner.left - r.left)) });
      }
      /* Ni rogné : le texte n'est coupé que si la boîte CLIPPE (overflow
         autre que visible) — un simple débordement visible est déjà
         rattrapé par le test « débordement » ci-dessus. */
      const ov = getComputedStyle(el);
      if (ov.overflowX !== 'visible' && ov.overflowX !== '' && el.scrollWidth > el.clientWidth + 1.5) {
        issues.push({ kind: 'texte rogné', card: who, el: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 40), px: rnd(el.scrollWidth - el.clientWidth) });
      }
    }
    /* Les débuts de ligne d'une liste sont sur une même verticale.
       « Début » s'entend dans le sens de lecture : bord gauche en LTR, bord
       droit en RTL — sinon le contrôle condamnerait le texte arabe, aligné à
       droite, pour n'être pas aligné à gauche. */
    for (const ul of card.querySelectorAll('.fmb-list')) {
      const rtl = getComputedStyle(ul).direction === 'rtl';
      const starts = [];
      for (const li of ul.querySelectorAll(':scope > li')) {
        const range = document.createRange();
        range.selectNodeContents(li);
        const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
        if (!rects.length) continue;
        const line = rects.filter(r => Math.abs((r.top + r.bottom) / 2 - (rects[0].top + rects[0].bottom) / 2) < 1);
        const x = rtl ? Math.max(...line.map(r => r.right)) : Math.min(...line.map(r => r.left));
        starts.push({ text: li.textContent.trim().slice(0, 32), x: rnd(x) });
      }
      if (starts.length > 1) {
        const xs = starts.map(s => s.x);
        const spread = Math.max(...xs) - Math.min(...xs);
        if (spread > 0.6) {
          issues.push({ kind: 'lignes désalignées', card: who, px: rnd(spread), starts });
        }
      }
      /* L'étoile précède bien le texte (marge du côté du début de lecture). */
      const li = ul.querySelector(':scope > li');
      if (li) {
        const liR = li.getBoundingClientRect();
        const padStart = parseFloat(getComputedStyle(li).paddingInlineStart) || 0;
        const starRight = (rtl ? liR.right : liR.left) + (rtl ? -padStart : padStart); /* bord du texte */
        const range = document.createRange();
        range.selectNodeContents(li);
        const rects = [...range.getClientRects()].filter(r => r.width > 0.5);
        if (rects.length) {
          const textStart = rtl ? Math.max(...rects.map(r => r.right)) : Math.min(...rects.map(r => r.left));
          const gap = Math.abs(starRight - textStart);
          /* Le texte doit commencer TOUT DE SUITE après la marge : un écart
             plus grand = étoile détachée ; négatif = le texte passe dessous. */
          if (gap > 2.5) issues.push({ kind: 'étoile décalée', card: who, px: rnd(gap), text: li.textContent.trim().slice(0, 32) });
        }
      }
    }
  }
  return issues;
}

const all = [];
const failures = [];
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(l => window.__setLang(l), lang);
    await page.waitForTimeout(260);
    const issues = await page.evaluate(inspect);
    if (issues.length) {
      all.push({ lang, width, issues });
      failures.push({ lang, width, kinds: [...new Set(issues.map(i => i.kind))] });
    }
  }
}
await browser.close();
server.close();

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 1));
console.log(`formules — ${LANGS.length} langue(s) × ${WIDTHS.length} largeur(s) : ${all.length ? `${failures.length} mesure(s) en défaut` : 'aucun débordement, lignes alignées'}`);
for (const f of failures.slice(0, 12)) console.log(`  ✗ ${f.lang} @ ${f.width}px — ${f.kinds.join(' + ')}`);
for (const rec of all.slice(0, 6)) {
  for (const i of rec.issues.slice(0, 4)) console.log(`      ${i.kind} · ${i.el || ''} ${i.text ? `« ${i.text} » ` : ''}${i.px != null ? `(${i.px}px)` : ''}`);
}
if (JSON_OUT) console.log('rapport :', JSON_OUT);
process.exit(all.length ? 1 : 0);
