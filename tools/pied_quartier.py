#!/usr/bin/env python3
"""Ligne \u00ab Dans le quartier \u00bb en pied de page, sous l'adresse.

Des liens vers les rep\u00e8res du 20e et du 11e arrondissement (P\u00e8re-Lachaise,
parc de Belleville, Carr\u00e9 de Baudouin, Th\u00e9\u00e2tre de la Colline, mairie du 20e,
Cirque d'Hiver, Bataclan, Op\u00e9ra Bastille) et un lien d'itin\u00e9raire RATP.
Ils sont tr\u00e8s discrets mais visibles : des liens dissimul\u00e9s seraient
contraires aux regles de Google.

Le lien RATP ouvre un itin\u00e9raire dont l'arriv\u00e9e est le restaurant et le
d\u00e9part la position exacte du visiteur (g\u00e9olocalisation du navigateur, adresse
retrouv\u00e9e par l'API Adresse de l'\u00c9tat). En cas de refus ou d'indisponibilit\u00e9,
l'itin\u00e9raire s'ouvre quand m\u00eame avec la seule arriv\u00e9e pr\u00e9-remplie.

Toutes les adresses ci-dessous ont \u00e9t\u00e9 v\u00e9rifi\u00e9es une \u00e0 une (octobre 2026).
Script idempotent, il remplace ses propres blocs entre marqueurs.
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

# Arriv\u00e9e de l'itin\u00e9raire, au format attendu par ratp.fr : numero, rue, departement, ville
ARRIVEE_RATP = "4, Rue Belgrand, 75, Paris"
URL_RATP = "https://www.ratp.fr/itineraires?end=" + quote(ARRIVEE_RATP)

CSS = """/* quartier:css:debut */
/* ===== Pied de page : reperes du quartier ==================================
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
/* quartier:css:fin */"""

# (url, libelle) -- 20e puis 11e, jamais la mairie du 11e
LIENS = [
    ("https://www.paris.fr/lieux/cimetiere-du-pere-lachaise-4080", "P\u00e8re-Lachaise"),
    ("https://www.paris.fr/lieux/parc-de-belleville-1777", "Parc de Belleville"),
    ("https://www.pavilloncarredebaudouin.fr/", "Carr\u00e9 de Baudouin"),
    ("https://www.colline.fr/", "Th\u00e9\u00e2tre de la Colline"),
    ("https://mairie20.paris.fr/", "Mairie du 20\u1d49"),
    ("https://www.cirquedhiver.com/", "Cirque d'Hiver"),
    ("https://www.bataclan.fr/", "Le Bataclan"),
    ("https://www.operadeparis.fr/visites/opera-bastille", "Op\u00e9ra Bastille"),
]

SEP = '<span class="footer-quartier__sep" aria-hidden="true">\u2022</span>'

ANCRES = SEP.join(
    f'<a href="{u}" target="_blank" rel="noopener">{t}</a>' for u, t in LIENS
) + SEP + (
    f'<a class="footer-quartier__ratp" data-ratp-itineraire href="{URL_RATP}"'
    ' target="_blank" rel="noopener">Itin\u00e9raire RATP \u2022 m\u00e9tro Gambetta</a>'
)

HTML = ('<!-- quartier:html:debut --><nav class="footer-quartier" aria-label="Rep\u00e8res du quartier">'
        '<span>Dans le quartier</span>' + SEP + ANCRES
        + '</nav><!-- quartier:html:fin -->')

JS = """<!-- quartier:js:debut -->
<script>
/* Itineraire RATP : arrivee = le restaurant, depart = la position exacte du
   visiteur. La geolocalisation n'est demandee qu'au clic ; si elle est refusee,
   indisponible ou trop lente, l'itineraire s'ouvre avec la seule arrivee. */
(function () {
  var ARRIVEE = %(arrivee)s;
  var BASE = 'https://www.ratp.fr/itineraires?end=' + encodeURIComponent(ARRIVEE);
  var lien = document.querySelector('[data-ratp-itineraire]');
  if (!lien) { return; }
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
})();
</script>
<!-- quartier:js:fin -->""" % {"arrivee": "'" + ARRIVEE_RATP + "'"}


def remplacer(s: str, debut: str, fin: str, bloc: str, ancre: str, avant: bool, marge: str) -> str:
    if debut in s:
        i = s.index(debut)
        j = s.index(fin) + len(fin)
        return s[:i] + bloc + s[j:]
    if avant:
        i = s.index(ancre)
        return s[:i] + bloc + marge + s[i:]
    i = s.index(ancre) + len(ancre)
    return s[:i] + marge + bloc + s[i:]


def main() -> None:
    s = INDEX.read_text(encoding="utf-8")

    s = remplacer(s, "/* quartier:css:debut */", "/* quartier:css:fin */", CSS,
                  "</style>", True, "\n")
    s = remplacer(s, "<!-- quartier:html:debut -->", "<!-- quartier:html:fin -->", HTML,
                  '<span class="footer-details__metro">M\u00c9TRO GAMBETTA \u2022 LIGNE 3</span></div>',
                  False, "\n      ")
    s = remplacer(s, "<!-- quartier:js:debut -->", "<!-- quartier:js:fin -->", JS,
                  "</body>", True, "\n")

    INDEX.write_text(s, encoding="utf-8")
    print(f"index.html : ligne \u00ab Dans le quartier \u00bb ({len(LIENS)} rep\u00e8res "
          f"+ itin\u00e9raire RATP g\u00e9olocalis\u00e9) sous l'adresse")


if __name__ == "__main__":
    main()
