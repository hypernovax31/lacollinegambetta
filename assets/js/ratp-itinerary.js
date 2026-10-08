/* Mention « Métro Gambetta • Ligne 3 » : ouvre l'application Bonjour RATP.
   - L'application d'abord : le domaine bonjour-ratp.fr est déclaré par l'app
     elle-même (App Links Android pour com.fabernovel.ratp, lien universel iOS),
     donc le lien universel suffit ; sous Android Chrome, un Intent explicite
     vise en plus le paquet officiel.
   - Application absente : le trajet est déjà ouvert dans un NOUVEL onglet sur
     ratp.fr, arrivée remplie (l'onglet courant revient simplement au site).
   - Ordinateur : comportement natif du lien (site RATP, nouvel onglet).
   Aucune page intermédiaire, aucune demande de position par le site. */
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

  /* Intent Android : application d'abord ; si elle manque, Chrome ouvre la
     page indiquée par S.browser_fallback_url (ici, le trajet déjà ouvert dans
     un nouvel onglet, ou la page courante pour ne rien afficher en double). */
  function intentUrl(appUrl, repli) {
    var app = new URL(appUrl);
    return 'intent://' + app.host + app.pathname + app.search +
      '#Intent;scheme=https;package=com.fabernovel.ratp;' +
      'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
  }

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    var trajet = lien.getAttribute('href');
    if (!appUrl || !trajet) return;

    /* Écran tactile : le lien vise l'application, jamais un nouvel onglet par
       défaut (c'est le script qui décide, au tap). */
    lien.href = appUrl;
    lien.removeAttribute('target');

    var dernierTap = 0;
    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      event.preventDefault();
      if (maintenant - dernierTap < REDOUBLE_MS) return;
      dernierTap = maintenant;

      /* 1. Le trajet RATP dans un nouvel onglet : c'est lui que l'internaute
         garde, application installée ou non. */
      var onglet = null;
      try {
        onglet = window.open(trajet, '_blank');
      } catch (e) {
        onglet = null;
      }
      /* Onglet refusé par le navigateur : le trajet prendra la place courante. */
      var repli = onglet ? window.location.href : trajet;

      /* 2. L'application dans l'onglet courant. */
      if (androidChrome) {
        try {
          window.location.assign(intentUrl(appUrl, repli));
        } catch (e) {
          window.location.assign(appUrl);
        }
      } else {
        /* Lien universel : iOS propose ou ouvre Bonjour RATP. */
        window.location.assign(appUrl);
      }
    });
  });
})();
