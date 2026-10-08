/* Mention « Métro Gambetta • Ligne 3 » : au clic, demande d'ouvrir
   l'application Bonjour RATP (comme le plan le fait pour l'adresse postale).
   Si l'utilisateur refuse d'ouvrir l'application ou ne l'a pas installée,
   une nouvelle page / un nouvel onglet s'ouvre sur le site de la RATP, avec
   le lieu actuel de l'utilisateur en DÉPART et l'adresse du restaurant en
   ARRIVÉE. Et c'est tout.

   - Android Chrome : Intent explicite vers com.fabernovel.ratp, avec en repli
     natif (S.browser_fallback_url) la page courante marquée ?ratp=1 : si
     l'application est absente, Chrome recharge la page, qui ouvre alors le
     site RATP. Si l'utilisateur annule le sélecteur, rien ne se passe.
   - iOS et autres mobiles : le clic émet le schéma d'application ratp://
     (c'est lui qui déclenche la boîte « Ouvrir dans Bonjour RATP ? ») dans
     une iframe jetable — la page courante n'est jamais remplacée. Si
     l'application ne prend pas la main (refus ou application absente), le
     site RATP s'ouvre dans un nouvel onglet.
   - Le lieu actuel n'est demandé (géolocalisation du navigateur, convertie
     en adresse par la Base Adresse Nationale) que quand le site RATP doit
     s'ouvrir : jamais si l'application s'ouvre, jamais au chargement.
   - Ordinateur : lien natif vers ratp.fr, nouvel onglet.

   Aucune page intermédiaire, aucune bannière, aucun lien manuel. */
(function () {
  'use strict';

  var SCHEMA_APP = 'ratp://';
  var ATTENTE_APP = 2000;
  var REDOUBLE_MS = 1200;
  var PARAM_RETOUR = 'ratp'; /* ?ratp=1 : retour de l'Intent Android sans application */
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;

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
     lui-même le repli (ici, la page courante marquée ?ratp=1). */
  function intentUrl(appUrl, repli) {
    var app = new URL(appUrl);
    return 'intent://' + app.host + app.pathname + app.search +
      '#Intent;scheme=https;package=com.fabernovel.ratp;' +
      'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
  }

  /* Lieu actuel de l'utilisateur, converti en adresse par la Base Adresse
     Nationale. Renvoie null si la position est refusée ou inutilisable. */
  function lieuActuel() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      var fini = false;
      function terminer(adresse) {
        if (fini) return;
        fini = true;
        resolve(adresse);
      }
      navigator.geolocation.getCurrentPosition(function (position) {
        var lon = position.coords.longitude;
        var lat = position.coords.latitude;
        var controleur = null;
        var delai = null;
        try {
          controleur = new AbortController();
          delai = setTimeout(function () { controleur.abort(); }, 5000);
        } catch (e) {
          controleur = null;
          delai = null;
        }
        fetch(REVERSE_ENDPOINT + '?lon=' + lon + '&lat=' + lat,
              controleur ? { signal: controleur.signal } : {})
          .then(function (r) { return r.json(); })
          .then(function (donnees) {
            if (delai) clearTimeout(delai);
            var feature = donnees && donnees.features && donnees.features[0];
            var label = feature && feature.properties && feature.properties.label;
            terminer(label || null);
          })
          .catch(function () {
            if (delai) clearTimeout(delai);
            terminer(null);
          });
      }, function () { terminer(null); },
      { timeout: GEOLOC_TIMEOUT, maximumAge: 300000 });
      setTimeout(function () { terminer(null); }, GEOLOC_TIMEOUT + 6000);
    });
  }

  /* URL du trajet RATP : DÉPART = lieu actuel (quand on le connaît),
     ARRIVÉE = adresse du restaurant (déjà dans le href du lien). */
  function urlTrajet(trajet, adresse) {
    if (!adresse) return trajet;
    var separateur = trajet.indexOf('?') === -1 ? '?' : '&';
    return trajet + separateur + 'start=' + encodeURIComponent(adresse);
  }

  /* Ouvrir le site RATP : nouvel onglet si le navigateur l'autorise,
     sinon la page courante. Le départ est le lieu actuel. */
  function ouvrirTrajet(trajet) {
    lieuActuel().then(function (adresse) {
      var url = urlTrajet(trajet, adresse);
      var onglet = null;
      try {
        onglet = window.open(url, '_blank');
      } catch (e) {
        onglet = null;
      }
      /* Dernier recours si le navigateur bloque le nouvel onglet. */
      if (!onglet) naviguer(url);
    });
  }

  /* --- Retour de l'Intent Android sans application installée : Chrome a
     rechargé la page avec ?ratp=1 -> on ouvre le site RATP (nouvelle page),
     avec le lieu actuel en départ et le restaurant en arrivée. */
  if (new URLSearchParams(window.location.search).get(PARAM_RETOUR) === '1') {
    try {
      var propre = new URL(window.location.href);
      propre.searchParams.delete(PARAM_RETOUR);
      window.history.replaceState(null, '', propre.pathname + propre.search + propre.hash);
    } catch (e) {}
    var lienRetour = document.querySelector('[data-ratp-itineraire]');
    if (lienRetour) {
      var trajetRetour = lienRetour.getAttribute('href');
      lieuActuel().then(function (adresse) {
        naviguer(urlTrajet(trajetRetour, adresse));
      });
    }
    return;
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
        /* Android Chrome : l'Intent vise l'application ; si elle est absente,
           Chrome recharge la page avec ?ratp=1 (détecté ci-dessus), qui ouvre
           le site RATP. Si l'utilisateur annule, rien ne se passe. */
        var repli = new URL(window.location.href);
        repli.searchParams.set(PARAM_RETOUR, '1');
        naviguer(intentUrl(appUrl, repli.href));
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
        /* L'application s'est ouverte (ou l'utilisateur a choisi « Ouvrir ») :
           on ne touche à rien, aucune position n'est demandée. */
        if (applicationOuverte || document.hidden) return;
        /* Refus ou application absente : le site RATP s'ouvre, avec le lieu
           actuel en départ et le restaurant en arrivée. */
        ouvrirTrajet(trajet);
      }, ATTENTE_APP);
    });
  });
})();
