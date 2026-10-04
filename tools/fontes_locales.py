#!/usr/bin/env python3
"""Auto-hébergement des fontes latines (performance + RGPD).

Remplace, dans les pages HTML du site, les appels à fonts.googleapis.com par
des déclarations @font-face pointant vers assets/fonts/. Supprime ainsi deux
connexions tierces et le blocage du rendu, et évite toute requête vers Google
depuis le navigateur du visiteur.

Les fichiers woff2 proviennent de @fontsource (mêmes sous-ensembles que Google
Fonts) et sont versionnés dans assets/fonts/.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

LATIN = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
         "U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,"
         "U+2212,U+2215,U+FEFF,U+FFFD")
LATIN_EXT = ("U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,"
             "U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,"
             "U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF")

MARQUEUR = "/* fontes latines auto-hebergees */"


def face(famille: str, poids: int, fichier: str, plage: str, style: str = "normal") -> str:
    return (f"@font-face{{font-family:'{famille}';font-style:{style};"
            f"font-weight:{poids};font-display:swap;"
            f"src:url('assets/fonts/{fichier}') format('woff2');"
            f"unicode-range:{plage};}}")


def bloc_css() -> str:
    lignes = [MARQUEUR]
    for p in (400, 500, 600, 700, 800, 900):
        lignes.append(face("Cinzel", p, f"cinzel-{p}.woff2", LATIN))
        lignes.append(face("Cinzel", p, f"cinzel-ext-{p}.woff2", LATIN_EXT))
    for p in (400, 500, 600, 700, 800):
        lignes.append(face("Montserrat", p, f"montserrat-{p}.woff2", LATIN))
    for p in (400, 600, 700):
        lignes.append(face("Montserrat", p, f"montserrat-ext-{p}.woff2", LATIN_EXT))
    lignes.append(face("Montserrat", 400, "montserrat-400-italic.woff2", LATIN, "italic"))
    lignes.append(face("Parisienne", 400, "parisienne-400.woff2", LATIN))
    return "\n".join(lignes)


PRECHARGE = (
    '<link rel="preload" as="font" type="font/woff2" '
    'href="assets/fonts/cinzel-700.woff2" crossorigin>\n'
    '<link rel="preload" as="font" type="font/woff2" '
    'href="assets/fonts/montserrat-400.woff2" crossorigin>'
)

PAGES = ["index.html", "reservation.html", "mentions-legales.html", "confidentialite.html"]


def traiter(nom: str) -> None:
    p = ROOT / nom
    s = p.read_text(encoding="utf-8")
    if MARQUEUR in s:
        print(f"{nom} : deja traite")
        return

    # 1. retrait des appels Google Fonts (preconnect, preload, stylesheet, noscript)
    avant = len(s)
    s = re.sub(r"[ \t]*<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?", "", s)
    s = re.sub(r"[ \t]*<noscript><link[^>]*fonts\.googleapis\.com[^>]*></noscript>\n?", "", s)

    # 2. préchargement des deux fontes critiques, juste avant la 1re feuille de style
    m = re.search(r"[ \t]*<style", s)
    s = s[:m.start()] + PRECHARGE + "\n" + s[m.start():]

    # 3. déclarations @font-face en tête de la première feuille de style
    m = re.search(r"<style[^>]*>", s)
    s = s[:m.end()] + "\n" + bloc_css() + "\n" + s[m.end():]

    p.write_text(s, encoding="utf-8")
    print(f"{nom} : Google Fonts retire, {avant - len(s):+d} octets")


if __name__ == "__main__":
    for nom in PAGES:
        traiter(nom)
