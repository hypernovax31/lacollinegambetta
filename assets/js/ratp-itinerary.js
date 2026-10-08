/* Mention « Métro Gambetta • Ligne 3 » : ouvre l'application Bonjour RATP.
   - Le clic vise l'APPLICATION d'abord, dans l'onglet courant : iOS reçoit le
     lien universel bonjour-ratp.fr (celui que l'app déclare elle-même dans son
     apple-app-site-association), Android Chrome un Intent explicite vers le
     paquet com.fabernovel.ratp. C'est la seule façon pour iOS et Android de
     proposer l'application : depuis un onglet en arrière-plan, le système
     refuse ce lancement.
   - Si l'application ne prend pas la main (page toujours visible), le trajet
     s'ouvre automatiquement : nouvel onglet sur ratp.fr si le navigateur
     l'autorise, sinon dans l'onglet courant.
   - Ordinateur : comportement natif du lien (site RATP, nouvel onglet).
   Aucune page intermédiaire, aucune demande de position par le site. */
(function () {
  'use strict';

  /* Délai laissé à l'application : au-delà, la page est toujours visible,
     donc rien ne s'est ouvert. */
  var DELAI_APP = 1500;
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

  /* Intent Android : application d'abord ; si elle manque, Chrome ouvre le
     trajet RATP (arrivée remplie), sans page intermédiaire. */
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
       défaut (c'est le script qui décide, au clic). */
    lien.href = appUrl;
    lien.removeAttribute('target');

    var dernierClic = 0;
    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      event.preventDefault();
      if (maintenant - dernierClic < REDOUBLE_MS) return;
      dernierClic = maintenant;

      /* L'application a pris la main : la page passe en arrière-plan ou est
         quittée. On renonce alors au trajet : c'est l'app qui calcule. */
      var applicationOuverte = false;
      window.addEventListener('pagehide', function () { applicationOuverte = true; }, { once: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) applicationOuverte = true;
      }, { once: true });

      /* Filet de sécurité : si rien ne s'est ouvert (application absente et
         lancement bloqué, navigateur intégré par exemple), le trajet RATP
         s'ouvre tout seul, arrivée remplie. */
      window.setTimeout(function () {
        if (applicationOuverte || document.hidden) return;
        var onglet = null;
        try {
          onglet = window.open(trajet, '_blank');
        } catch (e) {
          onglet = null;
        }
        if (!onglet) window.location.assign(trajet);
      }, DELAI_APP);

      /* L'application maintenant : c'est ce clic qui la propose. */
      if (androidChrome) {
        try {
          window.location.assign(intentUrl(appUrl, trajet));
        } catch (e) {
          window.location.assign(appUrl);
        }
      } else {
        window.location.assign(appUrl);
      }
    });
  });
})();
