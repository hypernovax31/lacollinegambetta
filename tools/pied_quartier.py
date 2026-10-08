#!/usr/bin/env python3
"""Pied de page commun : adresse, mention du m\u00e9tro, \u00ab Dans les alentours \u00bb.

Le m\u00eame bloc est pos\u00e9 sur toutes les pages, page de garde comprise :

    LA COLLINE GAMBETTA \u2022 4 RUE BELGRAND \u2022 75020 PARIS \u2022 M\u00c9TRO GAMBETTA \u2022 LIGNE 3
    Dans les alentours \u2022 Mairie du 20e \u2022 Th\u00e9\u00e2tre de la Colline \u2022 P\u00e8re-Lachaise ...
    Mentions l\u00e9gales \u00b7 Confidentialit\u00e9

\u2022 Les points d'int\u00e9r\u00eat sont tri\u00e9s automatiquement par distance au restaurant
  (calcul \u00e0 vol d'oiseau \u00e0 partir des coordonn\u00e9es ci-dessous, la distance est
  rappel\u00e9e dans l'infobulle de chaque lien).
\u2022 La mention \u00ab M\u00c9TRO GAMBETTA \u2022 LIGNE 3 \u00bb n'appara\u00eet qu'une fois par page et
  porte l'itin\u00e9raire RATP : sur mobile, elle ouvre l'application Bonjour RATP
  (arriv\u00e9e = 4 Rue Belgrand 75020 Paris) ; si l'application manque, le trajet
  est d\u00e9j\u00e0 ouvert dans un nouvel onglet sur ratp.fr, arriv\u00e9e remplie. Aucune
  page interm\u00e9diaire, aucune demande de position. Sur ordinateur, le lien web
  RATP s'ouvre dans un nouvel onglet.
\u2022 Les liens sont discrets mais bien visibles : jamais de texte dissimul\u00e9.

Script idempotent : il remplace ses propres blocs entre marqueurs et supprime
les anciens blocs RATP (handoff application) restés dans une page.
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parent.parent

# Le restaurant
LAT, LON = 48.8647788, 2.3993777
# Adresse d'arrivee du trajet : celle du restaurant, telle qu'elle doit
# apparaitre dans la case « Arrivee » de l'application et du site RATP.
ARRIVEE_RATP = "4 Rue Belgrand 75020 Paris"
URL_RATP_APP = ("https://www.bonjour-ratp.fr/itineraires/?end="
                + quote_plus(ARRIVEE_RATP))
URL_RATP_WEB = "https://www.ratp.fr/itineraires?end=" + quote_plus(ARRIVEE_RATP)
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


LIEN_METRO = (
    f'<a class="footer-details__metro" data-ratp-itineraire '
    f'data-ratp-app-href="{URL_RATP_APP}" '
    f'target="_blank" rel="noopener" href="{URL_RATP_WEB}"'
    ' title="Ouvrir Bonjour RATP pour l\u2019itin\u00e9raire">'
    'M\u00c9TRO GAMBETTA \u2022 LIGNE 3</a>')

# Script du handoff : fichier versionne, pose sur toutes les pages.
SCRIPT_ITINERAIRE = ("""<!-- ratp:itineraire:debut -->
<script src="assets/js/ratp-itinerary.js?v=2026100808" defer></script>
<!-- ratp:itineraire:fin -->""")

# Ancien bloc RATP inline (handoff de 2025) : le script le retire des pages
# qui le contiennent encore, sans jamais le reposer. Le handoff vit maintenant
# dans assets/js/ratp-itinerary.js, pose entre les marqueurs ratp:itineraire.
BLOC_RATP = re.compile(r'\n*<!-- ratp:app-handoff:debut -->[\s\S]*?'
                       r'<!-- ratp:app-handoff:fin -->\n*')

CSS = """/* quartier:css:debut */
/* ===== Pied de page : adresse, itineraire et reperes des alentours ========
   Une ligne en tres petits caracteres sous l'adresse, dans la meme fonte que
   le reste du pied de page. Discrete a l'oeil, parfaitement lisible pour les
   moteurs : ce sont de vrais liens, jamais du texte dissimule. */
/* Adresse et métro : ligne unique sur grand écran, repli en lignes complètes
   sur téléphone plutôt qu'un ruban qui masque la fin des liens. */
