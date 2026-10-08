/* Mention « Métro Gambetta • Ligne 3 » : demande d'ouverture de l'application
   Bonjour RATP, uniquement au clic.

   - Le clic vise d'abord le SCHÉMA D'APPLICATION : c'est ce qui déclenche la
     demande du système (« Ouvrir dans Bonjour RATP ? »). Un simple lien web
     ouvrirait l'application sans rien demander, et le système refuse en plus
     ce lancement depuis un onglet déjà passé en arrière-plan.
   - Android Chrome reçoit en plus un Intent explicite vers le paquet officiel,
     avec le trajet RATP en repli natif.
   - Si l'application ne prend pas la main (page toujours visible, lancement
     bloqué par un navigateur intégré, application absente), le trajet s'ouvre
     tout seul sur ratp.fr/itineraires, arrivée remplie : nouvel onglet si le
     navigateur l'autorise, sinon l'onglet courant.
   - Ordinateur : comportement natif du lien (site RATP, nouvel onglet).

   Aucune page intermédiaire, aucune bannière, aucune demande de position. */
(function () {
  'use strict';

  /* Schéma d'application : c'est lui qui fait apparaître la demande
     « Ouvrir dans Bonjour RATP ? ». S'il n'est pas reconnu par l'appareil,
     le repli ci-dessous ouvre le trajet RATP : rien ne reste bloqué. */
  var SCHEMA_APP = 'ratp://';
  var ATTENTE_APP = 2500;      /* le temps de répondre à la demande système */
  var ATTENTE_ANDROID = 2000;
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

  /* Intent Android : application d'abord ; si elle manque, Chrome ouvre le
     trajet RATP (arrivée remplie), sans page intermédiaire. */
  function intentUrl(appUrl, repli) {
    var app = new URL(appUrl);
    return 'intent://' + app.host + app.pathname + app.search +
      '#Intent;scheme=https;package=com.fabernovel.ratp;' +
      'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
  }

  /* Le trajet RATP : nouvel onglet si le navigateur l'autorise. */
  function ouvrirTrajet(trajet) {
    var onglet = null;
    try {
      onglet = window.open(trajet, '_blank');
    } catch (e) {
      onglet = null;
    }
    if (!onglet) naviguer(trajet);
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

      /* L'application a pris la main : la page passe en arrière-plan ou est
         quittée. On renonce alors au trajet, c'est l'app qui calcule. */
      var applicationOuverte = false;
      window.addEventListener('pagehide', function () { applicationOuverte = true; }, { once: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) applicationOuverte = true;
      }, { once: true });

      /* Demande d'ouverture de l'application, tout de suite, dans l'onglet
         courant : schéma sur iOS et les autres mobiles, Intent avec paquet
         officiel sur Android Chrome. */
      if (androidChrome) {
        naviguer(intentUrl(appUrl, trajet));
      } else {
        naviguer(SCHEMA_APP);
      }

      /* Rien ne s'est ouvert : le trajet RATP prend le relais. */
      function trajetSiRien(delai) {
        window.setTimeout(function () {
          if (applicationOuverte || document.hidden) return;
          ouvrirTrajet(trajet);
        }, delai);
      }
      trajetSiRien(androidChrome ? ATTENTE_ANDROID : ATTENTE_APP);
    });
  });
})();
