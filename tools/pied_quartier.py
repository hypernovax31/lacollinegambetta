#!/usr/bin/env python3
"""Pied de page commun : adresse, itin\u00e9raire RATP, \u00ab Dans les alentours \u00bb.

Le m\u00eame bloc est pos\u00e9 sur toutes les pages, page de garde comprise :

    LA COLLINE GAMBETTA \u2022 4 RUE BELGRAND, 75020 PARIS \u2022 M\u00c9TRO GAMBETTA \u2022 LIGNE 3
    Dans les alentours \u2022 Mairie du 20e \u2022 Th\u00e9\u00e2tre de la Colline \u2022 P\u00e8re-Lachaise ...
    Mentions l\u00e9gales \u00b7 Confidentialit\u00e9

\u2022 Les points d'int\u00e9r\u00eat sont tri\u00e9s automatiquement par distance au restaurant
  (calcul \u00e0 vol d'oiseau \u00e0 partir des coordonn\u00e9es ci-dessous, la distance est
  rappel\u00e9e dans l'infobulle de chaque lien).
\u2022 Plus de redondance : la mention \u00ab M\u00c9TRO GAMBETTA \u2022 LIGNE 3 \u00bb n'appara\u00eet
  qu'une fois par page et c'est elle qui porte l'itin\u00e9raire RATP.
\u2022 L'itin\u00e9raire a pour arriv\u00e9e le restaurant et pour d\u00e9part la position exacte
  du visiteur (g\u00e9olocalisation du navigateur + API Adresse de l'\u00c9tat), avec un
  repli propre si elle est refus\u00e9e ou indisponible.
\u2022 Les liens sont discrets mais bien visibles : jamais de texte dissimul\u00e9.

Toutes les adresses ont \u00e9t\u00e9 ouvertes et v\u00e9rifi\u00e9es une \u00e0 une (octobre 2026).
Script idempotent : il remplace ses propres blocs entre marqueurs.
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent

# Le restaurant
LAT, LON = 48.8647788, 2.3993777
ARRIVEE_RATP = "4, Rue Belgrand, 75, Paris"   # format attendu par ratp.fr
URL_RATP = "https://www.ratp.fr/itineraires?end=" + quote(ARRIVEE_RATP)
URL_PLAN = ("https://www.google.com/maps/search/?api=1&amp;query="
            "La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris")

# Points d'inter\u00eat du 20e et du 11e (jamais la mairie du 11e).
# (libelle, url, latitude, longitude) -- le tri par distance est automatique.
POINTS = [
    ("Mairie du 20\u1d49", "https://mairie20.paris.fr/", 48.86512, 2.39840),
    ("Th\u00e9\u00e2tre de la Colline", "https://www.colline.fr/", 48.86703, 2.40142),
    ("P\u00e8re-Lachaise", "https://www.paris.fr/lieux/cimetiere-du-pere-lachaise-4080",
     48.86300, 2.39550),
    ("Carr\u00e9 de Baudouin", "https://www.pavilloncarredebaudouin.fr/", 48.86978, 2.38894),
    ("Parc de Belleville", "https://www.paris.fr/lieux/parc-de-belleville-1777",
     48.87081, 2.38470),
    ("Le Bataclan", "https://www.bataclan.fr/", 48.86312, 2.37081),
    ("Cirque d'Hiver", "https://www.cirquedhiver.com/", 48.86349, 2.36767),
    ("Op\u00e9ra Bastille", "https://www.operadeparis.fr/visites/opera-bastille",
     48.85200, 2.37010),
]


def distance_m(lat: float, lon: float) -> float:
    """Distance \u00e0 vol d'oiseau entre le restaurant et un point, en m\u00e8tres."""
    r = 6371000.0
    p1, p2 = math.radians(LAT), math.radians(lat)
    dp, dl = p2 - p1, math.radians(lon - LON)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def libelle_distance(m: float) -> str:
    if m < 950:
        return f"{round(m / 50) * 50} m"
    return f"{m / 1000:.1f} km".replace(".", ",")


