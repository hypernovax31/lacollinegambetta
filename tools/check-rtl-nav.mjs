/* Sonde de recette — bandeau de sélection en RTL (arabe) : sens des flèches,
   côté où elles se rangent, avancée/retour réels, recentrage après changement
   de langue. Lancer : node tools/_probe-rtl.mjs            (rapport JSON)
   Outil de diagnostic ponctuel, non branché sur la CI. */
import { chromium } from '../node_modules/playwright/index.mjs';
import chromiumBinary, { setupLambdaEnvironment } from '../node_modules/@sparticuz/chromium/build/index.js';
import { carteChromiumArgs } from './chromium-args.mjs';
import { installLocalFonts } from './local-fonts.mjs';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
await installLocalFonts(ctx, ROOT);
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready.catch(() => {}));

/* Le bandeau de sélection vit dans la vue « carte ». */
await page.evaluate(() => {
  if (typeof showView === 'function') showView('menu');
  const m = document.getElementById('interior-menu'); if (m) m.style.display = 'block';
  const c = document.getElementById('cover-section'); if (c) c.style.display = 'none';
  const t = document.querySelector('.top-controls'); if (t) t.style.display = '';
});

const overlapNext = (which) => {
  const nav = document.getElementById('menu-nav');
  const btns = [...nav.querySelectorAll('.nav-btn')];
  const act = btns.findIndex(b => b.classList.contains('active'));
  const nxt = btns[act + (which === 'apres' ? 1 : 1)];
  if (!nxt) return 0;
  const a = nav.getBoundingClientRect(), b = nxt.getBoundingClientRect();
  return +Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)).toFixed(1);
};
const probe = () => {
  const nav = document.getElementById('menu-nav');
  const wrap = document.getElementById('menu-nav-wrap');
  const start = document.getElementById('menu-nav-hint-start');
  const end = document.getElementById('menu-nav-hint-end');
  const btns = [...nav.querySelectorAll('.nav-btn')];
  const navR = nav.getBoundingClientRect();
  const vis = btns.map((b, i) => {
    const r = b.getBoundingClientRect();
    return { i, t: b.textContent.trim(), full: r.left >= navR.left - 0.5 && r.right <= navR.right + 0.5, x: +r.left.toFixed(1), act: b.classList.contains('active') };
  });
  const mtx = el => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return { a: 1 };
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return { a: 1, raw: t };
    const [a, , , , e] = m[1].split(',').map(Number);
    return { a: +a.toFixed(2), e: +e.toFixed(1) };
  };
  const sR = start.getBoundingClientRect(), eR = end.getBoundingClientRect();
  const act = btns.find(b => b.classList.contains('active'));
  const actR = act ? act.getBoundingClientRect() : null;
  return {
    dir: getComputedStyle(document.documentElement).direction,
    lang: document.documentElement.lang,
    wrapCls: wrap.className,
    nav: { l: +navR.left.toFixed(1), r: +navR.right.toFixed(1), scrollLeft: +nav.scrollLeft.toFixed(1), clientW: nav.clientWidth, scrollW: nav.scrollWidth },
    hintStart: { vis: getComputedStyle(start).display !== 'none', x: +sR.left.toFixed(1), side: sR.left > navR.left ? 'droite' : 'gauche', flip: mtx(start.querySelector('svg')) },
    hintEnd: { vis: getComputedStyle(end).display !== 'none', x: +eR.left.toFixed(1), side: eR.left > navR.left ? 'droite' : 'gauche', flip: mtx(end.querySelector('svg')) },
    activeIdx: btns.findIndex(b => b.classList.contains('active')),
    activeBox: actR ? { l: +actR.left.toFixed(1), r: +actR.right.toFixed(1), w: +actR.width.toFixed(1) } : null,
    activeInside: actR ? (actR.left >= navR.left - 0.5 && actR.right <= navR.right + 0.5) : null,
    visible: vis.filter(v => v.full).map(v => v.i),
    firstVis: vis.find(v => v.full)?.i ?? null,
    lastVis: [...vis].reverse().find(v => v.full)?.i ?? null,
  };
};
const shot = async (label) => {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(260);
  const p = await page.evaluate(probe);
  console.log(label.padEnd(34), JSON.stringify(p));
  return p;
};
const clickHint = async (which) => {
  await page.evaluate(w => document.getElementById(`menu-nav-hint-${w}`).click(), which);
  await page.waitForTimeout(500);
};

