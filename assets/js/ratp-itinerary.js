/* Métro Gambetta • Ligne 3 : ouvre Bonjour RATP avec départ = lieu actuel
   (géolocalisé + BAN) et arrivée = 4 Rue Belgrand 75020 Paris.
   - Un seul onglet créé pendant le geste (about:blank) → pas bloqué, pas de
     double flash. On y tente l'app, sinon on y affiche le trajet.
   - Android : Intent com.fabernovel.ratp vers bonjour-ratp.fr (start+end)
     avec fallback = ratp.fr (start+end). L'onglet tente l'Intent :
     si app installée → prompt système / app s'ouvre, onglet se ferme ;
     sinon Chrome charge le fallback ratp.fr dans ce même onglet.
   - iOS : schémas candidats ratp://, bonjourratp://, bonjour-ratp://,
     com.fabernovel.ratp://, com.ratp.ratp:// via iframes → prompt
     « Ouvrir dans Bonjour RATP ? ». Lien universel bonjour-ratp.fr
     (start+end) dans le même onglet → Universal Link ouvre l'app si
     installée. Si rien ne s'ouvre, l'onglet affiche le trajet ratp.fr.
   - Si l'app s'ouvre, l'onglet se ferme tout seul.
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
  var REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';
  var GEOLOC_TIMEOUT = 8000;
  var SURVEILLANCE_APP = 2500;
  var DELAI_FALLBACK = 1000;

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

      /* 1. Un seul onglet créé pendant le geste (about:blank) */
      var onglet = null;
      try {
        onglet = window.open('about:blank', NOM_FENETRE);
      } catch (e) {
        onglet = null;
      }

      /* 2. Tentative d'ouverture de l'app dans ce même onglet + iframes */
      if (androidChrome) {
        var intent = intentUrl(appAvecDepart, trajetAvecDepart);
        try {
          var iframeIntent = document.createElement('iframe');
          iframeIntent.style.display = 'none';
          iframeIntent.setAttribute('aria-hidden', 'true');
          iframeIntent.tabIndex = -1;
          iframeIntent.src = intent;
          document.body.appendChild(iframeIntent);
          setTimeout(function () { if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent); }, 1200);
        } catch (e) {}
        try {
          if (onglet) {
            onglet.location.href = intent;
          } else {
            onglet = window.open(intent, NOM_FENETRE);
          }
        } catch (e2) {
          try { if (onglet) onglet.location.href = trajetAvecDepart; } catch (e3) {}
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
            setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 1200);
          } catch (e) {}
          try {
            var u = new URL(appAvecDepart);
            var ifr2 = document.createElement('iframe');
            ifr2.style.display = 'none';
            ifr2.setAttribute('aria-hidden', 'true');
            ifr2.tabIndex = -1;
            ifr2.src = schema + u.pathname + u.search;
            document.body.appendChild(ifr2);
            setTimeout(function () { if (ifr2.parentNode) ifr2.parentNode.removeChild(ifr2); }, 1200);
          } catch (e2) {}
        });
        try {
          if (onglet) {
            onglet.location.href = appAvecDepart;
          } else {
            onglet = window.open(appAvecDepart, NOM_FENETRE);
          }
        } catch (e) {}
      }

      if (!onglet) {
        try { onglet = window.open(trajetAvecDepart, NOM_FENETRE); } catch (e) {}
      }
      if (!onglet) {
        try { onglet = window.open(trajetAvecDepart, '_blank'); } catch (e2) {}
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

      /* 4. Fallback : si l'app ne s'est pas ouverte, on affiche le trajet */
      setTimeout(function () {
        if (!document.hidden && onglet && !onglet.closed) {
          try {
            var href = onglet.location.href || '';
            if (href === 'about:blank' || href.indexOf('about:blank') !== -1 ||
                href.indexOf('bonjour-ratp.fr') !== -1 && href.indexOf('start=') === -1 && !depart ||
                href.indexOf('ratp.fr') === -1 && href.indexOf('bonjour-ratp.fr') === -1) {
              onglet.location.href = trajetAvecDepart;
            }
          } catch (e) {
            try { onglet.location.href = trajetAvecDepart; } catch (e2) {}
          }
        }
      }, DELAI_FALLBACK);

      /* 5. Quand la position arrive, on complète et on retente l'app avec départ */
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
              setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 1200);
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
            SCHEMAS_APP.forEach(function (schema) {
              try {
                var u = new URL(appComplet);
                var ifr = document.createElement('iframe');
                ifr.style.display = 'none';
                ifr.src = schema + u.pathname + u.search;
                document.body.appendChild(ifr);
                setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 1200);
              } catch (e) {}
            });
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