html:not(.carte-doc) .footer-details {
  display:flex; flex-flow:row nowrap; align-items:center; justify-content:flex-start;
  gap:clamp(4px,.75vw,12px); width:max-content; max-width:calc(100% - 24px);
  margin:0 auto; overflow-x:auto; overflow-y:hidden; white-space:nowrap;
  scrollbar-width:none; overscroll-behavior-x:contain;
  font-size:clamp(.52rem,1vw,.68rem); letter-spacing:clamp(.035em,.08vw,.08em);
  color:#fff !important;
}
html:not(.carte-doc) .footer-details::-webkit-scrollbar { display:none; }
html:not(.carte-doc) .footer-details > * { flex:0 0 auto; white-space:nowrap; }
html:not(.carte-doc) .footer-details__location {
  display:inline-flex; flex-flow:row nowrap; align-items:center; gap:clamp(4px,.75vw,10px);
  flex:0 0 auto; white-space:nowrap;
}
html:not(.carte-doc) .footer-details__location > * { flex:0 0 auto; white-space:nowrap; }
html:not(.carte-doc) .footer-details .footer-address-link,
html:not(.carte-doc) .footer-details .footer-details__metro {
  color:#fff !important; text-decoration:none;
}
html:not(.carte-doc) .footer-details .footer-address-link:hover,
html:not(.carte-doc) .footer-details .footer-address-link:focus-visible,
html:not(.carte-doc) .footer-details .footer-details__metro:hover,
html:not(.carte-doc) .footer-details .footer-details__metro:focus-visible {
  color:#fff !important; text-decoration:underline; text-underline-offset:3px;
}
html:not(.carte-doc) .footer-details__separator { color:#fff !important; }
@media (max-width:860px) {
  html:not(.carte-doc) .footer-details {
    flex-flow:row wrap; justify-content:center; gap:5px 10px;
    width:100%; max-width:100%; overflow:visible; white-space:normal;
    font-size:clamp(.62rem,2.2vw,.76rem); letter-spacing:.035em; line-height:1.45;
  }
  html:not(.carte-doc) .footer-details > span:first-child {
    flex:0 0 100%; text-align:center; white-space:normal;
  }
  html:not(.carte-doc) .footer-details > span:nth-child(2) { display:none; }
  html:not(.carte-doc) .footer-details__location {
    display:flex; flex:0 1 100%; flex-flow:row wrap; justify-content:center;
    gap:4px 8px; width:100%; max-width:100%; min-width:0; white-space:normal;
  }
  html:not(.carte-doc) .footer-details__location > * {
    flex:0 1 auto; min-width:0; max-width:100%; white-space:normal;
  }
}
@media (max-width:560px) {
  html:not(.carte-doc) .footer-details { gap:4px; font-size:clamp(.62rem,3vw,.72rem); letter-spacing:.025em; }
  html:not(.carte-doc) .footer-details__location { gap:3px; }
  html:not(.carte-doc) .footer-details__location > a {
    flex:0 0 100%; max-width:100%; white-space:nowrap; text-align:center;
  }
  html:not(.carte-doc) .footer-details__separator { display:none; }
}

/* Pieds des pages intérieures (hors page de garde) : la marque et la ligne
   adresse • métro sont encadrées d'un léger trait doré — la couleur de la
   thématique du site — et l'adresse + le métro restent sur UNE même ligne,
   centrée sur l'axe vertical, à toutes les largeurs (défilement horizontal
   discret si l'écran est très étroit). Sélecteurs plus spécifiques que les
   media queries ci-dessus : ils priment. */
html:not(.carte-doc) .footer--secondaire .footer-details {
  border-top:1px solid rgba(216,178,87,.55);
  border-bottom:1px solid rgba(216,178,87,.55);
  padding:12px 8px;
}
html:not(.carte-doc) .footer--secondaire .footer-details__location {
  flex-flow:row nowrap; align-items:center; justify-content:center;
  max-width:100%; overflow-x:auto; overflow-y:hidden; scrollbar-width:none;
  -ms-overflow-style:none;
}
html:not(.carte-doc) .footer--secondaire .footer-details__location::-webkit-scrollbar { display:none; }
html:not(.carte-doc) .footer--secondaire .footer-details__location > * {
  flex:0 0 auto; white-space:nowrap;
}
html:not(.carte-doc) .footer--secondaire .footer-details__location > a {
  flex:0 0 auto; white-space:nowrap; text-align:center;
}
html:not(.carte-doc) .footer--secondaire .footer-details__separator { display:inline; }

/* Même traitement pour l'adresse affichée sur la couverture. */
html:not(.carte-doc) .cover-footer-address {
  display:flex; flex-flow:row nowrap; align-items:center; justify-content:flex-start;
  gap:clamp(4px,.75vw,10px); width:max-content; max-width:100%; margin-inline:auto;
  overflow-x:auto; overflow-y:hidden; white-space:nowrap; scrollbar-width:none;
  overscroll-behavior-x:contain; font-size:clamp(.58rem,2vw,.92rem);
  color:#fff !important;
}
html:not(.carte-doc) .cover-footer-address::-webkit-scrollbar { display:none; }
html:not(.carte-doc) .cover-footer-address > * { flex:0 0 auto; white-space:nowrap; }
html:not(.carte-doc) .cover-footer-address a,
html:not(.carte-doc) .cover-footer-address .footer-quartier__sep,
html:not(.carte-doc) .cover-footer-address a:hover,
html:not(.carte-doc) .cover-footer-address a:focus-visible {
  color:#fff !important;
}
html:not(.carte-doc) .cover-footer-address .footer-quartier__sep { opacity:1; }
/* La couverture contient des règles spécifiques d'horaires : on garantit aussi
   le non-retour à la ligne face à ces styles prioritaires. */
html:not(.carte-doc) #cover-section .cover-hours .cover-footer-address {
  flex-flow:row nowrap !important; white-space:nowrap !important;
  overflow-wrap:normal !important; overflow-x:auto !important; overflow-y:hidden !important;
}
@media (max-width:440px) {
  html:not(.carte-doc) #cover-section .cover-hours .cover-footer-address {
    font-size:clamp(.5rem,2.1vw,.66rem) !important;
  }
}

