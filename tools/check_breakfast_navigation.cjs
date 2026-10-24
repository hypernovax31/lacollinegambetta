// Clic Réservation → Nos menus → bloc petits-déjeuners, sans animations concurrentes.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const reservation = fs.readFileSync('reservation.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://lacollinegambetta.com/index.html?lang=de&noel=1#menu-petit-dejeuner',
  runScripts: 'outside-only'
});
const w = dom.window;
const doc = w.document;
const booking = new JSDOM(reservation);
assert.equal(booking.window.document.querySelector('.hours__minimal-note a').textContent,
  'Formules Petits-Déjeuners jusqu’à 12 h');
assert.equal(booking.window.document.querySelector('.hours__minimal-note a').getAttribute('href'),
  'index.html#menu-petit-dejeuner');
booking.window.close();
const frames = [], stable = [], animations = [], locks = [], views = [];
w.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
w.cancelAnimationFrame = () => {};
w.centerMenuNavButton = () => {};
w.syncMenuNavHints = () => {};
w.showView = view => views.push(view);
w.quandSectionStable = (section, callback) => stable.push(callback);
w.animateScrollTo = (top, duration, live) => animations.push({ top, live });
w.lockSectionAnchor = (target, offset) => locks.push({ target, offset });
Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 3000 });
Object.defineProperty(w, 'innerHeight', { value: 700 });
for (const [el, height] of [[doc.querySelector('.top-controls'), 60], [doc.getElementById('menu-nav-wrap'), 70]]) {
  Object.defineProperty(el, 'offsetHeight', { value: height });
}
let breakfastTop = 950;
doc.getElementById('menus').getBoundingClientRect = () => ({ top: 500 });
doc.getElementById('menu-petit-dejeuner').getBoundingClientRect = () => ({ top: breakfastTop });
const switchFunction = html.slice(html.indexOf('function showMenuSection('), html.indexOf('/* Verrou d\'ancre :'));
const hashFunction = html.slice(html.indexOf('function openInteractiveMenuIfHashed()'), html.indexOf('\nopenInteractiveMenuIfHashed();'));
w.eval('let __menuSwitchGen = 0;\n' + switchFunction + '\n' + hashFunction);
w.openInteractiveMenuIfHashed();
while (frames.length) frames.shift()();
assert.equal(animations.length, 0, 'Attendre que la rubrique soit stable');
while (stable.length) stable.shift()();
assert.deepEqual(views, ['menu']);
assert.equal(animations.length, 1, 'Une seule animation vers le bloc, pas vers le haut de rubrique');
assert.equal(animations[0].top, 810);
breakfastTop = 980;
assert.equal(animations[0].live(), 840, 'La cible suit une mise en page tardive');
assert.equal(locks.at(-1).target.id, 'menu-petit-dejeuner');
assert.equal(locks.at(-1).offset(), 140);
assert(doc.getElementById('menus').classList.contains('active'));
assert.equal(w.location.search, '?lang=de&noel=1');
assert.equal(w.location.hash, '');
const button = [...doc.querySelectorAll('#menu-nav .nav-btn')].find(el => el.getAttribute('onclick').includes("'menus'"));
w.showMenuSection('menus', button);
while (stable.length) stable.shift()();
assert.equal(animations.at(-1).top, 360, 'Le clic habituel Nos menus conserve sa cible');
assert.equal(locks.at(-1).target.id, 'menus');
dom.window.close();
console.log('Réservation → Formules petits-déjeuners : libellé, onglet, cible, animation unique et contexte OK.');
