/* ========================================================================== *
 *  Itinéraires — lien « Métro Gambetta • Ligne 3 » et adresse postale
 * -------------------------------------------------------------------------- *
 *  Deux portes d'entrée, un seul panneau de choix :
 *    [data-metro-route]  « Venir en métro »       : trajet en transports
 *    [data-nav-route]    « Venir au restaurant »   : navigation guidée
 *
 *  Au clic, on demande au visiteur dans QUELLE application ouvrir le trajet :
 *  départ = sa position (géolocalisation du navigateur), arrivée = le
 *  restaurant. La position n'est demandée qu'au clic, jamais au chargement.
 *
 *  Les liens gardent un href valable (Google Maps) : sans JavaScript, ils
 *  ouvrent directement l'itinéraire.
 *
 *  Formats utilisés (documentés) :
 *    Google Maps  https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=transit|driving
 *    Plans        https://maps.apple.com/?saddr=…&daddr=…&dirflg=r|d   (r = transports, d = voiture)
 *    Waze         https://waze.com/ul?ll=<lat>,<lng>&q=…&navigate=yes
 *    Bonjour RATP fiche App Store (id 507107090) / fiche Play Store
 *                 (com.fabernovel.ratp) sur mobile, calculateur officiel
 *                 ratp.fr/itineraires sur ordinateur — la RATP ne publie pas
 *                 de lien profond.
 *  Sans origine, chaque application part d'elle-même de la position de
 *  l'appareil : le visiteur n'est jamais bloqué par un refus de localisation.
 * ========================================================================== */
