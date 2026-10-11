/* ========================================================================== *
 *  Itinéraire en métro — lien « Métro Gambetta • Ligne 3 »
 * -------------------------------------------------------------------------- *
 *  Au clic, on demande au visiteur dans QUELLE application ouvrir le trajet :
 *  départ = sa position (géolocalisation du navigateur), arrivée = le
 *  restaurant, en mode « transports en commun ».
 *
 *  Le lien garde un href valable (Google Maps, itinéraire en transports) :
 *  sans JavaScript, il ouvre directement l'itinéraire.
 *
 *  Formats utilisés (documentés) :
 *    Google Maps  https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=transit
 *    Plans        https://maps.apple.com/?saddr=…&daddr=…&dirflg=r        (r = transports)
 *    Citymapper   https://citymapper.com/directions?startcoord=…&endcoord=…&endname=…&endaddress=…
 *    Moovit       moovit://directions?orig_lat=…&orig_lon=…&dest_lat=…&dest_lon=…&dest_name=…&auto_run=true
 *  Sans origine, chaque application part d'elle-même de la position de
 *  l'appareil : le visiteur n'est jamais bloqué par un refus de localisation.
 * ========================================================================== */
(function () {
  'use strict';

  var PAR_DEFAUT = {
    nom: 'La Colline Gambetta',
    adresse: 'La Colline Gambetta, 4 Rue Belgrand, 75020 Paris',
    lat: 48.8647788,
    lng: 2.3993777
  };
  var DELAI_REPLI = 1200;   /* ms : au-delà, l'application native ne viendra pas */

  function estApple() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod|Macintosh/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function estMobile() {
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua) ||
      (!!navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && /Mac/.test(ua));
  }

  /* ---------- les applications proposées ---------- */
  function construireApplis(dest, depart) {
    var adresse = encodeURIComponent(dest.adresse);
    var destCoord = dest.lat + ',' + dest.lng;
    var origine = depart ? (depart.lat + ',' + depart.lng) : '';
    var applis = [];

    /* Plans (Apple) : en tête sur iPhone / Mac, c'est l'application attendue */
    if (estApple()) {
      var plans = 'https://maps.apple.com/?daddr=' + adresse + '&dirflg=r';
      if (origine) plans += '&saddr=' + encodeURIComponent(origine);
      applis.push({ id: 'plans', nom: 'Plans', icone: '🍎',
        detail: 'Itinéraire en transports', web: plans });
    }

    /* Google Maps : présent partout, ouvre l'application sur mobile */
    var google = 'https://www.google.com/maps/dir/?api=1&destination=' + adresse + '&travelmode=transit';
    if (origine) google += '&origin=' + encodeURIComponent(origine);
    applis.push({ id: 'google', nom: 'Google Maps', icone: '🗺️',
      detail: 'Itinéraire en transports', web: google });

    /* Citymapper : le lien https ouvre l'application si elle est installée,
       sinon le calculateur web — pas de lien mort. */
    var city = 'https://citymapper.com/directions?endcoord=' + destCoord +
      '&endname=' + encodeURIComponent(dest.nom) + '&endaddress=' + adresse;
    if (origine) city += '&startcoord=' + origine + '&startname=' + encodeURIComponent('Ma position');
    applis.push({ id: 'citymapper', nom: 'Citymapper', icone: '🚇',
      detail: 'Le spécialiste du métro parisien', web: city });

    /* Moovit : application native uniquement (pas de calculateur web
       paramétrable) — on ne la propose donc que sur mobile, avec repli vers
       la boutique si elle n'est pas installée. */
    if (estMobile()) {
      var moovit = 'moovit://directions?dest_lat=' + dest.lat + '&dest_lon=' + dest.lng +
        '&dest_name=' + encodeURIComponent(dest.nom) + '&auto_run=true';
      if (origine) moovit += '&orig_lat=' + depart.lat + '&orig_lon=' + depart.lng + '&orig_name=' + encodeURIComponent('Ma position');
      var boutique = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || '')
        ? 'https://apps.apple.com/app/id498477945'
        : 'https://play.google.com/store/apps/details?id=com.tranzmate';
      applis.push({ id: 'moovit', nom: 'Moovit', icone: '🚉',
        detail: 'Application installée uniquement', app: moovit, web: boutique });
    }
    return applis;
  }

  /* ---------- ouverture : schéma natif, puis repli ---------- */
  function ouvrir(app) {
    if (!app.app) {                       /* lien web : nouvel onglet */
      var w = window.open(app.web, '_blank', 'noopener,noreferrer');
      if (!w) window.location.assign(app.web);
      return;
    }
    /* Schéma d'application (moovit://) : si rien ne s'ouvre, on retombe sur
       le lien web (la boutique) au bout d'une seconde — même mécanique que
       assets/js/map-links.js pour l'adresse. */
    var regle = false, timer = 0;
    function nettoyer() {
      if (regle) return;
      regle = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', surVisibilite);
    }
    function surVisibilite() { if (document.hidden) nettoyer(); }
    document.addEventListener('visibilitychange', surVisibilite);
    timer = window.setTimeout(function () {
      nettoyer();
      var w = window.open(app.web, '_blank', 'noopener,noreferrer');
      if (!w) window.location.assign(app.web);
    }, DELAI_REPLI);
    try { window.location.assign(app.app); }
    catch (e) { nettoyer(); window.location.assign(app.web); }
  }

  /* ---------- le panneau de choix ---------- */
  var panneau = null, liste = null, ligneDepart = null, dernierLien = null;

  function construire() {
    panneau = document.createElement('div');
    panneau.className = 'itin';
    panneau.setAttribute('role', 'dialog');
    panneau.setAttribute('aria-modal', 'true');
    panneau.setAttribute('aria-labelledby', 'itin-titre');
    panneau.hidden = true;

    var fond = document.createElement('div');
    fond.className = 'itin__fond';
    fond.addEventListener('click', fermer);

    var boite = document.createElement('div');
    boite.className = 'itin__boite';

    var fermerBtn = document.createElement('button');
    fermerBtn.type = 'button';
    fermerBtn.className = 'itin__fermer';
    fermerBtn.setAttribute('aria-label', 'Fermer');
    fermerBtn.innerHTML = '&times;';
    fermerBtn.addEventListener('click', fermer);

    var titre = document.createElement('h2');
    titre.className = 'itin__titre';
    titre.id = 'itin-titre';
    titre.textContent = 'Venir en métro';

    var sous = document.createElement('p');
    sous.className = 'itin__sous';
    sous.textContent = 'Arrivée : ' + PAR_DEFAUT.nom + ' — 4 rue Belgrand, 75020 Paris';

    ligneDepart = document.createElement('p');
    ligneDepart.className = 'itin__depart';

    liste = document.createElement('div');
    liste.className = 'itin__liste';

    var copier = document.createElement('button');
    copier.type = 'button';
    copier.className = 'itin__copier';
    copier.textContent = "Copier l'adresse";
    copier.addEventListener('click', function () {
      var texte = 'La Colline Gambetta, 4 rue Belgrand, 75020 Paris';
      var fin = function () { copier.textContent = "Adresse copiée ✓"; };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texte).then(fin, function () {});
        } else { fin(); }
      } catch (e) { fin(); }
      window.setTimeout(function () { copier.textContent = "Copier l'adresse"; }, 2200);
    });

    boite.appendChild(fermerBtn);
    boite.appendChild(titre);
    boite.appendChild(sous);
    boite.appendChild(ligneDepart);
    boite.appendChild(liste);
    boite.appendChild(copier);
    panneau.appendChild(fond);
    panneau.appendChild(boite);
    document.body.appendChild(panneau);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panneau.hidden) fermer();
    });
  }

  function remplir(applis) {
    liste.innerHTML = '';
    applis.forEach(function (app) {
      var lien = document.createElement('a');
      lien.className = 'itin__app itin__app--' + app.id;
      lien.href = app.web || '#';
      lien.setAttribute('data-app', app.id);
      if (app.app) lien.setAttribute('data-schema', app.app);
      lien.innerHTML = '';
      var icone = document.createElement('span');
      icone.className = 'itin__icone';
      icone.setAttribute('aria-hidden', 'true');
      icone.textContent = app.icone;
      var nom = document.createElement('span');
      nom.className = 'itin__nom';
      nom.textContent = app.nom;
      var detail = document.createElement('span');
      detail.className = 'itin__detail';
      detail.textContent = app.detail;
      lien.appendChild(icone);
      lien.appendChild(nom);
      lien.appendChild(detail);
      lien.addEventListener('click', function (e) {
        e.preventDefault();
        fermer();
        ouvrir(app);
      });
      liste.appendChild(lien);
    });
  }

  function ouvrirPanneau(dest) {
    if (!panneau) construire();
    /* première passe sans position : les applications partent d'elles-mêmes
       de la position de l'appareil — le visiteur peut cliquer tout de suite */
    var depart = null;
    remplir(construireApplis(dest, depart));
    ligneDepart.className = 'itin__depart itin__depart--attente';
    ligneDepart.textContent = 'Départ : localisation en cours…';
    panneau.hidden = false;
    document.documentElement.classList.add('itin-open');
    var premier = liste.querySelector('.itin__app');
    if (premier) premier.focus();

    if (!navigator.geolocation) {
      ligneDepart.className = 'itin__depart';
      ligneDepart.textContent = "Départ : votre position (chaque application la utilise)";
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      depart = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
      remplir(construireApplis(dest, depart));
      ligneDepart.className = 'itin__depart itin__depart--ok';
      ligneDepart.textContent = 'Départ : votre position (' +
        depart.lat.toFixed(4) + ', ' + depart.lng.toFixed(4) + ')';
    }, function () {
      ligneDepart.className = 'itin__depart';
      ligneDepart.textContent = "Départ : votre position (chaque application la utilise)";
    }, { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false });
  }

  function fermer() {
    if (!panneau || panneau.hidden) return;
    panneau.hidden = true;
    document.documentElement.classList.remove('itin-open');
    if (dernierLien && dernierLien.focus) { try { dernierLien.focus(); } catch (e) {} }
  }

  document.addEventListener('click', function (e) {
    var cible = e.target;
    var lien = cible && cible.closest ? cible.closest('[data-metro-route]') : null;
    if (!lien) return;
    e.preventDefault();
    dernierLien = lien;
    var dest = {
      nom: PAR_DEFAUT.nom,
      adresse: lien.getAttribute('data-map-address') || PAR_DEFAUT.adresse,
      lat: parseFloat(lien.getAttribute('data-map-lat')) || PAR_DEFAUT.lat,
      lng: parseFloat(lien.getAttribute('data-map-lng')) || PAR_DEFAUT.lng
    };
    ouvrirPanneau(dest);
  });
})();
