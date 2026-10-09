/* Métro Gambetta • Ligne 3 : ouvre Bonjour RATP avec départ = lieu actuel
   (géolocalisé + BAN) et arrivée = 4 Rue Belgrand 75020 Paris.
   - Garantie WEB : ouvre immédiatement le trajet ratp.fr dans un seul onglet
     (window.open pendant le geste, pas de flash, pas de about:blank).
   - Tente l'APP en parallèle sans second onglet, via iframes synchrones :
     Android : iframe intent:// (package com.fabernovel.ratp,
       S.browser_fallback_url = trajet) → prompt système Bonjour RATP.
     iOS : iframes ratp://, bonjourratp://, bonjour-ratp://,
       com.fabernovel.ratp://, com.ratp.ratp:// → prompt « Ouvrir dans
       Bonjour RATP ? ». Universal Link bonjour-ratp.fr est aussi tenté
       via un iframe caché + tentative de navigation douce du même onglet
       seulement si l'app n'est pas déjà en train de s'ouvrir.
   - Si l'app s'ouvre (document.hidden), on ferme l'onglet web.
   - Si popup bloqué, fallback <a> click puis location.href = trajet.
   Ordinateur : lien natif ratp.fr. */
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
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;
  var SURVEILLANCE_APP = 4000;

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
    try {
      var app = new URL(appUrl);
      return 'intent://' + app.host + app.pathname + app.search +
        '#Intent;scheme=https;package=com.fabernovel.ratp;' +
        'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
    } catch (e) {
      return null;
    }
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
        } catch (e) {}
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

  function ouvrirLienSecurise(url) {
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
      return true;
    } catch (e) {
      return false;
    }
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
      try {
        event.preventDefault();
      } catch (e) {}
      var maintenant = Date.now();
      if (maintenant - dernierClic < 800) return;
      dernierClic = maintenant;

      var depart = adresseCache || null;
      var trajetAvecDepart = depart ? urlTrajet(trajet, depart) : trajet;
      var appAvecDepart = depart ? urlTrajet(appUrl, depart) : appUrl;

      /* 1. GARANTIE WEB : ouvre le trajet immédiatement, un seul onglet */
      var onglet = null;
      try {
        onglet = window.open(trajetAvecDepart, NOM_FENETRE);
      } catch (e) {}
      if (!onglet) {
        try { onglet = window.open(trajetAvecDepart, '_blank'); } catch (e2) {}
      }
      if (!onglet) {
        // Fallback <a> click
        ouvrirLienSecurise(trajetAvecDepart);
      }
      // Si toujours pas d'onglet, on naviguera la page courante en dernier recours
      var fallbackWebDirect = !onglet;

      /* 2. Tentative APP synchrone, sans second onglet (iframes) */
      try {
        if (androidChrome) {
          var intent = intentUrl(appAvecDepart, trajetAvecDepart);
          if (intent) {
            var iframeIntent = document.createElement('iframe');
            iframeIntent.style.display = 'none';
            iframeIntent.setAttribute('aria-hidden', 'true');
            iframeIntent.tabIndex = -1;
            iframeIntent.src = intent;
            document.body.appendChild(iframeIntent);
            setTimeout(function () { if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent); }, 3000);
          }
        } else {
          // iOS : schémas candidats
          try {
            var appU = new URL(appAvecDepart);
            var suffix = appU.pathname + appU.search;
            SCHEMAS_APP.forEach(function (schema) {
              try {
                var ifr = document.createElement('iframe');
                ifr.style.position = 'absolute';
                ifr.style.width = '1px';
                ifr.style.height = '1px';
                ifr.style.opacity = '0';
                ifr.style.pointerEvents = 'none';
                ifr.setAttribute('aria-hidden', 'true');
                ifr.tabIndex = -1;
                ifr.src = schema + suffix;
                document.body.appendChild(ifr);
                setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
              } catch (e) {}
            });
          } catch (e) {
            SCHEMAS_APP.forEach(function (schema) {
              try {
                var ifr = document.createElement('iframe');
                ifr.style.display = 'none';
                ifr.src = schema;
                document.body.appendChild(ifr);
                setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
              } catch (ex) {}
            });
          }
          // Universal Link : tentative douce via iframe https (ne marche pas partout mais ne casse pas)
          try {
            var iframeApp = document.createElement('iframe');
            iframeApp.style.display = 'none';
            iframeApp.src = appAvecDepart;
            document.body.appendChild(iframeApp);
            setTimeout(function () { if (iframeApp.parentNode) iframeApp.parentNode.removeChild(iframeApp); }, 3000);
          } catch (e) {}
        }
      } catch (e) {}

      /* 3. Si l'app s'ouvre, on ferme l'onglet web */
      function detecterApp() {
        if (document.hidden && onglet) {
          try { onglet.close(); } catch (e) {}
        }
      }
      document.addEventListener('visibilitychange', detecterApp);
      window.addEventListener('pagehide', detecterApp);
      setTimeout(function () {
        document.removeEventListener('visibilitychange', detecterApp);
        window.removeEventListener('pagehide', detecterApp);
      }, SURVEILLANCE_APP);

      /* 4. Fallback ultime si popup bloqué : naviguer la page courante vers le trajet */
      if (fallbackWebDirect) {
        setTimeout(function () {
          if (!document.hidden) {
            try { window.location.href = trajetAvecDepart; } catch (e) {}
          }
        }, 300);
        return;
      }

      /* 5. Quand la position arrive, on complète l'onglet avec ?start= */
      lieuActuel().then(function (adresse) {
        if (!adresse) return;
        adresseCache = adresse;
        var trajetComplet = urlTrajet(trajet, adresse);
        var appComplet = urlTrajet(appUrl, adresse);
        if (document.hidden) {
          try { if (onglet && !onglet.closed) onglet.location.href = trajetComplet; } catch (e) {}
          return;
        }
        // Mettre à jour l'onglet web avec le départ géolocalisé
        try {
          if (onglet && !onglet.closed) {
            onglet.location.href = trajetComplet;
          }
        } catch (e) {}
        // Retenter l'app avec départ complet (iframe)
        try {
          if (androidChrome) {
            var intent2 = intentUrl(appComplet, trajetComplet);
            if (intent2) {
              var ifr = document.createElement('iframe');
              ifr.style.display = 'none';
              ifr.src = intent2;
              document.body.appendChild(ifr);
              setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
            }
          } else {
            try {
              var u = new URL(appComplet);
              var suf = u.pathname + u.search;
              SCHEMAS_APP.forEach(function (schema) {
                try {
                  var ifr = document.createElement('iframe');
                  ifr.style.display = 'none';
                  ifr.src = schema + suf;
                  document.body.appendChild(ifr);
                  setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
                } catch (e) {}
              });
            } catch (e) {}
          }
        } catch (e) {}
      });
    });
  });
})();
