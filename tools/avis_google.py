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

CSS = """/* avis-google:css:debut */
/* ===== Avis Google de la page de garde =====================================
   Le contour et l'espace libre distinguent les données de Google du reste du
   contenu. L'attribution textuelle Google Maps reste toujours visible. */
html.carte-doc .cover-reviews { display:none !important; }
html:not(.carte-doc) .cover-reviews[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews {
  box-sizing:border-box; display:flex; flex-direction:column; align-items:center;
  gap:.34rem; margin:.7rem auto 0; padding:.55rem .85rem;
  max-width:min(560px, 92vw); text-align:center;
  border:1px solid rgba(240,220,168,.22); border-radius:10px;
  background:rgba(0,0,0,.16);
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
html:not(.carte-doc) .cover-reviews__stars::before { content:'\\2605\\2605\\2605\\2605\\2605'; }
html:not(.carte-doc) .cover-reviews__stars span {
  position:absolute; inset:0 auto 0 0; overflow:hidden; white-space:nowrap;
  color:#e8c268; text-shadow:0 1px 2px rgba(0,0,0,.45);
}
html:not(.carte-doc) .cover-reviews__stars span::before { content:'\\2605\\2605\\2605\\2605\\2605'; }
html:not(.carte-doc) .cover-reviews__note { font-size:.95rem; letter-spacing:.04em; color:#f6e4b8; }
html:not(.carte-doc) .cover-reviews__count { opacity:.82; font-weight:500; letter-spacing:.05em; }
html:not(.carte-doc) .cover-reviews__review { max-width:48ch; }
html:not(.carte-doc) .cover-reviews__quote {
  margin:.08rem 0 .2rem; font-family:'Montserrat',sans-serif; font-style:italic;
  font-size:.78rem; line-height:1.45; color:rgba(255,255,255,.86);
}
html:not(.carte-doc) .cover-reviews__meta {
  display:flex; align-items:center; justify-content:center; flex-wrap:wrap;
  gap:.28rem .55rem; font-family:'Montserrat',sans-serif; font-size:.68rem;
  line-height:1.4; color:rgba(255,255,255,.78);
}
html:not(.carte-doc) .cover-reviews__avatar {
  width:1.35rem; height:1.35rem; border-radius:50%; object-fit:cover;
}
html:not(.carte-doc) .cover-reviews__author { color:rgba(255,255,255,.92); font-style:normal; }
html:not(.carte-doc) .cover-reviews__date { white-space:nowrap; }
html:not(.carte-doc) .cover-reviews__source {
  color:rgba(255,255,255,.86); text-decoration:underline;
  text-underline-offset:2px;
}
html:not(.carte-doc) .cover-reviews__disclosure {
  max-width:58ch; margin:.08rem 0 0; font-family:'Montserrat',sans-serif;
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
@media (max-height:700px) {
  html:not(.carte-doc) .cover-reviews__review { display:none !important; }
  html:not(.carte-doc) .cover-reviews { margin-top:.5rem; }
}
/* avis-google:css:fin */"""

