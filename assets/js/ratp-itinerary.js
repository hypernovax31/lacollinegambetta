/* Mention « Métro Gambetta • Ligne 3 » : au clic sur mobile, le trajet
   s'ouvre IMMÉDIATEMENT sur ratp.fr — nouvel onglet, sans aucun délai —
   avec l'arrivée = adresse du restaurant. Le départ = lieu actuel de
   l'utilisateur (géolocalisation + BAN) est ajouté dès que possible.

   La demande d'ouverture de l'application Bonjour RATP
   https://apps.apple.com/fr/app/bonjour-ratp/id507107090 est émise en
   parallèle avec le même trajet (départ = lieu actuel quand on le connaît,
   arrivée = 4 Rue Belgrand 75020 Paris) :
   - Android Chrome : Intent officiel com.fabernovel.ratp vers
     https://www.bonjour-ratp.fr/... avec fallback = trajet ratp.fr
   - iPhone : schémas candidats ratp:// et bonjourratp:// via iframes +
     lien universel bonjour-ratp.fr via second onglet (Universal Link).
     Le second onglet déclenche l'app si installée ; sinon il est refermé
     et seul le fallback ratp.fr reste.

   Si l'app s'ouvre (page en arrière-plan), les onglets web se ferment.
   Sinon le fallback reste, sans délai.

   Ordinateur : lien natif vers ratp.fr, nouvel onglet. */
(function () {
  'use strict';

  var SCHEMAS_APP = ['ratp://', 'bonjourratp://'];
  var NOM_FENETRE = 'ratp-trajet';
  var NOM_FENETRE_APP = 'ratp-app';
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;
  var SURVEILLANCE_APP = 2000;
  var NETTOYAGE_APP = 1400;

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

  /* Pré-cache du lieu actuel dès le chargement (mobile) : si l'utilisateur
     a déjà autorisé la position, le clic pourra ouvrir l'app directement
     avec départ + arrivée, sans attendre la géolocalisation. */
  var adresseCache = null;
  var promesseCache = null;
  try {
    promesseCache = lieuActuel().then(function (a) {
      if (a) adresseCache = a;
      return a;
    });
  } catch (e) {
    promesseCache = null;
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

      var departConnu = adresseCache || null;
      var trajetAvecDepart = departConnu ? urlTrajet(trajet, departConnu) : trajet;
      var appAvecDepart = departConnu ? urlTrajet(appUrl, departConnu) : appUrl;

      /* 1. Le trajet s'ouvre TOUT DE SUITE : nouvel onglet, sans délai. */
      var onglet = null;
      try {
        onglet = window.open(trajetAvecDepart, NOM_FENETRE);
      } catch (e) {
        onglet = null;
      }
      if (!onglet) {
        try {
          onglet = window.open(trajetAvecDepart, '_blank');
        } catch (e2) {
          onglet = null;
        }
      }

      var appOnglet = null;

      /* 2. La demande d'ouverture de l'application est émise en parallèle,
         avec le même départ (si on le connaît) et arrivée = restaurant,
         sans jamais naviguer la page courante. */
      if (androidChrome) {
        var intent = intentUrl(appAvecDepart, trajetAvecDepart);
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
        try {
          appOnglet = window.open(intent, NOM_FENETRE_APP);
        } catch (e2) {
          appOnglet = null;
        }
      } else {
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
          /* On tente aussi avec le trajet complet (start+end) si l'app
             accepte le chemin en deep link. */
          try {
            var u = new URL(appAvecDepart);
            var essai2 = document.createElement('iframe');
            essai2.style.display = 'none';
            essai2.setAttribute('aria-hidden', 'true');
            essai2.tabIndex = -1;
            essai2.src = schema + u.pathname + u.search;
            document.body.appendChild(essai2);
            setTimeout(function () {
              if (essai2.parentNode) essai2.parentNode.removeChild(essai2);
            }, 1000);
          } catch (e2) {}
        });
        try {
          appOnglet = window.open(appAvecDepart, NOM_FENETRE_APP);
        } catch (e) {
          appOnglet = null;
        }
      }

      /* 3. Si l'application s'ouvre, on ferme les onglets web. */
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

      setTimeout(function () {
        if (!document.hidden && appOnglet && !appOnglet.closed) {
          try { appOnglet.close(); } catch (e) {}
        }
      }, NETTOYAGE_APP);

      /* 4. Le départ (lieu actuel) complète les onglets et, si on ne l'avait
         pas au clic, on retente l'ouverture de l'app avec départ+arrivée. */
      function completerEtRetenter(adresse) {
        if (!adresse) return;
        adresseCache = adresse;
        var trajetComplet = urlTrajet(trajet, adresse);
        var appComplet = urlTrajet(appUrl, adresse);
        try {
          if (onglet && !onglet.closed) {
            onglet.location.href = trajetComplet;
          }
        } catch (e) {}
        if (document.hidden) return; /* app déjà ouverte */
        /* Si on n'avait pas le départ au clic, on retente l'app avec départ+arrivée */
        if (!departConnu) {
          if (androidChrome) {
            var intent2 = intentUrl(appComplet, trajetComplet);
            try {
              var iframe2 = document.createElement('iframe');
              iframe2.style.display = 'none';
              iframe2.src = intent2;
              document.body.appendChild(iframe2);
              setTimeout(function () { if (iframe2.parentNode) iframe2.parentNode.removeChild(iframe2); }, 1000);
            } catch (e) {}
            try {
              if (appOnglet && !appOnglet.closed) {
                appOnglet.location.href = intent2;
              } else {
                appOnglet = window.open(intent2, NOM_FENETRE_APP);
              }
            } catch (e2) {}
          } else {
            try {
              if (appOnglet && !appOnglet.closed) {
                appOnglet.location.href = appComplet;
              } else {
                appOnglet = window.open(appComplet, NOM_FENETRE_APP);
              }
            } catch (e3) {}
          }
        } else {
          try {
            if (appOnglet && !appOnglet.closed) {
              var base = appOnglet.location.href && appOnglet.location.href.indexOf('bonjour-ratp.fr') !== -1
                ? appUrl : trajet;
              var hrefBase = base.indexOf('bonjour-ratp.fr') !== -1 ? appComplet : trajetComplet;
              appOnglet.location.href = hrefBase;
            }
          } catch (e4) {}
        }
      }

      if (departConnu) {
        /* On a déjà le départ en cache : on a ouvert avec départ, mais on
           rafraîchit quand même au cas où la position a bougé. */
        lieuActuel().then(completerEtRetenter);
      } else {
        lieuActuel().then(completerEtRetenter);
      }
    });
  });
})();
