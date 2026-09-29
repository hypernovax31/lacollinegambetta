#!/usr/bin/env python3
"""Noyau géométrique du logo médaillon de La Colline Gambetta.

Objectif : des contours parfaitement lisses, sans aspérité, à n'importe quel
niveau de zoom. Chaque famille de formes est produite par le moyen le plus
précis disponible :

- les deux filets du cadre : cercles mathématiques (arcs de Bézier exacts) ;
- les textes : contours réels de la police Cinzel, celle du site ;
- les trois grains de café : courbes paramétriques ;
- l'arbre, les collines et le feuillage : vectorisation lissée de l'illustration
  d'origine (agrandissement x3, flou d'anticrénelage, potrace en lissage
  maximal) — voir tools/vectorize_master.py.

Aucun pixel n'est embarqué dans les SVG produits.
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lcg_text import text_path  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TRACE_SVG = ROOT / "assets" / "cover" / "medaillon-trace-source.svg"
CANVAS = 2000.0
CX = CY = 1000.0

# Bandes verticales de découpe du tracé d'origine (canevas 2000).
BANDS = {
    "arbre": (280, 1120),
    "titre": (1150, 1350),
    "titre2": (1370, 1560),
    "soustitre": (1590, 1700),
    "trio": (1700, 1900),
}

K = 0.5522847498307936  # approximation d'un cercle par quatre Bézier


# ---------------------------------------------------------------------------
# Primitives exactes
# ---------------------------------------------------------------------------
def circle_path(cx: float, cy: float, r: float) -> str:
    o = r * K
    return (
        f"M{cx:.2f} {cy - r:.2f}"
        f"C{cx + o:.2f} {cy - r:.2f} {cx + r:.2f} {cy - o:.2f} {cx + r:.2f} {cy:.2f}"
        f"C{cx + r:.2f} {cy + o:.2f} {cx + o:.2f} {cy + r:.2f} {cx:.2f} {cy + r:.2f}"
        f"C{cx - o:.2f} {cy + r:.2f} {cx - r:.2f} {cy + o:.2f} {cx - r:.2f} {cy:.2f}"
        f"C{cx - r:.2f} {cy - o:.2f} {cx - o:.2f} {cy - r:.2f} {cx:.2f} {cy - r:.2f}Z"
    )


def annulus(r_ext: float, r_int: float) -> str:
    return circle_path(CX, CY, r_ext) + circle_path(CX, CY, r_int)


def coffee_bean(cx: float, cy: float, rx: float, ry: float, angle: float = 0.0) -> str:
    """Grain de café : ovale plein et sillon central évidé (règle evenodd)."""
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)

    def P(x: float, y: float) -> str:
        return "%.2f %.2f" % (cx + x * ca - y * sa, cy + x * sa + y * ca)

    ox, oy = rx * K, ry * K
    oval = (
        f"M{P(0,-ry)}"
        f"C{P(ox,-ry)} {P(rx,-oy)} {P(rx,0)}"
        f"C{P(rx,oy)} {P(ox,ry)} {P(0,ry)}"
        f"C{P(-ox,ry)} {P(-rx,oy)} {P(-rx,0)}"
        f"C{P(-rx,-oy)} {P(-ox,-ry)} {P(0,-ry)}Z"
    )
    w = rx * 0.52
    sillon = (
        f"M{P(0,-ry*0.90)}"
        f"C{P(-rx*0.52,-ry*0.36)} {P(rx*0.52,ry*0.36)} {P(0,ry*0.90)}"
        f"C{P(rx*0.52-w,ry*0.36)} {P(-rx*0.52+w,-ry*0.36)} {P(0,-ry*0.90)}Z"
    )
    return oval + sillon


def beans_trio(cx: float = 1000.0, cy: float = 1778.0, scale: float = 1.0) -> str:
    rx, ry = 27.0 * scale, 40.0 * scale
    ecart = 62.0 * scale
    return (
        coffee_bean(cx - ecart, cy + 6 * scale, rx, ry, -24)
        + coffee_bean(cx, cy - 8 * scale, rx, ry, 0)
        + coffee_bean(cx + ecart, cy + 6 * scale, rx, ry, 24)
    )


# ---------------------------------------------------------------------------
# Tracé lissé de l'illustration (arbre, collines, feuillage)
# ---------------------------------------------------------------------------
def _subpaths(d: str) -> list[str]:
    return re.findall(r"M[^M]*", d)


def _bbox(sp: str) -> tuple[float, float, float, float]:
    nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", sp)]
    xs, ys = nums[0::2], nums[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def _load_trace() -> tuple[list[str], list[str]]:
    svg = TRACE_SVG.read_text(encoding="utf-8")
    d_or = re.search(r'id="or"[^>]*d="([^"]+)"', svg).group(1)
    d_vert = re.search(r'id="feuillage"[^>]*d="([^"]+)"', svg).group(1)
    return _subpaths(d_or), _subpaths(d_vert)


def _band(subs: list[str], ymin: float, ymax: float, garder: bool = True) -> str:
    out = []
    for sp in subs:
        _, y0, _, y1 = _bbox(sp)
        dedans = ymin <= (y0 + y1) / 2 <= ymax
        if dedans == garder:
            out.append(sp)
    return "".join(out)


_OR_TRACE, _VERT_TRACE = _load_trace()

# ---------------------------------------------------------------------------
# Composants publics
# ---------------------------------------------------------------------------
OR_ANNEAU = annulus(997.0, 986.5) + annulus(945.0, 923.0)
OR_ANNEAU_FIN = annulus(945.0, 934.0)
def _sans_grands(subs: list[str], seuil: float = 1500.0) -> list[str]:
    """Ecarte les contours qui couvrent presque tout le canevas (ancien cadre)."""
    return [sp for sp in subs
            if not (lambda b: b[2] - b[0] > seuil and b[3] - b[1] > seuil)(_bbox(sp))]


OR_ARBRE = _band(_sans_grands(_OR_TRACE), *BANDS["arbre"])
OR_TITRE = (
    text_path("LA COLLINE", 1000, 1325, 152, largeur=1309)
    + text_path("GAMBETTA", 1000, 1538, 152, largeur=1224)
)
OR_SOUSTITRE = text_path("BAR \u00b7 RESTAURANT", 1000, 1663, 54, largeur=935)
VERT_ARBRE = _band(_VERT_TRACE, *BANDS["trio"], garder=False)
GRAINS = beans_trio()

# Les lettres de Cinzel comportent des contours qui se recouvrent (fûts et
# empattements) : elles exigent la règle de remplissage « nonzero », alors que
# les formes tracées et les anneaux exigent « evenodd ». D'où deux chemins.
OR_FORMES = OR_ANNEAU + OR_ARBRE + GRAINS      # règle evenodd
OR_TEXTE = OR_TITRE + OR_SOUSTITRE             # règle nonzero
OR_COMPLET = OR_FORMES                          # compatibilité
VERT_COMPLET = VERT_ARBRE


def or_paths(fill: str, extra: str = "") -> str:
    """Les deux chemins dorés (formes + textes) avec la bonne règle."""
    return (f'    <path fill="{fill}" fill-rule="evenodd"{extra} d="{OR_FORMES}"/>\n'
            f'    <path fill="{fill}" fill-rule="nonzero"{extra} d="{OR_TEXTE}"/>')

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
        "  <desc>La Colline Gambetta - contours vectoriels lisses : cercles exacts, "
        "lettres issues des contours de la police Cinzel, grains parametriques, "
        f"illustration vectorisee en lissage maximal. Canevas {size}x{size} px "
        "(169,3 mm a 300 dpi), agrandissable sans perte.</desc>\n"
        f"  <defs>\n{defs}\n  </defs>\n{body}\n</svg>\n"
    )


if __name__ == "__main__":
    for nom, d in [("anneau", OR_ANNEAU), ("arbre", OR_ARBRE), ("titre", OR_TITRE),
                   ("soustitre", OR_SOUSTITRE), ("grains", GRAINS), ("vert", VERT_COMPLET)]:
        print(f"{nom:11s} {len(_subpaths(d)):3d} contours, {len(d):7d} caracteres")
