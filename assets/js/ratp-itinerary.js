/* Métro Gambetta • Ligne 3 : demande à l'utilisateur s'il veut utiliser
   l'application Bonjour RATP, comme l'adresse demande à ouvrir l'app de plan.
   - Au clic sur [data-ratp-itineraire], affiche une boîte de dialogue :
     « Ouvrir l'itinéraire dans Bonjour RATP ? » avec 3 choix :
     • Oui, ouvrir Bonjour RATP (Intent Android + Universal Link iOS)
     • Ouvrir dans l'app de plan par défaut (maps:// / geo: transit)
     • Non, voir sur le site RATP (ratp.fr)
   - Un seul onglet, pas de flash. Départ = lieu actuel BAN, arrivée = 4 Rue Belgrand.
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

  /* Boîte de dialogue : Voulez-vous utiliser Bonjour RATP ? */
  function demanderChoixApp() {
    return new Promise(function (resolve) {
      // Si déjà une boîte ouverte, la fermer
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
      btnFermer.setAttribute('aria-label', 'Fermer');
      btnFermer.style.cssText = 'width:100%;padding:8px;border:0;background:transparent;color:#888;font-size:13px;cursor:pointer;';
      
      function fermer(choix) {
        try { document.removeEventListener('keydown', onKey); } catch (e) {}
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(choix);
      }
      function onKey(e) {
        if (e.key === 'Escape') fermer('annuler');
      }
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) fermer('annuler');
      });
      btnBonjour.addEventListener('click', function () { fermer('bonjour-ratp'); });
      btnMaps.addEventListener('click', function () { fermer('system-maps'); });
      btnWeb.addEventListener('click', function () { fermer('ratp-web'); });
      btnFermer.addEventListener('click', function () { fermer('annuler'); });

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
  }

  function ouvrirBonjourRATP(appAvecDepart, trajetAvecDepart) {
    var onglet = null;
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
    return onglet;
  }

  function ouvrirSystemMaps(start, end) {
    var urls = transitSystemUrls(start, end);
    if (isIOS()) {
      try { window.location.assign(urls[0]); return null; } catch (e) {}
      try { return window.open(urls[0], NOM_FENETRE); } catch (e) { return null; }
    } else {
      // Android : iframe geo: + ouverture Google Maps
      try {
        urls.forEach(function (u) {
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
      try { return window.open(urls[0], NOM_FENETRE); } catch (e) { return null; }
    }
  }

  function ouvrirWeb(trajetUrl) {
    var onglet = null;
    try { onglet = window.open(trajetUrl, NOM_FENETRE); } catch (e) {}
    if (!onglet || onglet.closed) {
      try { onglet = window.open(trajetUrl, '_blank'); } catch (e2) {}
    }
    if (!onglet || onglet.closed) {
      ouvrirLienSecurise(trajetUrl);
    }
    if (!onglet || onglet.closed) {
      try { window.location.href = trajetUrl; } catch (e) {}
    }
    return onglet;
  }

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

      // Demander à l'utilisateur s'il veut Bonjour RATP, comme l'adresse demande Plans
      demanderChoixApp().then(function (choix) {
        var onglet = null;
        var endAddr = '4 Rue Belgrand 75020 Paris';
        var startAddr = depart || '';

        if (choix === 'bonjour-ratp') {
          onglet = ouvrirBonjourRATP(appAvecDepart, trajetAvecDepart);
          if (!onglet || onglet.closed) {
            onglet = ouvrirWeb(trajetAvecDepart);
          } else {
            // Si Bonjour RATP non installée, fallback web après délai
            setTimeout(function () {
              if (!document.hidden && onglet && !onglet.closed) {
                try { onglet.location.href = trajetAvecDepart; } catch (e) {}
              }
            }, DELAI_FALLBACK);
          }
        } else if (choix === 'system-maps') {
          onglet = ouvrirSystemMaps(startAddr, endAddr);
          if (!onglet || onglet.closed) {
            // Fallback Google Maps web transit
            var webMaps = transitSystemUrls(startAddr, endAddr);
            var fallback = webMaps[webMaps.length - 1];
            onglet = ouvrirWeb(fallback);
          }
          // Fallback ultime ratp.fr si Maps non ouvert
          setTimeout(function () {
            if (!document.hidden && onglet && !onglet.closed) {
              try {
                var href = '';
                try { href = onglet.location.href || ''; } catch (e) { href = ''; }
                if (!href || href.indexOf('maps://') === 0 || href.indexOf('geo:') === 0 || href.indexOf('about:blank') !== -1) {
                  onglet.location.href = trajetAvecDepart;
                }
              } catch (e) {}
            }
          }, DELAI_FALLBACK + 800);
        } else if (choix === 'ratp-web') {
          onglet = ouvrirWeb(trajetAvecDepart);
        } else {
          // Annuler : ne rien faire, ou ouvrir web par défaut
          return;
        }

        if (!onglet) return;

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

        lieuActuel().then(function (adresse) {
          if (!adresse) return;
          adresseCache = adresse;
          var trajetComplet = urlTrajet(trajet, adresse);
          if (document.hidden) return;
          try { if (onglet && !onglet.closed) onglet.location.href = trajetComplet; } catch (e) {}
        });
      });
    });
  });
})();
