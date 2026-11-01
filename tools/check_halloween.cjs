#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(ROOT, 'assets/js/halloween.js'), 'utf8');
// Observer l'état interne uniquement dans le test, sans exposer de nouvelle API publique.
const marker = 'api.feuilles = function () { return feuilles.length; };';
assert(original.includes(marker));
const source = original.replace(marker, marker + '\nwindow.__testLeaves = function () { return feuilles; };');
function setup(width, height, { eco = false, reduced = false, disabled = false } = {}) {
  const dom = new JSDOM('<!doctype html><html data-sorciere="1"><body></body></html>', {
    url: 'https://lacollinegambetta.com/?' + (disabled ? 'fete=0' : 'halloween=1'),
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.innerWidth = width; w.innerHeight = height; w.devicePixelRatio = 3;
  w.matchMedia = query => ({ matches: reduced && query.includes('prefers-reduced-motion'), addListener() {}, addEventListener() {} });
  Object.defineProperty(w.navigator, 'connection', { value: { saveData: eco } });
  w.setTimeout = (fn, delay) => { if (delay === 180) fn(); return 1; };
  let frames = new Map(), next = 0, drawings = 0;
  w.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  w.cancelAnimationFrame = id => frames.delete(id);
  const ctx = new Proxy({}, { get: (_, key) => key === 'fill' ? () => drawings++ : () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.eval(source);
  return { w, dom, frames, drawings: () => drawings };
}
for (const [width, height] of [[390, 844], [844, 390], [1440, 900], [1920, 1080], [3840, 2160]]) {
  const { w, dom, frames, drawings } = setup(width, height);
  const leaves = w.__testLeaves();
  const oldCount = Math.max(16, Math.min(34, Math.round(width * height / 40000)));
  assert.equal(leaves.length, Math.max(6, Math.min(14, Math.round(width * height / 100000))));
  assert(leaves.length < oldCount / 2);
  for (const f of leaves) assert(f.r >= 12 && f.r <= 24, 'Feuilles plus grandes, rayon 12–24 px');
  assert.equal(w.document.querySelector('#halloween-feuilles').getAttribute('aria-hidden'), 'true');
  for (const [id, fn] of [...frames]) { frames.delete(id); fn(16); }
  assert.equal(drawings(), leaves.length, 'Chaque feuille doit être dessinée');
  const initialCount = leaves.length;
  w.innerWidth = 390; w.innerHeight = 844;
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(w.__lcgSorciere.feuilles(), 6);
  Object.defineProperty(w.document, 'hidden', { configurable: true, value: true });
  w.document.dispatchEvent(new w.Event('visibilitychange')); assert.equal(frames.size, 0);
  Object.defineProperty(w.document, 'hidden', { configurable: true, value: false });
  w.document.dispatchEvent(new w.Event('visibilitychange')); assert(frames.size > 0);
  w.__lcgSorciere.pause(); assert.equal(frames.size, 0, 'Pause : aucune boucle restante');
  w.__lcgSorciere.resume(); assert(frames.size > 0);
  dom.window.close();
  console.log(`✓ ${width}×${height} : ${initialCount} feuilles, ancien plafond ${oldCount}`);
}
{
  const { w, dom } = setup(1920, 1080, { eco: true });
  assert.equal(w.__lcgSorciere.feuilles(), 4);
  assert.equal(w.document.querySelector('canvas').width, 1920);
  dom.window.close();
}
for (const options of [{ reduced: true }, { disabled: true }]) {
  const { w, dom, frames } = setup(1920, 1080, options);
  assert.equal(w.document.querySelector('#halloween-feuilles'), null);
  assert.equal(frames.size, 0);
  dom.window.close();
}
const css = fs.readFileSync(path.join(ROOT, 'assets/css/halloween.css'), 'utf8');
assert(/@media print\s*\{\s*#halloween-feuilles\s*\{\s*display:none !important/.test(css));
console.log('✓ Économie de données, réduction des animations, désactivation et impression préservées.');