const report = {};
for (const lang of ['fr', 'ar']) {
  await page.evaluate(l => window.__setLang(l), lang);
  await page.waitForTimeout(120);
  /* Repartir du premier onglet : sinon l'état laissé par la langue
     précédente fausse les comparaisons « suivant / précédent ». */
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.menu-nav .nav-btn')];
    showMenuSection('entrees', btns[0]);
    document.getElementById('menu-nav').scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const tab = page.url();
  report[lang] = { steps: [] };
  const base = await shot(`${lang} · état de départ`);
  report[lang].base = base;
  await clickHint('end');
  report[lang].apresEnd = await shot(`${lang} · clic « autres sections »`);
  await clickHint('end');
  report[lang].apresEnd2 = await shot(`${lang} · clic « autres sections » ×2`);
  await clickHint('start');
  report[lang].apresStart = await shot(`${lang} · clic « sections précédentes »`);
  /* « Coup de pouce » : pos 0 → il doit révéler la suite dans le sens du texte. */
  await page.evaluate(() => { const n = document.getElementById('menu-nav'); n.scrollLeft = 0; });
  await page.waitForTimeout(400);
  const before = await page.evaluate(probe);
  before.suivantVisible = await page.evaluate(`(${overlapNext.toString()})('apres')`);
  await page.evaluate(() => menuNavNudge());
  await page.waitForTimeout(900);
  const after = await page.evaluate(probe);
  after.suivantVisible = await page.evaluate(`(${overlapNext.toString()})('apres')`);
  report[lang].nudge = {
    avant: { scrollLeft: before.nav.scrollLeft, firstVis: before.firstVis, lastVis: before.lastVis, suivant: before.suivantVisible },
    apres: { scrollLeft: after.nav.scrollLeft, firstVis: after.firstVis, lastVis: after.lastVis, suivant: after.suivantVisible },
  };
  console.log(`${lang} · coup de pouce`.padEnd(34), JSON.stringify(report[lang].nudge));
  /* Dernier onglet : plus rien à révéler du côté « autres sections ». */
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.menu-nav .nav-btn')];
    showMenuSection('desserts', btns[btns.length - 1]);
  });
  await page.waitForTimeout(700);
  report[lang].dernier = await shot(`${lang} · onglet « desserts » actif`);
  /* Recentrage : le changement de langue refait la mise en page. */
  await page.evaluate(l => window.__setLang(l), lang === 'ar' ? 'de' : 'ar');
  await page.waitForTimeout(900);
  report[lang].apresApplyLang = await shot(`${lang} → ${lang === 'ar' ? 'de' : 'ar'} · recentrage`);
  void tab;
}
await browser.close();
server.close();

/* --- verdict --- */
const fail = [];
const ck = (cond, msg) => { if (!cond) fail.push(msg); };
for (const [lang, r] of Object.entries(report)) {
  const rtl = lang === 'ar';
  /* 1. Les flèches se rangent du côté du début de la lecture (on ne juge que
        celles qui sont affichées : une flèche masquée n'a pas de place). */
  if (r.base.hintStart.vis) {
    ck(r.base.hintStart.side === (rtl ? 'droite' : 'gauche'), `${lang} : « sections précédentes » devrait être à ${rtl ? 'droite' : 'gauche'} du ruban (vu : ${r.base.hintStart.side})`);
  }
  if (r.base.hintEnd.vis) {
    ck(r.base.hintEnd.side === (rtl ? 'gauche' : 'droite'), `${lang} : « autres sections » devrait être à ${rtl ? 'gauche' : 'droite'} du ruban (vu : ${r.base.hintEnd.side})`);
  }
  /* 2. Les chevrons regardent vers l'extérieur : retournés en RTL seulement.
     (Un chevron masqué (`display:none`) vaut `transform:none` — on ne juge
     que ceux qui sont affichés.) */
  for (const [nom, h] of [['précédent', r.base.hintStart], ['suivant', r.base.hintEnd]]) {
    if (!h.vis) continue;
    ck(h.flip.a === (rtl ? -1 : 1), `${lang} : chevron « ${nom} » mal orienté (scaleX ${h.flip.a})`);
  }
  /* 3. Le clic fait bien avancer/reculer dans l'ordre de lecture. */
  ck(r.apresEnd.activeIdx > r.base.activeIdx, `${lang} : « autres sections » ne va pas à l'onglet suivant (${r.base.activeIdx} → ${r.apresEnd.activeIdx})`);
  ck(r.apresEnd2.activeIdx > r.apresEnd.activeIdx, `${lang} : « autres sections » s'arrête après un clic`);
  ck(r.apresStart.activeIdx < r.apresEnd2.activeIdx, `${lang} : « sections précédentes » ne revient pas en arrière`);
  /* 4. Le coup de pouce révèle bien la suite de la liste, dans les deux sens. */
  ck(r.nudge.apres.suivant > r.nudge.avant.suivant, `${lang} : le coup de pouce ne découvre pas l'onglet suivant (part visible ${r.nudge.avant.suivant} → ${r.nudge.apres.suivant} px)`);
  ck(Math.abs(r.nudge.apres.scrollLeft) > Math.abs(r.nudge.avant.scrollLeft), `${lang} : le coup de pouce ne défile pas dans le sens de la lecture (scrollLeft ${r.nudge.avant.scrollLeft} → ${r.nudge.apres.scrollLeft})`);
  /* 5. L'onglet actif reste entier dans la fenêtre du ruban (recentrage). */
  for (const [k, st] of Object.entries({ base: r.base, end: r.apresEnd, start: r.apresStart, dernier: r.dernier, applyLang: r.apresApplyLang })) {
    ck(st.activeInside, `${lang} (${k}) : l'onglet actif (n°${st.activeIdx}) n'est pas entièrement visible — boîte ${JSON.stringify(st.activeBox)} vs ruban ${JSON.stringify(st.nav)}`);
  }
  /* 6. Quand des onglets restent cachés dans le sens de la lecture, la flèche du bon côté est présente. */
  ck(r.base.hintEnd.vis === (r.base.lastVis < 6), `${lang} : flèche « autres sections » (${r.base.hintEnd.vis}) incohérente avec les onglets cachés (dernier visible n°${r.base.lastVis})`);
}
console.log(fail.length ? '\n✗ ÉCHECS :\n' + fail.map(f => '  · ' + f).join('\n') : '\n✔ bandeau de sélection : sens RTL conforme (flèches, clics, recentrage).');
process.exit(fail.length ? 1 : 0);
