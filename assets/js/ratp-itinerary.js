/* Mention « Métro Gambetta • Ligne 3 » : ouvre l'application Bonjour RATP.
   - L'application d'abord : le domaine bonjour-ratp.fr est déclaré par l'app
     elle-même (App Links Android pour com.fabernovel.ratp, lien universel iOS),
     donc le lien universel suffit ; sous Android Chrome, un Intent explicite
     vise en plus le paquet officiel.
   - Application absente : le trajet s'ouvre dans un NOUVEL onglet, via la page
     de secours locale, qui demande la position (départ) puis ouvre l'itinéraire
     RATP avec le départ et l'arrivée remplis.
   - Ordinateur : comportement natif du lien (site RATP, nouvel onglet).
   Ce script ne demande jamais la position : c'est la page de secours qui le fait. */
(function () {
  'use strict';

  var REDOUBLE_MS = 1200;

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

  /* Page de secours : position -> itinéraire RATP, départ et arrivée remplis. */
  function pageSecours() {
    var url = new URL('ratp-fallback.html', window.location.href);
    url.searchParams.set('source', 'metro');
    var lang = language();
    if (lang) url.searchParams.set('lang', lang);
    return url.href;
  }

  /* Intent Android : application d'abord ; si elle manque, Chrome ouvre la
     page indiquée par S.browser_fallback_url. */
  function intentUrl(appUrl, secours) {
    var app = new URL(appUrl);
    return 'intent://' + app.host + app.pathname + app.search +
      '#Intent;scheme=https;package=com.fabernovel.ratp;' +
      'S.browser_fallback_url=' + encodeURIComponent(secours) + ';end';
  }

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    if (!appUrl) return;

    /* Écran tactile : le lien vise l'application, jamais un nouvel onglet par
       défaut (c'est le script qui décide, au tap). */
    lien.href = appUrl;
    lien.removeAttribute('target');

    var dernierTap = 0;
    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      if (maintenant - dernierTap < REDOUBLE_MS) {
        event.preventDefault();
        return;
      }
      dernierTap = maintenant;
      event.preventDefault();

      /* 1. Le trajet (ou sa page de secours) dans un nouvel onglet : l'onglet
         courant reste disponible pour l'application. */
      var secours = null;
      try {
        secours = window.open(pageSecours(), '_blank');
      } catch (e) {
        secours = null;
      }

      /* 2. L'application dans l'onglet courant. */
      if (androidChrome) {
        try {
          /* Onglet de secours ouvert : si l'app manque, Chrome revient ici.
             Onglet refusé : la page de secours prend le relais dans l'onglet. */
          window.location.assign(intentUrl(appUrl, secours ? window.location.href : pageSecours()));
        } catch (e) {
          window.location.assign(appUrl);
        }
      } else {
        /* Lien universel (iOS) ou App Links : l'app s'ouvre si elle est là. */
        window.location.assign(appUrl);
      }
    });
  });
})();
