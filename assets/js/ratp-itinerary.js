/* Métro Gambetta • Ligne 3 : ouvre Bonjour RATP avec départ = lieu actuel
   (géolocalisé + BAN) et arrivée = 4 Rue Belgrand 75020 Paris.
   - Au clic, le trajet s'ouvre IMMÉDIATEMENT dans un nouvel onglet (sans délai)
     avec départ si connu, sinon arrivée seule puis complété.
   - Android Chrome : Intent officiel com.fabernovel.ratp vers
     bonjour-ratp.fr (start+end) avec fallback = ratp.fr (start+end).
     Deux onglets : fallback ratp.fr + tentative Intent. Si app installée,
     l'app s'ouvre ; sinon second onglet refermé, fallback reste.
   - iPhone : lien universel bonjour-ratp.fr (start+end) en second onglet
     → Universal Link ouvre l'app si installée ; sinon second onglet refermé,
     fallback ratp.fr reste. En parallèle, schémas candidats ratp://,
     bonjourratp://, bonjour-ratp://, com.fabernovel.ratp://, com.ratp.ratp://
     via iframes pour déclencher le prompt système « Ouvrir dans Bonjour RATP ? ».
   - Si l'app s'ouvre, les onglets web se ferment.
   Ordinateur : lien natif ratp.fr, nouvel onglet. */
(function () {
  'use strict';

  var SCHEMAS_APP = [
    'ratp://',
    'bonjourratp://',
    'bonjour-ratp://',
    'com.fabernovel.ratp://',
    'com.ratp.ratp://'
  ];
  var NOM_FENETRE = 'ratp-trajet';
  var NOM_FENETRE_APP = 'ratp-app';
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;
  var SURVEILLANCE_APP = 2000;
  var BASCULE_FALLBACK = 1200;

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

  /* Lieu actuel */
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

  function urlTrajet(base, adresse) {
    if (!adresse) return base;
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    return base + sep + 'start=' + encodeURIComponent(adresse);
  }

  var adresseCache = null;
  try {
    lieuActuel().then(function (a) { if (a) adresseCache = a; });
  } catch (e) {}

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    var trajet = lien.getAttribute('href');
    if (!appUrl || !trajet) return;

    var dernierClic = 0;

    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      event.preventDefault();
      if (maintenant - dernierClic < 800) return;
      dernierClic = maintenant;

      var depart = adresseCache || null;
      var trajetAvecDepart = depart ? urlTrajet(trajet, depart) : trajet;
      var appAvecDepart = depart ? urlTrajet(appUrl, depart) : appUrl;

      /* 1. Fallback immédiat : un onglet avec le trajet (départ si connu) */
      var onglet = null;
      try {
        onglet = window.open(trajetAvecDepart, NOM_FENETRE);
      } catch (e) {
        onglet = null;
      }
      if (!onglet) {
        try { onglet = window.open(trajetAvecDepart, '_blank'); } catch (e2) {}
      }

      var appOnglet = null;

      /* 2. Tentative d'ouverture de l'app en parallèle, second onglet */
      if (androidChrome) {
        var intent = intentUrl(appAvecDepart, trajetAvecDepart);
        try {
          var iframeIntent = document.createElement('iframe');
          iframeIntent.style.display = 'none';
          iframeIntent.setAttribute('aria-hidden', 'true');
          iframeIntent.tabIndex = -1;
          iframeIntent.src = intent;
          document.body.appendChild(iframeIntent);
          setTimeout(function () { if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent); }, 1000);
        } catch (e) {}
        try {
          appOnglet = window.open(intent, NOM_FENETRE_APP);
        } catch (e2) {
          appOnglet = null;
        }
      } else {
        SCHEMAS_APP.forEach(function (schema) {
          try {
            var ifr = document.createElement('iframe');
            ifr.style.display = 'none';
            ifr.setAttribute('aria-hidden', 'true');
            ifr.tabIndex = -1;
            ifr.src = schema;
            document.body.appendChild(ifr);
            setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 1000);
          } catch (e) {}
          try {
            var u = new URL(appAvecDepart);
            var ifr2 = document.createElement('iframe');
            ifr2.style.display = 'none';
            ifr2.setAttribute('aria-hidden', 'true');
            ifr2.tabIndex = -1;
            ifr2.src = schema + u.pathname + u.search;
            document.body.appendChild(ifr2);
            setTimeout(function () { if (ifr2.parentNode) ifr2.parentNode.removeChild(ifr2); }, 1000);
          } catch (e2) {}
        });
        try {
          appOnglet = window.open(appAvecDepart, NOM_FENETRE_APP);
        } catch (e) {
          appOnglet = null;
        }
      }

      /* 3. Si l'app s'ouvre, on ferme les onglets web */
      function detecterApp() {
        if (document.hidden) {
          if (onglet) { try { onglet.close(); } catch (e) {} }
          if (appOnglet) { try { appOnglet.close(); } catch (e) {} }
        }
      }
      document.addEventListener('visibilitychange', detecterApp);
      window.addEventListener('pagehide', detecterApp);
      setTimeout(function () {
        document.removeEventListener('visibilitychange', detecterApp);
        window.removeEventListener('pagehide', detecterApp);
      }, SURVEILLANCE_APP);

      /* Si l'app ne s'est pas ouverte, on referme le second onglet */
      setTimeout(function () {
        if (!document.hidden && appOnglet && !appOnglet.closed) {
          try { appOnglet.close(); } catch (e) {}
        }
      }, BASCULE_FALLBACK);

      /* 4. Quand la position arrive, on complète le fallback et on retente
         l'app avec départ+arrivée si elle ne s'était pas ouverte. */
      lieuActuel().then(function (adresse) {
        if (!adresse) return;
        adresseCache = adresse;
        var trajetComplet = urlTrajet(trajet, adresse);
        var appComplet = urlTrajet(appUrl, adresse);
        try {
          if (onglet && !onglet.closed) {
            onglet.location.href = trajetComplet;
          }
        } catch (e) {}
        if (document.hidden) return;
        if (!depart) {
          if (androidChrome) {
            var intent2 = intentUrl(appComplet, trajetComplet);
            try {
              var ifr = document.createElement('iframe');
              ifr.style.display = 'none';
              ifr.src = intent2;
              document.body.appendChild(ifr);
              setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 1000);
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
            SCHEMAS_APP.forEach(function (schema) {
              try {
                var u = new URL(appComplet);
                var ifr = document.createElement('iframe');
                ifr.style.display = 'none';
                ifr.src = schema + u.pathname + u.search;
                document.body.appendChild(ifr);
                setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 1000);
              } catch (e) {}
            });
          }
        } else {
          try {
            if (appOnglet && !appOnglet.closed) {
              var base = appOnglet.location.href && appOnglet.location.href.indexOf('bonjour-ratp.fr') !== -1 ? appComplet : trajetComplet;
              appOnglet.location.href = base;
            }
          } catch (e4) {}
        }
      });
    });
  });
})();