TRIES = sorted(((t, u, distance_m(la, lo)) for t, u, la, lo in POINTS),
               key=lambda x: x[2])

SEP = '<span class="footer-quartier__sep" aria-hidden="true">\u2022</span>'


def nav_alentours(classe: str) -> str:
    liens = SEP.join(
        f'<a href="{u}" target="_blank" rel="noopener" '
        f'title="\u00c0 {libelle_distance(d)} du restaurant">{t}</a>'
        for t, u, d in TRIES)
    return (f'<nav class="footer-quartier{classe}" aria-label="Dans les alentours">'
            f'<span>Dans les alentours</span>{SEP}{liens}</nav>')


LIEN_METRO = (f'<a class="footer-details__metro" data-ratp-itineraire href="{URL_RATP}"'
              ' target="_blank" rel="noopener"'
              ' title="Itin\u00e9raire RATP jusqu\u2019au restaurant">'
              'M\u00c9TRO GAMBETTA \u2022 LIGNE 3</a>')

CSS = """/* quartier:css:debut */
/* ===== Pied de page : adresse, itineraire et reperes des alentours ========
   Une ligne en tres petits caracteres sous l'adresse, dans la meme fonte que
   le reste du pied de page. Discrete a l'oeil, parfaitement lisible pour les
   moteurs : ce sont de vrais liens, jamais du texte dissimule. */
html:not(.carte-doc) .footer-quartier {
  display:flex; flex-wrap:wrap; justify-content:center; align-items:center;
  gap:3px 10px; margin:5px auto 0; max-width:74ch;
  font-family:'Cinzel',serif; font-size:clamp(.5rem,.95vw,.6rem);
  letter-spacing:.09em; text-transform:uppercase; line-height:1.5;
  color:var(--gold-100,#f0dca8); opacity:.46;
}
html:not(.carte-doc) .footer-quartier a { color:inherit; text-decoration:none; }
html:not(.carte-doc) .footer-quartier a:hover { text-decoration:underline; opacity:1; }
html:not(.carte-doc) .footer-quartier__sep { opacity:.5; }
html:not(.carte-doc) a.footer-details__metro { color:inherit; text-decoration:none; }
html:not(.carte-doc) a.footer-details__metro:hover { text-decoration:underline; }
/* Le premier ecran de la couverture s'arrete aux boutons de contact.
   Avis et reperes restent juste apres, accessibles en faisant defiler. */
html:not(.carte-doc) .cover-more {
  display:grid; justify-items:center; gap:6px; width:100%;
  padding:14px 16px 20px;
  border-top:1px solid rgba(216,178,87,.32);
  background:linear-gradient(180deg,#432155 0%,#24102e 100%);
  color:#fff; text-align:center;
}
html:not(.carte-doc) .cover-more .footer-quartier--cover { margin-top:7px; opacity:.7; }
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover {
  display:flex; flex-wrap:wrap; justify-content:center; gap:4px 10px;
  margin:4px auto 0; padding:0; background:none; border:0;
  font-family:'Cinzel',serif; font-size:clamp(.5rem,.95vw,.6rem);
  letter-spacing:.09em; text-transform:uppercase;
  color:var(--gold-100,#f0dca8); opacity:.7;
}
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover a {
  color:inherit; background:none; border:0; padding:0; text-decoration:none; text-shadow:none;
}
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover a:hover { text-decoration:underline; }
@media print {
  .footer-quartier, .cover-more { display:none !important; }
}
/* quartier:css:fin */"""

