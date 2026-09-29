#!/usr/bin/env python3
"""Noyau géométrique du logo médaillon de La Colline Gambetta.

Les tracés proviennent d'une vectorisation réelle (séparation des couleurs puis
tracé des contours en courbes de Bézier) : aucune image pixellisée n'est
embarquée dans les SVG produits.

Le module découpe le tracé en composants nommés (anneau, arbre, lignes de
texte, feuillage) et remplace le trio de feuilles du bas par trois grains de
café dessinés en vectoriel.
"""
from __future__ import annotations

import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_SVG = ROOT / "assets" / "cover" / "medaillon-logo-noir-brillant.svg"
CANVAS = 2000.0
CENTER = 999.5
RADIUS = 999.5

# Bandes verticales de découpe, mesurées sur le tracé (canevas 2000).
BANDS = {
    "anneau": (0, 120),          # double filet extérieur
    "arbre": (280, 1120),        # arbre, branches et collines
    "titre": (1150, 1350),       # LA COLLINE GAMBETTA, 1re ligne
    "titre2": (1370, 1560),      # GAMBETTA, 2e ligne
    "soustitre": (1590, 1700),   # BAR . RESTAURANT
    "trio": (1700, 1900),        # trio de feuilles -> remplacé par les grains
}


def _subpaths(d: str) -> list[str]:
    return re.findall(r"M[^M]*", d)


def _bbox(sp: str) -> tuple[float, float, float, float]:
    nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", sp)]
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def _load() -> tuple[list[str], list[str]]:
    svg = BASE_SVG.read_text(encoding="utf-8")
    d_or = re.search(r'id="or"[^>]*d="([^"]+)"', svg).group(1)
    d_vert = re.search(r'id="feuillage"[^>]*d="([^"]+)"', svg).group(1)
    return _subpaths(d_or), _subpaths(d_vert)


def _select(subs: list[str], ymin: float, ymax: float) -> str:
    keep = []
    for sp in subs:
        _, y0, _, y1 = _bbox(sp)
        cy = (y0 + y1) / 2
        if ymin <= cy <= ymax:
            keep.append(sp)
    return "".join(keep)


def _reject(subs: list[str], ymin: float, ymax: float) -> str:
    keep = []
    for sp in subs:
        _, y0, _, y1 = _bbox(sp)
        cy = (y0 + y1) / 2
        if not (ymin <= cy <= ymax):
            keep.append(sp)
    return "".join(keep)


# ---------------------------------------------------------------------------
# Grain de café vectoriel
# ---------------------------------------------------------------------------
def coffee_bean(cx: float, cy: float, rx: float, ry: float, angle: float = 0.0) -> str:
    """Grain de café : ovale plein + sillon central évidé (règle evenodd)."""
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)

    def P(x: float, y: float) -> str:
        return "%.1f %.1f" % (cx + x * ca - y * sa, cy + x * sa + y * ca)

    k = 0.5523  # approximation d'un cercle par des Bézier
    ox, oy = rx * k, ry * k
    oval = (
        f"M{P(0,-ry)}"
        f"C{P(ox,-ry)} {P(rx,-oy)} {P(rx,0)}"
        f"C{P(rx,oy)} {P(ox,ry)} {P(0,ry)}"
        f"C{P(-ox,ry)} {P(-rx,oy)} {P(-rx,0)}"
        f"C{P(-rx,-oy)} {P(-ox,-ry)} {P(0,-ry)}Z"
    )
    w = rx * 0.52  # largeur du sillon central
    sillon = (
        f"M{P(0,-ry*0.90)}"
        f"C{P(-rx*0.52,-ry*0.36)} {P(rx*0.52,ry*0.36)} {P(0,ry*0.90)}"
        f"C{P(rx*0.52-w,ry*0.36)} {P(-rx*0.52+w,-ry*0.36)} {P(0,-ry*0.90)}Z"
    )
    return oval + sillon


def beans_trio(cx: float = 1000.0, cy: float = 1778.0, scale: float = 1.0) -> str:
    """Les trois grains qui remplacent le trio de feuilles du bas."""
    rx, ry = 27.0 * scale, 40.0 * scale
    ecart = 62.0 * scale
    return (
        coffee_bean(cx - ecart, cy + 6 * scale, rx, ry, -24)
        + coffee_bean(cx, cy - 8 * scale, rx, ry, 0)
        + coffee_bean(cx + ecart, cy + 6 * scale, rx, ry, 24)
    )


# ---------------------------------------------------------------------------
# Composants publics
# ---------------------------------------------------------------------------
_OR, _VERT = _load()

def _big(subs: list[str], seuil: float = 1500.0) -> str:
    """Contours couvrant presque tout le canevas : le double filet exterieur."""
    return "".join(sp for sp in subs
                   if (lambda b: b[2] - b[0] > seuil and b[3] - b[1] > seuil)(_bbox(sp)))


def _small(subs: list[str], seuil: float = 1500.0) -> str:
    return "".join(sp for sp in subs
                   if not (lambda b: b[2] - b[0] > seuil and b[3] - b[1] > seuil)(_bbox(sp)))


OR_ANNEAU = _big(_OR)
OR_ANNEAU_FIN = "".join(_subpaths(OR_ANNEAU)[2:])  # filet interieur seul
OR_ARBRE = _select(_OR, *BANDS["arbre"])
OR_TITRE = _select(_OR, *BANDS["titre"]) + _select(_OR, *BANDS["titre2"])
OR_SOUSTITRE = _select(_OR, *BANDS["soustitre"])
VERT_ARBRE = _reject(_VERT, *BANDS["trio"])
GRAINS = beans_trio()

# Tracé complet, trio de feuilles remplacé par les grains de café
OR_COMPLET = _reject(_OR, *BANDS["trio"]) + GRAINS
VERT_COMPLET = VERT_ARBRE

GOLD_STOPS = [(0, "#c9982f"), (18, "#fff3bf"), (42, "#e9c368"),
              (68, "#c39a37"), (88, "#ffefb8"), (100, "#d8ad48")]


def linear(gid: str, stops, x1="0%", y1="0%", x2="100%", y2="100%") -> str:
    inner = "".join(f'\n      <stop offset="{o}%" stop-color="{c}"/>' for o, c in stops)
    return (f'    <linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f"{inner}\n    </linearGradient>")


def radial(gid: str, stops, cx="50%", cy="42%", r="72%") -> str:
    inner = "".join(f'\n      <stop offset="{o}%" stop-color="{c}"/>' for o, c in stops)
    return (f'    <radialGradient id="{gid}" cx="{cx}" cy="{cy}" r="{r}">'
            f"{inner}\n    </radialGradient>")


def document(title: str, defs: str, body: str, size: int = 2000) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" '
        f'width="{size}" height="{size}" role="img" '
        'aria-label="La Colline Gambetta - Bar Restaurant">\n'
        f"  <title>{title}</title>\n"
        f"  <desc>La Colline Gambetta - formes vectorielles (courbes de Bezier), "
        f"canevas {size}x{size} px soit 169,3 mm a 300 dpi, agrandissable sans perte.</desc>\n"
        f"  <defs>\n{defs}\n  </defs>\n{body}\n</svg>\n"
    )


if __name__ == "__main__":
    for name, d in [("anneau", OR_ANNEAU), ("arbre", OR_ARBRE), ("titre", OR_TITRE),
                    ("soustitre", OR_SOUSTITRE), ("grains", GRAINS),
                    ("vert", VERT_COMPLET)]:
        print(f"{name:11s} {len(_subpaths(d)):3d} contours, {len(d):7d} caracteres")
