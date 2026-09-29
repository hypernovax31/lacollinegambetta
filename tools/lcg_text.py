#!/usr/bin/env python3
"""Génération des textes du logo en contours vectoriels parfaits.

Les lettres ne sont plus vectorisées depuis une image : elles proviennent
directement des contours de la police Cinzel (celle du site), converties en
courbes de Bézier. Les bords sont donc mathématiquement lisses.
"""
from __future__ import annotations

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules" / "@fontsource" / "cinzel" / "files" / "cinzel-latin-600-normal.woff2"
FALLBACK = ROOT / "assets" / "fonts" / "cinzel-600.woff2"


def _font() -> TTFont:
    path = FONT if FONT.exists() else FALLBACK
    return TTFont(str(path))


_F = _font()
_UPM = _F["head"].unitsPerEm
_CAP = getattr(_F["OS/2"], "sCapHeight", 700) or 700
_CMAP = _F.getBestCmap()
_GS = _F.getGlyphSet()
_HMTX = _F["hmtx"]


def _glyph_name(ch: str) -> str:
    return _CMAP.get(ord(ch), ".notdef")


def text_path(texte: str, cx: float, baseline: float, cap_height: float,
              largeur: float | None = None, tracking: float = 0.0) -> str:
    """Contours d'une ligne de texte, centrée sur `cx`, posée sur `baseline`.

    `cap_height` fixe la hauteur des capitales ; si `largeur` est fournie,
    l'interlettrage est calculé pour atteindre exactement cette largeur.
    """
    s = cap_height / _CAP
    noms = [_glyph_name(c) for c in texte]
    n_gaps = max(len(texte) - 1, 1)
    if largeur is not None:
        naturelle = sum(_HMTX[n][0] * s for n in noms)
        if naturelle > largeur:
            # jamais de chasse negative : les lettres ne doivent pas se chevaucher
            s *= largeur / naturelle
            tracking = 0.0
        else:
            tracking = (largeur - naturelle) / n_gaps
    avances = [_HMTX[n][0] * s for n in noms]
    total = sum(avances) + tracking * n_gaps

    x = cx - total / 2
    morceaux = []
    for nom, avance in zip(noms, avances):
        pen = SVGPathPen(_GS, ntos=lambda v: "%.2f" % v)
        tp = TransformPen(pen, Transform(s, 0, 0, -s, x, baseline))
        _GS[nom].draw(tp)
        d = pen.getCommands()
        if d:
            morceaux.append(d)
        x += avance + tracking
    return "".join(morceaux)


if __name__ == "__main__":
    print("unitsPerEm", _UPM, "capHeight", _CAP)
    d = text_path("LA COLLINE", 1000, 1325, 152, largeur=1309)
    print(len(d), d[:120])
