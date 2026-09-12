#!/usr/bin/env node
/**
 * Contrôle des pastilles (boutons) et du bandeau des langues — toutes langues.
 *
 *   node tools/check-pills.mjs
 *       Balaye les 15 langues du site × toutes les largeurs utiles et signale :
 *         • « pastille »      : le texte d'un bouton ne tient pas dans sa boîte
 *                               (débordement horizontal, texte rogné ou hauteur
 *                               dépassée) — ruban d'onglets, bandeau du haut,
 *                               pilules des formules, menu des langues, flèches
 *                               du bandeau ;
 *         • « chevauchement » : l'encre de deux pastilles voisines se recouvre ;
 *         • « hors écran »    : une pastille sort de la fenêtre ;
 *         • « langue cachée » : une langue du menu n'est pas atteignable dans la
 *                               fenêtre visible (menu coupé, liste non
 *                               défilante, dernière ligne inatteignable).
 *       Sortie ≠ 0 si une langue échoue.
 *
 * Options : --langs fr,en,ar --widths 320,390,768,1024,1440
 *           --tabs entrees,menus,cocktails   --json /tmp/pills.json
 *           [--remote-fonts]
 *
 * Les mesures exigent les vraies fontes du site (Cinzel, Montserrat, Amiri,
 * Noto Sans/Serif JP·KR·SC, Tajawal…) : elles sont posées par
 * tools/local-fonts.mjs depuis @fontsource (npm install). Sans elles, les
 * largeurs de texte — donc les diagnostics — seraient fausses.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { carteChromiumArgs } from './chromium-args.mjs';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ALL_LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'uk', 'ja', 'ko', 'pl', 'tr', 'hi'];

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
const LANGS = argv.langs ? String(argv.langs).split(',').filter(Boolean) : ALL_LANGS;
const WIDTHS = argv.widths
  ? String(argv.widths).split(',').map(Number)
  : [320, 360, 390, 430, 540, 640, 720, 900, 1024, 1180, 1440];
const TABS = argv.tabs ? String(argv.tabs).split(',').filter(Boolean) : ['entrees', 'menus', 'cocktails', 'vins'];

/* ------------------------------------------------------------------ serveur */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};
function serve(root) {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')));
    if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}/index.html` }));
  });
}

/* --------------------------------------------------------------------- sonde */
/* Exécutée dans la page — doit rester autonome (Playwright la sérialise).
   On mesure l'encre réelle du texte (Range.getClientRects) contre la boîte
   du bouton : un texte plus large que la boîte est rogné (« overflow:hidden »,
   « white-space:nowrap ») ou déborde ; deux encres de pastilles voisines qui
   se recouvrent = chevauchement. */
function inspect(context) {
  const EPS = 0.6;
  const issues = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const label = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32) || (el.getAttribute('aria-label') || '?');

  /* Rognage : l'encre d'un texte DÉFILÉ hors de son conteneur n'est pas
     visible — Range.getClientRects() la renvoie pourtant, et sans ce
     rognage on croirait à un chevauchement avec la flèche qui la recouvre
     alors que le texte est simplement hors de la bande. On intersecte donc
     chaque rectangle d'encre avec la boîte de découpe du plus proche
     ancêtre défilant (`clientWidth` : la boîte des contenus, bords
     intérieurs des bordures). */
  const clipOf = el => {
    let node = el.parentElement, clip = null;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const r = node.getBoundingClientRect();
        const c = {
          l: r.left + node.clientLeft, t: r.top + node.clientTop,
          r: r.left + node.clientLeft + node.clientWidth, b: r.top + node.clientTop + node.clientHeight,
        };
        clip = clip ? {
          l: Math.max(clip.l, c.l), t: Math.max(clip.t, c.t),
          r: Math.min(clip.r, c.r), b: Math.min(clip.b, c.b),
        } : c;
      }
      node = node.parentElement;
    }
    return clip;
  };
  const rect2 = r => ({ l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) });
  const inkOf = el => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const clip = clipOf(el);
    return Array.from(r.getClientRects())
      .map(rect2)
      .map(b => (clip ? { l: Math.max(b.l, clip.l), r: Math.min(b.r, clip.r), t: Math.max(b.t, clip.t), b: Math.min(b.b, clip.b) } : b))
      .filter(b => b.r - b.l > 0.5 && b.b - b.t > 0.5);
  };
  const box2 = el => rect2(el.getBoundingClientRect());
  const styleInfo = el => {
    const cs = getComputedStyle(el);
    const par = el.parentElement;
    const pcs = par ? getComputedStyle(par) : null;
    return {
      el: { display: cs.display, whiteSpace: cs.whiteSpace, flex: cs.flex, width: cs.width, fontSize: cs.fontSize },
      parent: pcs ? { cls: par.className, display: pcs.display, flex: pcs.flex, padding: pcs.padding, width: pcs.width, gridTemplateColumns: pcs.gridTemplateColumns } : null,
    };
  };
  const scrollInfo = el => {
    const sc = el.closest('.menu-nav, .lang-menu');
    if (!sc) return null;
    return { cls: sc.className, scrollLeft: +sc.scrollLeft.toFixed(1), clientW: sc.clientWidth, scrollW: sc.scrollWidth };
  };
  const visible = el => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
  };

  const GROUPS = [
    '.menu-nav', '.top-controls__nav', '.cover-links', '.footer-links',
    '.fmb-choices', '.lang-menu__list', '#menu-nav-wrap',
  ];
  const PILLS = '.nav-btn, .control-btn, .lang-option, .menu-nav-hint, .fmb-pils, .contact-link, .footer-link';

  function scanPills() {
    for (const el of document.querySelectorAll(PILLS)) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const box = box2(el);
      const clip = clipOf(el);
      /* 1. débordement interne du bouton */
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') {
        issues.push({ kind: 'pastille', el: el.className.split(' ')[0], text: label(el), px: +(el.scrollWidth - el.clientWidth).toFixed(1), why: 'texte plus large que la boîte' });
      }
      if (el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== 'visible') {
        issues.push({ kind: 'pastille', el: el.className.split(' ')[0], text: label(el), px: +(el.scrollHeight - el.clientHeight).toFixed(1), why: 'texte plus haut que la boîte' });
      }
      /* 2. encre hors de la boîte du bouton (padding mangé, texte qui déborde) */
      for (const b of inkOf(el)) {
        const over = Math.max(b.r - (box.r - 0.5), (box.l + 0.5) - b.l);
        if (over > EPS && box.r - box.l > 0) {
          issues.push({ kind: 'pastille', el: el.className.split(' ')[0], text: label(el), px: +over.toFixed(1), why: 'encre hors de la pastille', geom: { box, ink: b, scroll: scrollInfo(el), style: styleInfo(el) } });
        }
        /* Hors écran : seulement pour ce que rien ne rogne (un onglet de la
           bande défilante est légitimement hors champ). */
        if (!clip && (b.r > vw - 0.5 || b.l < 0.5)) {
          issues.push({ kind: 'hors écran', el: el.className.split(' ')[0], text: label(el), px: +(b.r - vw).toFixed(1), geom: { ink: b, box, style: styleInfo(el) } });
        }
      }
    }
    /* 3. chevauchement de deux pastilles voisines du même groupe */
    for (const sel of GROUPS) {
      for (const group of document.querySelectorAll(sel)) {
        const pills = Array.from(group.querySelectorAll(PILLS)).filter(visible);
        const inks = pills.map(p => ({ p, rects: inkOf(p) }));
        for (let i = 0; i < inks.length; i++) {
          for (let j = i + 1; j < inks.length; j++) {
            for (const a of inks[i].rects) {
              for (const b of inks[j].rects) {
                const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
                const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
                if (ox > EPS && oy > 1) {
                  issues.push({
                    kind: 'chevauchement', el: sel, text: `${label(inks[i].p)} ⇄ ${label(inks[j].p)}`, px: +ox.toFixed(1),
                    geom: { a: { box: box2(inks[i].p), ink: a }, b: { box: box2(inks[j].p), ink: b } },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  /* En-têtes de colonnes de prix (Prix / sigle du happy hour) : l'encre de
     l'en-tête ne doit pas sortir de sa colonne ni mordre sur la voisine. */
  function scanHeaders() {
    if (document.documentElement.classList.contains('carte-doc')) return;
    for (const head of document.querySelectorAll('.hh-head, .beer-table__head')) {
      const cells = Array.from(head.children).filter(c => c.textContent.trim());
      for (const cell of cells) {
        const box = box2(cell);
        for (const b of inkOf(cell)) {
          const over = Math.max(b.r - box.r, box.l - b.l);
          if (over > EPS) {
            issues.push({ kind: 'colonne HH', el: head.className.split(' ')[0], text: label(cell), px: +over.toFixed(1), why: 'en-tête hors de sa colonne' });
          }
        }
      }
      const rects = cells.map(c => ({ c, rects: inkOf(c) }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          for (const a of rects[i].rects) for (const b of rects[j].rects) {
            const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (ox > EPS && oy > 1) {
              issues.push({ kind: 'colonne HH', el: head.className.split(' ')[0], text: `${label(rects[i].c)} ⇄ ${label(rects[j].c)}`, px: +ox.toFixed(1) });
            }
          }
        }
      }
    }
  }

  /* Menu des langues : toutes les langues doivent être atteignables dans la
     fenêtre visible — panneau entièrement à l'écran, liste réellement
     DÉFILANTE quand elle est plus haute que l'espace disponible (un
     `overflow: hidden` se laisse défiler par le script mais pas par le
     doigt : les langues du bas seraient perdues), dernière langue montrable
     en entier une fois la liste au bout. */
  function scanLangMenu(done) {
    const btn = document.getElementById('lang-btn');
    const menu = document.getElementById('lang-menu');
    if (!btn || !menu) { done(null); return; }
    btn.click();
    const options = Array.from(menu.querySelectorAll('.lang-option')).filter(o => getComputedStyle(o).display !== 'none');
    const r = menu.getBoundingClientRect();
    const oy = getComputedStyle(menu).overflowY;
    const report = {
      open: !menu.hidden, count: options.length, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
      scrollable: oy === 'auto' || oy === 'scroll',
      needed: menu.scrollHeight, available: menu.clientHeight,
    };
    if (menu.hidden) { issues.push({ kind: 'langue cachée', text: 'menu fermé au clic', px: 0 }); done(report); return; }
    if (r.width < 1 || r.height < 1) {
      issues.push({ kind: 'langue cachée', text: 'menu ouvert mais invisible (boîte nulle)', px: 0 });
      done(report); return;
    }
    if (r.top < -0.5) issues.push({ kind: 'langue cachée', text: 'haut du menu hors fenêtre', px: +r.top.toFixed(1) });
    if (r.bottom > vh + 0.5) issues.push({ kind: 'langue cachée', text: 'bas du menu hors fenêtre', px: +(r.bottom - vh).toFixed(1) });
    if (r.left < -0.5 || r.right > vw + 0.5) issues.push({ kind: 'langue cachée', text: 'menu plus large que la fenêtre', px: +(r.right - vw).toFixed(1) });
    if (!options.length) { issues.push({ kind: 'langue cachée', text: 'aucune langue dans le menu', px: 0 }); done(report); return; }
    /* Une partie de la liste est-elle hors du panneau sans défilement
       utilisable ? (overflow:hidden se laisse défiler par le script, jamais
       par le doigt ni la molette.) */
    if (menu.scrollHeight > menu.clientHeight + 1 && !report.scrollable) {
      issues.push({ kind: 'langue cachée', text: `liste plus haute que le panneau et non défilante (overflow-y: ${oy})`, px: menu.scrollHeight - menu.clientHeight });
    }
    /* Une ligne plus haute que la fenêtre du panneau ne peut jamais être vue
       en entier : c'est le cas d'un écran très bas (paysage de téléphone). */
    const tooTall = options.filter(o => o.getBoundingClientRect().height > menu.clientHeight + 0.5);
    if (tooTall.length) {
      issues.push({ kind: 'langue cachée', text: `${tooTall.length} langue(s) plus haute(s) que le panneau : ${tooTall.slice(0, 3).map(label).join(', ')}`, px: 0 });
    }
    const last = options[options.length - 1];
    menu.scrollTop = menu.scrollHeight;
    const lastBox = last.getBoundingClientRect();
    if (lastBox.bottom > r.bottom + 0.5 || lastBox.top < r.top - 0.5) {
      issues.push({ kind: 'langue cachée', text: 'dernière langue inatteignable', px: +(lastBox.bottom - r.bottom).toFixed(1) });
    }
    menu.scrollTop = 0;
    done(report);
  }

  scanPills();
  scanHeaders();
  return new Promise(done => scanLangMenu(report => {
    if (document.documentElement.scrollWidth > vw + 1) {
      issues.push({ kind: 'hors écran', text: 'page débordante', px: document.documentElement.scrollWidth - vw });
    }
    const btn = document.getElementById('lang-btn');
    const menu = document.getElementById('lang-menu');
    if (menu && !menu.hidden) {
      btn.click();
      btn.setAttribute('aria-expanded', 'false');
    }
    done({ issues, menu: report, viewport: { w: vw, h: vh } });
  }));
}

/* Sonde du seul menu des langues : pour les fenêtres basses (téléphone en
   paysage, petit portable), où la hauteur décide de l'accessibilité de la
   dernière langue, indépendamment des pastilles. */
function inspectLangMenuOnly() {
  const btn = document.getElementById('lang-btn');
  const menu = document.getElementById('lang-menu');
  const issues = [];
  const vh = window.innerHeight;
  if (!btn || !menu) return { issues, note: 'menu absent' };
  btn.click();
  if (menu.hidden) {
    btn.click();
    return { issues: [{ kind: 'langue cachée', text: 'menu impossible à ouvrir' }] };
  }
  const options = Array.from(menu.querySelectorAll('.lang-option'));
  const r = menu.getBoundingClientRect();
  const oy = getComputedStyle(menu).overflowY;
  if (r.width < 1 || r.height < 1) {
    btn.click();
    return { issues: [{ kind: 'langue cachée', text: 'menu ouvert mais invisible (boîte nulle)' }] };
  }
  if (r.top < -0.5) issues.push({ kind: 'langue cachée', text: 'haut du menu hors fenêtre', px: +r.top.toFixed(1) });
  if (r.bottom > vh + 0.5) issues.push({ kind: 'langue cachée', text: 'bas du menu hors fenêtre', px: +(r.bottom - vh).toFixed(1) });
  if (menu.scrollHeight > menu.clientHeight + 1 && oy !== 'auto' && oy !== 'scroll') {
    issues.push({ kind: 'langue cachée', text: `liste non défilante (overflow-y: ${oy})`, px: menu.scrollHeight - menu.clientHeight });
  }
  const last = options[options.length - 1];
  if (last) {
    menu.scrollTop = menu.scrollHeight;
    const lb = last.getBoundingClientRect();
    if (lb.bottom > r.bottom + 0.5 || lb.top < r.top - 0.5) {
      issues.push({ kind: 'langue cachée', text: 'dernière langue inatteignable', px: +(lb.bottom - r.bottom).toFixed(1) });
    }
    menu.scrollTop = 0;
  }
  btn.click();
  return { issues, count: options.length, menu: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), height: +r.height.toFixed(1), needed: menu.scrollHeight, available: menu.clientHeight, overflowY: oy } };
}

/* ------------------------------------------------------------------- harnais */
async function main() {
  const { server, url } = await serve(ROOT);
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
  let browser;
  const failures = [];
  const json = [];
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: await chromiumBinary.executablePath(),
      args: [...carteChromiumArgs(), '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    if (!argv['remote-fonts']) await installLocalFonts(ctx, ROOT);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready.catch(() => {}));
    await checkPageFonts(page);
    await page.evaluate(() => {
      if (typeof showView === 'function') showView('menu');
      const menu = document.getElementById('interior-menu');
      if (menu) menu.style.display = 'block';
      const cover = document.getElementById('cover-section');
      if (cover) cover.style.display = 'none';
      /* Le bouton des langues vit dans le bandeau du haut, masqué sur la page
         de garde : sans cette ligne le menu s'ouvre dans un élément
         `display:none` et toutes les mesures du menu valent zéro. */
      const top = document.querySelector('.top-controls');
      if (top) top.style.display = '';
    });
    const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    for (const lang of LANGS) {
      const perLang = { lang, widths: {} };
      for (const tab of TABS) {
        await page.evaluate(({ l, t }) => {
          if (typeof window.__setLang === 'function') window.__setLang(l);
          const btn = [...document.querySelectorAll('.nav-btn')].find(b => (b.getAttribute('onclick') || '').includes(`'${t}'`));
          if (btn && typeof showMenuSection === 'function') showMenuSection(t, btn);
        }, { l: lang, t: tab });
        await settle();
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: w < 720 ? 740 : 900 });
          await settle();
          /* Les pastilles ont une transition de 200 ms (« transition: .2s ») :
             entre le changement de largeur et la fin de l'animation, `flex` et
             `width` valent des valeurs intermédiaires (flex-shrink 0,78…) et
             le texte déborde de sa boîte le temps de la transition. On mesure
             l'état POSÉ, celui que le visiteur voit. */
          await page.waitForTimeout(260);
          await page.evaluate(() => { if (typeof syncMenuNavHints === 'function') syncMenuNavHints(); });
          const res = await page.evaluate(inspect, {});
          const kinds = [...new Set(res.issues.map(i => i.kind))];
          if (argv.verbose) console.log(`    ${lang} ${tab} ${w}px — menu ${JSON.stringify(res.menu)} — ${res.issues.length} diagnostic(s)`);
          perLang.widths[w] = perLang.widths[w] || [];
          perLang.widths[w].push({ tab, n: res.issues.length, kinds, sample: res.issues.slice(0, 3) });
          if (res.issues.length) {
            json.push({ lang, tab, width: w, issues: res.issues, menu: res.menu });
            const key = `${lang}|${kinds.join('+')}`;
            if (!failures.some(f => f.key === key)) {
              failures.push({ key, lang, tab, width: w, kinds, sample: res.issues.slice(0, 4), menu: res.menu });
            }
          }
        }
      }
      /* Fenêtres basses : le menu des langues doit rester entièrement dans
         l'écran et défilable du doigt, quelle que soit la hauteur. */
      for (const [w, h] of [[390, 640], [360, 560], [320, 480], [1024, 600], [844, 390]]) {
        await page.setViewportSize({ width: w, height: h });
        await settle();
        await page.waitForTimeout(260);
        const res = await page.evaluate(inspectLangMenuOnly);
        if (res.issues.length) {
          json.push({ lang, tab: 'lang-menu', width: w, height: h, issues: res.issues });
          const key = `${lang}|menu|${res.issues.map(i => i.kind).join('+')}`;
          if (!failures.some(f => f.key === key)) failures.push({ key, lang, tab: 'lang-menu', width: w, kinds: [...new Set(res.issues.map(i => i.kind))], sample: res.issues.slice(0, 3), menu: res.menu });
        }
      }
      const wide = Object.entries(perLang.widths).filter(([, v]) => v.some(x => x.n));
      console.log(`${wide.length ? '✗' : '✓'} ${lang.padEnd(3)} ${wide.length ? `— ${wide.length} largeur(s) en difficulté (${wide.slice(0, 4).map(([w, v]) => `${w}px:${v.reduce((s, x) => s + x.n, 0)}`).join(' ')})` : '— aucune pastille ne déborde, toutes les langues atteignables'}`);
    }
    if (failures.length) {
      console.log('');
      for (const f of failures) {
        console.log(`  ✗ ${f.lang} @ ${f.width}px — ${f.kinds.join(' + ')}`);
        for (const s of f.sample) {
          const bits = [s.kind, s.el, s.text].filter(Boolean).join(' · ');
          console.log(`      ${bits}${s.px ? ` (${s.px}px)` : ''}${s.why ? ` — ${s.why}` : ''}`);
        }
      }
    }
    if (argv.json) {
      mkdirSync(resolve(String(argv.json), '..'), { recursive: true });
      writeFileSync(String(argv.json), JSON.stringify(json, null, 1));
      console.log(`\nrapport : ${argv.json}`);
    }
    if (failures.length) {
      console.error(`\n✗ échec : ${failures.length} diagnostic(s) sur ${LANGS.length} langue(s) — ${WIDTHS.length} largeurs de ${WIDTHS[0]} à ${WIDTHS[WIDTHS.length - 1]}px.`);
      process.exitCode = 1;
    } else {
      console.log(`\n✔ pastilles et menu des langues : ${LANGS.length} langues × ${WIDTHS.length} largeurs, aucun débordement.`);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(done => server.close(done));
  }
}

await main();
