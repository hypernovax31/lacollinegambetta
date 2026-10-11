#!/usr/bin/env python3
"""Fonds des médaillons de fête.

Trois règles appliquées aux SVG de médaillons (assets/cover + assets/fetes) :

1. ``sans_voile``  : suppression des films de dégradé noir posés sur le médaillon
   (``lcgTextBg`` : voile noir derrière les textes du bas ; ``lcgVignette`` :
   vignette noire sur tout le disque).  Le fond redevient transparent : seul le
   disque de la fête reste visible.
2. ``coeur``       : Saint-Valentin — un grand cœur en fond du médaillon,
   dessiné juste après le disque, donc derrière l'orangerie (arbre, colline,
   textes, logos).
3. ``vinyle``      : Fête de la musique — le disque noir uni est remplacé par un
   vinyle (sillons concentriques, étiquette or cerclée, trou central, reflet).

Le script est idempotent : relancé, il retire puis remet les motifs sans les
dupliquer.

Usage :
    python3 tools/medaillons_fond.py                 # tous les médaillons
    python3 tools/medaillons_fond.py assets/cover/medaillon-logo-saint-valentin.svg
    python3 tools/medaillons_fond.py --check         # contrôle uniquement
"""
from __future__ import annotations

import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOSSIERS = ("assets/cover", "assets/fetes")

# Gradients considérés comme des voiles noirs recouvrant le médaillon.
VOILES = ("lcgTextBg", "lcgVignette")

DISQUE = re.compile(r'<circle cx="999\.5" cy="999\.5" r="999\.5" fill="url\(#lcgDisc\)"/>')


# --------------------------------------------------------------------------- #
# 1. Retrait des voiles noirs                                                 #
# --------------------------------------------------------------------------- #
def retirer_voiles(texte: str) -> str:
    """Supprime les éléments qui peignent un film noir sur le médaillon."""
    for gid in VOILES:
        # éléments utilisant le dégradé (rect de voile bas, cercle de vignette)
        texte = re.sub(r'<(?:rect|circle|path|ellipse)\b[^>]*url\(#%s\)[^>]*/>' % gid, '', texte)
        # définition du dégradé lui-même
        texte = re.sub(
            r'\s*<(?:radial|linear)Gradient\b[^>]*\bid="%s"[^>]*>.*?</(?:radial|linear)Gradient>' % gid,
            '', texte, flags=re.S)
    return texte


# --------------------------------------------------------------------------- #
# 2. Cœur — Saint-Valentin                                                    #
# --------------------------------------------------------------------------- #
def coeur_path(cx: float = 1000.0, cy: float = 1000.0, rayon: float = 560.0,
               points: int = 64) -> str:
    """Tracé de cœur lissé (Bézier cubique), inscrit dans un cercle de ``rayon``.

    Courbe paramétrique classique du cœur, convertie en cubiques de Bézier par
    un passage Catmull-Rom : un tracé court et parfaitement lisse.
    """
    brut = []
    for i in range(points):
        t = 2 * math.pi * i / points
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        brut.append((x, y))
    xs = [p[0] for p in brut]
    ys = [p[1] for p in brut]
    ox, oy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

    # normalisation : le cœur tient dans un rayon de 1 autour de son centre
    pts = [((x - ox), (y - oy)) for x, y in brut]
    echelle = 1.0 / max(math.hypot(x, y) for x, y in pts)
    pts = [(x * echelle, y * echelle) for x, y in pts]
    # recentrage : le centre du cœur (et non de sa boîte) sur (cx, cy)
    dy = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
    n = len(pts)
    P = [(cx + x * rayon, cy + (y - dy) * rayon) for x, y in pts]

    d = "M%.2f %.2f" % P[0]
    for i in range(n):
        p0, p1 = P[i], P[(i + 1) % n]
        pm1, p2 = P[(i - 1) % n], P[(i + 2) % n]
        c1 = (p0[0] + (p1[0] - pm1[0]) / 6, p0[1] + (p1[1] - pm1[1]) / 6)
        c2 = (p1[0] - (p2[0] - p0[0]) / 6, p1[1] - (p2[1] - p0[1]) / 6)
        d += "C%.2f %.2f %.2f %.2f %.2f %.2f" % (c1[0], c1[1], c2[0], c2[1], p1[0], p1[1])
    return d + "Z"


