const { JSDOM } = require('jsdom');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const code = readFileSync('assets/js/itineraire.js', 'utf8');
let count = 0;
for (const file of ['index.html','reservation.html','mentions-legales.html','confidentialite.html','404.html']) {
  const dom = new JSDOM(readFileSync(file, 'utf8'), { url: 'https://lacollinegambetta.com/' + file, runScripts: 'outside-only' });
  dom.window.eval(code);
  for (const link of dom.window.document.querySelectorAll('a[data-nav-route], a[data-metro-route], a[data-map-address]')) {
    const metro = link.hasAttribute('data-metro-route');
    const fallback = new URL(link.href);
    const destination = fallback.searchParams.get('destination') || fallback.searchParams.get('query');
    assert.ok(destination.includes(metro ? 'Station Gambetta' : '4 rue Belgrand'), file + ' fallback');
    assert.ok(!destination.includes('La Colline'), file + ' ambiguous name');
    if (link.hasAttribute('data-nav-route') || metro) {
      link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      const google = new URL(dom.window.document.querySelector('.itin__app--google').href);
      assert.ok(google.searchParams.get('destination').includes(metro ? 'Station Gambetta' : '4 rue Belgrand'));
      if (!metro) assert.equal(google.searchParams.get('destination_place_id'), 'ChIJF8cwdNBt5kcRaUhXDrZCsKw');
      if (metro) assert.equal(google.searchParams.get('travelmode'), 'transit');
      const waze = dom.window.document.querySelector('.itin__app--waze');
      if (waze) assert.ok(new URL(waze.href).searchParams.get('q').includes('4 rue Belgrand'));
    }
    count++;
  }
  dom.window.close();
}
console.log(count + ' liens vérifiés : restaurant au 4 rue Belgrand et métro à la station Gambetta.');
