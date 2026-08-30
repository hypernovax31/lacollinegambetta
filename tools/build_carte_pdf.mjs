#!/usr/bin/env node
/**
 * Carte A4 téléchargeable : une image par page, puis un PDF unifié.
 *
 *   node tools/build_carte_pdf.mjs
 *     → carte-a4-pages/page-01.jpg … page-10.jpg   (A4 300 dpi, 2480 × 3508 px)
 *     → carte-a4.pdf                               (les 10 pages assemblées)
 *
 *   node tools/build_carte_pdf.mjs --jpgs-only     (les images seules, sans PDF)
 *   node tools/build_carte_pdf.mjs --quality 88    (JPEG plus légers)
 *
 * Pourquoi des images ? Le PDF doit sortir exactement comme la carte à l'écran,
 * sur n'importe quelle machine, sans dépendre des polices de celui qui
 * l'imprime. Le prix à payer : le texte n'est plus sélectionnable ni
 * rechercheable — c'est volontaire ici, la carte se lit, elle ne se copie pas.
 *
 * Le PDF est un conteneur, pas une re-compression : chaque JPEG est embarqué
 * tel quel (/DCTDecode), donc un JPG → PDF ne perd rien.
 *
 * Déroulé : carte.html (généré par tools/build_carte.py) est rendu par Chromium
 * en média « print », chaque feuille .print-page est photographiée à 300 dpi,
 * les fichiers sont contrôlés (format A4, densité, contenu non vide), puis
 * assemblés. Les polices du site (Cinzel, Montserrat) sont servies depuis
 * node_modules/@fontsource : sans elles le rendu sortirait en police système,
 * et cette fois le build s'arrête là-dessus au lieu de livrer silencieusement.
 */
import { createServer } from 'node:http';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import chromiumBinary, { setupLambdaEnvironment } from '@sparticuz/chromium';
import { installLocalFonts, checkPageFonts } from './local-fonts.mjs';
import { imagesToPdf, jpegInfo } from './jpeg-pdf.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = 'carte.html';
const OUT_NAME = 'carte-a4.pdf';
const IMAGES_DIR = 'carte-a4-pages';
const STAGE = join(ROOT, '.carte-pdf');
/* Le nombre de feuilles vient de carte.html (la pagination est mesurée, pas
   devinée) ; --pages N permet de l'imposer dans un test. */
const JPG_WIDTH = 2480;                  // 210 mm à 300 dpi
const JPG_HEIGHT = 3508;                 // 297 mm à 300 dpi
const JPG_SLACK = 6;                     // le liseré doré de la feuille (1 px par bord) s'ajoute au 210 × 297 mm
const ECART_CENTRAGE_MM = 0.2, JEU_CADRE_MM = 1.5;   // centrage et non-chevauchement du cadre
const SHEET_OVERFLOW_PX = 2;             // au-delà de ~0,7 mm hors feuille, la capture rognerait
const MIN_JPG_BYTES = 120_000;  // une feuille vraiment imprimée pèse plus lourd : anti-page-blanche

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const QUALITY = Number(flag('quality', 92));
const EXPECTED_PAGES = Number(flag('pages', 0));

