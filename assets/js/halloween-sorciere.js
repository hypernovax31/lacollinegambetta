/* ========================================================================== *
 *  Halloween — la sorcière passe de temps en temps et fait coucou
 * -------------------------------------------------------------------------- *
 *  Même mécanique que le traîneau du Père Noël : un survol programmé, une
 *  traversée en arc avec de légères ondulations, une apparition en fondu, et
 *  rien qui tourne quand l'onglet est caché. La sorcière lève le bras au
 *  milieu du trajet (classe « sorciere--coucou », animation CSS du bras).
 *
 *  Actif uniquement sur la fenêtre Halloween : classe html.fete-halloween-active
 *  posée par assets/js/fetes-medaillon.js, ou ?halloween=1 / ?sorciere=1.
 *  Jamais en mode carte-doc, jamais à l'impression, jamais si le visiteur a
 *  demandé la réduction des animations.
 *
 *  Le SVG est injecté par ce script : hors saison, aucun nœud ajouté au DOM et
 *  aucun fichier chargé. La boucle d'animation ne tourne que pendant un vol.
 *
 *  API : window.__lcgSorciere.fly() / .pause() / .resume() / .programmer(ms)
 *        (utilisée par preview-halloween.html pour la déclencher à la demande)
 * ========================================================================== */