JS = """<!-- quartier:js:debut -->
<script>
/* Itineraire RATP : arrivee = le restaurant, depart = la position exacte du
   visiteur. La geolocalisation n'est demandee qu'au clic ; si elle est refusee,
   indisponible ou trop lente, l'itineraire s'ouvre avec la seule arrivee. */
(function () {
  var ARRIVEE = '%(arrivee)s';
  var BASE = 'https://www.ratp.fr/itineraires?end=' + encodeURIComponent(ARRIVEE);
  var liens = document.querySelectorAll('[data-ratp-itineraire]');
  if (!liens.length) { return; }
  Array.prototype.forEach.call(liens, function (lien) {
    lien.setAttribute('href', BASE);
    if (!navigator.geolocation) { return; }
    lien.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) { return; }
      ev.preventDefault();

      var onglet = null;
      try { onglet = window.open('about:blank', '_blank'); } catch (e) { onglet = null; }
      if (onglet) { try { onglet.opener = null; } catch (e) {} }

      var parti = false;
      function ouvrir(url) {
        if (parti) { return; }
        parti = true;
        if (onglet && !onglet.closed) { onglet.location.replace(url); }
        else { window.open(url, '_blank', 'noopener'); }
      }
      var secours = setTimeout(function () { ouvrir(BASE); }, 9000);

      navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        fetch('https://api-adresse.data.gouv.fr/reverse/?lat=' + lat + '&lon=' + lon)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            var p = d && d.features && d.features[0] && d.features[0].properties;
            var depart = '';
            if (p) {
              var dep = String(p.postcode || '').slice(0, 2);
              depart = [p.housenumber, p.street || p.name, dep, p.city]
                .filter(function (x) { return x; }).join(', ');
            }
            clearTimeout(secours);
            ouvrir(depart ? BASE + '&start=' + encodeURIComponent(depart) : BASE);
          })
          .catch(function () { clearTimeout(secours); ouvrir(BASE); });
      }, function () {
        clearTimeout(secours); ouvrir(BASE);
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
  });
})();
</script>
<!-- quartier:js:fin -->""" % {"arrivee": ARRIVEE_RATP}

COVER_ADRESSE = (
    '<div class="cover-footer-address">'
    f'<a href="{URL_PLAN}" data-default-map'
    ' data-map-address="La Colline Gambetta, 4 Rue Belgrand, 75020 Paris"'
    ' target="_blank" rel="noopener" title="Ouvrir l\u2019adresse dans le plan">'
    '4 rue Belgrand \u2022 75020 Paris</a>'
    '<span class="footer-quartier__sep" aria-hidden="true"> \u2022 </span>'
    f'<a data-ratp-itineraire href="{URL_RATP}" target="_blank" rel="noopener"'
    ' title="Itin\u00e9raire RATP jusqu\u2019au restaurant">M\u00e9tro Gambetta \u2022 Ligne 3</a>'
    '</div>')

LEGAL_COVER = ('<nav class="legal-bottom-nav legal-bottom-nav--cover"'
               ' aria-label="Informations l\u00e9gales">'
               '<a href="mentions-legales.html">Mentions l\u00e9gales</a>'
               '<span aria-hidden="true">\u00b7</span>'
               '<a href="confidentialite.html">Confidentialit\u00e9</a></nav>')


def entre_marqueurs(s: str, debut: str, fin: str, bloc: str) -> tuple[str, bool]:
    if debut in s:
        i, j = s.index(debut), s.index(fin) + len(fin)
        return s[:i] + bloc + s[j:], True
    return s, False


def poser_css(s: str) -> str:
    bloc = CSS
    s, fait = entre_marqueurs(s, "/* quartier:css:debut */", "/* quartier:css:fin */", bloc)
    if fait:
        return s
    i = s.index("</style>")
    return s[:i] + bloc + "\n" + s[i:]


def poser_js(s: str) -> str:
    s, fait = entre_marqueurs(s, "<!-- quartier:js:debut -->", "<!-- quartier:js:fin -->", JS)
    if fait:
        return s
    i = s.index("</body>")
    return s[:i] + JS + "\n" + s[i:]


def poser_metro(s: str) -> str:
    """La mention du metro devient le lien d'itineraire (une seule par page)."""
    motif = re.compile(
        r'<(?:span|a)[^>]*class="footer-details__metro"[^>]*>.*?</(?:span|a)>', re.S)
    return motif.sub(lambda _m: LIEN_METRO, s)


def poser_nav_pied(s: str) -> str:
    bloc = ("<!-- quartier:html:debut -->" + nav_alentours("")
            + "<!-- quartier:html:fin -->")
    s, fait = entre_marqueurs(s, "<!-- quartier:html:debut -->",
                              "<!-- quartier:html:fin -->", bloc)
    if fait:
        return s
    i = s.index(LIEN_METRO) + len(LIEN_METRO)
    i = s.index("</div>", i) + len("</div>")
    return s[:i] + "\n      " + bloc + s[i:]