(function () {
  'use strict';

  var PAR_DEFAUT = {
    nom: 'La Colline Gambetta',
    adresse: 'La Colline Gambetta, 4 Rue Belgrand, 75020 Paris',
    court: '4 rue Belgrand, 75020 Paris',
    lat: 48.8647788,
    lng: 2.3993777
  };

  function estApple() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod|Macintosh/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /* ---------- Bonjour RATP ----------
     Pas de lien profond public : sur téléphone on ouvre la fiche de
     l'application, qui l'ouvre si elle est installée, sinon propose de
     l'installer ; sur ordinateur, où l'application n'existe pas, on ouvre le
     calculateur officiel de la RATP. */
  function lienRatp() {
    var ua = navigator.userAgent || '';
    var apple = /iPad|iPhone|iPod|Macintosh/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (apple) {
      return { web: 'https://apps.apple.com/fr/app/bonjour-ratp/id507107090',
        detail: "Ouvre l'application, ou l'installe" };
    }
    if (/Android/i.test(ua)) {
      return { web: 'https://play.google.com/store/apps/details?id=com.fabernovel.ratp&hl=fr',
        detail: "Ouvre l'application, ou l'installe" };
    }
    return { web: 'https://www.ratp.fr/itineraires', detail: 'Calculateur officiel RATP' };
  }

  /* ---------- les applications proposées ---------- */
  function applisMetro(dest, origine) {
    var adresse = encodeURIComponent(dest.adresse);
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

    var ratp = lienRatp();
    applis.push({ id: 'ratp', nom: 'Bonjour RATP', icone: '🚇',
      detail: ratp.detail, web: ratp.web });
    return applis;
  }

  function applisAdresse(dest, origine) {
    var adresse = encodeURIComponent(dest.adresse);
    var applis = [];

    /* Plans (Apple) : dirflg=d pour la navigation voiture */
    if (estApple()) {
      var plans = 'https://maps.apple.com/?daddr=' + adresse + '&dirflg=d';
      if (origine) plans += '&saddr=' + encodeURIComponent(origine);
      applis.push({ id: 'plans', nom: 'Plans', icone: '🍎',
        detail: 'Navigation guidée', web: plans });
    }

    var google = 'https://www.google.com/maps/dir/?api=1&destination=' + adresse + '&travelmode=driving';
    if (origine) google += '&origin=' + encodeURIComponent(origine);
    applis.push({ id: 'google', nom: 'Google Maps', icone: '🗺️',
      detail: 'Navigation guidée', web: google });

    /* Waze : navigation porte-à-porte. Le lien https ouvre l'application si
       elle est installée, sinon le calculateur web de Waze. Waze part toujours
       de la position de l'appareil : pas de paramètre de départ. */
    var waze = 'https://waze.com/ul?ll=' + encodeURIComponent(dest.lat + ',' + dest.lng) +
      '&q=' + adresse + '&navigate=yes';
    applis.push({ id: 'waze', nom: 'Waze', icone: '🚗',
      detail: 'Navigation porte-à-porte', web: waze });
    return applis;
  }

  var MODES = {
    metro: { titre: 'Venir en métro', applis: applisMetro },
    adresse: { titre: 'Venir au restaurant', applis: applisAdresse }
  };

  /* ---------- ouverture ----------
     Toutes les applications proposées s'ouvrent par un lien https, dans un
     nouvel onglet ; le téléphone passe la main à l'application quand elle est
     installée. (Le schéma natif et son repli, utilisés par le passé pour
     Moovit, restent possibles via la propriété `app` d'une entrée.) */
  function ouvrir(app) {
    var cible = app.app || app.web;
    var w = window.open(cible, '_blank', 'noopener,noreferrer');
    if (!w) window.location.assign(cible);
  }

  /* ---------- le panneau de choix ---------- */
  var panneau = null, liste = null, ligneDepart = null, titreEl = null, dernierLien = null;

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

    titreEl = document.createElement('h2');
    titreEl.className = 'itin__titre';
    titreEl.id = 'itin-titre';

    var sous = document.createElement('p');
    sous.className = 'itin__sous';
    sous.textContent = 'Arrivée : ' + PAR_DEFAUT.nom + ' — ' + PAR_DEFAUT.court;

    ligneDepart = document.createElement('p');
    ligneDepart.className = 'itin__depart';

    liste = document.createElement('div');
    liste.className = 'itin__liste';

    var copier = document.createElement('button');
    copier.type = 'button';
    copier.className = 'itin__copier';
    copier.textContent = "Copier l'adresse";
    copier.addEventListener('click', function () {
      var texte = PAR_DEFAUT.court;
      var fin = function () { copier.textContent = "Adresse copiée ✓"; };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texte).then(fin, function () {});
        } else { fin(); }
      } catch (e) { fin(); }
      window.setTimeout(function () { copier.textContent = "Copier l'adresse"; }, 2200);
    });

    boite.appendChild(fermerBtn);
    boite.appendChild(titreEl);
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

  function ouvrirPanneau(dest, mode) {
    if (!panneau) construire();
    titreEl.textContent = (MODES[mode] || MODES.metro).titre;
    /* première passe sans position : les applications partent d'elles-mêmes
       de la position de l'appareil — le visiteur peut cliquer tout de suite */
    remplir((MODES[mode] || MODES.metro).applis(dest, null));
    ligneDepart.className = 'itin__depart itin__depart--attente';
    ligneDepart.textContent = 'Départ : localisation en cours…';
    panneau.hidden = false;
    document.documentElement.classList.add('itin-open');
    var premier = liste.querySelector('.itin__app');
    if (premier) premier.focus();

    var sansPosition = function () {
      ligneDepart.className = 'itin__depart';
      ligneDepart.textContent = "Départ : votre position (chaque application la utilise)";
    };
    if (!navigator.geolocation) { sansPosition(); return; }

    navigator.geolocation.getCurrentPosition(function (pos) {
      var depart = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
      remplir((MODES[mode] || MODES.metro).applis(dest, depart.lat + ',' + depart.lng));
      ligneDepart.className = 'itin__depart itin__depart--ok';
      ligneDepart.textContent = 'Départ : votre position (' +
        depart.lat.toFixed(4) + ', ' + depart.lng.toFixed(4) + ')';
    }, sansPosition, { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false });
  }

  function fermer() {
    if (!panneau || panneau.hidden) return;
    panneau.hidden = true;
    document.documentElement.classList.remove('itin-open');
    if (dernierLien && dernierLien.focus) { try { dernierLien.focus(); } catch (e) {} }
  }

  document.addEventListener('click', function (e) {
    var cible = e.target;
    var lien = cible && cible.closest ? cible.closest('[data-metro-route], [data-nav-route]') : null;
    if (!lien) return;
    e.preventDefault();
    dernierLien = lien;
    var mode = lien.hasAttribute('data-nav-route') ? 'adresse' : 'metro';
    var dest = {
      nom: PAR_DEFAUT.nom,
      adresse: lien.getAttribute('data-map-address') || PAR_DEFAUT.adresse,
      lat: parseFloat(lien.getAttribute('data-map-lat')) || PAR_DEFAUT.lat,
      lng: parseFloat(lien.getAttribute('data-map-lng')) || PAR_DEFAUT.lng
    };
    ouvrirPanneau(dest, mode);
  });
})();
