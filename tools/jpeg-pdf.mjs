/**
 * Assemblage de JPEG en un PDF A4 unique, sans dépendance externe.
 *
 * Un JPEG est déjà un flux d'images compressé : un PDF n'a rien à recomposer,
 * il lui suffit d'embarquer le fichier tel quel (`/DCTDecode`). Aucune
 * re-compression, aucune perte, aucun Ghostscript ou ImageMagick requis.
 *
 *   import { imagesToPdf } from './jpeg-pdf.mjs';
 *   imagesToPdf({ images: ['page-01.jpg', …], out: 'carte-a4.pdf' });
 *
 * En ligne de commande, pour réassembler le PDF à partir des JPEG déjà rendus
 * (sans relancer Chromium ni refaire la mise en page) :
 *
 *   node tools/jpeg-pdf.mjs                          # carte-a4-pages/ → carte-a4.pdf
 *   node tools/jpeg-pdf.mjs --dir dossier --out x.pdf
 *   node tools/jpeg-pdf.mjs page-01.jpg page-02.jpg --out x.pdf
 *
 * Chaque page du PDF obtenu mesure exactement un A4 (595,28 × 841,89 pt) et
 * l'image y est étalée en pleine feuille : il faut donc des JPEG au format
 * A4 (2480 × 3508 px = 300 dpi), ce que imagesToPdf() contrôle.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A4 en points (1 pt = 1/72 in). 210 mm × 297 mm. */
export const A4_PT = { width: 595.2756, height: 841.8898 };

/** Dimensions et espace colorimétrique d'un JPEG, lus dans son en-tête. */
export function jpegInfo(path) {
  const buf = readFileSync(path);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(`${path} : pas un JPEG (en-tête FFD8 absent)`);
  let p = 2;
  while (p + 9 < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const marker = buf[p + 1];
    const len = (buf[p + 2] << 8) | buf[p + 3];
    // SOF0..SOF15, hors DHT(0xC4)/JPG(0xC8)/DAC(0xCC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const precision = buf[p + 4];
      const height = (buf[p + 5] << 8) | buf[p + 6];
      const width = (buf[p + 7] << 8) | buf[p + 8];
      const components = buf[p + 9];
      return {
        buf,
        width,
        height,
        components,
        precision,
        colorSpace: components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK' : '/DeviceRGB',
      };
    }
    if (marker === 0xd9) break;                       // fin d'image
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) p += 2;   // sans longueur
    else p += 2 + len;
  }
  throw new Error(`${path} : marqueur de dimensions JPEG (SOF) introuvable`);
}

/**
 * @param {{ images: string[], out: string, pageWidth?: number, pageHeight?: number, tolerate?: number }} o
 *   `images` : JPEG dans l'ordre des pages. `tolerate` : écart d'aspect toléré (fraction).
 */
