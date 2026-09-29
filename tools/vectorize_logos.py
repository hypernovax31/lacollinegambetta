#!/usr/bin/env python3
"""Vectorisation des logos et icônes de La Colline Gambetta.

Produit des SVG entièrement vectoriels (courbes de Bézier, aucune image
pixellisée embarquée) à partir des PNG d'origine.

Dépendances : pillow, numpy, potracer  (pip install pillow numpy potracer)

Sortie : assets/vector/
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import potrace
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "vector"
SIZE = 2000  # côté du canevas exporté (px à 100 %), soit 169,3 mm à 300 dpi

GOLD_STOPS = [
    (0, "#c9982f"), (18, "#fff3bf"), (42, "#e9c368"),
    (68, "#c39a37"), (88, "#ffefb8"), (100, "#d8ad48"),
]


def gold_gradient(gid: str) -> str:
    stops = "".join(
        f'\n      <stop offset="{o}%" stop-color="{c}"/>' for o, c in GOLD_STOPS
    )
    return (
        f'    <linearGradient id="{gid}" x1="0%" y1="0%" x2="100%" y2="100%">{stops}\n'
        f"    </linearGradient>"
    )


BLUR = 3.2       # flou d'anticrenelage avant seuillage (px du canevas agrandi)
ALPHAMAX = 1.334  # lissage maximal des coins
OPTTOL = 1.0     # tolerance d'optimisation des courbes


def smooth(mask_float: np.ndarray) -> np.ndarray:
    """Flou leger puis seuillage : des bords reguliers, sans marches d'escalier."""
    img = Image.fromarray((np.clip(mask_float, 0, 1) * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.GaussianBlur(BLUR))
    return np.asarray(img) >= 128


def trace_mask(mask: np.ndarray, turdsize: int = 4) -> str:
    """Trace un masque booléen et renvoie un attribut `d` SVG.

    Attention : potracer considère les zéros comme la forme, d'où le `~mask`.
    """
    path = potrace.Bitmap(~mask).trace(
        turdsize=turdsize, alphamax=ALPHAMAX, opticurve=True, opttolerance=OPTTOL
    )
    out = []
    for curve in path:
        s = curve.start_point
        out.append("M%.1f %.1f" % (s.x, s.y))
        for seg in curve:
            if seg.is_corner:
                out.append(
                    "L%.1f %.1fL%.1f %.1f"
                    % (seg.c.x, seg.c.y, seg.end_point.x, seg.end_point.y)
                )
            else:
                out.append(
                    "C%.1f %.1f %.1f %.1f %.1f %.1f"
                    % (
                        seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y,
                        seg.end_point.x, seg.end_point.y,
                    )
                )
        out.append("Z")
    return "".join(out)


def vectorize_icon(src: Path, dest: Path, title: str, upscale: int = 8) -> None:
    """Vectorise une icône au trait à partir de son canal alpha."""
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    alpha = im.split()[3].resize((w * upscale, h * upscale), Image.LANCZOS)
    mask = smooth(np.asarray(alpha).astype(np.float32) / 255.0)
    d = trace_mask(mask, turdsize=upscale * upscale)

    vw, vh = w * upscale, h * upscale
    side = max(vw, vh)
    dx, dy = (side - vw) / 2, (side - vh) / 2  # centrage dans un carré

    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" width="{SIZE}" height="{SIZE}" role="img" aria-label="{title}">
  <title>{title}</title>
  <desc>La Colline Gambetta — tracé vectoriel, canevas {SIZE}x{SIZE} px (169,3 mm a 300 dpi).</desc>
  <defs>
{gold_gradient('lcgGold')}
  </defs>
  <g transform="translate({dx:.1f},{dy:.1f})">
    <path fill="url(#lcgGold)" fill-rule="evenodd" d="{d}"/>
  </g>
</svg>
"""
    dest.write_text(svg, encoding="utf-8")
    print(f"{dest.relative_to(ROOT)}  ({len(svg) // 1024} Ko)")


ICONS = {
    "icon-duo.png": ("menu-duo", "Menu Duo — couverts sur assiette"),
    "icon-complete.png": ("menu-complet", "Menu Complet — couverts sur assiette"),
    "icon-enfant.png": ("menu-enfant", "Menu Enfant — burger, frites et boisson"),
    "icon-pdj.png": ("menu-petit-dejeuner", "Petit-déjeuner — jus, croissant et cafe"),
    "medal-entree.png": ("medaille-entree", "Entrées — saladier"),
    "medal-plat.png": ("medaille-plat", "Plats — cloche de service"),
    "medal-dessert.png": ("medaille-dessert", "Desserts — coupe glacée"),
    "star.png": ("etoile", "Étoile décorative"),
    "motif-80a.png": ("motif-couverts", "Motif couverts"),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, (slug, title) in ICONS.items():
        src = ROOT / "assets" / "menus" / filename
        if not src.exists():
            print(f"!! introuvable : {src}")
            continue
        vectorize_icon(src, OUT / f"{slug}.svg", title)


if __name__ == "__main__":
    main()