COEUR_GRADIENTS = """<radialGradient id="lcgHeart" cx="42%" cy="32%" r="72%"><stop offset="0%" stop-color="#ffb3c1"/><stop offset="35%" stop-color="#f4566f"/><stop offset="72%" stop-color="#d01b45"/><stop offset="100%" stop-color="#8e0c2c"/></radialGradient>
<radialGradient id="lcgHeartBg" cx="50%" cy="52%" r="62%"><stop offset="0%" stop-color="#ff7a95" stop-opacity="0.50"/><stop offset="60%" stop-color="#ff5c7d" stop-opacity="0.20"/><stop offset="100%" stop-color="#ff5c7d" stop-opacity="0"/></radialGradient>
"""


def appliquer_coeur(texte: str, rayon: float = 600.0) -> str:
    """Insère le cœur de fond juste après le disque du médaillon."""
    texte = re.sub(r'\s*<g id="coeur-fond".*?</g>', '', texte, flags=re.S)
    for gid in ("lcgHeart", "lcgHeartBg"):
        texte = re.sub(
            r'\s*<(?:radial|linear)Gradient\b[^>]*\bid="%s"[^>]*>.*?</(?:radial|linear)Gradient>' % gid,
            '', texte, flags=re.S)

    d = coeur_path(rayon=rayon)
    groupe = (
        '<g id="coeur-fond">'
        '<path d="%s" fill="url(#lcgHeartBg)"/>'
        '<path d="%s" fill="url(#lcgHeart)" opacity="0.94" stroke="#6d0722" stroke-width="5" stroke-linejoin="round"/>'
        '<path d="%s" fill="none" stroke="url(#lcgGold)" stroke-width="3" stroke-opacity="0.9" stroke-linejoin="round"/>'
        '</g>' % (d, d, d)
    )
    texte = DISQUE.sub(lambda m: m.group(0) + groupe, texte, count=1)
    return texte


# --------------------------------------------------------------------------- #
# 3. Vinyle — Fête de la musique                                              #
# --------------------------------------------------------------------------- #
VINYLE_GRADIENTS = """<radialGradient id="lcgVinyl" cx="50%" cy="42%" r="74%"><stop offset="0%" stop-color="#2e2e2e"/><stop offset="38%" stop-color="#171717"/><stop offset="72%" stop-color="#0b0b0b"/><stop offset="100%" stop-color="#040404"/></radialGradient>
<radialGradient id="lcgLabel" cx="38%" cy="30%" r="76%"><stop offset="0%" stop-color="#ffe9a8"/><stop offset="45%" stop-color="#e9c368"/><stop offset="100%" stop-color="#c08a24"/></radialGradient>
<radialGradient id="lcgVinylSheen" cx="32%" cy="22%" r="60%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.13"/><stop offset="55%" stop-color="#ffffff" stop-opacity="0.04"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
"""


def _sillons(r_min: float, r_max: float, pas: float, couleur: str, opacite: float,
             largeur: float, decalage: float = 0.0) -> str:
    out = []
    r = r_min
    while r <= r_max + 0.01:
        out.append('<circle cx="1000" cy="1000" r="%.1f"/>' % (r + decalage))
        r += pas
    return ('<g fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s">%s</g>'
            % (couleur, opacite, largeur, "".join(out)))


