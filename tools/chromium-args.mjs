// tools/chromium-args.mjs
//
// Arguments Chromium des outils de la carte, adaptés à l'environnement.
//
// Le paquet @sparticuz/chromium propose des arguments pensés pour AWS Lambda :
// --single-process, --in-process-gpu, --use-gl=angle --use-angle=swiftshader…
// Sur certains environnements (sandbox de build sans GPU), l'initialisation
// ANGLE/SwiftShader échoue et fait planter le navigateur dès le lancement.
// On retire ces arguments et on désactive le GPU : le rendu du DOM et des
// pages (texte, mise en page, couleurs) est assuré par Skia en logiciel — les
// hauteurs mesurées et les JPEG des feuilles sont identiques.
import chromiumBinary from '@sparticuz/chromium';

const EXCLUS = [
  'single-process', 'swiftshader', 'gl=angle', 'use-angle',
  'in-process-gpu', 'ignore-gpu-blocklist', 'enable-unsafe',
];

export function carteChromiumArgs() {
  const args = chromiumBinary.args.filter(
    (a) => !EXCLUS.some((b) => a.includes(b)),
  );
  args.push('--disable-gpu');
  return args;
}
