/* Mention « Métro Gambetta • Ligne 3 » : ouvre l'application Bonjour RATP.
   - Android Chrome : Intent explicite vers le paquet officiel ; si l'app
     manque, Chrome ouvre la page de secours locale (S.browser_fallback_url).
   - iOS et autres mobiles : lien universel HTTPS ; si la page reste au premier
     plan après le tap, l'app n'a pas pris la main, on ouvre la page de secours.
   - Ordinateur : aucun changement, le lien web RATP s'ouvre dans un onglet.
   La page de secours demande la position (départ), puis ouvre l'itinéraire
   RATP avec le départ et l'arrivée remplis. Aucune géolocalisation ici. */
(function () {
  'use strict';

  var FALLBACK_DELAY = 1600;

  var agent = navigator.userAgent || '';
  var tactile = false;
  try {
    tactile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) {}
  tactile = tactile || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(agent);
  if (!tactile) return;
  var androidChrome = /Android/i.test(agent) && /Chrome/i.test(agent) &&
    !/(EdgA|OPR|SamsungBrowser|DuckDuckGo|; wv)/i.test(agent);

  function language() {
    var lang = '';
    try {
      lang = new URLSearchParams(window.location.search).get('lang') || '';
      if (!lang) lang = window.localStorage.getItem('lcg-lang') || '';
    } catch (e) {}
    return /^(fr|en|es|de|it|pt|nl|pl|zh|uk|ja|ko|ar|tr|hi)$/.test(lang) ? lang : '';
  }

  function fallbackUrl() {
    var url = new URL('ratp-fallback.html', window.location.href);
    url.searchParams.set('source', 'metro');
    var lang = language();
    if (lang) url.searchParams.set('lang', lang);
    return url.href;
  }

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    if (!appUrl) return;

    /* Écran tactile : on vise l'application, dans l'onglet courant. */
    lien.href = appUrl;
    lien.removeAttribute('target');

    if (androidChrome) {
      try {
        var app = new URL(appUrl);
        lien.href = 'intent://' + app.host + app.pathname + app.search +
          '#Intent;scheme=https;package=com.fabernovel.ratp;' +
          'S.browser_fallback_url=' + encodeURIComponent(fallbackUrl()) + ';end';
        return;
      } catch (e) {
        lien.href = appUrl;
      }
    }

    lien.addEventListener('click', function () {
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        /* La page est encore visible : l'application ne s'est pas ouverte. */
        if (!document.hidden) window.location.assign(fallbackUrl());
      }, FALLBACK_DELAY);
      function cancel() {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
      }
      document.addEventListener('visibilitychange', cancel, { once: true });
      window.addEventListener('pagehide', cancel, { once: true });
    });
  });
})();
