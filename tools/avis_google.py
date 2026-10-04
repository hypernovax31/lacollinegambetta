#!/usr/bin/env python3
"""Bandeau d'avis Google de la page de garde (styles, balisage, chargeur).

Le bandeau affiche la note, les etoiles et les meilleurs commentaires de la
fiche Google du restaurant. Deux sources possibles, dans cet ordre :

1. l'API Google Places, si `place_id` et `cle_api` sont renseignes dans
   assets/data/avis-google.json : la note et les avis sont alors toujours a
   jour, sans intervention ;
2. les avis recopies a la main dans ce meme fichier.

Rien n'est jamais invente : sans donnees, le bandeau reste masque.
Le script est idempotent, il remplace ses propres blocs entre marqueurs.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

CSS = """/* avis-google:css:debut */
/* ===== Avis Google de la page de garde =====================================
   Une ligne sobre sous les liens de contact : etoiles dorees bien lisibles,
   note chiffree, nombre d'avis, puis le meilleur commentaire. Le bloc est
   masque tant qu'aucune donnee reelle n'est disponible : il ne peut donc
   jamais decaler la mise en page. */
html.carte-doc .cover-reviews { display:none !important; }
html:not(.carte-doc) .cover-reviews[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews {
  display:flex; flex-direction:column; align-items:center; gap:.34rem;
  margin:.7rem auto 0; max-width:min(560px, 92vw); text-align:center;
}
html:not(.carte-doc) .cover-reviews__head {
  display:inline-flex; align-items:center; gap:.5rem; flex-wrap:wrap;
  justify-content:center;
  font-family:'Montserrat',sans-serif; font-size:.78rem; font-weight:600;
  letter-spacing:.07em; text-transform:uppercase; color:#f0dca8;
}
/* Les etoiles : un dégradé or coupe au pourcentage exact de la note, pour
   qu'un 4,6/5 affiche vraiment quatre etoiles et demie. */
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
html:not(.carte-doc) .cover-reviews__count { opacity:.74; font-weight:500; letter-spacing:.05em; }
html:not(.carte-doc) .cover-reviews__quote {
  margin:0; font-family:'Montserrat',sans-serif; font-style:italic;
  font-size:.78rem; line-height:1.45; color:rgba(255,255,255,.78); max-width:48ch;
}
html:not(.carte-doc) .cover-reviews__author { font-style:normal; opacity:.62; }
html:not(.carte-doc) .cover-reviews a { color:inherit; text-decoration:none; }
html:not(.carte-doc) .cover-reviews a:hover .cover-reviews__note { text-decoration:underline; }
@media (max-height: 700px) {
  html:not(.carte-doc) .cover-reviews__quote { display:none; }
  html:not(.carte-doc) .cover-reviews { margin-top:.5rem; }
}
/* avis-google:css:fin */"""

HTML = """<!-- avis-google:html:debut --><div class="cover-reviews" id="cover-reviews" hidden aria-label="Avis Google">
          <a class="cover-reviews__head" id="cover-reviews-link" href="https://www.google.com/maps/search/?api=1&amp;query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris" target="_blank" rel="noopener">
            <span class="cover-reviews__stars" id="cover-reviews-stars" aria-hidden="true"><span id="cover-reviews-stars-fill"></span></span>
            <span class="cover-reviews__note" id="cover-reviews-note"></span>
            <span class="cover-reviews__count" id="cover-reviews-count"></span>
          </a>
          <p class="cover-reviews__quote" id="cover-reviews-quote" hidden></p>
        </div><!-- avis-google:html:fin -->"""

JS = """<!-- avis-google:js:debut --><script>
/* Bandeau d'avis Google.
   Source 1 : l'API Google Places, si place_id et cle_api sont renseignes dans
   assets/data/avis-google.json (note et avis toujours a jour, mis en cache
   12 h pour ne pas multiplier les appels).
   Source 2 : les avis recopies a la main dans ce meme fichier.
   Sans donnees, le bandeau reste masque : aucune note n'est inventee. */
(function () {
  var bloc = document.getElementById('cover-reviews');
  if (!bloc || !window.fetch) return;
  var CACHE = 'lcg-avis-google';
  var DUREE = 12 * 3600 * 1000;

  function etoiles(note) {
    document.getElementById('cover-reviews-stars-fill').style.width =
      (Math.max(0, Math.min(5, note)) / 5 * 100).toFixed(2) + '%';
  }

  function afficher(d) {
    var note = Number(String(d.note).replace(',', '.'));
    if (!(note > 0)) return;
    etoiles(note);
    document.getElementById('cover-reviews-note').textContent =
      note.toFixed(1).replace('.', ',') + '/5';
    var nb = Number(d.nombre_avis || 0);
    document.getElementById('cover-reviews-count').textContent =
      nb ? '\\u00b7 ' + nb.toLocaleString('fr-FR') + ' avis Google' : '\\u00b7 Avis Google';
    if (d.url) document.getElementById('cover-reviews-link').href = d.url;
    var liste = (d.avis || []).filter(function (a) {
      return a && a.texte && (!a.note || a.note >= 4);
    }).sort(function (a, b) { return (b.note || 5) - (a.note || 5); });
    if (liste.length) {
      var a = liste[Math.floor(Math.random() * Math.min(liste.length, 5))];
      var q = document.getElementById('cover-reviews-quote');
      var texte = a.texte.replace(/\\s+/g, ' ').trim();
      if (texte.length > 150) texte = texte.slice(0, 147).replace(/[\\s,;:.]+$/, '') + '\\u2026';
      q.textContent = '\\u00ab\\u202f' + texte + '\\u202f\\u00bb';
      if (a.auteur) {
        var sp = document.createElement('span');
        sp.className = 'cover-reviews__author';
        sp.textContent = ' \\u2014 ' + a.auteur;
        q.appendChild(sp);
      }
      q.hidden = false;
    }
    bloc.hidden = false;
  }

  /* Reponse de l'API Places (v1) ramenee au format du fichier local. */
  function depuisPlaces(p, secours) {
    if (!p || !p.rating) return null;
    return {
      note: p.rating,
      nombre_avis: p.userRatingCount,
      url: p.googleMapsUri || secours.url || '',
      avis: (p.reviews || []).map(function (r) {
        return {
          auteur: (r.authorAttribution && r.authorAttribution.displayName) || '',
          note: r.rating,
          texte: (r.text && r.text.text) || (r.originalText && r.originalText.text) || ''
        };
      })
    };
  }

  fetch('assets/data/avis-google.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      var cache = null;
      try { cache = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); } catch (e) {}
      if (cache && cache.t && Date.now() - cache.t < DUREE && cache.d) return afficher(cache.d);

      if (d.place_id && d.cle_api) {
        var url = 'https://places.googleapis.com/v1/places/' + encodeURIComponent(d.place_id) +
          '?languageCode=fr&fields=rating,userRatingCount,googleMapsUri,reviews&key=' +
          encodeURIComponent(d.cle_api);
        return fetch(url)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (p) {
            var vivant = depuisPlaces(p, d);
            if (vivant) {
              try { sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d: vivant })); } catch (e) {}
              return afficher(vivant);
            }
            if (d.publie === true && d.note) afficher(d);
          })
          .catch(function () { if (d.publie === true && d.note) afficher(d); });
      }
      if (d.publie === true && d.note) afficher(d);
    })
    .catch(function () {});
})();
</script><!-- avis-google:js:fin -->"""

MODELE = {
    "_mode_emploi": [
        "Deux facons d'alimenter le bandeau d'avis de la page de garde.",
        "A) Automatique : collez l'identifiant de votre fiche Google dans "
        "place_id et une cle d'API Places (restreinte au domaine "
        "lacollinegambetta.com) dans cle_api. La note, le nombre d'avis et "
        "les meilleurs commentaires se mettent a jour tout seuls.",
        "B) Manuel : passez publie a true et recopiez ci-dessous la note, le "
        "nombre d'avis et vos meilleurs commentaires, tels qu'ils figurent "
        "sur votre fiche Google. N'y mettez que de vrais avis.",
        "Tant qu'aucune des deux sources n'est renseignee, le bandeau reste "
        "invisible et la page de garde est inchangee.",
    ],
    "place_id": "",
    "cle_api": "",
    "publie": False,
    "note": None,
    "nombre_avis": None,
    "url": "",
    "avis": [{"auteur": "", "note": 5, "texte": ""}],
}


def _remplacer(s: str, debut: str, fin: str, neuf: str, avant: str) -> str:
    if debut in s:
        return s[:s.index(debut)] + neuf + s[s.index(fin) + len(fin):]
    i = s.index(avant)
    return s[:i] + neuf + "\n" + s[i:]


def main() -> None:
    s = INDEX.read_text(encoding="utf-8")

    # styles : juste avant la fin de la feuille principale
    if "/* avis-google:css:debut */" in s:
        i = s.index("/* avis-google:css:debut */")
        j = s.index("/* avis-google:css:fin */") + len("/* avis-google:css:fin */")
        s = s[:i] + CSS + s[j:]
    else:
        i = s.index("</style>")
        s = s[:i] + CSS + "\n" + s[i:]

    # balisage : apres les liens de contact de la page de garde
    if "<!-- avis-google:html:debut -->" in s:
        i = s.index("<!-- avis-google:html:debut -->")
        j = s.index("<!-- avis-google:html:fin -->") + len("<!-- avis-google:html:fin -->")
        s = s[:i] + HTML + s[j:]
    else:
        k = s.index('<div class="cover-links">')
        j = s.index("\n        </div>", k) + len("\n        </div>")
        s = s[:j] + "\n        " + HTML + s[j:]

    # chargeur
    if "<!-- avis-google:js:debut -->" in s:
        i = s.index("<!-- avis-google:js:debut -->")
        j = s.index("<!-- avis-google:js:fin -->") + len("<!-- avis-google:js:fin -->")
        s = s[:i] + JS + s[j:]
    else:
        i = s.rindex("</body>")
        s = s[:i] + JS + "\n" + s[i:]

    INDEX.write_text(s, encoding="utf-8")

    p = ROOT / "assets" / "data" / "avis-google.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        actuel = json.loads(p.read_text(encoding="utf-8"))
        for cle, val in MODELE.items():
            actuel.setdefault(cle, val)
        actuel["_mode_emploi"] = MODELE["_mode_emploi"]
        p.write_text(json.dumps(actuel, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("assets/data/avis-google.json : mis a jour (donnees conservees)")
    else:
        p.write_text(json.dumps(MODELE, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("assets/data/avis-google.json : cree")
    print("index.html : bandeau d'avis (styles, balisage, chargeur Places + manuel)")


if __name__ == "__main__":
    main()
