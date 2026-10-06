#!/usr/bin/env python3
"""Optimisations de contenu et de balisage SEO, sans toucher au design.

Toutes les transformations sont idempotentes : le script peut etre relance
apres n'importe quelle modification du site.

1. un vrai <h1> sur la page de garde (meme rendu : les regles CSS en h2 sont
   elargies a :is(h1,h2), specificite inchangee) ;
2. meta description ramenee sous 160 caracteres ;
3. liens hreflang vers les 15 langues servies par ?lang= ;
4. donnees structurees enrichies : Restaurant complet, carte Menu avec les
   prix, action de reservation, site web et fil d'Ariane sur les pages annexes.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
BASE = "https://lacollinegambetta.com"
LANGUES = ["fr", "en", "es", "de", "it", "pt", "nl", "pl", "zh", "uk", "ja",
           "ko", "ar", "tr", "hi"]
DESCRIPTION = ("Bar-brasserie au 4 rue Belgrand, Paris 20e (metro Gambetta) : "
               "cuisine maison en continu, Happy Hour 17h-23h, terrasse.")
DESCRIPTION = ("Bar-brasserie au 4 rue Belgrand, Paris 20\u1d49 (m\u00e9tro Gambetta) : "
               "cuisine maison en continu, Happy Hour 17h-23h, terrasse.")


# --------------------------------------------------------------------------- #
# 1. un vrai <h1>, au rendu strictement identique
# --------------------------------------------------------------------------- #
def titre_principal(s: str) -> str:
    if "<h1" in s:
        print("  h1 : deja en place")
        return s

    # Les regles CSS ecrites pour h2 doivent aussi viser h1 : :is(h1,h2) a
    # exactement la meme specificite qu'un selecteur de type, donc aucune
    # cascade n'est modifiee.
    debut = s.index("<style>") + len("<style>")
    fin = s.index("</style>", debut)
    css = s[debut:fin]
    css2 = re.sub(r"(?<![\w.#\-])h2(?![\w\-])", ":is(h1,h2)", css)
    s = s[:debut] + css2 + s[fin:]

    # Seule la page de garde recoit le h1 ; l'en-tete interieur garde son h2.
    ancre = '<h2>COLLINE <span>GAMBETTA</span></h2>'
    i = s.index('id="titre-principal"')
    j = s.index(ancre, i)
    titre = ('<h1>COLLINE <span>GAMBETTA</span>'
             '<small class="sr-only"> \u2014 bar et restaurant au 4 rue Belgrand, '
             'Paris 20\u1d49, m\u00e9tro Gambetta</small></h1>')
    s = s[:j] + titre + s[j + len(ancre):]
    print(f"  h1 : page de garde ({css.count('h2') } selecteurs CSS elargis)")
    return s


# --------------------------------------------------------------------------- #
# 2. meta description
# --------------------------------------------------------------------------- #
def description(s: str) -> str:
    m = re.search(r'<meta name="description" content="([^"]*)">', s)
    if m.group(1) == DESCRIPTION:
        print("  description : deja raccourcie")
        return s
    s = s[:m.start()] + f'<meta name="description" content="{DESCRIPTION}">' + s[m.end():]
    print(f"  description : {len(m.group(1))} -> {len(DESCRIPTION)} caracteres")
    return s


# --------------------------------------------------------------------------- #
# 3. hreflang (les traductions sont servies par ?lang=)
# --------------------------------------------------------------------------- #
def hreflang(s: str) -> str:
    if 'hreflang=' in s:
        print("  hreflang : deja en place")
        return s
    liens = ['<!-- Les 15 langues du site sont accessibles par ?lang= : on les declare a Google. -->']
    for lg in LANGUES:
        href = f"{BASE}/" if lg == "fr" else f"{BASE}/?lang={lg}"
        liens.append(f'<link rel="alternate" hreflang="{lg}" href="{href}">')
    liens.append(f'<link rel="alternate" hreflang="x-default" href="{BASE}/">')
    ancre = f'<link rel="canonical" href="{BASE}/">'
    s = s.replace(ancre, ancre + "\n" + "\n".join(liens), 1)
    print(f"  hreflang : {len(LANGUES)} langues + x-default")
    return s


# --------------------------------------------------------------------------- #
# 4. donnees structurees
# --------------------------------------------------------------------------- #
def _texte(x: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", x)).replace("\u00a0", " ").strip()


def _prix(x: str) -> str | None:
    m = re.search(r"(\d+[,.]\d{2})", x)
    return m.group(1).replace(",", ".") if m else None


def carte_menu(s: str) -> dict:
    """Construit le Menu schema.org a partir du HTML de la carte."""
    titres = {"entrees": "Entr\u00e9es", "plats": "Plats", "menus": "Formules",
              "boissons": "Boissons", "cocktails": "Cocktails", "vins": "Vins",
              "desserts": "Desserts"}
    sections = []
    for ident, titre in titres.items():
        m = re.search(rf'<section id="{ident}" class="menu-section[^"]*">', s)
        if not m:
            continue
        bloc = s[m.end():s.index("</section>", m.end())]
        sous = []
        for pan in re.split(r'<article class="panel">', bloc)[1:]:
            nom = re.search(r'<h4 class="panel__title">(.*?)</h4>', pan)
            items = []
            for mm in re.finditer(
                    r'<h5>(.*?)</h5>(.*?)</div>\s*<strong>([^<]+)</strong>', pan, re.S):
                note = " ".join(_texte(x) for x in re.findall(
                    r'class="food-card__note">(.*?)<', mm.group(2)))
                items.append((_texte(mm.group(1)), note, _prix(mm.group(3))))
            for mm in re.finditer(
                    r'class="price-line__name">(.*?)</div>.*?'
                    r'class="price-line__price">(.*?)</div>', pan, re.S):
                items.append((_texte(mm.group(1)), "", _prix(mm.group(2))))
            for mm in re.finditer(
                    r'class="hh-line__name">(.*?)</div>.*?'
                    r'class="hh-line__price">(.*?)</span>', pan, re.S):
                items.append((_texte(mm.group(1)), "", _prix(mm.group(2))))
            for mm in re.finditer(
                    r'<td class="wine-name">(.*?)</td>(.*?)</tr>', pan, re.S):
                prix = [p for p in re.findall(r'<td data-label="[^"]*">([^<]*)</td>',
                                              mm.group(2)) if _prix(p)]
                items.append((_texte(mm.group(1)), "", _prix(prix[-1]) if prix else None))
            if not items:
                continue
            offres = []
            for nom_item, note, prix in items:
                item = {"@type": "MenuItem", "name": nom_item}
                if note:
                    item["description"] = note
                if prix:
                    item["offers"] = {"@type": "Offer", "price": prix,
                                      "priceCurrency": "EUR"}
                offres.append(item)
            sous.append({"@type": "MenuSection",
                         "name": _texte(nom.group(1)) if nom else titre,
                         "hasMenuItem": offres})
        if sous:
            sections.append({"@type": "MenuSection", "name": titre,
                             "hasMenuSection": sous})
    return {"@type": "Menu", "@id": f"{BASE}/#carte", "name": "Carte de La Colline Gambetta",
            "inLanguage": "fr-FR", "hasMenuSection": sections}


def donnees_structurees(s: str) -> str:
    menu = carte_menu(s)
    nb = sum(len(x["hasMenuItem"]) for sec in menu["hasMenuSection"]
             for x in sec["hasMenuSection"])

    restaurant = {
        "@context": "https://schema.org",
        "@type": "Restaurant",
        "@id": f"{BASE}/#restaurant",
        "name": "La Colline Gambetta",
        "alternateName": "La Colline",
        "description": "Bar-brasserie de quartier \u00e0 Paris 20\u1d49, \u00e0 deux pas de la place "
                       "Gambetta et du P\u00e8re-Lachaise : cuisine maison servie en continu, "
                       "planches, cocktails, vins au verre, Happy Hour de 17h \u00e0 23h et terrasse.",
        "image": [f"{BASE}/assets/cover/og-cover.jpg",
                  f"{BASE}/assets/plats/cuisse-de-canard-confite.jpg",
                  f"{BASE}/assets/plats/la-cochonnaille.jpg"],
        "logo": f"{BASE}/assets/cover/medaillon-logo-noir-brillant.svg",
        "url": f"{BASE}/",
        "telephone": "+33143490593",
        "email": "restaurant@lacollinegambetta.com",
        "priceRange": "\u20ac\u20ac",
        "currenciesAccepted": "EUR",
        "paymentAccepted": "Esp\u00e8ces, Carte bancaire, Titres-restaurant",
        "servesCuisine": ["Fran\u00e7aise", "Brasserie", "Bistrot", "Planches", "Cocktails"],
        "acceptsReservations": "True",
        "menu": f"{BASE}/#menu-nav-anchor",
        "hasMenu": {"@id": f"{BASE}/#carte"},
        "address": {"@type": "PostalAddress", "streetAddress": "4 rue Belgrand",
                    "addressLocality": "Paris", "addressRegion": "\u00cele-de-France",
                    "postalCode": "75020", "addressCountry": "FR"},
        "geo": {"@type": "GeoCoordinates", "latitude": 48.8647788, "longitude": 2.3993777},
        "hasMap": "https://www.openstreetmap.org/directions?to=48.8647788%2C2.3993777",
        "areaServed": [{"@type": "City", "name": "Paris"},
                       {"@type": "Place", "name": "Paris 20\u1d49 arrondissement"}],
        "containedInPlace": {"@type": "Place", "name": "Quartier Gambetta \u2014 Paris 20\u1d49",
                             "address": {"@type": "PostalAddress", "addressLocality": "Paris",
                                         "postalCode": "75020", "addressCountry": "FR"}},
        "publicAccess": True,
        "smokingAllowed": False,
        "amenityFeature": [
            {"@type": "LocationFeatureSpecification", "name": "Terrasse", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Service continu", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Cuisine fait maison", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "Happy Hour 17h-23h", "value": True},
        ],
        "knowsLanguage": LANGUES,
        "openingHoursSpecification": [{
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                          "Saturday", "Sunday"],
            "opens": "07:00", "closes": "02:00"}],
        "potentialAction": {
            "@type": "ReserveAction",
            "target": {"@type": "EntryPoint",
                       "urlTemplate": f"{BASE}/reservation.html",
                       "inLanguage": "fr-FR",
                       "actionPlatform": ["https://schema.org/DesktopWebPlatform",
                                          "https://schema.org/MobileWebPlatform"]},
            "result": {"@type": "FoodEstablishmentReservation",
                       "name": "R\u00e9server une table \u00e0 La Colline Gambetta"}},
        "sameAs": [
            "https://www.instagram.com/lacolline.gambetta",
            "https://www.google.com/maps/search/?api=1&query=La+Colline+Gambetta,"
            "+4+Rue+Belgrand,+75020+Paris",
            "https://www.openstreetmap.org/?mlat=48.8647788&mlon=2.3993777",
        ],
    }

    site = {"@context": "https://schema.org", "@type": "WebSite",
            "@id": f"{BASE}/#site", "url": f"{BASE}/",
            "name": "La Colline Gambetta",
            "inLanguage": [f"{lg}-FR" if lg == "fr" else lg for lg in LANGUES],
            "publisher": {"@id": f"{BASE}/#restaurant"}}

    menu_ld = dict(menu)
    menu_ld["@context"] = "https://schema.org"
    menu_ld["provider"] = {"@id": f"{BASE}/#restaurant"}

    bloc = ["<!-- donnees structurees (tools/seo_contenu.py) -->"]
    for d in (restaurant, site, menu_ld):
        bloc.append('<script type="application/ld+json">'
                    + json.dumps(d, ensure_ascii=False, separators=(",", ":"))
                    + "</script>")
    bloc.append("<!-- fin donnees structurees -->")
    neuf = "\n".join(bloc)

    debut = "<!-- donnees structurees (tools/seo_contenu.py) -->"
    fin = "<!-- fin donnees structurees -->"
    if debut in s:
        i, j = s.index(debut), s.index(fin) + len(fin)
        s = s[:i] + neuf + s[j:]
    else:
        m = re.search(r'<!-- Donn\u00e9es structur\u00e9es[^>]*-->\s*'
                      r'<script type="application/ld\+json">.*?</script>', s, re.S)
        s = s[:m.start()] + neuf + s[m.end():]
    print(f"  donnees structurees : Restaurant + WebSite + Menu ({nb} plats et boissons)")
    return s


# --------------------------------------------------------------------------- #
# 5. fil d'Ariane sur les pages annexes
# --------------------------------------------------------------------------- #
ANNEXES = {"reservation.html": "R\u00e9servation",
           "mentions-legales.html": "Mentions l\u00e9gales",
           "confidentialite.html": "Confidentialit\u00e9"}


def fil_ariane() -> None:
    for nom, titre in ANNEXES.items():
        p = ROOT / nom
        s = p.read_text(encoding="utf-8")
        if "BreadcrumbList" in s:
            print(f"  {nom} : fil d'Ariane deja present")
            continue
        fil = {"@context": "https://schema.org", "@type": "BreadcrumbList",
               "itemListElement": [
                   {"@type": "ListItem", "position": 1, "name": "Accueil", "item": f"{BASE}/"},
                   {"@type": "ListItem", "position": 2, "name": titre,
                    "item": f"{BASE}/{nom}"}]}
        bloc = ('<script type="application/ld+json">'
                + json.dumps(fil, ensure_ascii=False, separators=(",", ":"))
                + "</script>")
        i = s.index("</head>")
        p.write_text(s[:i] + bloc + "\n" + s[i:], encoding="utf-8")
        print(f"  {nom} : fil d'Ariane ajoute")


CANONIQUE = """<script>
/* Les traductions sont servies par ?lang= : chaque version linguistique doit
   se declarer canonique d'elle-meme, sinon Google ignore les hreflang. */
(function () {
  var langues = ['en','es','de','it','pt','nl','pl','zh','uk','ja','ko','ar','tr','hi'];
  var p = new URLSearchParams(location.search).get('lang');
  var l = document.querySelector('link[rel="canonical"]');
  if (!l || !p || langues.indexOf(p) < 0) return;
  l.href = 'https://lacollinegambetta.com/?lang=' + p;
})();
</script>"""


def canonical_par_langue(s: str) -> str:
    if "se declarer canonique" in s:
        print("  canonical par langue : deja en place")
        return s
    i = s.index("</head>")
    print("  canonical par langue : ajoute")
    return s[:i] + CANONIQUE + "\n" + s[i:]


def main() -> None:
    s = INDEX.read_text(encoding="utf-8")
    avant = len(s)
    s = titre_principal(s)
    s = description(s)
    s = hreflang(s)
    s = donnees_structurees(s)
    s = canonical_par_langue(s)
    INDEX.write_text(s, encoding="utf-8")
    fil_ariane()
    print(f"index.html : {avant} -> {len(s)} octets")


if __name__ == "__main__":
    main()
