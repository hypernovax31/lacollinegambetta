#!/usr/bin/env python3
"""Bandeau d'avis Google de la page de garde.

Le chargement automatique passe par la bibliothèque Places de l'API Maps
JavaScript (adaptée au navigateur), et non par l'API REST Places appelée en
fetch cross-origin. La clé est donc une clé navigateur publique, à restreindre
au domaine et aux API nécessaires dans Google Cloud Console.

La source manuelle reste disponible en secours. Rien n'est inventé : sans
note valide, le bandeau reste masqué. Le script est idempotent.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

CSS = r"""/* avis-google:css:debut */
/* ===== Avis Google de la page de garde =====================================
   Le contour et l'espace libre distinguent les données de Google du reste du
   contenu. L'attribution textuelle Google Maps reste toujours visible. */
html.carte-doc .cover-reviews { display:none !important; }
html:not(.carte-doc) .cover-reviews[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews {
  box-sizing:border-box; display:flex; flex-direction:column; align-items:center;
  gap:.42rem; width:100%; max-width:min(560px, 92vw);
  margin:.7rem auto 0; padding:.7rem .85rem;
  text-align:center; border:1px solid rgba(240,220,168,.22);
  border-radius:10px; background:rgba(0,0,0,.16);
}
html:not(.carte-doc) .cover-reviews__head {
  display:inline-flex; align-items:center; gap:.5rem; flex-wrap:wrap;
  justify-content:center;
  font-family:'Montserrat',sans-serif; font-size:.78rem; font-weight:600;
  letter-spacing:.07em; text-transform:uppercase; color:#f0dca8;
}
html:not(.carte-doc) .cover-reviews__stars {
  position:relative; display:inline-block; font-size:1.12rem; line-height:1;
  letter-spacing:.1em; color:rgba(216,178,87,.3);
}
html:not(.carte-doc) .cover-reviews__stars::before { content:'\2605\2605\2605\2605\2605'; }
html:not(.carte-doc) .cover-reviews__stars span {
  position:absolute; inset:0 auto 0 0; overflow:hidden; white-space:nowrap;
  color:#e8c268; text-shadow:0 1px 2px rgba(0,0,0,.45);
}
html:not(.carte-doc) .cover-reviews__stars span::before { content:'\2605\2605\2605\2605\2605'; }
html:not(.carte-doc) .cover-reviews__note { font-size:.95rem; letter-spacing:.04em; color:#f6e4b8; }
html:not(.carte-doc) .cover-reviews__count { opacity:.82; font-weight:500; letter-spacing:.05em; }
html:not(.carte-doc) .cover-reviews__carousel {
  display:grid; grid-template-columns:2.35rem minmax(0,1fr) 2.35rem;
  align-items:center; gap:.35rem; width:100%;
}
html:not(.carte-doc) .cover-reviews__carousel[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews__viewport {
  min-width:0; overflow:hidden; border-radius:4px; touch-action:pan-y;
  outline-offset:3px;
}
html:not(.carte-doc) .cover-reviews__track {
  display:flex; width:100%; transform:translate3d(0,0,0);
  transition:transform .34s cubic-bezier(.22,.68,0,1.02); will-change:transform;
}
html:not(.carte-doc) .cover-reviews__slide {
  box-sizing:border-box; flex:0 0 100%; width:100%; padding:0 .18rem;
}
html:not(.carte-doc) .cover-reviews__review { max-width:48ch; margin:0 auto; }
html:not(.carte-doc) .cover-reviews__quote {
  margin:.08rem 0 .32rem; font-family:'Montserrat',sans-serif; font-style:italic;
  font-size:.78rem; line-height:1.5; color:rgba(255,255,255,.9);
}
html:not(.carte-doc) .cover-reviews__meta {
  display:flex; align-items:center; justify-content:center; flex-wrap:wrap;
  gap:.28rem .55rem; font-family:'Montserrat',sans-serif; font-size:.68rem;
  line-height:1.4; color:rgba(255,255,255,.78);
}
html:not(.carte-doc) .cover-reviews__avatar {
  width:1.35rem; height:1.35rem; border-radius:50%; object-fit:cover;
}
html:not(.carte-doc) .cover-reviews__author { color:rgba(255,255,255,.96); font-style:normal; }
html:not(.carte-doc) .cover-reviews__date { white-space:nowrap; }
html:not(.carte-doc) .cover-reviews__source {
  color:rgba(255,255,255,.86); text-decoration:underline;
  text-underline-offset:2px;
}
html:not(.carte-doc) .cover-reviews__nav {
  box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center;
  width:2.35rem; height:2.35rem; padding:0; border:1px solid rgba(240,220,168,.38);
  border-radius:50%; background:rgba(0,0,0,.18); color:#f0dca8;
  cursor:pointer; transition:background-color .18s ease, color .18s ease, border-color .18s ease;
}
html:not(.carte-doc) .cover-reviews__nav[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews__nav:hover,
html:not(.carte-doc) .cover-reviews__nav:focus-visible {
  border-color:rgba(240,220,168,.78); background:rgba(240,220,168,.14); color:#fff;
}
html:not(.carte-doc) .cover-reviews__nav:focus-visible,
html:not(.carte-doc) .cover-reviews__viewport:focus-visible {
  outline:2px solid #f0dca8;
}
html:not(.carte-doc) .cover-reviews__nav:disabled { opacity:.48; cursor:wait; }
html:not(.carte-doc) .cover-reviews__nav svg {
  display:block; width:1rem; height:1rem; fill:none; stroke:currentColor;
  stroke-width:2; stroke-linecap:round; stroke-linejoin:round;
}
html:not(.carte-doc) .cover-reviews__status {
  margin:-.12rem 0 0; font-family:'Montserrat',sans-serif; font-size:.62rem;
  line-height:1.2; letter-spacing:.08em; color:rgba(255,255,255,.66);
}
html:not(.carte-doc) .cover-reviews__status[hidden],
html:not(.carte-doc) .cover-reviews__disclosure[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews__disclosure {
  max-width:58ch; margin:.02rem 0 0; font-family:'Montserrat',sans-serif;
  font-size:.62rem; line-height:1.35; color:rgba(255,255,255,.62);
}
html:not(.carte-doc) .cover-reviews__data-attribution {
  max-width:58ch; margin:.08rem 0 0; font-family:'Montserrat',sans-serif;
  font-size:.66rem; line-height:1.35; color:rgba(255,255,255,.72);
}
html:not(.carte-doc) .cover-reviews__data-attribution a {
  color:inherit; text-decoration:underline; text-underline-offset:2px;
}
/* Google Maps text attribution: official wording and neutral, readable style. */
html:not(.carte-doc) .cover-reviews__maps-attribution {
  margin-top:.05rem; font-family:Arial,sans-serif; font-size:12px;
  font-style:normal; font-weight:400; letter-spacing:normal;
  line-height:1.35; text-transform:none; white-space:nowrap; color:#fff;
}
html:not(.carte-doc) .cover-reviews__maps-attribution a {
  color:inherit; text-decoration:none;
}
html:not(.carte-doc) .cover-reviews__maps-attribution a:hover { text-decoration:underline; }
html:not(.carte-doc) .cover-reviews a { color:inherit; }
html:not(.carte-doc) .cover-reviews__head { text-decoration:none; }
html:not(.carte-doc) .cover-reviews__head:hover .cover-reviews__note { text-decoration:underline; }
@media (max-width:420px) {
  html:not(.carte-doc) .cover-reviews { padding:.62rem .58rem; }
  html:not(.carte-doc) .cover-reviews__carousel { grid-template-columns:2.1rem minmax(0,1fr) 2.1rem; gap:.2rem; }
  html:not(.carte-doc) .cover-reviews__nav { width:2.1rem; height:2.1rem; }
  html:not(.carte-doc) .cover-reviews__quote { font-size:.74rem; }
}
@media (prefers-reduced-motion:reduce) {
  html:not(.carte-doc) .cover-reviews__track { transition:none; }
  html:not(.carte-doc) .cover-reviews__nav { transition:none; }
}
/* avis-google:css:fin */"""

HTML = r"""<!-- avis-google:html:debut --><div class="cover-reviews" id="cover-reviews" hidden aria-label="Note et avis Google">
          <a class="cover-reviews__head" id="cover-reviews-link" href="https://www.google.com/maps/search/?api=1&amp;query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris" target="_blank" rel="noopener noreferrer">
            <span class="cover-reviews__stars" id="cover-reviews-stars" aria-hidden="true"><span id="cover-reviews-stars-fill"></span></span>
            <span class="cover-reviews__note" id="cover-reviews-note"></span>
            <span class="cover-reviews__count" id="cover-reviews-count"></span>
          </a>
          <div class="cover-reviews__carousel" id="cover-reviews-carousel" role="region" aria-roledescription="carrousel" aria-label="Avis clients Google" hidden>
            <button class="cover-reviews__nav cover-reviews__nav--previous" id="cover-reviews-previous" type="button" aria-label="Avis précédent" aria-controls="cover-reviews-viewport" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5-7.5 7.5 7.5 7.5"/></svg>
            </button>
            <div class="cover-reviews__viewport" id="cover-reviews-viewport" tabindex="0" aria-label="Avis Google sélectionné. Utilisez les flèches gauche et droite pour parcourir les commentaires.">
              <div class="cover-reviews__track" id="cover-reviews-track"></div>
            </div>
            <button class="cover-reviews__nav cover-reviews__nav--next" id="cover-reviews-next" type="button" aria-label="Avis suivant" aria-controls="cover-reviews-viewport" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 4.5 7.5 7.5-7.5 7.5"/></svg>
            </button>
          </div>
          <p class="cover-reviews__status" id="cover-reviews-status" aria-live="polite" aria-atomic="true" hidden></p>
          <p class="cover-reviews__disclosure" id="cover-reviews-disclosure" hidden></p>
          <p class="cover-reviews__data-attribution" id="cover-reviews-data-attribution" hidden></p>
          <div class="cover-reviews__maps-attribution"><a id="cover-reviews-maps" href="https://www.google.com/maps/search/?api=1&amp;query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris" target="_blank" rel="noopener noreferrer" lang="en" translate="no" aria-label="Google Maps">Google Maps</a></div>
        </div><!-- avis-google:html:fin -->"""

JS = r"""<!-- avis-google:js:debut --><script>
/* Le SDK Places de Maps JavaScript est utilisé côté navigateur. La clé
   associée est une clé publique restreinte au site et aux API autorisées.
   Ce chargeur n'enregistre aucun contenu Places. */
(function () {
  var bloc = document.getElementById('cover-reviews');
  if (!bloc || !window.fetch) return;

  var carousel = document.getElementById('cover-reviews-carousel');
  var viewport = document.getElementById('cover-reviews-viewport');
  var piste = document.getElementById('cover-reviews-track');
  var precedent = document.getElementById('cover-reviews-previous');
  var suivant = document.getElementById('cover-reviews-next');
  var position = document.getElementById('cover-reviews-status');
  var divulgation = document.getElementById('cover-reviews-disclosure');
  if (!carousel || !viewport || !piste || !precedent || !suivant || !position || !divulgation) return;

  var URL_CARTE = 'https://www.google.com/maps/search/?api=1&query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris';
  var bibliothequePlaces = null;
  var avisAffichables = [];
  var indiceActif = 0;
  var indicePiste = 0;
  var sourceAvis = 'places';
  var transitionEnCours = false;
  var minuteurTransition = null;
  var departGeste = null;

  function lienSecurise(valeur) {
    if (!valeur) return '';
    try {
      var url = new URL(String(valeur), window.location.href);
      return url.protocol === 'https:' ? url.href : '';
    } catch (e) { return ''; }
  }

  function ajusterPage() {
    var planifier = window.requestAnimationFrame || function (callback) {
      window.setTimeout(callback, 0);
    };
    planifier(function () {
      if (typeof window.sizeCoverMedallion === 'function') window.sizeCoverMedallion();
    });
  }

  function afficher(data, source) {
    var note = Number(String(data && data.note).replace(',', '.'));
    if (!(note > 0 && note <= 5) || !isFinite(note)) return;

    document.getElementById('cover-reviews-stars-fill').style.width =
      (Math.max(0, Math.min(5, note)) / 5 * 100).toFixed(2) + '%';
    document.getElementById('cover-reviews-note').textContent =
      note.toFixed(1).replace('.', ',') + '/5';

    var nombre = Number(data.nombre_avis || 0);
    document.getElementById('cover-reviews-count').textContent = nombre > 0
      ? '\u00b7 ' + nombre.toLocaleString('fr-FR') + ' avis Google'
      : '\u00b7 Avis Google';

    var urlFiche = lienSecurise(data.url) || URL_CARTE;
    var lienEntete = document.getElementById('cover-reviews-link');
    var lienMaps = document.getElementById('cover-reviews-maps');
    lienEntete.href = urlFiche;
    lienMaps.href = urlFiche;
    afficherAttributions(data.attributions);

    var recus = Array.isArray(data.avis) ? data.avis : [];
    var admissibles = [];
    for (var i = 0; i < recus.length; i++) {
      var avis = normaliserAvis(recus[i]);
      if (avis) admissibles.push(avis);
    }
    installerCarrousel(admissibles, source);
    bloc.hidden = false;
    ajusterPage();
  }

  function afficherAttributions(attributions) {
    var element = document.getElementById('cover-reviews-data-attribution');
    while (element.firstChild) element.removeChild(element.firstChild);
    var sources = Array.isArray(attributions)
      ? attributions.filter(function (item) { return item && item.provider; }) : [];
    sources.forEach(function (item, index) {
      if (index) element.appendChild(document.createTextNode('; '));
      if (!index) element.appendChild(document.createTextNode('Données fournies par '));
      var provider = String(item.provider);
      var url = lienSecurise(item.providerURI);
      if (url) {
        var link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = provider;
        element.appendChild(link);
      } else {
        element.appendChild(document.createTextNode(provider));
      }
    });
    element.hidden = sources.length === 0;
  }

  function normaliserAvis(avis) {
    if (!avis) return null;
    var auteurComplet = String(avis.auteur || '').trim();
    var auteur = premierPrenom(auteurComplet);
    var texte = String(avis.texte || '').replace(/\s+/g, ' ').trim();
    var noteAvis = Number(String(avis.note || '').replace(',', '.'));
    var lienAvis = lienSecurise(avis.url_avis || avis.googleMapsURI);
    var photo = lienSecurise(avis.photo || avis.photoURI);
    var profil = lienSecurise(avis.profil || avis.authorURI);
    var date = dateVisite(avis);
    if (!(noteAvis >= 4 && noteAvis <= 5) || !texte || !auteur || !date || !lienAvis) return null;

    if (texte.length > 150) {
      texte = texte.slice(0, 147).replace(/[\s,;:.]+$/, '') + '\u2026';
    }
    return {
      auteur: auteur,
      profil: profil,
      photo: photo,
      note: noteAvis,
      texte: texte,
      date: date,
      url: lienAvis,
      traduit: !!avis.traduit
    };
  }

  function premierPrenom(nom) {
    return String(nom || '').trim().split(/\s+/)[0] || '';
  }

  function creerLien(url, classe, texte) {
    var element = document.createElement(url ? 'a' : 'span');
    element.className = classe;
    element.textContent = texte;
    if (url) {
      element.href = url;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    }
    return element;
  }

  function creerDiapositive(avis, index, clone) {
    var slide = document.createElement('article');
    slide.className = 'cover-reviews__slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'avis');
    if (clone) {
      slide.setAttribute('data-carousel-clone', 'true');
      slide.setAttribute('aria-hidden', 'true');
      slide.setAttribute('inert', '');
    } else {
      slide.setAttribute('data-review-index', String(index));
    }

    var review = document.createElement('div');
    review.className = 'cover-reviews__review';
    var quote = document.createElement('blockquote');
    quote.className = 'cover-reviews__quote';
    quote.textContent = '\u00ab\u202f' + avis.texte + '\u202f\u00bb';
    review.appendChild(quote);

    var meta = document.createElement('div');
    meta.className = 'cover-reviews__meta';
    if (avis.photo) {
      var avatar = document.createElement('img');
      avatar.className = 'cover-reviews__avatar';
      avatar.alt = 'Avatar de ' + avis.auteur;
      avatar.width = 22;
      avatar.height = 22;
      avatar.loading = 'lazy';
      avatar.decoding = 'async';
      avatar.addEventListener('error', function () {
        avatar.hidden = true;
        avatar.removeAttribute('src');
        avatar.alt = '';
      }, { once: true });
      avatar.src = avis.photo;
      meta.appendChild(avatar);
    }
    var auteur = creerLien(avis.profil, 'cover-reviews__author', avis.auteur);
    if (avis.profil) auteur.setAttribute('aria-label', 'Profil Google de ' + avis.auteur);
    meta.appendChild(auteur);

    var date = document.createElement('time');
    date.className = 'cover-reviews__date';
    date.textContent = 'Visite : ' + avis.date;
    meta.appendChild(date);

    var source = creerLien(avis.url, 'cover-reviews__source', 'Voir cet avis sur Google Maps');
    meta.appendChild(source);
    review.appendChild(meta);
    slide.appendChild(review);
    return slide;
  }

  function installerCarrousel(avis, source) {
    avisAffichables = avis;
    sourceAvis = source;
    indiceActif = 0;
    indicePiste = avis.length > 1 ? 1 : 0;
    transitionEnCours = false;
    if (minuteurTransition !== null) {
      window.clearTimeout(minuteurTransition);
      minuteurTransition = null;
    }
    while (piste.firstChild) piste.removeChild(piste.firstChild);

    if (!avis.length) {
      carousel.hidden = true;
      position.hidden = true;
      divulgation.hidden = true;
      return;
    }

    carousel.hidden = false;
    var plusieurs = avis.length > 1;
    precedent.hidden = !plusieurs;
    suivant.hidden = !plusieurs;
    precedent.disabled = false;
    suivant.disabled = false;

    if (plusieurs) piste.appendChild(creerDiapositive(avis[avis.length - 1], avis.length - 1, true));
    avis.forEach(function (item, index) {
      piste.appendChild(creerDiapositive(item, index, false));
    });
    if (plusieurs) piste.appendChild(creerDiapositive(avis[0], 0, true));

    piste.style.transition = 'none';
    placerPiste();
    void piste.offsetWidth;
    piste.style.transition = '';
    actualiserAccessibilite();
    actualiserPositionEtMention();
  }

  function actualiserAccessibilite() {
    Array.prototype.forEach.call(piste.children, function (slide) {
      var clone = slide.getAttribute('data-carousel-clone') === 'true';
      var actif = !clone && Number(slide.getAttribute('data-review-index')) === indiceActif;
      slide.setAttribute('aria-hidden', actif ? 'false' : 'true');
      if (actif) {
        slide.removeAttribute('inert');
        slide.setAttribute('aria-label', 'Avis ' + (indiceActif + 1) + ' sur ' + avisAffichables.length);
      } else {
        slide.setAttribute('inert', '');
        slide.removeAttribute('aria-label');
      }
    });
  }

  function actualiserPositionEtMention() {
    var avis = avisAffichables[indiceActif];
    if (!avis) return;
    position.hidden = avisAffichables.length < 2;
    position.textContent = avisAffichables.length > 1
      ? 'Avis ' + (indiceActif + 1) + ' sur ' + avisAffichables.length
      : '';
    var mention = sourceAvis === 'places'
      ? 'Avis de 4 ou 5 étoiles affichés dans l’ordre de pertinence de Google. Seuls ceux avec texte, date de visite et lien direct disponibles sont présentés. Les avis ne sont pas vérifiés par Google ; les faux contenus identifiés sont retirés.'
      : 'Avis de 4 ou 5 étoiles avec texte, date de visite et lien direct, sélectionnés par La Colline Gambetta. Les avis ne sont pas vérifiés par Google ; les faux contenus identifiés sont retirés.';
    if (avis.traduit) mention += ' Le texte a été traduit par Google ; le lien ouvre l’avis source.';
    divulgation.textContent = mention;
    divulgation.hidden = false;
    actualiserAccessibilite();
  }

  function placerPiste() {
    piste.style.transform = 'translate3d(-' + (indicePiste * 100) + '%,0,0)';
  }

  function mouvementReduit() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function naviguer(direction) {
    var total = avisAffichables.length;
    if (total < 2 || transitionEnCours) return;

    indiceActif = (indiceActif + direction + total) % total;
    indicePiste += direction;
    actualiserPositionEtMention();

    if (mouvementReduit()) {
      indicePiste = indiceActif + 1;
      piste.style.transition = 'none';
      placerPiste();
      void piste.offsetWidth;
      piste.style.transition = '';
      return;
    }

    transitionEnCours = true;
    precedent.disabled = true;
    suivant.disabled = true;
    placerPiste();
    minuteurTransition = window.setTimeout(terminerTransition, 480);
  }

  function terminerTransition() {
    if (!transitionEnCours) return;
    transitionEnCours = false;
    if (minuteurTransition !== null) {
      window.clearTimeout(minuteurTransition);
      minuteurTransition = null;
    }

    if (indicePiste === 0 || indicePiste === avisAffichables.length + 1) {
      indicePiste = indiceActif + 1;
      piste.style.transition = 'none';
      placerPiste();
      void piste.offsetWidth;
      piste.style.transition = '';
    }
    precedent.disabled = false;
    suivant.disabled = false;
  }

  precedent.addEventListener('click', function () { naviguer(-1); });
  suivant.addEventListener('click', function () { naviguer(1); });
  piste.addEventListener('transitionend', function (event) {
    if (event.target === piste && event.propertyName === 'transform') terminerTransition();
  });
  viewport.addEventListener('keydown', function (event) {
    if (event.target !== viewport) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); naviguer(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); naviguer(1); }
  });
  viewport.addEventListener('touchstart', function (event) {
    if (!event.touches || event.touches.length !== 1) { departGeste = null; return; }
    departGeste = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  viewport.addEventListener('touchend', function (event) {
    if (!departGeste || !event.changedTouches || !event.changedTouches.length) return;
    var fin = event.changedTouches[0];
    var deltaX = departGeste.x - fin.clientX;
    var deltaY = departGeste.y - fin.clientY;
    departGeste = null;
    if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      naviguer(deltaX > 0 ? 1 : -1);
    }
  }, { passive: true });
  viewport.addEventListener('touchcancel', function () { departGeste = null; }, { passive: true });

  function dateVisite(avis) {
    var annee = Number(avis.visitDateYear || avis.annee_visite || 0);
    var valeurMois = avis.visitDateMonth;
    var mois = valeurMois === undefined || valeurMois === null || valeurMois === ''
      ? NaN : Number(valeurMois);
    if (!annee && typeof avis.date_visite === 'string') {
      var match = avis.date_visite.match(/^(\d{4})-(\d{1,2})$/);
      if (match) { annee = Number(match[1]); mois = Number(match[2]) - 1; }
    }
    if (!annee || !isFinite(mois) || mois < 0 || mois > 11) return '';
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        month: 'long', year: 'numeric', timeZone: 'UTC'
      }).format(new Date(Date.UTC(annee, mois, 1)));
    } catch (e) { return ''; }
  }

  function texteLocalise(valeur) {
    if (typeof valeur === 'string') return valeur;
    return valeur && typeof valeur.text === 'string' ? valeur.text : '';
  }

  function depuisPlaces(place, secours) {
    if (!place || !place.rating) return null;
    return {
      note: place.rating,
      nombre_avis: place.userRatingCount,
      url: place.googleMapsURI || secours.url || URL_CARTE,
      attributions: Array.isArray(place.attributions) ? place.attributions : [],
      avis: (place.reviews || []).map(function (avis) {
        var auteur = avis.authorAttribution || {};
        return {
          auteur: auteur.displayName || '',
          profil: auteur.uri || '',
          photo: auteur.photoURI || '',
          note: avis.rating,
          texte: texteLocalise(avis.text) || texteLocalise(avis.originalText),
          traduit: !!(avis.textLanguageCode && avis.originalTextLanguageCode &&
            String(avis.textLanguageCode).toLowerCase() !== String(avis.originalTextLanguageCode).toLowerCase()),
          url_avis: avis.googleMapsURI || '',
          visitDateMonth: avis.visitDateMonth,
          visitDateYear: avis.visitDateYear
        };
      })
    };
  }

  function chargerPlaces(cle) {
    if (window.google && window.google.maps &&
        typeof window.google.maps.importLibrary === 'function') {
      return window.google.maps.importLibrary('places');
    }
    if (bibliothequePlaces) return bibliothequePlaces;

    bibliothequePlaces = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var params = new URLSearchParams({
        key: cle,
        v: 'weekly',
        loading: 'async',
        language: 'fr',
        region: 'FR'
      });
      script.src = 'https://maps.googleapis.com/maps/api/js?' + params.toString();
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (!window.google || !window.google.maps ||
            typeof window.google.maps.importLibrary !== 'function') {
          reject(new Error('La bibliothèque Maps JavaScript n’est pas disponible.'));
          return;
        }
        window.google.maps.importLibrary('places').then(resolve, reject);
      };
      script.onerror = function () { reject(new Error('Échec de chargement de Maps JavaScript.')); };
      document.head.appendChild(script);
    });
    return bibliothequePlaces;
  }

  function recupererPlaces(placeId, cle) {
    return chargerPlaces(cle).then(function (lib) {
      if (!lib || !lib.Place) throw new Error('La bibliothèque Places est indisponible.');
      var place = new lib.Place({ id: placeId });
      return place.fetchFields({
        fields: ['rating', 'userRatingCount', 'googleMapsURI', 'reviews', 'attributions']
      }).then(function () { return place; });
    });
  }

  function afficherSecours(data) {
    if (data && data.publie === true && data.note) afficher(data, 'manuel');
  }

  fetch('assets/data/avis-google.json', { cache: 'no-cache' })
    .then(function (reponse) { return reponse.ok ? reponse.json() : null; })
    .then(function (data) {
      if (!data) return;
      if (data.place_id && data.cle_api) {
        var demande = recupererPlaces(data.place_id, data.cle_api)
          .then(function (place) { return depuisPlaces(place, data); })
          .catch(function () { return null; });
        var minuteur;
        var delai = new Promise(function (resolve) {
          minuteur = window.setTimeout(function () { resolve(null); }, 8000);
        });
        return Promise.race([demande, delai]).then(function (live) {
          window.clearTimeout(minuteur);
          if (live) afficher(live, 'places');
          else afficherSecours(data);
        });
      }
      afficherSecours(data);
    })
    .catch(function () {});
})();
</script><!-- avis-google:js:fin -->"""

MODELE = {
    "_mode_emploi": [
        "Deux facons d'alimenter le bandeau d'avis de la page de garde.",
        "A) Automatique : placez une cle publique navigateur dans cle_api et "
        "l'identifiant de votre fiche Google dans place_id. Dans Google Cloud, "
        "restreignez la cle aux referents de votre domaine et aux API Maps "
        "JavaScript et Places (New). La cle est visible dans le navigateur.",
        "B) Manuel : passez publie a true et recopiez la note, le nombre "
        "d'avis et, si vous affichez des extraits, leurs auteurs, textes, liens "
        "Google Maps directs et mois/annee de visite. Le carrousel boucle sur "
        "les avis admissibles ; seul le premier element du nom public est montre.",
        "Aucun avis Places n'est conserve dans le navigateur. Tant qu'aucune "
        "source n'est renseignee, le bandeau reste invisible.",
    ],
    "place_id": "",
    "cle_api": "",
    "publie": False,
    "note": None,
    "nombre_avis": None,
    "url": "",
    "avis": [],
}


def main() -> None:
    s = INDEX.read_text(encoding="utf-8")

    # Styles, juste avant la fermeture de la feuille principale.
    if "/* avis-google:css:debut */" in s:
        i = s.index("/* avis-google:css:debut */")
        j = s.index("/* avis-google:css:fin */", i) + len("/* avis-google:css:fin */")
        s = s[:i] + CSS + s[j:]
    else:
        i = s.index("</style>")
        s = s[:i] + CSS + "\n" + s[i:]

    # Balisage dans la zone qui se trouve sous la premiere page d'accueil.
    if "<!-- avis-google:html:debut -->" in s:
        i = s.index("<!-- avis-google:html:debut -->")
        j = s.index("<!-- avis-google:html:fin -->", i) + len("<!-- avis-google:html:fin -->")
        s = s[:i] + HTML + s[j:]
    elif '<section id="cover-more"' in s:
        k = s.index('<section id="cover-more"')
        j = s.index(">", k) + 1
        s = s[:j] + "\n        " + HTML + s[j:]
    else:
        k = s.index('<div class="cover-links">')
        j = s.index("\n        </div>", k) + len("\n        </div>")
        s = s[:j] + "\n        " + HTML + s[j:]

    # Retire l'ancienne version du chargeur et les fermetures body dupliquees
    # laissees par la version precedente, puis remet le script dans le body.
    s = re.sub(
        r"<!-- avis-google:js:debut -->[\s\S]*?<!-- avis-google:js:fin -->\s*",
        "",
        s,
    )
    s = re.sub(r"</body>\s*", "", s, flags=re.IGNORECASE)
    i = s.rindex("</html>")
    s = s[:i] + JS + "\n</body>\n" + s[i:]
    INDEX.write_text(s, encoding="utf-8")

    config = ROOT / "assets" / "data" / "avis-google.json"
    config.parent.mkdir(parents=True, exist_ok=True)
    if config.exists():
        actuel = json.loads(config.read_text(encoding="utf-8"))
        for cle, valeur in MODELE.items():
            actuel.setdefault(cle, valeur)
        actuel["_mode_emploi"] = MODELE["_mode_emploi"]
        config.write_text(json.dumps(actuel, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("assets/data/avis-google.json : mis a jour (donnees conservees)")
    else:
        config.write_text(json.dumps(MODELE, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("assets/data/avis-google.json : cree")
    print("index.html : bandeau Places navigateur, attribution, avis et secours manuel")


if __name__ == "__main__":
    main()
