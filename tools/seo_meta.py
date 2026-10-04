#!/usr/bin/env python3
"""Harmonise les métadonnées SEO et de partage des pages du site.

Idempotent : relancer le script ne duplique rien.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://lacollinegambetta.com"
OG = f"{BASE}/assets/cover/og-cover.jpg"
ALT = "Medaillon dore de La Colline Gambetta, bar restaurant a Paris 20e"
THEME = '<meta name="theme-color" content="#24102e">\n<meta name="color-scheme" content="dark light">'


def inserer_apres_charset(s: str, bloc: str) -> str:
    m = re.search(r'<meta charset="[^"]+">\s*', s, re.I)
    return s[:m.end()] + bloc + "\n" + s[m.end():]


def page_accueil() -> None:
    p = ROOT / "index.html"
    s = p.read_text(encoding="utf-8")

    s = s.replace(f'{BASE}/Logo_LaColline_Gambetta.png', OG)

    if "og:image:width" not in s:
        s = s.replace(
            f'<meta property="og:image" content="{OG}">',
            f'<meta property="og:image" content="{OG}">\n'
            '<meta property="og:image:width" content="1200">\n'
            '<meta property="og:image:height" content="630">\n'
            f'<meta property="og:image:alt" content="{ALT}">\n'
            '<meta property="og:image:type" content="image/jpeg">')
        s = s.replace(
            f'<meta name="twitter:image" content="{OG}">',
            f'<meta name="twitter:image" content="{OG}">\n'
            f'<meta name="twitter:image:alt" content="{ALT}">')

    if 'name="theme-color"' not in s:
        s = inserer_apres_charset(s, THEME)

    # préchargement de l'image du médaillon : c'est l'élément LCP de la page
    if "medaillon-logo-noir-brillant.svg" in s and 'as="image"' not in s:
        s = s.replace(
            '<link rel="preload" as="font" type="font/woff2" href="assets/fonts/cinzel-700.woff2" crossorigin>',
            '<link rel="preload" as="image" type="image/svg+xml" '
            'href="assets/cover/medaillon-logo-noir-brillant.svg?v=20260930-grains" fetchpriority="high">\n'
            '<link rel="preload" as="font" type="font/woff2" href="assets/fonts/cinzel-700.woff2" crossorigin>')

    # dimensions intrinsèques : évite tout décalage de mise en page (CLS)
    tailles = {
        "assets/noel/sleigh.svg": (1116, 363),
        "assets/menus/motif-80a.png": (80, 80),
        "assets/menus/icon-duo.png": (261, 259),
        "assets/menus/icon-complete.png": (256, 256),
        "assets/menus/icon-enfant.png": (308, 308),
        "assets/menus/icon-pdj.png": (316, 316),
    }

    def ajouter_dimensions(m: re.Match) -> str:
        balise = m.group(0)
        if "width=" in balise:
            return balise
        for src, (w, h) in tailles.items():
            if src in balise:
                return balise[:-1].rstrip() + f' width="{w}" height="{h}">'
        return balise

    s = re.sub(r"<img\b[^>]*>", ajouter_dimensions, s)
    p.write_text(s, encoding="utf-8")
    print("index.html : metadonnees de partage, theme-color, preload LCP, dimensions d'images")


SECONDAIRES = {
    "reservation.html": (
        "La Colline Gambetta — Réserver une table",
        "Réservez votre table à La Colline Gambetta, bar-restaurant au 4 rue Belgrand, Paris 20e.",
        "website",
    ),
    "mentions-legales.html": (
        "La Colline Gambetta — Mentions légales",
        "Mentions légales du site de La Colline Gambetta, 4 rue Belgrand, 75020 Paris.",
        "website",
    ),
    "confidentialite.html": (
        "La Colline Gambetta — Confidentialité",
        "Politique de confidentialité et informations RGPD de La Colline Gambetta.",
        "website",
    ),
}


def pages_secondaires() -> None:
    for nom, (titre, desc, typ) in SECONDAIRES.items():
        p = ROOT / nom
        s = p.read_text(encoding="utf-8")
        url = f"{BASE}/{nom}"
        ajouts = []
        if 'rel="canonical"' not in s:
            ajouts.append(f'<link rel="canonical" href="{url}">')
        if 'name="robots"' not in s:
            robots = "index, follow, max-image-preview:large"
            ajouts.append(f'<meta name="robots" content="{robots}">')
        if 'property="og:' not in s:
            ajouts += [
                f'<meta property="og:type" content="{typ}">',
                f'<meta property="og:title" content="{titre}">',
                f'<meta property="og:description" content="{desc}">',
                f'<meta property="og:url" content="{url}">',
                '<meta property="og:site_name" content="La Colline Gambetta">',
                '<meta property="og:locale" content="fr_FR">',
                f'<meta property="og:image" content="{OG}">',
                '<meta property="og:image:width" content="1200">',
                '<meta property="og:image:height" content="630">',
                f'<meta property="og:image:alt" content="{ALT}">',
                '<meta name="twitter:card" content="summary_large_image">',
                f'<meta name="twitter:title" content="{titre}">',
                f'<meta name="twitter:description" content="{desc}">',
                f'<meta name="twitter:image" content="{OG}">',
            ]
        if 'name="theme-color"' not in s:
            ajouts.append(THEME)
        if not ajouts:
            print(f"{nom} : deja complet")
            continue
        s = inserer_apres_charset(s, "\n".join(ajouts))
        p.write_text(s, encoding="utf-8")
        print(f"{nom} : {len(ajouts)} metadonnees ajoutees")


if __name__ == "__main__":
    page_accueil()
    pages_secondaires()
