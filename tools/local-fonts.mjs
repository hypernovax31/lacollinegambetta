/**
 * Polices du site pour les rendus headless (PDF, captures) et les mesures.
 *
 * Le site charge Cinzel et Montserrat depuis fonts.googleapis.com. Dans un
 * environnement sans réseau — conteneur de build, CI, poste déconnecté — la
 * requête échoue et Chromium compose avec une police de repli (Open Sans) :
 * le PDF part alors « à la bonne taille, mais pas avec la bonne police ».
 * Pire, `document.fonts.check('700 24px Cinzel')` renvoie `true` même en
 * repli système, ce qui rend le contrôle inutile.
 *
 * Ce module sert donc les fontes depuis `node_modules/@fontsource` (mêmes
 * fichiers que Google Fonts, donc mêmes métriques) et vérifie le résultat
 * côté page ET côté PDF produit.
 *
 *   import { installLocalFonts, checkPageFonts, assertPdfFonts } from './local-fonts.mjs';
 *
 *   await installLocalFonts(context, ROOT);              // avant tout page.goto()
 *   await checkPageFonts(page);                          // après document.fonts.ready
 *   await page.pdf({ path: out, … });
 *   assertPdfFonts(out);                                 // preuve par le fichier
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '/__localfont/';

/* Découpages demandés par le site : latin + latin-ext (accents, ✦, →, €). */
const UNICODE = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

const PACKAGES = [
  ['cinzel', 'Cinzel', [400, 500, 600, 700, 800, 900], ['normal']],
  ['montserrat', 'Montserrat', [400, 500, 600, 700, 800], ['normal', 'italic']],
];

/**
 * @returns {null | { css: string, files: Map<string,string>, faces: string[] }}
 */
export function localFontCss(root) {
  const base = join(root, 'node_modules', '@fontsource');
  if (!existsSync(join(base, 'cinzel')) || !existsSync(join(base, 'montserrat'))) return null;
  const faces = [];
  const files = new Map();
  for (const [dir, family, weights, styles] of PACKAGES) {
    for (const weight of weights) for (const style of styles) for (const subset of ['latin', 'latin-ext']) {
      // @fontsource nomme les fichiers « cinzel-latin-700-normal.woff2 » (v5)
      // ou « cinzel-700-normal.woff2 » (v4, latin par défaut) : les deux formes.
      const dirFiles = join(base, dir, 'files');
      const candidates = subset === 'latin'
        ? [`${dir}-latin-${weight}-${style}.woff2`, `${dir}-${weight}-${style}.woff2`]
        : [`${dir}-latin-ext-${weight}-${style}.woff2`, `${dir}-ext-${weight}-${style}.woff2`];
      const file = candidates.map(name => join(dirFiles, name)).find(existsSync);
      if (!file) continue;
      const url = `${MARKER}${dir}-${subset}-${weight}-${style}.woff2`;
      files.set(url, file);
      faces.push(`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url('${url}') format('woff2');unicode-range:${UNICODE[subset]};}`);
    }
  }
  if (!faces.length) return null;
  const css = faces.join('\n');
  return { css, files, faces: faces.map(f => f.match(/font-family:'([^']+)';font-style:(\w+);font-weight:(\d+)/).slice(1, 4).join(' ')) };
}

/** Intercepte les requêtes Google Fonts du contexte et répond avec @fontsource. */
export async function installLocalFonts(context, root) {
  const local = localFontCss(root);
  if (!local) {
    console.warn(`⚠ @fontsource absent de node_modules : les rendus sortiront en police de repli.\n  Installons les mêmes fontes que le site : npm install`);
    return 0;
  }
  await context.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    const url = route.request().url();
    const cut = url.indexOf(MARKER);
    if (cut > -1) {
      const file = local.files.get(url.slice(cut).split('?')[0]);
      if (file) return route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(file) });
      return route.fulfill({ status: 404, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: local.css });
  });
  return local.files.size;
}

/** Les fontes réellement chargées dans la page (le seul contrôle qui vaille). */
export async function loadedFonts(page) {
  return page.evaluate(() => {
    const loaded = new Set();
    document.fonts.forEach(f => { if (f.status === 'loaded') loaded.add(`${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`); });
    return [...loaded].sort();
  });
}

export async function checkPageFonts(page, required = ['Cinzel', 'Montserrat']) {
  const loaded = await loadedFonts(page);
  const families = new Set(loaded.map(f => f.split(' ')[0]));
  const missing = required.filter(f => !families.has(f));
  if (missing.length) {
    throw new Error(`polices du site absentes du rendu (${missing.join(', ')}) — chargé : ${loaded.join(', ') || 'rien'}. `
      + `Le document serait composé en police de repli : npm install puis relancer.`);
  }
  return loaded;
}

/** Noms de polices embarqués dans un PDF (Chromium les préfixe « AAAAAA+… »). */
export function pdfFonts(pdfPath) {
  const data = readFileSync(pdfPath).toString('latin1');   // /BaseFont est en ASCII : lecture en latin1 suffisante
  const names = new Set();
  const re = /\/BaseFont\s*\/([A-Za-z0-9+\-.]+)/g;
  let m;
  while ((m = re.exec(data))) names.add(m[1].replace(/^[A-Z]{6}\+/, ''));
  return [...names].sort();
}

/** Échoue si le PDF n'embarque pas les fontes du site (repli Open Sans, etc.). */
export function assertPdfFonts(pdfPath, required = ['Cinzel', 'Montserrat']) {
  const embedded = pdfFonts(pdfPath);
  const missing = required.filter(f => !embedded.some(e => e.startsWith(f)));
  if (missing.length) {
    throw new Error(`${pdfPath.split('/').pop()} composé avec « ${embedded.join(', ') || 'aucune police embarquée'} » au lieu de ${missing.join(' + ')}.`
      + ` Relancer avec les fontes locales (npm install) : le build retombe sinon sur la police de repli de Chromium.`);
  }
  return embedded;
}