HTML = """<!-- avis-google:html:debut --><div class="cover-reviews" id="cover-reviews" hidden aria-label="Note et avis Google">
          <a class="cover-reviews__head" id="cover-reviews-link" href="https://www.google.com/maps/search/?api=1&amp;query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris" target="_blank" rel="noopener noreferrer">
            <span class="cover-reviews__stars" id="cover-reviews-stars" aria-hidden="true"><span id="cover-reviews-stars-fill"></span></span>
            <span class="cover-reviews__note" id="cover-reviews-note"></span>
            <span class="cover-reviews__count" id="cover-reviews-count"></span>
          </a>
          <div class="cover-reviews__review" id="cover-reviews-review" hidden>
            <blockquote class="cover-reviews__quote" id="cover-reviews-quote"></blockquote>
            <div class="cover-reviews__meta">
              <img class="cover-reviews__avatar" id="cover-reviews-avatar" alt="" width="22" height="22" loading="lazy" hidden>
              <a class="cover-reviews__author" id="cover-reviews-author"></a>
              <time class="cover-reviews__date" id="cover-reviews-date" hidden></time>
              <a class="cover-reviews__source" id="cover-reviews-source" target="_blank" rel="noopener noreferrer" hidden>Voir cet avis sur Google Maps</a>
            </div>
            <p class="cover-reviews__disclosure" id="cover-reviews-disclosure"></p>
          </div>
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

  var URL_CARTE = 'https://www.google.com/maps/search/?api=1&query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris';
  var bibliothequePlaces = null;

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

    var avis = Array.isArray(data.avis) ? data.avis : [];
    var avisAffiche = false;
    for (var i = 0; i < avis.length; i++) {
      if (afficherAvis(avis[i], source)) {
        avisAffiche = true;
        break;
      }
    }
    document.getElementById('cover-reviews-review').hidden = !avisAffiche;
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

  function afficherAvis(avis, source) {
    if (!avis) return false;
    var auteur = String(avis.auteur || '').trim();
    var texte = String(avis.texte || '').replace(/\s+/g, ' ').trim();
    var noteAvis = Number(String(avis.note || '').replace(',', '.'));
    var lienAvis = lienSecurise(avis.url_avis || avis.googleMapsURI);
    var photo = lienSecurise(avis.photo || avis.photoURI);
    var date = dateVisite(avis);
    if (!(noteAvis >= 4 && noteAvis <= 5) || !texte || !auteur || !date || !lienAvis || !lienAvis.startsWith('https://')) return false;

    if (texte.length > 150) {
      texte = texte.slice(0, 147).replace(/[\s,;:.]+$/, '') + '\u2026';
    }
    document.getElementById('cover-reviews-quote').textContent =
      '\u00ab\u202f' + texte + '\u202f\u00bb';

    var auteurEl = document.getElementById('cover-reviews-author');
    var profil = lienSecurise(avis.profil || avis.authorURI);
    auteurEl.textContent = auteur;
    if (profil) {
      auteurEl.href = profil;
      auteurEl.target = '_blank';
      auteurEl.rel = 'noopener noreferrer';
    } else {
      auteurEl.removeAttribute('href');
      auteurEl.removeAttribute('target');
      auteurEl.removeAttribute('rel');
    }

    var avatar = document.getElementById('cover-reviews-avatar');
    if (photo) {
      avatar.src = photo;
      avatar.alt = 'Photo de ' + auteur;
      avatar.hidden = false;
    } else {
      avatar.removeAttribute('src');
      avatar.alt = '';
      avatar.hidden = true;
    }

    var dateEl = document.getElementById('cover-reviews-date');
    dateEl.textContent = 'Visite : ' + date;
    dateEl.hidden = false;

    var sourceEl = document.getElementById('cover-reviews-source');
    sourceEl.href = lienAvis;
    sourceEl.textContent = 'Voir cet avis sur Google Maps';
    sourceEl.hidden = false;

    var mention = source === 'places'
      ? 'Un seul avis est présenté à la fois : le premier avis de 4 ou 5 étoiles parmi ceux classés par pertinence par Google. Seuls les avis avec date de visite, texte et attribution disponibles sont affichés. Les avis ne sont pas vérifiés par Google ; les faux contenus identifiés sont retirés.'
      : 'Le premier extrait admissible de 4 ou 5 étoiles avec date et attribution de la liste, sélectionné par La Colline Gambetta. Les avis ne sont pas vérifiés par Google ; les faux contenus identifiés sont retirés.';
    if (avis.traduit) mention += ' Le texte a été traduit par Google ; le lien ouvre l’avis source.';
    document.getElementById('cover-reviews-disclosure').textContent = mention;
    return true;
  }

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
        "d'avis et, si vous affichez un avis, son auteur, son texte, son lien "
        "Google Maps direct et le mois/annee de visite.",
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

    # Balisage, apres les liens de contact de la page de garde.
    if "<!-- avis-google:html:debut -->" in s:
        i = s.index("<!-- avis-google:html:debut -->")
        j = s.index("<!-- avis-google:html:fin -->", i) + len("<!-- avis-google:html:fin -->")
        s = s[:i] + HTML + s[j:]
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
