/* Métro Gambetta • Ligne 3 : demande à l'utilisateur s'il veut utiliser
   l'application Bonjour RATP, comme l'adresse demande à ouvrir l'app de plan.
   - Au clic, ouvre immédiatement un onglet vide pendant le geste (pas bloqué),
     puis affiche la boîte. Les boutons de la boîte ouvrent DIRECTEMENT
     pendant leur propre geste (pas via Promise.then) pour ne pas être bloqués.
   - Choix : Bonjour RATP (Intent + Universal Link), Plans/Maps transit, Site RATP.
   - Un seul onglet, pas de flash. Départ = lieu actuel BAN. */
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
  var DELAI_FALLBACK = 2200;

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

  function transitSystemUrls(start, end) {
    var urls = [];
    var encEnd = encodeURIComponent(end);
    var encStart = start ? encodeURIComponent(start) : '';
    if (isIOS()) {
      if (encStart) urls.push('maps://?saddr=' + encStart + '&daddr=' + encEnd + '&dirflg=r');
      urls.push('maps://?daddr=' + encEnd + '&dirflg=r');
      if (encStart) urls.push('comgooglemaps://?saddr=' + encStart + '&daddr=' + encEnd + '&directionsmode=transit');
      urls.push('comgooglemaps://?daddr=' + encEnd + '&directionsmode=transit');
    } else if (isAndroid()) {
      urls.push('geo:0,0?q=' + encEnd);
      if (encStart) urls.push('https://www.google.com/maps/dir/?api=1&origin=' + encStart + '&destination=' + encEnd + '&travelmode=transit');
      urls.push('https://www.google.com/maps/dir/?api=1&destination=' + encEnd + '&travelmode=transit');
      urls.push('google.navigation:q=' + encEnd + '&mode=transit');
    }
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
      try { event.preventDefault(); } catch (e) {}
      var maintenant = Date.now();
      if (maintenant - dernierClic < 800) return;
      dernierClic = maintenant;

      var depart = adresseCache || null;
      var trajetAvecDepart = depart ? urlTrajet(trajet, depart) : trajet;
      var appAvecDepart = depart ? urlTrajet(appUrl, depart) : appUrl;

      /* Ouvrir immédiatement un onglet vide pendant le geste */
      var onglet = null;
      try {
        onglet = window.open('about:blank', NOM_FENETRE);
      } catch (e) {}

      /* Boîte de dialogue - les boutons ouvrent DIRECTEMENT pendant leur geste */
      var exist = document.getElementById('ratp-choix-dialog');
      if (exist && exist.parentNode) exist.parentNode.removeChild(exist);

      var overlay = document.createElement('div');
      overlay.id = 'ratp-choix-dialog';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Ouvrir dans Bonjour RATP ?');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);padding:16px;box-sizing:border-box;';
      
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#1a1a1a;max-width:380px;width:100%;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.25);padding:22px 20px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
      
      var titre = document.createElement('div');
      titre.textContent = 'Ouvrir l’itinéraire ?';
      titre.style.cssText = 'font-weight:700;font-size:18px;line-height:1.3;margin-bottom:8px;';
      
      var msg = document.createElement('div');
      msg.textContent = 'Voulez-vous utiliser l’application « Bonjour RATP » pour l’itinéraire Métro Gambetta • Ligne 3 ?';
      msg.style.cssText = 'font-size:15px;line-height:1.45;color:#333;margin-bottom:18px;';
      
      var btnBonjour = document.createElement('button');
      btnBonjour.type = 'button';
      btnBonjour.textContent = 'Oui, ouvrir Bonjour RATP';
      btnBonjour.style.cssText = 'width:100%;padding:12px 14px;border-radius:10px;border:0;background:#000;color:#fff;font-weight:600;font-size:15px;cursor:pointer;margin-bottom:10px;';
      
      var btnMaps = document.createElement('button');
      btnMaps.type = 'button';
      btnMaps.textContent = 'Ouvrir dans Plans / Maps';
      btnMaps.style.cssText = 'width:100%;padding:11px 14px;border-radius:10px;border:1px solid #ddd;background:#f7f7f7;color:#111;font-weight:500;font-size:14px;cursor:pointer;margin-bottom:10px;';
      
      var btnWeb = document.createElement('button');
      btnWeb.type = 'button';
      btnWeb.textContent = 'Non, voir sur le site RATP';
      btnWeb.style.cssText = 'width:100%;padding:11px 14px;border-radius:10px;border:1px solid #e5e5e5;background:#fff;color:#555;font-weight:400;font-size:14px;cursor:pointer;margin-bottom:6px;';
      
      var btnFermer = document.createElement('button');
      btnFermer.type = 'button';
      btnFermer.textContent = 'Annuler';
      btnFermer.style.cssText = 'width:100%;padding:8px;border:0;background:transparent;color:#888;font-size:13px;cursor:pointer;';

      function nettoyer() {
        try { document.removeEventListener('keydown', onKey); } catch (e) {}
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          nettoyer();
          if (onglet && !onglet.closed) { try { onglet.close(); } catch (e) {} }
        }
      }
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          nettoyer();
          if (onglet && !onglet.closed) { try { onglet.close(); } catch (e) {} }
        }
      });

      function ouvrirDansOnglet(url) {
        // Essayer de naviguer l'onglet vide déjà ouvert pendant le premier geste
        if (onglet && !onglet.closed) {
          try { onglet.location.href = url; return onglet; } catch (e) {}
        }
        // Sinon ouvrir directement pendant ce second geste (clic sur bouton)
        try {
          var o = window.open(url, NOM_FENETRE);
          if (o && !o.closed) return o;
        } catch (e) {}
        try {
          var o2 = window.open(url, '_blank');
          if (o2 && !o2.closed) return o2;
        } catch (e2) {}
        ouvrirLienSecurise(url);
        try { window.location.href = url; } catch (e3) {}
        return null;
      }

      btnBonjour.addEventListener('click', function () {
        // Geste utilisateur direct : ouverture app
        var endAddr = '4 Rue Belgrand 75020 Paris';
        var startAddr = depart || '';
        var cible = appAvecDepart;
        var intent = null;
        if (androidChrome) {
          intent = intentUrl(appAvecDepart, trajetAvecDepart);
          if (intent) {
            try {
              var iframeIntent = document.createElement('iframe');
              iframeIntent.style.display = 'none';
              iframeIntent.src = intent;
              document.body.appendChild(iframeIntent);
              setTimeout(function () { if (iframeIntent.parentNode) iframeIntent.parentNode.removeChild(iframeIntent); }, 3000);
            } catch (e) {}
            cible = intent;
          }
        } else {
          try {
            var appU = new URL(appAvecDepart);
            var suffix = appU.pathname + appU.search;
            SCHEMAS_APP.forEach(function (schema) {
              try {
                var ifr = document.createElement('iframe');
                ifr.style.display = 'none';
                ifr.src = schema + suffix;
                document.body.appendChild(ifr);
                setTimeout(function () { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 3000);
              } catch (e) {}
            });
          } catch (e) {}
        }
        var o = ouvrirDansOnglet(cible);
        nettoyer();
        if (!o) return;
        // Détection ouverture app
        function detecterApp() {
          if (document.hidden && o) { try { o.close(); } catch (e) {} }
        }
        document.addEventListener('visibilitychange', detecterApp);
        window.addEventListener('pagehide', detecterApp);
        setTimeout(function () {
          document.removeEventListener('visibilitychange', detecterApp);
          window.removeEventListener('pagehide', detecterApp);
        }, SURVEILLANCE_APP);
        // Fallback web si app non installée
        setTimeout(function () {
          if (!document.hidden && o && !o.closed) {
            try { o.location.href = trajetAvecDepart; } catch (e) {}
          }
        }, DELAI_FALLBACK);
        // Compléter avec lieu actuel
        lieuActuel().then(function (adresse) {
          if (!adresse) return;
          adresseCache = adresse;
          var trajetComplet = urlTrajet(trajet, adresse);
          if (document.hidden) return;
          try { if (o && !o.closed) o.location.href = trajetComplet; } catch (e) {}
        });
      });

      btnMaps.addEventListener('click', function () {
        var endAddr = '4 Rue Belgrand 75020 Paris';
        var startAddr = depart || '';
        var systemUrls = transitSystemUrls(startAddr, endAddr);
        var cible = systemUrls[0];
        // iOS : comme l'adresse, navigation directe
        if (isIOS()) {
          nettoyer();
          try { window.location.assign(cible); } catch (e) {}
          if (onglet && !onglet.closed) { try { onglet.close(); } catch (e) {} }
          // Fallback web si Maps non ouvert
          setTimeout(function () {
            if (!document.hidden) {
              try { window.open(trajetAvecDepart, '_blank'); } catch (e) {}
            }
          }, 1200);
          return;
        }
        var o = ouvrirDansOnglet(cible);
        nettoyer();
        if (!o) return;
        setTimeout(function () {
          if (!document.hidden && o && !o.closed) {
            try {
              var href = '';
              try { href = o.location.href || ''; } catch (e) { href = ''; }
              if (!href || href.indexOf('maps://') === 0 || href.indexOf('geo:') === 0 || href.indexOf('about:blank') !== -1) {
                o.location.href = trajetAvecDepart;
              }
            } catch (e) {}
          }
        }, DELAI_FALLBACK + 800);
      });

      btnWeb.addEventListener('click', function () {
        var o = null;
        if (onglet && !onglet.closed) {
          try { onglet.location.href = trajetAvecDepart; o = onglet; } catch (e) {}
        }
        if (!o || o.closed) {
          try { o = window.open(trajetAvecDepart, NOM_FENETRE); } catch (e) {}
        }
        if (!o || o.closed) {
          try { o = window.open(trajetAvecDepart, '_blank'); } catch (e2) {}
        }
        if (!o || o.closed) {
          ouvrirLienSecurise(trajetAvecDepart);
          try { window.location.href = trajetAvecDepart; } catch (e) {}
        }
        nettoyer();
        if (!o) return;
        lieuActuel().then(function (adresse) {
          if (!adresse) return;
          adresseCache = adresse;
          var trajetComplet = urlTrajet(trajet, adresse);
          if (document.hidden) return;
          try { if (o && !o.closed) o.location.href = trajetComplet; } catch (e) {}
        });
      });

      btnFermer.addEventListener('click', function () {
        nettoyer();
        if (onglet && !onglet.closed) { try { onglet.close(); } catch (e) {} }
      });

      box.appendChild(titre);
      box.appendChild(msg);
      box.appendChild(btnBonjour);
      box.appendChild(btnMaps);
      box.appendChild(btnWeb);
      box.appendChild(btnFermer);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      try { btnBonjour.focus(); } catch (e) {}
    });
  });
})();