export function imagesToPdf(o) {
  const { images, out } = o;
  if (!images?.length) throw new Error('imagesToPdf : aucune image');
  const W = o.pageWidth ?? A4_PT.width;
  const H = o.pageHeight ?? A4_PT.height;
  const tolerate = o.tolerate ?? 0.005;
  const pageAspect = W / H;

  const infos = images.map((file, i) => {
    const info = jpegInfo(file);
    if (info.precision !== 8) throw new Error(`${file} : profondeur ${info.precision} bits, seuls les JPEG 8 bits sont acceptés`);
    const aspect = info.width / info.height;
    if (Math.abs(aspect - pageAspect) / pageAspect > tolerate) {
      throw new Error(`${file} : format ${info.width}×${info.height} (ratio ${aspect.toFixed(4)}) incompatible avec une feuille A4 `
        + `(ratio ${pageAspect.toFixed(4)}) — la page serait déformée. Rendu attendu : 2480×3508 px.`);
    }
    return info;
  });

  const chunks = [];
  let pos = 0;
  const push = (part) => { const b = Buffer.isBuffer(part) ? part : Buffer.from(part, 'binary'); chunks.push(b); pos += b.length; return pos - b.length; };

  const offsets = [];
  const objects = [];                      // [numéro, function d'écriture]
  let next = 1;
  const catalog = next++;
  const pages = next++;
  const perImage = [];
  for (let i = 0; i < infos.length; i++) {
    perImage.push({ page: next++, content: next++, image: next++ });
  }

  objects.push([catalog, () => `<< /Type /Catalog /Pages ${pages} 0 R >>`]);
  objects.push([pages, () => `<< /Type /Pages /Count ${infos.length} /Kids [${perImage.map(p => `${p.page} 0 R`).join(' ')}] >>`]);

  infos.forEach((info, i) => {
    const { page, content, image } = perImage[i];
    objects.push([page, () => `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${round(W)} ${round(H)}] `
      + `/Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`]);
    objects.push([content, () => {
      const stream = `q ${round(W)} 0 0 ${round(H)} 0 0 cm /Im0 Do Q`;
      return `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`;
    }]);
    objects.push([image, () => {
      const extra = info.components === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
      const head = `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} `
        + `/ColorSpace ${info.colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${info.buf.length}${extra} >>\nstream\n`;
      return { head: Buffer.from(head, 'binary'), body: info.buf, tail: Buffer.from('\nendstream', 'binary') };
    }]);
  });

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');       // ligne binaire : le fichier est binaire
  const written = new Map();
  for (const [num, build] of objects) {
    const payload = build();
    const start = push(`${num} 0 obj\n`);
    if (payload.head) {                          // flux binaire : le JPEG, tel quel
      push(payload.head); push(payload.body); push(payload.tail); push('\n');
    } else {
      push(`${payload}\n`);
    }
    push('endobj\n');
    written.set(num, start);
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let num = 1; num <= objects.length; num++) {   // objets numérotés à la suite
    xref += `${String(written.get(num)).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  writeFileSync(out, Buffer.concat(chunks));
  return { out, pages: infos.length, bytes: pos, width: W, height: H };
}

const round = (n) => (Math.round(n * 1000) / 1000).toString();

/* ---------------------------------------------------------------- ligne de commande
   Réassembler le PDF à partir des JPEG déjà rendus. Utile quand les feuilles
   sont bonnes et qu'on ne veut que le PDF : c'est l'étape finale de
   build_carte_pdf.mjs, isolée, sans Chromium ni remise en page.

   Les pages sont prises dans l'ordre de leur nom (page-01, page-02, …), et non
   dans celui, arbitraire, que renvoie le système de fichiers : un tri naturel
   met page-10 après page-09, là où un tri de texte le placerait après page-01. */

/** Les JPEG d'un dossier, triés dans l'ordre humain des nombres qu'ils portent. */
export function jpegsFromDir(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`${directory} : dossier introuvable`);
  }
  const files = readdirSync(directory).filter((f) => /\.jpe?g$/i.test(f));
  if (!files.length) throw new Error(`${directory} : aucun JPEG`);
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  return files.sort(collator.compare).map((f) => join(directory, f));
}

function cli(argv) {
  const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = flag('--dir', join(root, 'carte-a4-pages'));
  const out = resolve(flag('--out', join(root, 'carte-a4.pdf')));
  // fichiers nommés explicitement (tout ce qui n'est ni une option ni sa valeur)
  const named = argv.filter((a, i) => !a.startsWith('--')
    && !(i > 0 && ['--dir', '--out'].includes(argv[i - 1])));
  const images = named.length ? named.map((f) => resolve(f)) : jpegsFromDir(dir);

  for (const f of images) if (!existsSync(f)) throw new Error(`${f} : fichier introuvable`);
  const built = imagesToPdf({ images, out, tolerate: 0.005 });

  const octets = images.reduce((total, f) => total + statSync(f).size, 0);
  const ko = (n) => Math.round(n / 1024).toLocaleString('fr-FR');
  console.log(`${images.length} feuilles → ${basename(out)}`);
  for (const f of images) {
    const info = jpegInfo(f);
    console.log(`  ${basename(f).padEnd(12)} ${info.width}×${info.height}  ${ko(statSync(f).size)} Ko`);
  }
  console.log(`\n${basename(out)} : ${built.pages} pages A4 `
    + `(${round(built.width)} × ${round(built.height)} pt), ${ko(built.bytes)} Ko — `
    + `les JPEG pèsent ${ko(octets)} Ko, embarqués octet pour octet, aucune re-compression.`);
}

// exécuté directement (et non importé) : on assemble.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(`Assemblage impossible : ${error.message}`);
    process.exitCode = 1;
  }
}
