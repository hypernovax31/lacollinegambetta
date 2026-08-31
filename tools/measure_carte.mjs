#!/usr/bin/env node
/**
 * Mesure des hauteurs de blocs, dans la carte elle-même.
 *
 *   node tools/measure_carte.mjs        → tools/carte-metrics.json
 *
 * Deux documents, un seul rendu :
 *   1. index.html, à la largeur de composition (data-carte-viewport) : on relève
 *      la largeur naturelle du flux de chaque onglet et le nombre de blocs, pour
 *      vérifier que le générateur n'en a pas perdu en route.
 *   2. carte-measure.html, écrit par tools/build_carte.py avec la CSS exacte des
 *      feuilles (mêmes règles propres au papier, même imbrication
 *      .carte-flow > .tab-flow > blocs), sans découpage et sans transformation :
 *      chaque bloc y est mesuré **à chaque largeur de composition candidate**
 *      (data-carte-width-ratios, émis par le générateur — une seule source de
 *      vérité). La hauteur n'est pas une propriété du bloc mais du couple
 *      (bloc, largeur) : c'est l'échelle qui permet au build de choisir pour
 *      chaque onglet la largeur faisant border le cadre, sans surprise de
 *      rebord. Le débordement horizontal est relevé en même temps, pour écarter
 *      une largeur que le contenu refuserait (tableaux à min-width).
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

// les attributs du document de mesure, en guillemets simples OU doubles : refs est du
// JSON, il ne peut pas s'écrire en guillemets doubles
const attr = (html, name) => {
  const m = html.match(new RegExp(`data-carte-${name}="([^"]*)"|data-carte-${name}='([^']*)'`));
  return m ? (m[1] ?? m[2]) : undefined;
};

async function main() {
  if (!existsSync(DOC)) {
    throw new Error(`${DOC} introuvable — lancer d'abord : python3 tools/build_carte.py`);
  }
  const docHtml = readFileSync(DOC, 'utf8');
  const viewport = Number(attr(docHtml, 'viewport')) || Number(process.argv.find((a, i) => process.argv[i - 1] === '--width')) || 1180;
  const indexHash = attr(docHtml, 'index-hash');
  const cssHash = attr(docHtml, 'css-hash');
  const ratios = (attr(docHtml, 'width-ratios') || '1').split(',').map(Number);
  const refs = JSON.parse(attr(docHtml, 'refs') || '{}');
  const expectedBlocks = JSON.parse(attr(docHtml, 'blocks') || '{}');

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

    // Chaque onglet sera composé à LA largeur qui fait border son bloc au cadre :
    // il faut donc connaître sa hauteur à chaque largeur possible, pas seulement
    // à celle du site (1 140 px). On relève les deux — débordement horizontal
    // compris, pour écarter une largeur que le contenu refuserait de tenir.
    await doc.goto(`http://127.0.0.1:${port}/carte-measure.html`, { waitUntil: 'networkidle' });
    await doc.evaluate(async () => { await document.fonts.ready; });

    // Le site plafonne ses flux à la largeur de son conteneur d'écran avec un
    // !important assis sur un id : seule une déclaration inline en !important la fait
    // sauter. Sans ça, every width variant would silently stay at 1140 px.
    await doc.evaluate(() => {
      for (const el of document.querySelectorAll('.carte-measure-sec .tab-flow')) {
        el.style.setProperty('max-width', 'none', 'important');
      }
    });

    const variants = {};
    for (const w of ratios.map((r) => Math.round(base * r))) {
      await doc.evaluate((px) => {
        document.documentElement.style.setProperty('--carte-base-w', `${px}px`);
      }, w);
      await doc.waitForTimeout(140);
      const at = await doc.evaluate(({ ids2, w, refs2 }) => {
        const out = {};
        for (const id of ids2) {
          const sec = document.querySelector(`.carte-measure-sec[data-sec="${id}"]`);
          if (!sec) throw new Error(`carte-measure.html : section ${id} absente`);
          // quelques éléments de référence (un carton dont la carte doit connaître la
          // taille réelle pour imposer un gabarit à ses voisins) — mêmes largeurs qu'au-dessus
          const refsH = {};
          for (const [nom, sel] of Object.entries(refs2[id] || {})) {
            const el = sec.querySelector(sel);
            if (!el) throw new Error(`carte-measure.html : « ${nom} » (${sel}) absent de ${id}`);
            refsH[nom] = +el.getBoundingClientRect().height.toFixed(2);
          }
          const flow = sec.querySelector('.tab-flow');
          const holder = sec.querySelector('.carte-flow') || sec;
          const cs = getComputedStyle(flow);
          // probe deux colonnes de lignes : les blocs du groupe TWOC avec
          // carte-2col (sauf le bandeau), empilés — hauteurs individuelles et
          // débordement horizontal à cette largeur. Absent pour les sections
          // sans groupe TWOC.
          // plusieurs groupes TWOC par section (cocktails : deux pages) : on
          // fusionne les probes — chaque bloc n'apparaît que dans le sien
          const probes = sec.querySelectorAll('.carte-twocolsec-probe');
          let heights2col = null, overflow2col = null;
          if (probes.length) {
            const map = new Map();
            for (const probe of probes) {
              for (const el of probe.querySelectorAll(':scope [data-block]')) {
                map.set(Number(el.dataset.block), el);
              }
            }
            // aligné sur les indices du flux principal (null hors probe) : le
            // build compare hs[i] et hs2[i] bloc à bloc
            heights2col = [...flow.querySelectorAll(':scope > [data-block]')]
              .sort((a, b) => Number(a.dataset.block) - Number(b.dataset.block))
              .map((el) => {
                const p = map.get(Number(el.dataset.block));
                return p ? +p.getBoundingClientRect().height.toFixed(2) : null;
              });
            overflow2col = Math.max(0, ...[...map.values()]
              .map((el) => el.scrollWidth - el.clientWidth));
            overflow2col = +overflow2col.toFixed(2);
          }
          out[id] = {
            w,
            refs: refsH,
            gap: parseFloat(cs.rowGap || '0') || 0,
            overflow: +(holder.scrollWidth - holder.clientWidth).toFixed(2),
            heights: [...flow.querySelectorAll(':scope > [data-block]')]
              .sort((a, b) => Number(a.dataset.block) - Number(b.dataset.block))
              .map((el) => +el.getBoundingClientRect().height.toFixed(2)),
            count: flow.querySelectorAll(':scope > [data-block]').length,
            heights2col,
            overflow2col,
          };
        }
        return out;
      }, { ids2: ids, w, refs2: refs });
      for (const [id, v] of Object.entries(at)) {
        (variants[id] ??= []).push(v);
      }
    }

    const sections = {};
    for (const id of ids) {
      const atNatural = variants[id].find((v) => v.w === base);
      const nSite = siteInfo[id].blocks;
      if (!atNatural) throw new Error(`${id} : la largeur du site (${base} px) n'est pas dans les variantes mesurées`);
      if (atNatural.count !== (expectedBlocks[id] ?? nSite)) {
        throw new Error(`${id} : ${atNatural.count} blocs dans le document de mesure, `
          + `${expectedBlocks[id] ?? nSite} attendus — le générateur perd ou double un bloc.`);
      }
      const zero = variants[id].filter((v) => v.heights.some((h) => h < 4));
      if (zero.length) {
        throw new Error(`${id} : ${zero.length} variante(s) mesurée(s) à ~0 px — la CSS de la carte `
          + 'ne reproduit pas le site.');
      }
      sections[id] = {
        flow_width: base,
        gap: atNatural.gap,
        refs: atNatural.refs || {},
        blocks: atNatural.heights.map((h, i) => ({ i, tag: 'block', cls: '', h })),
        variants: variants[id],
      };
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
    console.log(`mesure @${viewport} px · flux site ${base} px · ${variants[ids[0]].length} largeurs de composition · `
      + `${Object.values(sections).reduce((a, s) => a + s.blocks.length, 0)} blocs · ${Math.round(total)} px `
      + `cumulés à la largeur du site · fontes ${fonts.join(', ')}`);
    for (const [id, s] of Object.entries(sections)) {
      const et = s.variants.map((v) => `${v.w}:${Math.round(v.heights.reduce((a, b) => a + b, 0))}`).join(' ');
      console.log(`  ${id.padEnd(9)} ${et}`);
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
