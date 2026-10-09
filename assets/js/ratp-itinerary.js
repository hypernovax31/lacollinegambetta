/* Mention « Métro Gambetta • Ligne 3 » : au clic sur mobile, le trajet
   s'ouvre IMMÉDIATEMENT sur ratp.fr — nouvel onglet, sans aucun délai —
   avec l'arrivée = adresse du restaurant. Le départ = lieu actuel de
   l'utilisateur est ajouté dès que la géolocalisation est résolue (l'onglet
   ouvert est alors rafraîchi avec ?start=).

   La demande d'ouverture de l'application Bonjour RATP est émise en
   parallèle (schémas candidats ratp:// et bonjourratp:// sur iPhone, Intent
   officiel com.fabernovel.ratp sur Android Chrome) : si l'application
   s'ouvre, l'onglet du site RATP, inutile, se ferme tout seul. Si
   l'application n'apparaît pas, l'onglet reste : aucun délai.

   Ordinateur : lien natif vers ratp.fr, nouvel onglet. */
(function () {
  'use strict';

  var SCHEMAS_APP = ['ratp://', 'bonjourratp://'];
  var NOM_FENETRE = 'ratp-trajet';
  var PARAM_RETOUR = 'ratp'; /* ?ratp=1 : retour de l'Intent Android sans application */
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;
  var SURVEILLANCE_APP = 2000;
  var REDOUBLE_MS = 800;

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

  /* Intent Android : application visée ; si elle est absente, Chrome recharge
     la page courante marquée ?ratp=1 (aucune page d'erreur). */
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

  /* Rafraîchir l'onglet du trajet avec le départ (lieu actuel). */
  function completerDepart(trajet, onglet) {
    lieuActuel().then(function (adresse) {
      if (!adresse || !onglet) return;
      try {
        onglet.location.href = urlTrajet(trajet, adresse);
      } catch (e) {}
    });
  }

  /* --- Retour de l'Intent Android sans application installée : Chrome a
     rechargé la page avec ?ratp=1. On nettoie l'URL, puis on remplit le
     départ de l'onglet du trajet déjà ouvert (retrouvé par son nom). */
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
        if (!adresse) return;
        var reference = null;
        try { reference = window.open('', NOM_FENETRE); } catch (e) { reference = null; }
        if (reference) {
          try {
            reference.location.href = urlTrajet(trajetRetour, adresse);
          } catch (e) {}
        }
      });
    }
    return;
  }

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    var trajet = lien.getAttribute('href');
    if (!appUrl || !trajet) return;

    var dernierClic = 0;
    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      event.preventDefault();
      if (maintenant - dernierClic < REDOUBLE_MS) return;
      dernierClic = maintenant;

      /* 1. Le trajet s'ouvre TOUT DE SUITE : nouvel onglet, sans délai. */
      var onglet = null;
      try {
        onglet = window.open(trajet, NOM_FENETRE);
      } catch (e) {
        onglet = null;
      }
      if (!onglet) naviguer(trajet);

      /* 2. La demande d'ouverture de l'application est émise en parallèle. */
      if (androidChrome) {
        var repli = new URL(window.location.href);
        repli.searchParams.set(PARAM_RETOUR, '1');
        naviguer(intentUrl(appUrl, repli.href));
      } else {
        /* iPhone et autres mobiles : les schémas candidats, dans des iframes
           jetables — la page courante n'est jamais remplacée. */
        SCHEMAS_APP.forEach(function (schema) {
          var essai = document.createElement('iframe');
          essai.style.display = 'none';
          essai.setAttribute('aria-hidden', 'true');
          essai.tabIndex = -1;
          essai.src = schema;
          document.body.appendChild(essai);
          setTimeout(function () {
            if (essai.parentNode) essai.parentNode.removeChild(essai);
          }, 1000);
        });
      }

      /* 3. Si l'application s'ouvre peu après le clic (la page passe en
         arrière-plan), l'onglet du site RATP, inutile, se ferme tout seul. */
      function detecterApplication() {
        if (document.hidden) {
          if (onglet) {
            try { onglet.close(); } catch (e) {}
          }
        }
      }
      document.addEventListener('visibilitychange', detecterApplication);
      window.addEventListener('pagehide', detecterApplication);
      setTimeout(function () {
        document.removeEventListener('visibilitychange', detecterApplication);
        window.removeEventListener('pagehide', detecterApplication);
      }, SURVEILLANCE_APP);

      /* 4. Le départ (lieu actuel) complète l'onglet dès que possible. */
      completerDepart(trajet, onglet);
    });
  });
})();
