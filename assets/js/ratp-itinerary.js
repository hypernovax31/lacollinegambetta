/* Mention « Métro Gambetta • Ligne 3 » : au clic sur mobile, le trajet
   s'ouvre IMMÉDIATEMENT sur ratp.fr — nouvel onglet, sans aucun délai —
   avec l'arrivée = adresse du restaurant. Le départ = lieu actuel de
   l'utilisateur est ajouté dès que la géolocalisation est résolue (l'onglet
   ouvert est alors rafraîchi avec ?start=).

   La demande d'ouverture de l'application Bonjour RATP est émise en
   parallèle :
   - Android Chrome : Intent officiel com.fabernovel.ratp vers
     https://www.bonjour-ratp.fr/... avec fallback = trajet ratp.fr.
     L'Intent est ouvert dans le même onglet nommé que le fallback :
     s'il déclenche l'app, l'app s'ouvre ; sinon le fallback ratp.fr
     reste (un seul onglet).
   - iPhone et autres mobiles : schémas candidats ratp:// et
     bonjourratp:// via iframes jetables (prompt système si l'app les
     déclare) + lien universel https://www.bonjour-ratp.fr/...
     ouvert dans un second onglet. Ce second onglet déclenche l'app
     via Universal Link s'il est installée ; sinon il est refermé
     automatiquement et seul le fallback ratp.fr reste.

   Si l'application s'ouvre (page passe en arrière-plan), l'onglet du
   site RATP, inutile, se ferme tout seul. Si elle n'apparaît pas,
   l'onglet reste : aucun délai.

   Ordinateur : lien natif vers ratp.fr, nouvel onglet. */
(function () {
  'use strict';

  var SCHEMAS_APP = ['ratp://', 'bonjourratp://'];
  var NOM_FENETRE = 'ratp-trajet';
  var NOM_FENETRE_APP = 'ratp-app';
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;
  var SURVEILLANCE_APP = 2000;
  var NETTOYAGE_APP = 1200;

  var agent = navigator.userAgent || '';
  var tactile = false;
  try {
    tactile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) {}
  tactile = tactile || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(agent);
  if (!tactile) return;
  var androidChrome = /Android/i.test(agent) && /Chrome/i.test(agent) &&
    !/(EdgA|OPR|SamsungBrowser|DuckDuckGo|; wv)/i.test(agent);

  function intentUrl(appUrl, repli) {
    var app = new URL(appUrl);
    return 'intent://' + app.host + app.pathname + app.search +
      '#Intent;scheme=https;package=com.fabernovel.ratp;' +
      'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
  }

  /* Lieu actuel de l'utilisateur */
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

  function urlTrajet(trajet, adresse) {
    if (!adresse) return trajet;
    var separateur = trajet.indexOf('?') === -1 ? '?' : '&';
    return trajet + separateur + 'start=' + encodeURIComponent(adresse);
  }

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    var trajet = lien.getAttribute('href');
    if (!appUrl || !trajet) return;

    var dernierClic = 0;
    var REDOUBLE_MS = 800;

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
      if (!onglet) {
        try {
          onglet = window.open(trajet, '_blank');
        } catch (e2) {
          onglet = null;
        }
      }

      var appOnglet = null;

      /* 2. La demande d'ouverture de l'application est émise en parallèle,
         sans jamais naviguer la page courante. */
      if (androidChrome) {
        var intent = intentUrl(appUrl, trajet);
        /* Intent dans un iframe jetable (ne navigue pas la page courante). */
        try {
          var iframeIntent = document.createElement('iframe');
          iframeIntent.style.display = 'none';
          iframeIntent.setAttribute('aria-hidden', 'true');
          iframeIntent.tabIndex = -1;
          iframeIntent.src = intent;
          document.body.appendChild(iframeIntent);
          setTimeout(function () {
            if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent);
          }, 1000);
        } catch (e) {}
        /* Intent ouvert dans un second onglet : s'il déclenche l'app,
           l'app s'ouvre ; sinon le fallback (trajet) reste dans le premier
           onglet et le second est refermé. */
        try {
          appOnglet = window.open(intent, NOM_FENETRE_APP);
        } catch (e2) {
          appOnglet = null;
        }
      } else {
        /* iPhone et autres mobiles : schémas candidats dans des iframes jetables. */
        SCHEMAS_APP.forEach(function (schema) {
          try {
            var essai = document.createElement('iframe');
            essai.style.display = 'none';
            essai.setAttribute('aria-hidden', 'true');
            essai.tabIndex = -1;
            essai.src = schema;
            document.body.appendChild(essai);
            setTimeout(function () {
              if (essai.parentNode) essai.parentNode.removeChild(essai);
            }, 1000);
          } catch (e) {}
        });
        /* Lien universel Bonjour RATP : déclenche l'app via Universal Link
           s'il est installée. Ouvert dans un second onglet pour ne pas écraser
           le fallback ratp.fr. S'il ne déclenche pas l'app, on le referme et
           on garde uniquement le fallback. */
        try {
          appOnglet = window.open(appUrl, NOM_FENETRE_APP);
        } catch (e) {
          appOnglet = null;
        }
      }

      /* 3. Si l'application s'ouvre peu après le clic (la page passe en
         arrière-plan), les onglets du site RATP, inutiles, se ferment tout seuls. */
      function detecterApplication() {
        if (document.hidden) {
          if (onglet) {
            try { onglet.close(); } catch (e) {}
          }
          if (appOnglet) {
            try { appOnglet.close(); } catch (e) {}
          }
        }
      }
      document.addEventListener('visibilitychange', detecterApplication);
      window.addEventListener('pagehide', detecterApplication);
      setTimeout(function () {
        document.removeEventListener('visibilitychange', detecterApplication);
        window.removeEventListener('pagehide', detecterApplication);
      }, SURVEILLANCE_APP);

      /* Si l'app ne s'est pas ouverte, on referme le second onglet
         (tentative d'app) et on ne garde que le fallback ratp.fr. */
      setTimeout(function () {
        if (!document.hidden && appOnglet && !appOnglet.closed) {
          try { appOnglet.close(); } catch (e) {}
        }
      }, NETTOYAGE_APP);

      /* 4. Le départ (lieu actuel) complète les onglets dès que possible. */
      lieuActuel().then(function (adresse) {
        if (!adresse) return;
        try {
          if (onglet && !onglet.closed) {
            onglet.location.href = urlTrajet(trajet, adresse);
          }
        } catch (e) {}
        try {
          if (appOnglet && !appOnglet.closed) {
            var base = appOnglet.location.href && appOnglet.location.href.indexOf('bonjour-ratp.fr') !== -1
              ? appUrl : trajet;
            appOnglet.location.href = urlTrajet(base, adresse);
          }
        } catch (e2) {}
      });
    });
  });
})();