/** Ce que build_carte.py a mesuré : à lui seul le garant de la fidélité. */
function composition(file) {
  const html = readFileSync(file, 'utf8');
  const viewport = Number((html.match(/data-carte-viewport="(\d+)"/) || [])[1]);
  const base = Number((html.match(/data-carte-base-w="([\d.]+)/) || [])[1]);
  const fit = Number((html.match(/--carte-fit:\s*([\d.]+)/) || [])[1]);
  if (!viewport || !base || !fit) {
    throw new Error(`${basename(file)} : --carte-base-w / --carte-fit / data-carte-viewport absents — `
      + `relancer python3 tools/build_carte.py`);
  }
  return { viewport, base, fit };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
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
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/${SRC}` });
    });
  });
}

/** Contrôle d'une feuille : dimensions A4 300 dpi, 8 bits RVB, et de l'encre. */
function checkJpg(file, dimsExactes) {
  const name = basename(file);
  const info = jpegInfo(file);
  const bytes = statSync(file).size;
  const ok = (a, b) => (dimsExactes ? a === b : Math.abs(a - b) <= JPG_SLACK);
  if (!ok(info.width, JPG_WIDTH) || !ok(info.height, JPG_HEIGHT)) {
    throw new Error(`${name} : ${info.width}×${info.height} au lieu de ${JPG_WIDTH}×${JPG_HEIGHT}`
      + `${dimsExactes ? '' : ` (±${JPG_SLACK} px tolérés sans ImageMagick)`} — la feuille ne sort pas en A4 plein à 300 dpi.`);
  }
  const aspect = info.width / info.height;
  if (Math.abs(aspect - JPG_WIDTH / JPG_HEIGHT) > 0.005) {
    throw new Error(`${name} : ratio ${aspect.toFixed(4)} au lieu de ${(JPG_WIDTH / JPG_HEIGHT).toFixed(4)} — déformé à l'impression.`);
  }
  if (info.components !== 3) throw new Error(`${name} : ${info.components} composante(s), un JPEG RVB 8 bits est attendu.`);
  if (bytes < MIN_JPG_BYTES) {
    throw new Error(`${name} : ${Math.round(bytes / 1024)} Ko, trop léger pour une feuille imprimée (page blanche ou rendu cassé ?).`);
  }
  return { name, width: info.width, height: info.height, ko: Math.round(bytes / 1024) };
}

/**
 * Ramène les 10 JPEG au 2480 × 3508 exact. Chromium arrondit les millimètres
 * selon les feuilles et le liseré doré ajoute un pixel par bord : sans cela,
 * les pages n'auraient pas toutes la même taille dans le PDF. Même correction
 * que tools/build_browser_print.mjs pour ses propres JPEG. Renvoie false si
 * ImageMagick n'est pas installé — le contrôle accepte alors ±6 px.
 */
function normalizeJpgs(directory, count) {
  if (spawnSync('which', ['convert'], { encoding: 'utf8' }).status !== 0) return false;
  for (let i = 1; i <= count; i++) {
    const file = join(directory, `page-${String(i).padStart(2, '0')}.jpg`);
    const tmp = join(directory, `.normalise-${i}.jpg`);
    const r = spawnSync('convert', [file, '-resize', `${JPG_WIDTH}x${JPG_HEIGHT}!`, '-quality', String(QUALITY), tmp], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ImageMagick n'a pas pu normaliser ${basename(file)} : ${r.stderr.trim()}`);
    renameSync(tmp, file);
  }
  return true;
}

async function main() {
  if (!existsSync(join(ROOT, SRC))) {
    throw new Error(`${SRC} introuvable — lancer d'abord : python3 tools/build_carte.py`);
  }
  const comp = composition(join(ROOT, SRC));
  console.log(`composition : flux ${comp.base} px réduit × ${comp.fit.toFixed(4)} (fenêtre ${comp.viewport} px)`);
  const imagesDir = join(ROOT, IMAGES_DIR);
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });
  mkdirSync(imagesDir, { recursive: true });

  const shots = [];
  const { server, url } = await startStaticServer();
  let browser;
  try {
    // @sparticuz/chromium fournit le navigateur et ses bibliothèques : aucun
    // Chrome système n'est nécessaire, et le rendu ne dépend pas du poste.
    process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
    setupLambdaEnvironment(join(tmpdir(), 'al2023', 'lib'));
    const executablePath = await chromiumBinary.executablePath();
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [...chromiumBinary.args, '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      // La largeur de composition du site, pas une largeur au hasard : les
      // règles responsive du site (colonnes, empilement des prix) se décident
      // sur la fenêtre, et build_carte.py a mesé le flux à cette largeur-là.
      viewport: { width: comp.viewport, height: 1600 },
      // 210 mm = 793,7 px CSS ; × 3,125 = 2 480 px, soit 300 dpi sur papier.
      deviceScaleFactor: 3.125,
    });
    await installLocalFonts(context, ROOT);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load('400 24pt Cinzel'),
        document.fonts.load('700 29pt Cinzel'),
        document.fonts.load('800 29pt Cinzel'),
        document.fonts.load('400 10px Montserrat'),
      ]);
    });
    const pages = await page.evaluate(() => document.querySelectorAll('#print-document .print-page').length);
    if (!pages) throw new Error(`aucune feuille .print-page dans ${SRC}`);
    if (EXPECTED_PAGES && pages !== EXPECTED_PAGES) {
      throw new Error(`--pages ${EXPECTED_PAGES} : ${SRC} en contient ${pages}`);
    }
    const fonts = await checkPageFonts(page);
    console.log(`carte A4 : ${pages} feuilles ; polices = ${fonts.join(', ')}`);

    // Média « screen » : c'est la mise en page écran du site que l'on recopie
    // (ses règles responsive sont toutes sous @media screen). Le contenant A4,
    // lui, est posé par la feuille de style de carte.html.
    await page.waitForTimeout(200);   // laisse la mise en page se stabiliser

    const sheets = page.locator('#print-document .print-page');
    let ecartMax = 0, jeuMini = Infinity;
    for (let i = 0; i < pages; i++) {
      // Rien ne doit dépasser la feuille : sous média print, .print-page est en
      // overflow:hidden — une page trop longue serait rognée à l'écran comme ici,
      // sans un bruit. On mesure, et on s'arrête.
      const cadrage = await sheets.nth(i).evaluate((el) => {
        const zone = el.querySelector('.print-page__content');
        if (!zone) return null;
        const flow = zone.querySelector('.carte-flow');
        const PX_PER_MM = 96 / 25.4;
        const z = zone.getBoundingClientRect();
        const s = el.getBoundingClientRect();
        const f = (flow || el).getBoundingClientRect();   // déjà transformé
        const filet = parseFloat(getComputedStyle(el, '::after').left) / PX_PER_MM;
        return {
          debord: +Math.max(0, f.bottom - z.bottom, f.right - z.right).toFixed(2),
          ecartMM: +((f.left - s.left) - (s.right - f.right)).toFixed(2) / PX_PER_MM,
          jeuMM: +(Math.min(f.left - s.left, s.right - f.right) / PX_PER_MM - filet).toFixed(2),
        };
      });
      if (cadrage && cadrage.debord > SHEET_OVERFLOW_PX) {
        throw new Error(`feuille ${i + 1} : le contenu dépasse le bas de la feuille de ${cadrage.debord} px `
          + `(≈ ${(cadrage.debord * 0.264).toFixed(1)} mm) — il serait rogné. Alléger cette page dans tools/build_carte.py.`);
      }
      if (cadrage && Math.abs(cadrage.ecartMM) > ECART_CENTRAGE_MM) {
        throw new Error(`feuille ${i + 1} : le bloc est décalé de ${cadrage.ecartMM.toFixed(2)} mm `
          + `(gauche/droite inégaux) — le centrage se calcule dans la feuille, après réduction : `
          + `voir --carte-zone-w dans tools/build_carte.py.`);
      }
      if (cadrage && cadrage.jeuMM < JEU_CADRE_MM) {
        throw new Error(`feuille ${i + 1} : le contenu arrive à ${cadrage.jeuMM} mm du filet du cadre — `
          + `il le chevaucherait à l'impression.`);
      }
      if (cadrage) {
        ecartMax = Math.max(ecartMax, Math.abs(cadrage.ecartMM));
        jeuMini = Math.min(jeuMini, cadrage.jeuMM);
      }
      // Capture de l'élément : Playwright l'amène dans le champ tout seul.
      await sheets.nth(i).screenshot({
        path: join(STAGE, `page-${String(i + 1).padStart(2, '0')}.jpg`),
        type: 'jpeg',
        quality: QUALITY,
        scale: 'device',
        animations: 'disabled',
      });
    }
    await context.close();

    const normalisees = normalizeJpgs(STAGE, pages);
    console.log(`cadrage : symétrique à ± ${ecartMax.toFixed(2)} mm et ${jeuMini.toFixed(1)} mm avant le filet du cadre`);
    console.log(normalisees
      ? `  ImageMagick : les ${pages} feuilles ramenées à ${JPG_WIDTH}×${JPG_HEIGHT}`
      : `  ImageMagick absent : feuilles gardées telles que capturées (±${JPG_SLACK} px autour de ${JPG_WIDTH}×${JPG_HEIGHT})`);

    for (let i = 0; i < pages; i++) {
      const name = `page-${String(i + 1).padStart(2, '0')}.jpg`;
      const info = checkJpg(join(STAGE, name), normalisees);
      copyFileSync(join(STAGE, name), join(imagesDir, name));   // remplacé seulement si contrôlé
      shots.push(info);
      console.log(`  ${info.name}  ${info.width}×${info.height}  ${info.ko} Ko`);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  const jpgs = shots.map((_, i) => join(imagesDir, `page-${String(i + 1).padStart(2, '0')}.jpg`));
  if (argv.includes('--jpgs-only')) {
    rmSync(STAGE, { recursive: true, force: true });
    console.log(`\n${IMAGES_DIR}/ : ${shots.length} feuilles A4 300 dpi, PDF non assemblé (--jpgs-only)`);
    return;
  }

  const built = imagesToPdf({ images: jpgs, out: join(ROOT, OUT_NAME), tolerate: 0.005 });
  rmSync(STAGE, { recursive: true, force: true });
  const ko = (n) => Math.round(n / 1024).toLocaleString('fr-FR');   // n en octets
  const total = shots.reduce((a, s) => a + s.ko, 0);   // déjà en Ko
  console.log(`\n${OUT_NAME} : ${built.pages} pages image A4, ${ko(built.bytes)} Ko `
    + `(les JPEG pèsent ${total.toLocaleString('fr-FR')} Ko, embarqués octet pour octet — aucune re-compression)`);
  console.log(`${IMAGES_DIR}/ : les ${shots.length} feuilles, livrables telles quelles.`);
}

main().catch((error) => {
  console.error(`Carte A4 (images) impossible : ${error.message}`);
  console.error('Rappels : npm install (Playwright + Chromium + fontes), puis python3 tools/build_carte.py.');
  process.exitCode = 1;
});