(function () {
  'use strict';

  var SVG = '<svg viewBox="0 -52 448 236" xmlns="http://www.w3.org/2000/svg">\
  <defs>\
    <radialGradient id="gLune" cx="50%" cy="50%" r="50%">\
      <stop offset="0" stop-color="#ffe9b0" stop-opacity=".38"/>\
      <stop offset="55%" stop-color="#e8c46a" stop-opacity=".16"/>\
      <stop offset="100%" stop-color="#e8c46a" stop-opacity="0"/>\
    </radialGradient>\
    <linearGradient id="gRobe" x1="0" y1="0" x2="0" y2="1">\
      <stop offset="0" stop-color="#4a2263"/><stop offset="1" stop-color="#25102f"/>\
    </linearGradient>\
    <linearGradient id="gCape" x1="1" y1="0" x2="0" y2="1">\
      <stop offset="0" stop-color="#6d3692"/><stop offset="1" stop-color="#331550"/>\
    </linearGradient>\
    <linearGradient id="gBois" x1="0" y1="0" x2="0" y2="1">\
      <stop offset="0" stop-color="#a0703e"/><stop offset="1" stop-color="#58381c"/>\
    </linearGradient>\
    <linearGradient id="gChapeau" x1="0" y1="0" x2="1" y2="1">\
      <stop offset="0" stop-color="#3d1a4f"/><stop offset="1" stop-color="#1a0a22"/>\
    </linearGradient>\
  </defs>\
\
  <!-- halo : la sorcière passe devant la lune -->\
  <ellipse cx="228" cy="52" rx="190" ry="96" fill="url(#gLune)"/>\
\
  <!-- ===== balai ===== -->\
  <g stroke-linecap="round" fill="none">\
    <path d="M56 120 L368 86" stroke="url(#gBois)" stroke-width="13"/>\
    <path d="M58 116 L366 83" stroke="#c68f4f" stroke-width="3.5" opacity=".5"/>\
    <g stroke="#cfa351" stroke-width="4.5">\
      <path d="M58 119 L8 103"/><path d="M58 120 L4 118"/><path d="M58 121 L8 133"/><path d="M58 122 L16 145"/><path d="M58 123 L28 154"/>\
    </g>\
    <g stroke="#8a6528" stroke-width="3">\
      <path d="M58 119 L14 107"/><path d="M58 121 L12 126"/><path d="M58 122 L22 138"/>\
    </g>\
  </g>\
  <path d="M64 108 L78 110 L76 134 L62 132 Z" fill="#b8362c"/>\
\
  <!-- ===== cape ===== -->\
  <path d="M234 60 C196 58 142 74 96 108 C124 122 156 116 184 102 C204 92 222 82 240 78 Z" fill="url(#gCape)"/>\
  <path d="M232 66 C188 70 140 88 100 114 C118 120 142 114 164 104" fill="#8b4bb0" opacity=".4" stroke="none"/>\
\
  <!-- ===== jambe ===== -->\
  <g stroke="#1c0b25" stroke-width="14" stroke-linecap="round" fill="none">\
    <path d="M216 98 L256 108"/><path d="M256 108 L242 134"/>\
  </g>\
  <path d="M244 134 L214 142 L222 152 L252 142 Z" fill="#150820"/>\
\
  <!-- ===== bras du fond ===== -->\
  <path d="M238 68 L294 86" stroke="#22102c" stroke-width="13" stroke-linecap="round" fill="none"/>\
  <circle cx="298" cy="88" r="7.5" fill="#f0dcbb"/>\
\
  <!-- ===== buste / robe ===== -->\
  <path d="M202 94 C208 74 220 62 238 58 C254 55 262 66 255 81 C248 96 234 104 216 106 C205 106 199 102 202 94 Z" fill="url(#gRobe)"/>\
  <path d="M200 98 C178 102 166 114 174 124 C186 132 214 122 230 110 C216 106 206 102 200 98 Z" fill="#2c1238"/>\
  <path d="M216 106 C228 102 242 98 254 98" stroke="#d8b257" stroke-width="3" fill="none" opacity=".85"/>\
\
  <!-- ===== cheveux ===== -->\
  <g stroke="#c2622a" stroke-width="7.5" stroke-linecap="round" fill="none">\
    <path d="M248 38 C212 42 180 58 156 80"/>\
    <path d="M246 46 C210 54 178 72 154 94"/>\
    <path d="M244 54 C210 66 188 86 166 106"/>\
  </g>\
\
  <!-- ===== tête ===== -->\
  <circle cx="262" cy="44" r="16.5" fill="#f0dcbb"/>\
  <path d="M276 42 C285 45 285 52 276 54" fill="#f0dcbb"/>\
  <circle cx="268" cy="41" r="2.5" fill="#22102c"/>\
  <path d="M265 54 C270 58 275 57 278 53" stroke="#b9765a" stroke-width="2" fill="none" stroke-linecap="round"/>\
  <circle cx="257" cy="51" r="1.7" fill="#8f3f18" opacity=".65"/>\
\
  <!-- ===== chapeau ===== -->\
  <path d="M226 28 C238 -8 268 -30 312 -36 C296 -2 288 12 292 26 Z" fill="url(#gChapeau)"/>\
  <ellipse cx="258" cy="30" rx="41" ry="10.5" transform="rotate(-8 258 30)" fill="#2b1136"/>\
  <path d="M230 27 C250 21 274 21 290 25" stroke="#d8b257" stroke-width="6" fill="none" stroke-linecap="round"/>\
  <g transform="rotate(-8 258 22)"><rect x="252" y="16" width="13" height="10" rx="2" fill="#f0d78f"/><rect x="255.5" y="19" width="6" height="4" rx="1" fill="#b8912f"/></g>\
\
  <!-- ===== bras qui fait coucou (pivot à 238,66) ===== -->\
  <g class="sorciere__bras">\
    <path d="M238 66 L280 58" stroke="#3d1a52" stroke-width="13" stroke-linecap="round" fill="none"/>\
    <path d="M280 58 L312 40" stroke="#3d1a52" stroke-width="11" stroke-linecap="round" fill="none"/>\
    <circle cx="316" cy="38" r="8" fill="#f0dcbb"/>\
    <g stroke="#f0dcbb" stroke-width="3.4" stroke-linecap="round">\
      <path d="M312 30 L309 20"/><path d="M318 28 L320 18"/><path d="M323 33 L329 26"/>\
    </g>\
  </g>\
</svg>';

  function param(nom) {
    try { return (new URLSearchParams(location.search).get(nom) || '').toLowerCase(); }
    catch (e) { return ''; }
  }

  function active() {
    if (document.documentElement.classList.contains('carte-doc')) return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (param('fete') === '0' || param('fetes') === '0' || param('sorciere') === '0' || param('halloween') === '0') return false;
    if (param('sorciere') === '1' || param('halloween') === '1') return true;
    if (document.documentElement.classList.contains('fete-halloween-active')) return true;
    /* filet de sécurité : le médaillon n'a pas encore tourné au chargement */
    var F = window.FeteMedaillon;
    if (F && F.choisir) {
      try { var f = F.choisir(location.search, F.aujourdhui()); return !!f && f.id === 'halloween'; }
      catch (e) { return false; }
    }
    return false;
  }

  var api = { active: active(), fly: function () {}, pause: function () {}, resume: function () {}, programmer: function () {} };
  window.__lcgSorciere = api;

  /* la page reste ouverte (tablette du bar) : on revérifie la saison souvent,
     sans recharger — on arrête simplement les vols si Halloween est passé */
  var controleSaison = 0;
  function saisonToujoursBonne() {
    if (active() === api.active) return true;
    api.active = active();
    if (api.active) { programmer(4000); return true; }
    finir();                       /* arrête le vol en cours, s'il y en a un */
    window.clearTimeout(minuterieCoucou);
    cache = true;
    if (boite && boite.parentNode) boite.parentNode.removeChild(boite);
    boite = null;
    return false;
  }
  function programmerControleSaison() {
    window.clearTimeout(controleSaison);
    controleSaison = window.setTimeout(function () {
      controleSaison = 0;
      if (saisonToujoursBonne()) programmerControleSaison();
    }, 30 * 60 * 1000);
  }

  var boite = null, bras = null;

  if (api.active) {
    boite = document.createElement('div');
    boite.id = 'halloween-sorciere';
    boite.setAttribute('aria-hidden', 'true');
    boite.innerHTML = '<span class="trail"></span>' + SVG;
    document.body.appendChild(boite);
  }

  var W = 0, H = 0, minuterie = 0, rafId = 0, vol = null, cache = document.hidden, minuterieCoucou = 0;

  function mesure() { W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight); }
  function hasard(a, b) { return a + Math.random() * (b - a); }
  function douce(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function fonduDoux(t) { return Math.sin((t * Math.PI) / 2); }

  function finir() {
    if (!vol) return;
    vol = null;
    window.clearTimeout(minuterieCoucou);
    if (boite) {
      boite.classList.remove('on', 'flip', 'ltr', 'rtl', 'sorciere--coucou');
      boite.style.opacity = '';
      boite.style.transform = '';
    }
    programmer(hasard(38000, 85000));
  }

  function coucou() {
    if (!boite) return;
    boite.classList.add('sorciere--coucou');
    window.clearTimeout(minuterieCoucou);
    minuterieCoucou = window.setTimeout(function () {
      if (boite) boite.classList.remove('sorciere--coucou');
    }, 3400);
  }

  function image(now) {
    rafId = 0;
    if (!vol || cache || !boite) return;
    var s = vol;
    var avance = Math.min(1, (now - s.debut) / s.duree);
    var e = douce(avance);
    var x = s.ltr ? s.x0 + (s.x1 - s.x0) * e : s.x1 - (s.x1 - s.x0) * e;
    var arc = -Math.sin(avance * Math.PI) * H * 0.06;
    var onde1 = Math.sin(avance * Math.PI * 2 * s.vagues + s.phase) * s.amplitude;
    var onde2 = Math.sin(avance * Math.PI * 4.3 + s.phase * 1.3) * s.amplitude * 0.3;
    var y = s.haut + arc + onde1 + onde2;
    var precedent = s.dernierY != null ? s.dernierY : y;
    var tangage = Math.max(-10, Math.min(10, (y - precedent) * 1.4));
    s.dernierY = y;
    var fondu = avance < 0.14 ? fonduDoux(avance / 0.14)
      : avance > 0.86 ? fonduDoux((1 - avance) / 0.14) : 1;
    var echelle = 0.9 + Math.sin(avance * Math.PI) * 0.12;
    boite.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) ' +
      'rotateZ(' + tangage.toFixed(2) + 'deg) scale(' + echelle.toFixed(3) + ')';
    boite.style.opacity = fondu.toFixed(3);
    var trail = boite.querySelector('.trail');
    if (trail) {
      trail.style.opacity = (fondu * 0.75).toFixed(3);
      trail.style.transform = 'scale(' + (0.85 + fondu * 0.45).toFixed(2) + ')';
    }
    /* elle salue en arrivant au milieu de l'écran */
    if (!s.coucouFait && avance > 0.38) { s.coucouFait = true; coucou(); }
    if (avance >= 1) { finir(); return; }
    rafId = requestAnimationFrame(image);
  }

  function voler(options) {
    if (vol || cache || !api.active || !boite) return;
    options = options || {};
    mesure();
    var largeur = options.width || Math.round(Math.max(190, Math.min(360, W * 0.26)));
    var ltr = options.dir ? options.dir === 'ltr' : Math.random() < 0.5;
    vol = {
      ltr: ltr,
      x0: -largeur - 90,
      x1: W + 90,
      haut: options.top == null ? Math.round(H * hasard(0.06, 0.34)) : options.top,
      duree: options.duration || hasard(13000, 18000),
      amplitude: hasard(10, 20),
      vagues: hasard(1.0, 1.6),
      phase: Math.random() * Math.PI * 2,
      debut: (window.performance && performance.now) ? performance.now() : Date.now(),
      dernierY: null,
      coucouFait: false
    };
    boite.style.width = largeur + 'px';
    boite.classList.remove('flip', 'ltr', 'rtl', 'sorciere--coucou');
    boite.classList.add('on', ltr ? 'ltr' : 'rtl');
    if (!ltr) boite.classList.add('flip');
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    rafId = requestAnimationFrame(image);
  }

  function programmer(delai) {
    window.clearTimeout(minuterie); minuterie = 0;
    if (cache || !api.active) return;
    minuterie = window.setTimeout(function () {
      minuterie = 0;
      voler();
    }, delai == null ? hasard(38000, 85000) : delai);
  }

  function maintenant() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function pause() {
    cache = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    window.clearTimeout(minuterie); minuterie = 0;
    window.clearTimeout(minuterieCoucou);
    if (vol) vol.enPause = maintenant();
  }

  function reprendre() {
    cache = false;
    if (vol && vol.enPause) {
      vol.debut += maintenant() - vol.enPause;
      delete vol.enPause;
      vol.dernierY = null;
      if (!rafId) rafId = requestAnimationFrame(image);
    } else if (!vol && !minuterie) {
      programmer(hasard(10000, 22000));
    }
  }

  api.fly = voler;
  api.pause = pause;
  api.resume = reprendre;
  api.programmer = programmer;

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else reprendre();
  });
  window.addEventListener('resize', mesure, { passive: true });
  window.addEventListener('pageshow', function (e) { if (e.persisted) reprendre(); }, false);

  if (api.active) {
    mesure();
    programmer(hasard(7000, 14000));
    programmerControleSaison();
  }
})();
