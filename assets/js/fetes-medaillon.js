/* ========================================================================== *
 *  Médaillons de fête — le médaillon central suit le calendrier (Paris)
 * -------------------------------------------------------------------------- *
 *  Un seul fichier pour tout le site : index.html (médaillon de la page de
 *  garde) et 404.html. Chargé en tête de page, puis appliqué juste après le
 *  médaillon pour éviter tout flash.
 *
 *  Utilisation :
 *    <script src="assets/js/fetes-medaillon.js?v=20261011"></script>
 *    <script>FeteMedaillon.applique();</script>
 *    ou, pour un autre médaillon :
 *    <script>FeteMedaillon.applique({ element:'medaillon-404' });</script>
 *
 *  Aperçu / réglages par l'URL :
 *    ?fete=paques            force une fête (id ou alias)
 *    ?noel=1  ?stpatrick=1   raccourcis (idem ?fete=noel, ?fete=saint-patrick)
 *    ?noel=0                 n'affiche jamais celle-là
 *    ?fete=0                 désactive tous les médaillons de fête
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- dates : on calcule à midi, insensible à l'heure d'été ---------- */
  function midi(a, m, d) { return new Date(a, m - 1, d, 12, 0, 0, 0); }
  function ajoute(date, n) { var c = new Date(date.getTime()); c.setDate(c.getDate() + n); return c; }
  function ecart(a, b) { return Math.abs(Math.round((a - b) / 86400000)); }
  function jourSemaine(date, cible, sens) { /* sens 1 : jour suivant, -1 : précédent */
    var d = new Date(date.getTime());
    while (d.getDay() !== cible) d = ajoute(d, sens);
    return d;
  }
  function niemeJour(a, m, n, cible) { /* n-ième <cible> (0 = dimanche) du mois m */
    var d = midi(a, m, 1), trouve = 0;
    while (true) { if (d.getDay() === cible) { trouve++; if (trouve === n) return d; } d = ajoute(d, 1); }
  }
  function paques(a) { /* dimanche de Pâques — Meeus/Jones/Butcher, grégorien */
    var A = a % 19, B = Math.floor(a / 100), C = a % 100, D = Math.floor(B / 4), E = B % 4,
        F = Math.floor((B + 8) / 25), G = Math.floor((B - F + 1) / 3), H = (19 * A + B - D - G + 15) % 30,
        I = Math.floor(C / 4), K = C % 4, L = (32 + 2 * E + 2 * I - H - K) % 7,
        M = Math.floor((A + 11 * H + 22 * L) / 451);
    return midi(a, Math.floor((H + L - 7 * M + 114) / 31), ((H + L - 7 * M + 114) % 31) + 1);
  }
  function feteDesMeres(a) { /* dernier dimanche de mai, ou 1er dimanche de juin si Pentecôte */
    var d = jourSemaine(midi(a, 6, 0), 0, -1);
    if (ecart(d, ajoute(paques(a), 49)) === 0) d = niemeJour(a, 6, 1, 0);
    return d;
  }

  /* ---------- calendrier des médaillons ----------
     pic     : le jour de la fête (sert à départager deux fenêtres qui se
               chevauchent : c'est la fête la plus proche qui gagne)
     fenetre : [début, fin] d'affichage, bornes incluses                     */
  var FETES = [
    { id:'nouvel-an', fichier:'medaillon-logo-nouvel-an.svg', titre:'Bonne année — La Colline Gambetta',
      alias:['nouvelan','jourdelan','reveillon','an','ny'],
      pic:function (a) { return midi(a, 1, 1); },
      fenetre:function (a) { return [midi(a - 1, 12, 26), midi(a, 1, 1)]; } },
    { id:'epiphanie', fichier:'medaillon-logo-epiphanie.svg', titre:'Épiphanie — galette des rois',
      alias:['epiphanie','galette','rois'],
      pic:function (a) { return niemeJour(a, 1, 1, 0); },
      fenetre:function (a) { return [midi(a, 1, 2), midi(a, 1, 14)]; } },
    { id:'chandeleur', fichier:'medaillon-logo-chandeleur.svg', titre:'Chandeleur — crêpes maison',
      alias:['chandeleur','crepes'],
      pic:function (a) { return midi(a, 2, 2); },
      fenetre:function (a) { return [midi(a, 1, 28), midi(a, 2, 4)]; } },
    { id:'saint-valentin', fichier:'medaillon-logo-saint-valentin.svg', titre:'Saint-Valentin — La Colline Gambetta',
      alias:['saintvalentin','valentin','coeur','amour'],
      pic:function (a) { return midi(a, 2, 14); },
      fenetre:function (a) { return [midi(a, 2, 5), midi(a, 2, 16)]; } },
    { id:'mardi-gras', fichier:'medaillon-logo-mardi-gras.svg', titre:'Mardi gras — carnaval',
      alias:['mardigras','carnaval'],
      pic:function (a) { return ajoute(paques(a), -47); },
      fenetre:function (a) { var p = ajoute(paques(a), -47); return [ajoute(p, -4), ajoute(p, 1)]; } },
    { id:'paques', fichier:'medaillon-logo-paques.svg', titre:'Joyeuses Pâques — La Colline Gambetta',
      alias:['paque','easter'],
      pic:paques,
      fenetre:function (a) { return [ajoute(paques(a), -8), ajoute(paques(a), 7)]; } },
    { id:'saint-patrick', fichier:'medaillon-logo-saint-patrick.svg', titre:'Saint-Patrick — La Colline Gambetta',
      alias:['stpatrick','stpat','stp','saintpat'], css:'stpatrick-medallion-active',
      pic:function (a) { return midi(a, 3, 17); },
      fenetre:function (a) { return [midi(a, 3, 10), midi(a, 3, 20)]; } },
    { id:'fete-des-meres', fichier:'medaillon-logo-fete-des-meres.svg', titre:'Fête des mères',
      alias:['fetedemeres','meres','mamans'],
      pic:feteDesMeres,
      fenetre:function (a) { var p = feteDesMeres(a); return [ajoute(p, -5), ajoute(p, 1)]; } },
    { id:'fete-de-la-musique', fichier:'medaillon-logo-fete-de-la-musique.svg', titre:'Fête de la musique — 21 juin',
      alias:['fdm','fetedelamusique','musique','vinyle'],
      pic:function (a) { return midi(a, 6, 21); },
      fenetre:function (a) { return [midi(a, 6, 16), midi(a, 6, 24)]; } },
    { id:'14-juillet', fichier:'medaillon-logo-14-juillet.svg', titre:'14 Juillet — fête nationale',
      alias:['14juillet','juillet','nationale'],
      pic:function (a) { return midi(a, 7, 14); },
      fenetre:function (a) { return [midi(a, 7, 10), midi(a, 7, 16)]; } },
    { id:'oktoberfest', fichier:'medaillon-logo-oktoberfest.svg', titre:'Oktoberfest — bières de saison',
      alias:['oktoberfest','biere','bieres'],
      pic:function (a) { return midi(a, 9, 20); },
      fenetre:function (a) { return [midi(a, 9, 16), midi(a, 10, 5)]; } },
    { id:'halloween', fichier:'medaillon-logo-halloween.svg', titre:'Halloween — La Colline Gambetta',
      alias:['halloween','citrouilles'],
      pic:function (a) { return midi(a, 10, 31); },
      fenetre:function (a) { return [midi(a, 10, 24), midi(a, 11, 2)]; } },
    { id:'beaujolais-nouveau', fichier:'medaillon-logo-beaujolais-nouveau.svg', titre:'Le Beaujolais nouveau est arrivé',
      alias:['beaujolais','beaujolaisnouveau'],
      pic:function (a) { return niemeJour(a, 11, 3, 4); },
      fenetre:function (a) { var p = niemeJour(a, 11, 3, 4); return [ajoute(p, -3), ajoute(p, 5)]; } },
    { id:'noel', fichier:'medaillon-logo-noel-full.svg', titre:'Joyeux Noël — La Colline Gambetta',
      alias:['noel','christmas','xmas'], css:'xmas-medallion-active',
      pic:function (a) { return midi(a, 12, 25); },
      fenetre:function (a) { return [midi(a, 12, 1), midi(a, 12, 25)]; } }
  ];

  var VERSION = '20261011';

  /* ---------- date du jour à Paris ---------- */
  function aujourdhuiParis() {
    try {
      var f = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit' });
      var p = f.formatToParts(new Date()), o = {};
      for (var i = 0; i < p.length; i++) o[p[i].type] = p[i].value;
      return midi(Number(o.year), Number(o.month), Number(o.day));
    } catch (e) {
      var n = new Date();
      return midi(n.getFullYear(), n.getMonth() + 1, n.getDate());
    }
  }

  /* ---------- quelle fête ce jour-là ? ---------- */
  function duJour(maintenant) {
    var an = maintenant.getFullYear(), retenue = null, meilleur = Infinity;
    for (var i = 0; i < FETES.length; i++) {
      var f = FETES[i];
      /* les fenêtres peuvent chevaucher l'année (26/12 → 5/01) : on regarde
         l'année en cours et ses voisines, et on garde la fête la plus proche */
      for (var k = -1; k <= 1; k++) {
        var w = f.fenetre(an + k);
        if (maintenant < w[0] || maintenant > w[1]) continue;
        var d = ecart(maintenant, f.pic(an + k));
        if (d < meilleur) { meilleur = d; retenue = f; }
        break;
      }
    }
    return retenue;
  }

  /* ---------- choix final : calendrier + paramètres d'URL ---------- */
  function choisir(search, maintenant) {
    maintenant = maintenant || aujourdhuiParis();
    var qs, force = '';
    try { qs = new URLSearchParams(search || ''); } catch (e) { return duJour(maintenant); }
    force = (qs.get('fete') || '').toLowerCase();
    if (force === '0' || force === 'off' || force === 'aucune' || qs.get('fetes') === '0') return null;

    var i, q, clefs, v;
    if (force && force !== '1') {                       /* ?fete=paques */
      for (i = 0; i < FETES.length; i++) {
        var f = FETES[i];
        if (f.id === force) return f;
        clefs = f.alias || [];
        for (q = 0; q < clefs.length; q++) if (clefs[q] === force) return f;
      }
      return null;
    }
    var retenue = duJour(maintenant);
    for (i = 0; i < FETES.length; i++) {                /* ?paques=1 ?noel=1 … */
      clefs = [FETES[i].id].concat(FETES[i].alias || []);
      for (q = 0; q < clefs.length; q++) {
        v = qs.get(clefs[q]);
        if (v === '1' || v === 'oui') retenue = FETES[i];
      }
    }
    for (i = 0; i < FETES.length; i++) {                /* ?noel=0 : jamais celle-là */
      clefs = [FETES[i].id].concat(FETES[i].alias || []);
      for (q = 0; q < clefs.length; q++) if (qs.get(clefs[q]) === '0' && retenue === FETES[i]) retenue = null;
    }
    return retenue;
  }

  function hrefDe(f) { return 'assets/cover/' + f.fichier + '?v=' + VERSION; }

  /* ---------- application sur un médaillon ---------- */
  function applique(options) {
    options = options || {};
    var doc = global.document;
    if (!doc) return null;
    var racine = options.racine || doc.documentElement;
    if (racine && racine.classList && racine.classList.contains('carte-doc')) return null;

    var element = options.element;
    if (typeof element === 'string') element = doc.getElementById(element) || doc.querySelector(element);
    if (typeof element === 'function') { try { element = element(); } catch (e) { element = null; } }
    if (!element) {
      element = doc.getElementById('medallion-web') || doc.querySelector('.medallion-photo--web');
    }
    if (!element) return null;
    /* <img> (page 404) ou <image> dans un SVG (page de garde) */
    var estImg = !!element.tagName && String(element.tagName).toLowerCase() === 'img';

    var appliquee = null, cssPrecedent = '';

    function poser(f) {
      var href = hrefDe(f);
      if (estImg) {
        if ((element.getAttribute('src') || '').indexOf(f.fichier) === -1) {
          try { var p = new Image(); p.src = href; } catch (e) {}
          element.setAttribute('src', href);
        }
        try { element.setAttribute('alt', f.titre); } catch (e) {}
      } else {
        var deja = (element.getAttribute('href') || '') + ' ' + (element.getAttribute('xlink:href') || '');
        if (deja.indexOf(f.fichier) === -1) {
          try { var pre = new Image(); pre.src = href; } catch (e) {}
          element.setAttribute('href', href);
          try { element.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) {}
          try { element.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href); } catch (e) {}
        }
        try { element.setAttribute('aria-label', f.titre); } catch (e) {}
      }
      if (racine && racine.classList) {
        if (appliquee && appliquee !== f.id) {
          racine.classList.remove('fete-' + appliquee + '-active');
          if (cssPrecedent && cssPrecedent !== f.css) racine.classList.remove(cssPrecedent);
        }
        cssPrecedent = f.css || '';
        racine.classList.add('fete-medallion-active');
        racine.classList.add('fete-' + f.id + '-active');
        if (f.css) racine.classList.add(f.css);
      }
      appliquee = f.id;
      return f;
    }

    var courante = choisir(global.location ? global.location.search : '', aujourdhuiParis());
    if (courante) poser(courante);

    /* la page reste ouverte (tablette du bar) : on suit le changement de date,
       sans recharger — on remplace simplement le médaillon */
    if (options.suivi !== false) {
      function reverifier() {
        try {
          var c = choisir(global.location ? global.location.search : '', aujourdhuiParis());
          if (c && c.id !== appliquee) poser(c);
        } catch (e) {}
      }
      try { global.setInterval(reverifier, 30 * 60 * 1000); } catch (e) {}
      try {
        doc.addEventListener('visibilitychange', function () { if (!doc.hidden) reverifier(); });
      } catch (e) {}
    }
    return courante;
  }

  global.FeteMedaillon = {
    fetes: FETES,
    version: VERSION,
    paques: paques,
    aujourdhui: aujourdhuiParis,
    duJour: duJour,
    choisir: choisir,
    href: hrefDe,
    applique: applique
  };
})(typeof window !== 'undefined' ? window : this);
