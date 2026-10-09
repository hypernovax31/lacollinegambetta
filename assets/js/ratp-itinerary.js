/* Métro Gambetta • Ligne 3 : ouvre Bonjour RATP puis app Plans/Maps par défaut
   comme l'adresse postale ouvre l'app de plan du mobile.
   - Un seul onglet, pas de flash.
   - Au clic : Bonjour RATP d'abord (Intent Android + Universal Link iOS),
     sinon app de plan par défaut en mode transports (comme data-default-map),
     sinon fallback web ratp.fr + Google Maps transit.
   - Départ = lieu actuel géolocalisé BAN, arrivée = 4 Rue Belgrand.
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
  var SURVEILLANCE_APP = 4500;
  var DELAI_FALLBACK_RATP = 1600;
  var DELAI_FALLBACK_MAPS = 2600;

  var agent = navigator.userAgent || '';
  var tactile = false;
  try {
    tactile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) {}
  tactile = tactile || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(agent);
  if (!tactile) return;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(agent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isAndroid() {
    return /Android/i.test(agent);
  }
  var androidChrome = isAndroid() && /Chrome/i.test(agent) &&
    !/(EdgA|OPR|SamsungBrowser|DuckDuckGo|; wv)/i.test(agent);

  function intentUrl(appUrl, repli) {
    try {
      var app = new URL(appUrl);
      return 'intent://' + app.host + app.pathname + app.search +
        '#Intent;scheme=https;package=com.fabernovel.ratp;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
    } catch (e) {
      return null;
    }
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

  /* URLs pour app de plan par défaut en mode transports, comme map-links.js */
  function transitSystemUrls(start, end) {
    var urls = [];
    var encEnd = encodeURIComponent(end);
    var encStart = start ? encodeURIComponent(start) : '';
    if (isIOS()) {
      // Apple Plans : maps://?saddr=...&daddr=...&dirflg=r (r=transit)
      if (encStart) urls.push('maps://?saddr=' + encStart + '&daddr=' + encEnd + '&dirflg=r');
      urls.push('maps://?daddr=' + encEnd + '&dirflg=r');
      // Google Maps iOS si installé
      if (encStart) urls.push('comgooglemaps://?saddr=' + encStart + '&daddr=' + encEnd + '&directionsmode=transit');
      urls.push('comgooglemaps://?daddr=' + encEnd + '&directionsmode=transit');
    } else if (isAndroid()) {
      // geo: pour app par défaut
      urls.push('geo:0,0?q=' + encEnd);
      // Google Maps navigation transit
      if (encStart) urls.push('https://www.google.com/maps/dir/?api=1&origin=' + encStart + '&destination=' + encEnd + '&travelmode=transit');
      urls.push('https://www.google.com/maps/dir/?api=1&destination=' + encEnd + '&travelmode=transit');
      urls.push('google.navigation:q=' + encEnd + '&mode=transit');
    }
    // Fallback web Google Maps transit (ouvre n'importe quel navigateur)
    if (encStart) {
      urls.push('https://www.google.com/maps/dir/?api=1&origin=' + encStart + '&destination=' + encEnd + '&travelmode=transit');
    } else {
      urls.push('https://www.google.com/maps/dir/?api=1&destination=' + encEnd + '&travelmode=transit');
    }
    return urls;
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
      var trajetSecurise = trajet;
      try { event.preventDefault(); } catch (e) {}
      var maintenant = Date.now();
      if (maintenant - dernierClic < 800) return;
      dernierClic = maintenant;

      var depart = adresseCache || null;
      var trajetAvecDepart = depart ? urlTrajet(trajet, depart) : trajet;
      var appAvecDepart = depart ? urlTrajet(appUrl, depart) : appUrl;
      trajetSecurise = trajetAvecDepart;

      try {
        /* 1. Tentative BONJOUR RATP d'abord */
        var onglet = null;
        var intent = null;
        if (androidChrome) {
          intent = intentUrl(appAvecDepart, trajetAvecDepart);
          if (intent) {
            try {
              var iframeIntent = document.createElement('iframe');
              iframeIntent.style.display = 'none';
              iframeIntent.setAttribute('aria-hidden', 'true');
              iframeIntent.tabIndex = -1;
              iframeIntent.src = intent;
              document.body.appendChild(iframeIntent);
              setTimeout(function () { if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent); }, 3000);
            } catch (e) {}
            try { onglet = window.open(intent, NOM_FENETRE); } catch (e) {}
            if (!onglet || onglet.closed) {
              try {
                onglet = window.open('about:blank', NOM_FENETRE);
                if (onglet) { try { onglet.location.href = intent; } catch (e2) {} }
              } catch (e3) {}
            }
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
                ifr.src = schema + suffix;
                document.body.appendChild(ifr);
                setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
              } catch (e) {}
            });
          } catch (e) {}
          try { onglet = window.open(appAvecDepart, NOM_FENETRE); } catch (e) {}
          if (!onglet || onglet.closed) {
            try {
              onglet = window.open('about:blank', NOM_FENETRE);
              if (onglet) { try { onglet.location.href = appAvecDepart; } catch (e2) {} }
            } catch (e3) {}
          }
        }

        /* 2. Garantie WEB si popup bloqué */
        if (!onglet || onglet.closed) {
          try { onglet = window.open(trajetAvecDepart, NOM_FENETRE); } catch (e) {}
        }
        if (!onglet || onglet.closed) {
          try { onglet = window.open(trajetAvecDepart, '_blank'); } catch (e2) {}
        }
        if (!onglet || onglet.closed) {
          ouvrirLienSecurise(trajetAvecDepart);
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

        /* 4. Fallback : si Bonjour RATP ne s'est pas ouverte, essayer app Plans/Maps par défaut en mode transit (comme l'adresse) */
        setTimeout(function () {
          if (document.hidden || !onglet || onglet.closed) return;
          try {
            var href = '';
            try { href = onglet.location.href || ''; } catch (e) { href = ''; }
            // Si on est encore sur intent://, bonjour-ratp.fr ou about:blank, on n'a pas ouvert l'app
            var besoinFallback = !href || href === 'about:blank' || href.indexOf('about:blank') !== -1 ||
              href.indexOf('intent://') === 0 || href.indexOf('bonjour-ratp.fr') !== -1;
            if (!besoinFallback) return; // déjà sur ratp.fr ou autre, on garde

            // Essayer app de plan par défaut en mode transit
            var endAddr = '4 Rue Belgrand 75020 Paris';
            var startAddr = depart || '';
            var systemUrls = transitSystemUrls(startAddr, endAddr);
            // iOS : comme map-links.js, navigation directe vers maps:// sans repli immédiat
            if (isIOS()) {
              try {
                window.location.assign(systemUrls[0]);
              } catch (e) {
                try { onglet.location.href = systemUrls[systemUrls.length - 1]; } catch (e2) {}
              }
              return;
            }
            // Android : iframe geo: + navigation onglet vers Google Maps transit
            try {
              systemUrls.forEach(function (u) {
                if (u.indexOf('geo:') === 0 || u.indexOf('google.navigation:') === 0 || u.indexOf('comgooglemaps://') === 0) {
                  try {
                    var ifr = document.createElement('iframe');
                    ifr.style.display = 'none';
                    ifr.src = u;
                    document.body.appendChild(ifr);
                    setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 2500);
                  } catch (e) {}
                }
              });
            } catch (e) {}
            try { onglet.location.href = systemUrls[0]; } catch (e) {}
          } catch (e) {}
        }, DELAI_FALLBACK_RATP);

        /* 5. Fallback ultime web : ratp.fr + Google Maps transit */
        setTimeout(function () {
          if (!document.hidden && onglet && !onglet.closed) {
            try { onglet.location.href = trajetAvecDepart; } catch (e) {}
          }
        }, DELAI_FALLBACK_MAPS);

        /* 6. Quand la position arrive, compléter avec ?start= et retenter */
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
            // Mettre à jour l'onglet avec le départ géolocalisé
            try { if (onglet && !onglet.closed) onglet.location.href = trajetComplet; } catch (e) {}
            // Retenter Bonjour RATP avec départ
            if (androidChrome) {
              var intent2 = intentUrl(appComplet, trajetComplet);
              if (intent2) {
                try {
                  var ifr = document.createElement('iframe');
                  ifr.style.display = 'none';
                  ifr.src = intent2;
                  document.body.appendChild(ifr);
                  setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
                } catch (e) {}
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
          } else {
            try { if (onglet && !onglet.closed) onglet.location.href = trajetComplet; } catch (e5) {}
          }
        });
      } catch (err) {
        try { window.open(trajetSecurise, '_blank'); } catch (e) {}
        try { ouvrirLienSecurise(trajetSecurise); } catch (e2) {}
        try { window.location.href = trajetSecurise; } catch (e3) {}
      }
    });
  });
})();