html:not(.carte-doc) .footer-quartier {
  display:flex; flex-wrap:wrap; justify-content:center; align-items:center;
  width:100%; max-width:none; min-width:0; box-sizing:border-box;
  gap:3px 10px; margin:5px auto 0;
  font-family:'Cinzel',serif; font-size:clamp(.5rem,.95vw,.6rem);
  letter-spacing:.09em; text-transform:uppercase; line-height:1.5;
  color:var(--gold-100,#f0dca8); opacity:.46;
}
html:not(.carte-doc) .footer-quartier a { color:inherit; text-decoration:none; }
html:not(.carte-doc) .footer-quartier a:hover { text-decoration:underline; opacity:1; }
html:not(.carte-doc) .footer-quartier__sep { opacity:.5; }
/* Le premier ecran de la couverture s'arrete aux boutons de contact.
   Les reperes du quartier et les liens legaux suivent en defilant. */
html:not(.carte-doc) .cover-more {
  display:grid; grid-template-columns:minmax(0,1fr); justify-items:center;
  gap:6px; width:100%; min-width:0; box-sizing:border-box;
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

/* Chaque lien légal est une pill discrète, au contour et au texte blancs. */
html:not(.carte-doc) .footer .legal-bottom-nav,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover {
  display:flex; flex-flow:row nowrap; align-items:center; justify-content:center;
  gap:8px; width:max-content; max-width:calc(100% - 16px);
  margin:4px auto 0; padding:6px 8px 2px; overflow-x:auto; overflow-y:hidden;
  white-space:nowrap; scrollbar-width:none; background:transparent;
  color:#fff; opacity:1;
}
html:not(.carte-doc) .footer .legal-bottom-nav::-webkit-scrollbar,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover::-webkit-scrollbar { display:none; }
html:not(.carte-doc) .footer .legal-bottom-nav > span,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover > span { display:none; }
html:not(.carte-doc) .footer .legal-bottom-nav a,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover a {
  display:inline-flex; flex:0 0 auto; align-items:center; justify-content:center;
  min-height:30px; padding:5px 12px; border:1px solid rgba(255,255,255,.46);
  border-radius:999px; background:rgba(255,255,255,.035); color:#fff !important;
  font-size:inherit; font-weight:500; line-height:1.2; text-decoration:none;
  text-shadow:none; white-space:nowrap;
  transition:background-color .2s ease,border-color .2s ease;
}
html:not(.carte-doc) .footer .legal-bottom-nav a:hover,
html:not(.carte-doc) .footer .legal-bottom-nav a:focus-visible,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover a:hover,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover a:focus-visible {
  background:rgba(255,255,255,.1); border-color:#fff; color:#fff !important;
}
html:not(.carte-doc) .footer .legal-bottom-nav a:focus-visible,
html:not(.carte-doc) .cover-more .legal-bottom-nav--cover a:focus-visible {
  outline:2px solid rgba(255,255,255,.8); outline-offset:2px;
}
@media print {
  .footer-quartier, .cover-more { display:none !important; }
}
/* quartier:css:fin */"""

COVER_ADRESSE = (
    '<div class="cover-footer-address">'
    f'<a href="{URL_PLAN}" data-default-map'
    ' data-map-address="La Colline Gambetta, 4 Rue Belgrand, 75020 Paris"'
    ' target="_blank" rel="noopener" title="Ouvrir l\u2019adresse dans le plan">'
    '4 rue Belgrand \u2022 75020 Paris</a>'
    '<span class="footer-quartier__sep" aria-hidden="true"> \u2022 </span>'
    f'<a data-ratp-itineraire data-ratp-app-href="{URL_RATP_APP}" '
    f'target="_blank" rel="noopener" href="{URL_RATP_WEB}"'
    ' title="Ouvrir Bonjour RATP pour l\u2019itin\u00e9raire">M\u00e9tro Gambetta \u2022 Ligne 3</a>'
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
    """Retire l'ancien bloc inline et pose le script du handoff."""
    s, _ = entre_marqueurs(s, "<!-- quartier:js:debut -->",
                            "<!-- quartier:js:fin -->", "")
    s = BLOC_RATP.sub("\n", s)
    s, fait = entre_marqueurs(s, "<!-- ratp:itineraire:debut -->",
                              "<!-- ratp:itineraire:fin -->", SCRIPT_ITINERAIRE)
    if fait:
        return s
    i = s.rfind("</body>")
    if i < 0:
        return s
    return s[:i] + SCRIPT_ITINERAIRE + "\n" + s[i:]


def poser_metro(s: str) -> str:
    """La mention du metro porte l'itineraire RATP (une seule par page)."""
    motif = re.compile(
        r'<(?:span|a)[^>]*class="footer-details__metro"[^>]*>.*?</(?:span|a)>', re.S)
    s = motif.sub(lambda _m: LIEN_METRO, s)
    s = s.replace('>4 RUE BELGRAND, 75020 PARIS</a>',
                  '>4 RUE BELGRAND • 75020 PARIS</a>')
    if 'class="footer-details__location"' in s:
        return s
    separateur = '<span class="footer-details__separator" aria-hidden="true">•</span>'
    adresse_metro = re.compile(
        r'(<a class="footer-address-link"[^>]*>.*?</a>)\s*'
        r'(?:<span class="footer-details__separator"[^>]*>.*?</span>\s*)?'
        r'(<a class="footer-details__metro"[^>]*>.*?</a>)', re.S)
    return adresse_metro.sub(
        lambda m: '<span class="footer-details__location">'
        + m.group(1) + separateur + m.group(2) + '</span>', s)


def poser_classe_secondaire(s: str) -> str:
    """Marque le pied de page des pages intérieures (hors page de garde)."""
    if 'class="footer footer--secondaire"' in s:
        return s
    return s.replace('<footer class="footer">',
                     '<footer class="footer footer--secondaire">', 1)


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
    """Garde plein ecran; alentours et liens legaux suivent au defilement."""
    s = re.sub(r'<div class="cover-footer-address">.*?</div>\s*</div>',
               lambda _m: COVER_ADRESSE + "\n        </div>", s, count=1, flags=re.S)

    # Supprimer l'ancienne ligne du quartier avant de reconstruire le bloc.
    s, _ = entre_marqueurs(s, "<!-- quartier:garde:debut -->",
                           "<!-- quartier:garde:fin -->", "")
    s = re.sub(
        r'(<div class="cover-links">[\s\S]*?</div>)[ \t]*\n(?:[ \t]*\n)+([ \t]*</div>)',
        r"\1\n\2",
        s,
        count=1,
    )
    bloc = (
        "<!-- cover-more:debut -->\n"
        '<section id="cover-more" class="cover-more">\n'
        "        <!-- quartier:garde:debut -->\n        "
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
        s = poser_classe_secondaire(s)
        s = poser_js(s)
        f.write_text(s, encoding="utf-8")
        print(f"{nom} : pied de page intérieur mis a jour (trait + ligne unique)")

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