def groupe_vinyle() -> str:
    """Sillons + étiquette or + trou central + reflet, derrière l'orangerie."""
    return (
        '<g id="vinyle-fond">'
        + _sillons(455, 958, 21, "#ffffff", 0.07, 1.8)
        + _sillons(455, 958, 21, "#000000", 0.40, 1.2, decalage=10.5)
        + '<circle cx="1000" cy="1000" r="430" fill="url(#lcgLabel)"/>'
        + '<circle cx="1000" cy="1000" r="430" fill="none" stroke="#140d05" stroke-width="11" stroke-opacity="0.85"/>'
        + '<circle cx="1000" cy="1000" r="438" fill="none" stroke="url(#lcgGold)" stroke-width="4"/>'
        + _sillons(150, 400, 46, "#ffffff", 0.05, 1.2)
        + '<circle cx="1000" cy="1000" r="26" fill="#080808" stroke="url(#lcgGold)" stroke-width="2.5"/>'
        + '<circle cx="999.5" cy="999.5" r="999.5" fill="url(#lcgVinylSheen)"/>'
        + '</g>'
    )


def appliquer_vinyle(texte: str) -> str:
    """Remplace le fond noir du médaillon par un vinyle."""
    # anciens éléments vinyle (petit disque posé au centre)
    texte = re.sub(r'\s*<g id="vinyle-fond".*?</g>', '', texte, flags=re.S)
    texte = re.sub(r'\s*<g opacity="0\.15">(?:\s*<circle cx="1000" cy="850"[^>]*/>)+\s*</g>', '', texte)
    texte = re.sub(r'\s*<circle cx="1000" cy="850"[^>]*/>', '', texte)
    for gid in ("lcgVinyl", "lcgLabel", "lcgVinylSheen"):
        texte = re.sub(
            r'\s*<(?:radial|linear)Gradient\b[^>]*\bid="%s"[^>]*>.*?</(?:radial|linear)Gradient>' % gid,
            '', texte, flags=re.S)

    # le disque devient le corps du vinyle, les sillons se posent juste après
    texte = DISQUE.sub(
        '<circle cx="999.5" cy="999.5" r="999.5" fill="url(#lcgVinyl)"/>' + groupe_vinyle(),
        texte, count=1)

    if "<defs>" in texte:
        texte = texte.replace("<defs>", "<defs>\n" + VINYLE_GRADIENTS, 1)
    return texte


# --------------------------------------------------------------------------- #
# Application par fichier                                                     #
# --------------------------------------------------------------------------- #
def traiter(fichier: Path) -> str:
    nom = fichier.name
    texte = fichier.read_text(encoding="utf-8")
    if "<<<<<<<" in texte:
        return "CONFLIT (non résolu)"
    texte = retirer_voiles(texte)
    if "saint-valentin" in nom:
        texte = appliquer_coeur(texte)
        if "<defs>" in texte:
            texte = texte.replace("<defs>", "<defs>\n" + COEUR_GRADIENTS, 1)
    elif "fete-de-la-musique" in nom:
        texte = appliquer_vinyle(texte)
        texte = DISQUE.sub(lambda m: m.group(0) + groupe_vinyle(), texte, count=1)
    fichier.write_text(texte, encoding="utf-8")
    try:
        ET.fromstring(texte)
    except ET.ParseError as exc:  # pragma: no cover - sécurité
        return "XML INVALIDE : %s" % exc
    return "ok"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    fichiers = [Path(a) for a in args]
    if not fichiers:
        fichiers = sorted(p for d in DOSSIERS for p in (ROOT / d).glob("medaillon-logo-*.svg"))
    for f in fichiers:
        if not f.exists():
            print("introuvable :", f)
            continue
        if check:
            texte = f.read_text(encoding="utf-8")
            ET.fromstring(texte)
            etat = []
            for gid in VOILES:
                if gid in texte:
                    etat.append("voile " + gid)
            if "saint-valentin" in f.name and "coeur-fond" not in texte:
                etat.append("cœur absent")
            if "fete-de-la-musique" in f.name and "vinyle-fond" not in texte:
                etat.append("vinyle absent")
            print("%-52s %s" % (f.name, ", ".join(etat) if etat else "ok"))
        else:
            print("%-52s %s" % (f.name, traiter(f)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
