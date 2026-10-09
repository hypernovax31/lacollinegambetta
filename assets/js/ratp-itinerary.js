/* Métro Gambetta • Ligne 3 : ouvre Bonjour RATP avec départ = lieu actuel
   (géolocalisé + BAN) et arrivée = 4 Rue Belgrand 75020 Paris.
   - Un seul onglet, pas de flash. Au clic on tente l'app DANS le geste :
     Android : Intent com.fabernovel.ratp (package officiel) ouvert via
       window.open(intent, 'ratp-trajet') + iframe intent → prompt système,
       S.browser_fallback_url = trajet ratp.fr (même onglet) si app absente.
     iOS : schémas candidats ratp://, bonjourratp://, bonjour-ratp://,
       com.fabernovel.ratp://, com.ratp.ratp:// via iframes synchrones →
       prompt « Ouvrir dans Bonjour RATP ? », + lien universel
       bonjour-ratp.fr/itineraires/?end=...&start=... ouvert via
       window.open(appUrl, 'ratp-trajet') → Universal Link ouvre l'app si
       installée, sinon fallback ratp.fr dans même onglet après 2s.
   - Garantie web : si popup bloqué, ouvre trajet via _blank, <a> click,
     puis location.href en dernier recours.
   - Si l'app s'ouvre (document.hidden), on ferme l'onglet.
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
  var SURVEILLANCE_APP = 3500;
  var DELAI_FALLBACK = 2000;

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
      event.preventDefault();
      var maintenant = Date.now();
      if (maintenant - dernierClic < 800) return;
      dernierClic = maintenant;

      var depart = adresseCache || null;
      var trajetAvecDepart = depart ? urlTrajet(trajet, depart) : trajet;
      var appAvecDepart = depart ? urlTrajet(appUrl, depart) : appUrl;

      /* 1. Tentative APP synchrone dans le geste (iframe) */
      var onglet = null;

      if (androidChrome) {
        var intent = intentUrl(appAvecDepart, trajetAvecDepart);
        try {
          var iframeIntent = document.createElement('iframe');
          iframeIntent.style.display = 'none';
          iframeIntent.setAttribute('aria-hidden', 'true');
          iframeIntent.tabIndex = -1;
          iframeIntent.src = intent;
          document.body.appendChild(iframeIntent);
          setTimeout(function () { if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent); }, 2500);
        } catch (e) {}
        // Ouverture directe Intent dans un seul onglet (geste utilisateur)
        try {
          onglet = window.open(intent, NOM_FENETRE);
        } catch (e) {
          onglet = null;
        }
        if (!onglet) {
          try {
            onglet = window.open('about:blank', NOM_FENETRE);
            if (onglet) {
              try { onglet.location.href = intent; } catch (e2) {}
            }
          } catch (e3) {}
        }
      } else {
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
              ifr.src = schema;
              document.body.appendChild(ifr);
              setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 2500);
            } catch (e) {}
            try {
              var ifr2 = document.createElement('iframe');
              ifr2.style.position = 'absolute';
              ifr2.style.width = '1px';
              ifr2.style.height = '1px';
              ifr2.style.opacity = '0';
              ifr2.style.pointerEvents = 'none';
              ifr2.setAttribute('aria-hidden', 'true');
              ifr2.tabIndex = -1;
              ifr2.src = schema + suffix;
              document.body.appendChild(ifr2);
              setTimeout(function () { if (ifr2.parentNode) ifr2.parentNode.removeChild(ifr2); }, 2500);
            } catch (e2) {}
          });
        } catch (e) {
          SCHEMAS_APP.forEach(function (schema) {
            try {
              var ifr = document.createElement('iframe');
              ifr.style.display = 'none';
              ifr.src = schema;
              document.body.appendChild(ifr);
              setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 2500);
            } catch (ex) {}
          });
        }
        try {
          onglet = window.open(appAvecDepart, NOM_FENETRE);
        } catch (e) {
          onglet = null;
        }
        if (!onglet) {
          try {
            onglet = window.open('about:blank', NOM_FENETRE);
            if (onglet) {
              try { onglet.location.href = appAvecDepart; } catch (e2) {}
            }
          } catch (e3) {}
        }
      }

      /* 2. Garantie WEB : si l'onglet n'a pas pu s'ouvrir, forcer l'ouverture du trajet */
      if (!onglet) {
        try { onglet = window.open(trajetAvecDepart, NOM_FENETRE); } catch (e) {}
      }
      if (!onglet) {
        try { onglet = window.open(trajetAvecDepart, '_blank'); } catch (e2) {}
      }
      if (!onglet) {
        ouvrirLienSecurise(trajetAvecDepart);
      }
      if (!onglet) {
        // Dernier recours : navigation dans la page courante (garantit au moins le web)
        try { window.location.href = trajetAvecDepart; } catch (e) {}
        return;
      }

      /* 3. Si l'app s'ouvre, on ferme l'onglet */
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

      /* 4. Fallback : si l'app ne s'est pas ouverte, afficher le trajet dans le même onglet */
      setTimeout(function () {
        if (!document.hidden && onglet && !onglet.closed) {
          try {
            var href = '';
            try { href = onglet.location.href || ''; } catch (e) { href = ''; }
            if (!href || href === 'about:blank' || href.indexOf('about:blank') !== -1 ||
                href.indexOf('intent://') === 0 ||
                href.indexOf('bonjour-ratp.fr') !== -1 ||
                href.indexOf('ratp.fr') === -1) {
              onglet.location.href = trajetAvecDepart;
            }
          } catch (e) {
            try { onglet.location.href = trajetAvecDepart; } catch (e2) {}
          }
        }
      }, DELAI_FALLBACK);

      /* 5. Quand la position arrive, on complète avec ?start= et on retente */
      lieuActuel().then(function (adresse) {
        if (!adresse) return;
        adresseCache = adresse;
        var trajetComplet = urlTrajet(trajet, adresse);
        var appComplet = urlTrajet(appUrl, adresse);
        if (document.hidden) {
          try { if (onglet && !onglet.closed) onglet.location.href = trajetComplet; } catch (e) {}
          return;
        }
        if (!depart) {
          if (androidChrome) {
            var intent2 = intentUrl(appComplet, trajetComplet);
            try {
              var ifr = document.createElement('iframe');
              ifr.style.display = 'none';
              ifr.src = intent2;
              document.body.appendChild(ifr);
              setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 2500);
            } catch (e) {}
            try {
              if (onglet && !onglet.closed) {
                onglet.location.href = intent2;
              }
            } catch (e2) {}
            setTimeout(function () {
              if (!document.hidden && onglet && !onglet.closed) {
                try { onglet.location.href = trajetComplet; } catch (e) {}
              }
            }, DELAI_FALLBACK);
          } else {
            try {
              if (onglet && !onglet.closed) {
                onglet.location.href = appComplet;
              }
            } catch (e3) {}
            try {
              var u = new URL(appComplet);
              var suf = u.pathname + u.search;
              SCHEMAS_APP.forEach(function (schema) {
                try {
                  var ifr = document.createElement('iframe');
                  ifr.style.display = 'none';
                  ifr.src = schema + suf;
                  document.body.appendChild(ifr);
                  setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 2500);
                } catch (e) {}
              });
            } catch (e) {}
            setTimeout(function () {
              if (!document.hidden && onglet && !onglet.closed) {
                try { onglet.location.href = trajetComplet; } catch (e) {}
              }
            }, DELAI_FALLBACK);
          }
        } else {
          try {
            if (onglet && !onglet.closed) {
              onglet.location.href = trajetComplet;
            }
          } catch (e5) {}
        }
      });
    });
  });
})();
