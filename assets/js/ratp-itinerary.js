/* Mention « Métro Gambetta • Ligne 3 » : demande l'ouverture de l'application
   Bonjour RATP au clic, sans JAMAIS remplacer la page du site.

   - Le clic demande l'application : schéma d'application ratp:// (c'est lui
     qui déclenche « Ouvrir dans Bonjour RATP ? ») sur iOS et les autres
     mobiles, Intent explicite vers com.fabernovel.ratp sur Android Chrome.
   - La page du site ne disparaît jamais au profit de ratp.fr :
     * l'application s'ouvre -> la page passe en arrière-plan, rien d'autre ;
     * l'ouverture est annulée -> la page reste telle quelle, et un lien
       « Ouvrir le trajet sur ratp.fr » (traduit) apparaît à côté de la
       mention : c'est un second clic volontaire qui ouvre le site RATP dans
       un nouvel onglet ;
     * application absente : Android Chrome ouvre lui-même le trajet RATP
       (S.browser_fallback_url de l'Intent) ; sur iOS le schéma échoue
       silencieusement (iframe) et le même lien manuel apparaît.
   - Ordinateur : lien natif vers ratp.fr, nouvel onglet.

   Aucune page intermédiaire, aucune bannière, aucune demande de position. */
(function () {
  'use strict';

  var SCHEMA_APP = 'ratp://';
  var ATTENTE_APP = 2500;
  var REDOUBLE_MS = 1200;

  var agent = navigator.userAgent || '';
  var tactile = false;
  try {
    tactile = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) {}
  tactile = tactile || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(agent);
  if (!tactile) return;
  var androidChrome = /Android/i.test(agent) && /Chrome/i.test(agent) &&
    !/(EdgA|OPR|SamsungBrowser|DuckDuckGo|; wv)/i.test(agent);

  function naviguer(url) {
    try {
      window.location.assign(url);
    } catch (e) {
      window.location.href = url;
    }
  }

  /* Intent Android : application visée ; si elle est absente, Chrome ouvre
     lui-même le trajet RATP (arrivée remplie), sans page intermédiaire. */
  function intentUrl(appUrl, repli) {
    var app = new URL(appUrl);
    return 'intent://' + app.host + app.pathname + app.search +
      '#Intent;scheme=https;package=com.fabernovel.ratp;' +
      'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
  }

  /* Lien « Ouvrir le trajet sur ratp.fr », inséré à côté de la mention quand
     l'application ne s'est pas ouverte. Libellé traduit par i18n.js via
     l'attribut data-ratp-trajet-site. */
  function ajouterLienSite(lien, trajet) {
    if (lien.parentNode.querySelector('.footer-details__metro-site')) return;
    var libelle = lien.getAttribute('data-ratp-trajet-site') || 'Ouvrir le trajet sur ratp.fr';
    var separateur = document.createElement('span');
    separateur.className = 'footer-details__separator';
    separateur.setAttribute('aria-hidden', 'true');
    separateur.textContent = '•';
    var lienSite = document.createElement('a');
    lienSite.className = 'footer-details__metro-site';
    lienSite.href = trajet;
    lienSite.target = '_blank';
    lienSite.rel = 'noopener';
    lienSite.title = libelle;
    lienSite.textContent = libelle;
    lien.parentNode.insertBefore(separateur, lien.nextSibling);
    lien.parentNode.insertBefore(lienSite, separateur.nextSibling);
    /* La langue peut changer après l'échec : le libellé suit. */
    window.addEventListener('lcg-lang-changed', function () {
      var nouveau = lien.getAttribute('data-ratp-trajet-site');
      if (nouveau && nouveau !== lienSite.textContent) {
        lienSite.textContent = nouveau;
        lienSite.title = nouveau;
      }
    });
  }

  document.querySelectorAll('[data-ratp-itineraire]').forEach(function (lien) {
    var appUrl = lien.getAttribute('data-ratp-app-href');
    var trajet = lien.getAttribute('href');
    if (!appUrl || !trajet) return;

    /* Écran tactile : le lien vise l'application (lien universel) pour le cas
       sans JavaScript ; le clic, lui, passe par la demande système. */
    lien.href = appUrl;
    lien.removeAttribute('target');

    var dernierClic = 0;
    lien.addEventListener('click', function (event) {
      var maintenant = Date.now();
      event.preventDefault();
      if (maintenant - dernierClic < REDOUBLE_MS) return;
      dernierClic = maintenant;

      /* L'application a pris la main : la page passe en arrière-plan. */
      var applicationOuverte = false;
      window.addEventListener('pagehide', function () { applicationOuverte = true; }, { once: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) applicationOuverte = true;
      }, { once: true });

      if (androidChrome) {
        /* Android Chrome : l'Intent gère tout nativement. Application absente
           -> Chrome ouvre le trajet RATP tout seul ; annulé -> rien ne se
           passe, la page du site reste. Le site n'ajoute aucun minuteur. */
        naviguer(intentUrl(appUrl, trajet));
        return;
      }

      /* iOS et autres mobiles : demande d'ouverture via le schéma, dans une
         iframe jetable — jamais dans la page courante, que Safari remplacerait
         par « Impossible d'ouvrir la page » si l'application est absente. */
      var essai = document.createElement('iframe');
      essai.style.display = 'none';
      essai.setAttribute('aria-hidden', 'true');
      essai.tabIndex = -1;
      essai.src = SCHEMA_APP;
      document.body.appendChild(essai);

      window.setTimeout(function () {
        if (essai.parentNode) essai.parentNode.removeChild(essai);
        /* L'application s'est ouverte : on ne touche à rien. */
        if (applicationOuverte || document.hidden) return;
        /* Annulée ou absente : la page du site reste, on propose le trajet
           sur ratp.fr en manuel (second clic volontaire, nouvel onglet). */
        ajouterLienSite(lien, trajet);
      }, ATTENTE_APP);
    });
  });
})();