def poser_bloc_garde(s: str) -> str:
    """Garde plein ecran; avis, alentours et mentions suivent au defilement."""
    s = re.sub(r'<div class="cover-footer-address">.*?</div>\s*</div>',
               lambda _m: COVER_ADRESSE + "\n        </div>", s, count=1, flags=re.S)

    # Replacer le bloc d'avis avec son marqueur, quelle que soit sa position
    # actuelle, pour l'installer sous la couverture (et non dans son premier ecran).
    avis = re.search(r'<!-- avis-google:html:debut -->.*?<!-- avis-google:html:fin -->',
                     s, flags=re.S)
    bloc_avis = avis.group(0) if avis else ""
    if avis:
        s = s[:avis.start()] + s[avis.end():]

    # Supprimer l'ancienne ligne du quartier avant de reconstruire son bloc.
    s, _ = entre_marqueurs(s, "<!-- quartier:garde:debut -->",
                           "<!-- quartier:garde:fin -->", "")
    # Le retrait des blocs laisse parfois des lignes vides apres les boutons.
    s = re.sub(
        r'(<div class="cover-links">[\s\S]*?</div>)[ \t]*\n(?:[ \t]*\n)+([ \t]*</div>)',
        r"\1\n\2",
        s,
        count=1,
    )
    bloc = (
        "<!-- cover-more:debut -->\n"
        '<section id="cover-more" class="cover-more" '
        'aria-label="Avis Google et informations du quartier">\n'
        + ("        " + bloc_avis + "\n" if bloc_avis else "")
        + "        <!-- quartier:garde:debut -->\n        "
        + nav_alentours(" footer-quartier--cover")
        + "\n        " + LEGAL_COVER + "\n        <!-- quartier:garde:fin -->\n"
        "</section>\n<!-- cover-more:fin -->"
    )
    s, fait = entre_marqueurs(s, "<!-- cover-more:debut -->",
                              "<!-- cover-more:fin -->", bloc)
    if fait:
        return s

    debut = s.index('<section id="cover-section"')
    fin = s.index("</section>", debut) + len("</section>")
    return s[:fin] + "\n  " + bloc + s[fin:]


def main() -> None:
    # 1. page de garde + pied interieur d'index.html
    f = ROOT / "index.html"
    s = f.read_text(encoding="utf-8")
    s = poser_css(s)
    s = poser_metro(s)
    s = poser_nav_pied(s)
    s = poser_bloc_garde(s)
    s = poser_js(s)
    f.write_text(s, encoding="utf-8")
    print("index.html : page de garde + pied de page mis a jour")

    # 2. les autres pieds de page
    for nom in ("reservation.html", "mentions-legales.html", "confidentialite.html"):
        f = ROOT / nom
        s = f.read_text(encoding="utf-8")
        s = poser_css(s)
        s = poser_metro(s)
        s = poser_nav_pied(s)
        s = poser_js(s)
        f.write_text(s, encoding="utf-8")
        print(f"{nom} : pied de page identique a la page de garde")

    # 3. page 404 : la meme ligne de reperes sous l'adresse
    f = ROOT / "404.html"
    s = poser_css(f.read_text(encoding="utf-8"))
    bloc = ("<!-- quartier:html:debut -->" + nav_alentours("")
            + "<!-- quartier:html:fin -->")
    s, fait = entre_marqueurs(s, "<!-- quartier:html:debut -->",
                              "<!-- quartier:html:fin -->", bloc)
    if not fait:
        i = s.index("</main>")
        s = s[:i] + "  " + bloc + "\n" + s[i:]
    f.write_text(s, encoding="utf-8")
    print("404.html : ligne des alentours ajoutee")

    print("  ordre par distance : "
          + " \u2022 ".join(f"{t} ({libelle_distance(d)})" for t, _u, d in TRIES))


if __name__ == "__main__":
    main()
