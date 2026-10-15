/* Conserve les aperçus de fêtes et la langue dans la navigation interne.
   Les vrais liens restent utilisables (nouvel onglet, clavier, sans JS). */
(function () {
  'use strict';
  var KEY = 'lcg-cover-context-v1';
  var PARAMS = ['fete', 'fetes', 'halloween', 'sorciere', 'noel', 'lang'];
  var PAGES = ['index.html', 'reservation.html', 'mentions-legales.html', 'confidentialite.html', '404.html'];
  function pageName(url) { return url.pathname.split('/').pop() || 'index.html'; }
  function isInternal(url) { return url.origin === location.origin && PAGES.indexOf(pageName(url)) !== -1; }
  function context(url) {
    var result = new URLSearchParams();
    PARAMS.forEach(function (key) {
      if (url.searchParams.has(key)) result.set(key, url.searchParams.get(key));
    });
    return result;
  }
  var current = new URL(location.href);
  var home = pageName(current) === 'index.html';
  var saved;
  try {
    var stored = sessionStorage.getItem(KEY);
    saved = stored ? new URL(stored, location.origin) : null;
    if (saved && (!isInternal(saved) || pageName(saved) !== 'index.html')) saved = null;
  } catch (e) { saved = null; }
  // Le referrer est utile lors d'une ouverture dans un nouvel onglet.
  if (!home && !saved && document.referrer) {
    try {
      var ref = new URL(document.referrer);
      if (isInternal(ref) && pageName(ref) === 'index.html') saved = ref;
    } catch (e) {}
  }
  var cover = home ? new URL(current.href) : (saved || new URL('index.html', current));
  cover.hash = 'cover-section';
  var inherited = context(cover);
  context(current).forEach(function (value, key) { inherited.set(key, value); });
  inherited.forEach(function (value, key) { cover.searchParams.set(key, value); });
  if (home) {
    try { sessionStorage.setItem(KEY, cover.href); } catch (e) {}
  }
  function update(link) {
    var raw = link.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || link.hasAttribute('download')) return;
    var url;
    try { url = new URL(raw, location.href); } catch (e) { return; }
    if (!isInternal(url)) return;
    if (pageName(url) === 'index.html' && (!url.hash || url.hash === '#cover-section')) {
      link.href = cover.href;
    } else {
      inherited.forEach(function (value, key) {
        if (!url.searchParams.has(key)) url.searchParams.set(key, value);
      });
      link.href = url.href;
    }
  }
  document.querySelectorAll('a[href]').forEach(update);
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (link) update(link);
  }, true);
  // Un changement de langue doit aussi se retrouver dans les liens de retour.
  window.addEventListener('lcg-lang-changed', function (event) {
    var lang = event.detail && event.detail.lang;
    if (!lang) return;
    inherited.set('lang', lang);
    cover.searchParams.set('lang', lang);
    try { sessionStorage.setItem(KEY, cover.href); } catch (e) {}
    document.querySelectorAll('a[href]').forEach(function (link) {
      var url;
      try { url = new URL(link.href); } catch (e) { return; }
      if (isInternal(url)) { url.searchParams.set('lang', lang); link.href = url.href; }
    });
  });
})();
