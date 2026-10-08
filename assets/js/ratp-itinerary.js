/* Mention « Métro Gambetta • Ligne 3 » : au clic, demande d'ouvrir
   l'application Bonjour RATP. Si l'application n'est pas là, le trajet
   s'ouvre dans un NOUVEL onglet sur ratp.fr — la page du site du restaurant
   n'est jamais écrasée. Et c'est tout.

   - Android Chrome : Intent explicite vers com.fabernovel.ratp, avec le trajet
     RATP en repli natif (S.browser_fallback_url) : si l'application est
     absente, Chrome ouvre lui-même le trajet ; si l'utilisateur annule le
     sélecteur, rien ne se passe et la page du site reste.
   - iOS et autres mobiles : le clic émet le schéma d'application ratp://
     (c'est lui qui déclenche la boîte « Ouvrir dans Bonjour RATP ? ») dans
     une iframe jetable — la page courante n'est jamais remplacée (Safari
     afficherait sinon « Impossible d'ouvrir la page » si l'app est absente).
     Si l'application ne prend pas la main, le trajet s'ouvre dans un nouvel
     onglet, arrivée remplie.
   - Ordinateur : lien natif vers ratp.fr, nouvel onglet.

   Aucune page intermédiaire, aucune bannière, aucun lien manuel, aucune
   demande de position. */
(function () {
  'use strict';

  var SCHEMA_APP = 'ratp://';
  var ATTENTE_APP = 2500;
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

  function naviguer(url) {
    try {
      window.location.assign(url);
    } catch (e) {
      window.location.href = url;
    }
  }

  /* Intent Android : application visée ; si elle est absente, Chrome ouvre
     lui-même le trajet RATP (arrivée remplie), sans page intermédiaire. */
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

    /* Écran tactile : le lien vise l'application (lien universel) pour le cas
       sans JavaScript ; le clic, lui, passe par la demande système. */
    lien.href = appUrl;
    lien.removeAttribute('target');

    var dernierClic = 0;
    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      event.preventDefault();
      if (maintenant - dernierClic < REDOUBLE_MS) return;
      dernierClic = maintenant;

      /* L'application a pris la main : la page passe en arrière-plan. */
      var applicationOuverte = false;
      window.addEventListener('pagehide', function () { applicationOuverte = true; }, { once: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) applicationOuverte = true;
      }, { once: true });

      if (androidChrome) {
        /* Android Chrome : l'Intent gère tout nativement. Application absente
           -> Chrome ouvre lui-même le trajet RATP ; annulé -> rien ne se
           passe, la page du site reste. Le site n'ajoute rien d'autre. */
        naviguer(intentUrl(appUrl, trajet));
        return;
      }

      /* iOS et autres mobiles : demande d'ouverture via le schéma, dans une
         iframe jetable — jamais dans la page courante, que Safari remplacerait
         par « Impossible d'ouvrir la page » si l'application est absente. */
      var essai = document.createElement('iframe');
      essai.style.display = 'none';
      essai.setAttribute('aria-hidden', 'true');
      essai.tabIndex = -1;
      essai.src = SCHEMA_APP;
      document.body.appendChild(essai);

      window.setTimeout(function () {
        if (essai.parentNode) essai.parentNode.removeChild(essai);
        /* L'application s'est ouverte : on ne touche à rien. */
        if (applicationOuverte || document.hidden) return;
        /* L'application n'est pas là (absente, ou ouverture annulée — le
           navigateur ne signale pas la différence) : le trajet s'ouvre dans
           un NOUVEL onglet, la page du site n'est pas écrasée. */
        var onglet = null;
        try {
          onglet = window.open(trajet, '_blank');
        } catch (e) {
          onglet = null;
        }
        /* Dernier recours si le navigateur bloque le nouvel onglet. */
        if (!onglet) naviguer(trajet);
      }, ATTENTE_APP);
    });
  });
})();
