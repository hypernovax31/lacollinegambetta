#!/usr/bin/env python3
"""Optimisations de contenu et de balisage SEO, sans toucher au design.

Toutes les transformations sont idempotentes : le script peut etre relance
apres n'importe quelle modification du site.

1. un vrai <h1> sur la page de garde (meme rendu : les regles CSS en h2 sont
   elargies a :is(h1,h2), specificite inchangee) ;
2. meta description ramenee sous 160 caracteres ;
3. liens hreflang vers les 15 langues servies par ?lang= ;
4. donnees structurees enrichies : Restaurant complet, carte Menu avec les
   prix, action de reservation, site web, fil d'Ariane sur les pages annexes ;
5. bloc d'avis Google sur la page de garde, alimente par
   assets/data/avis-google.json (rien ne s'affiche tant que le fichier n'est
   pas rempli avec de vrais avis).
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
# 5. bloc d'avis Google sur la page de garde
# --------------------------------------------------------------------------- #
CSS_AVIS = """
/* ===== Avis Google : une seule ligne sobre sous les liens de la page de
   garde. Le bloc reste masque tant que assets/data/avis-google.json n'a pas
   ete rempli, il ne peut donc jamais decaler la mise en page. ===== */
html:not(.carte-doc) .cover-reviews[hidden] { display:none !important; }
html:not(.carte-doc) .cover-reviews {
  display:flex; flex-direction:column; align-items:center; gap:.3rem;
  margin:.55rem auto 0; max-width:min(560px, 92vw); text-align:center;
}
html:not(.carte-doc) .cover-reviews__head {
  display:inline-flex; align-items:center; gap:.46rem;
  font-family:'Montserrat',sans-serif; font-size:.74rem; font-weight:600;
  letter-spacing:.08em; text-transform:uppercase; color:var(--gold-500,#d8b257);
}
html:not(.carte-doc) .cover-reviews__stars { letter-spacing:.12em; font-size:.82rem; line-height:1; }
html:not(.carte-doc) .cover-reviews__count { opacity:.72; font-weight:500; letter-spacing:.05em; }
html:not(.carte-doc) .cover-reviews__quote {
  margin:0; font-family:'Montserrat',sans-serif; font-style:italic;
  font-size:.76rem; line-height:1.45; color:rgba(255,255,255,.76);
  max-width:46ch;
}
html:not(.carte-doc) .cover-reviews__author { font-style:normal; opacity:.6; }
html:not(.carte-doc) .cover-reviews a { color:inherit; text-decoration:none; }
html:not(.carte-doc) .cover-reviews a:hover { text-decoration:underline; }
@media (max-height: 700px) {
  html:not(.carte-doc) .cover-reviews__quote { display:none; }
}
"""

HTML_AVIS = """<div class="cover-reviews" id="cover-reviews" hidden aria-label="Avis Google">
          <a class="cover-reviews__head" id="cover-reviews-link" href="https://www.google.com/maps/search/?api=1&amp;query=La%20Colline%20Gambetta%2C%204%20Rue%20Belgrand%2C%2075020%20Paris" target="_blank" rel="noopener">
            <span class="cover-reviews__stars" id="cover-reviews-stars" aria-hidden="true"></span>
            <span id="cover-reviews-note"></span>
            <span class="cover-reviews__count" id="cover-reviews-count"></span>
          </a>
          <p class="cover-reviews__quote" id="cover-reviews-quote" hidden></p>
        </div>"""

JS_AVIS = """<script>
/* Avis Google de la page de garde : lus dans assets/data/avis-google.json,
   jamais ecrits en dur. Tant que "publie" est faux ou que le fichier est
   absent, le bloc reste masque et la page est rigoureusement inchangee. */
(function () {
  var bloc = document.getElementById('cover-reviews');
  if (!bloc || !window.fetch) return;
  fetch('assets/data/avis-google.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || d.publie !== true || !d.note) return;
      var note = Number(String(d.note).replace(',', '.'));
      if (!(note > 0)) return;
      /* une etoile pleine par point entier ; 4,6/5 affiche donc quatre
         etoiles pleines et une vide, la note chiffree faisant foi. */
      var pleines = Math.round(note - 0.25);
      var etoiles = '';
      for (var i = 0; i < 5; i++) etoiles += (i < pleines ? '\\u2605' : '\\u2606');
      document.getElementById('cover-reviews-stars').textContent = etoiles;
      document.getElementById('cover-reviews-note').textContent =
        note.toFixed(1).replace('.', ',') + '/5';
      var nb = Number(d.nombre_avis || 0);
      document.getElementById('cover-reviews-count').textContent =
        nb ? '\\u00b7 ' + nb + ' avis Google' : '\\u00b7 Avis Google';
      if (d.url) document.getElementById('cover-reviews-link').href = d.url;
      var liste = (d.avis || []).filter(function (a) { return a && a.texte; });
      if (liste.length) {
        var a = liste[Math.floor(Math.random() * liste.length)];
        var q = document.getElementById('cover-reviews-quote');
        q.textContent = '\\u00ab\\u202f' + a.texte + '\\u202f\\u00bb';
        if (a.auteur) {
          var sp = document.createElement('span');
          sp.className = 'cover-reviews__author';
          sp.textContent = ' \\u2014 ' + a.auteur;
          q.appendChild(sp);
        }
        q.hidden = false;
      }
      bloc.hidden = false;
    })
    .catch(function () {});
})();
</script>"""


def bloc_avis(s: str) -> str:
    if "cover-reviews" in s:
        print("  avis Google : deja en place")
        return s
    fin_style = s.index("</style>")
    s = s[:fin_style] + CSS_AVIS + s[fin_style:]
    ancre = '      </div>\n      </div>\n'  # fin de .cover-links / .cover-footer
    i = s.index('<div class="cover-links">')
    j = s.index("</div>\n      </div>", i)
    s = s[:j] + "</div>\n        " + HTML_AVIS + "\n      " + s[j + len("</div>"):]
    k = s.rindex("</body>")
    s = s[:k] + JS_AVIS + "\n" + s[k:]
    print("  avis Google : bloc, styles et chargeur ajoutes")
    return s


def fichier_avis() -> None:
    p = ROOT / "assets" / "data" / "avis-google.json"
    if p.exists():
        print("  avis Google : fichier de donnees deja present")
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({
        "_mode_emploi": [
            "Renseignez ici les avis de la fiche Google La Colline Gambetta,",
            "puis passez publie a true : le bloc apparait sur la page de garde.",
            "N'y mettez que de vrais avis de votre fiche."],
        "publie": False,
        "note": None,
        "nombre_avis": None,
        "url": "",
        "avis": [{"auteur": "", "note": 5, "texte": ""}],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("  avis Google : assets/data/avis-google.json cree (vide, non publie)")


# --------------------------------------------------------------------------- #
# 6. fil d'Ariane sur les pages annexes
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
    s = bloc_avis(s)
    s = canonical_par_langue(s)
    INDEX.write_text(s, encoding="utf-8")
    fichier_avis()
    fil_ariane()
    print(f"index.html : {avant} -> {len(s)} octets")


if __name__ == "__main__":
    main()
