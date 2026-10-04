#!/usr/bin/env python3
"""Vectorisation haute qualité du logo médaillon (tracés lissés).

Chaîne de traitement, pensée pour supprimer les aspérités d'escalier des
contours :

1. l'image source est agrandie 3x en Lanczos (canevas de travail 6000 px) ;
2. les couleurs sont séparées en masques flous (anticrénelage conservé) ;
3. un flou gaussien léger casse les marches de pixels ;
4. le seuillage à 50 % produit un masque net mais aux bords réguliers ;
5. potrace trace en courbes de Bézier avec un lissage maximal
   (alphamax 1.334, optimisation de courbe tolérante) ;
6. les coordonnées sont ramenées dans le canevas 2000 avec deux décimales.

Résultat : des contours continus, sans facettes visibles même à fort zoom.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np
import potrace
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "assets" / "cover" / "medaillon-trace-source.svg"

UP = 4           # facteur d'agrandissement avant trace
BLUR = 3.6       # rayon du flou de lissage, en pixels du canevas agrandi
ALPHAMAX = 1.334  # lissage maximal des coins par potrace
OPTTOL = 1.0     # tolerance d'optimisation des courbes
TURD = 40        # suppression des poussieres

# Image d'origine du logo : elle n'est plus versionnee (le site n'utilise que
# les SVG), on la relit dans l'historique Git du depot.
SOURCE_COMMIT = "9f6f460"
SOURCE_PATH = "assets/cover/medaillon-logo-noir-brillant.png"


def source_image() -> Image.Image:
    """Image d'origine du logo (récupérée depuis l'historique Git si besoin)."""
    local = ROOT / SOURCE_PATH
    try:
        data = subprocess.run(
            ["git", "show", f"{SOURCE_COMMIT}:{SOURCE_PATH}"],
            cwd=ROOT, capture_output=True, check=True,
        ).stdout
        tmp = Path("/tmp/lcg-source.png")
        tmp.write_bytes(data)
        return Image.open(tmp).convert("RGB")
    except Exception:
        if not local.exists():
            raise SystemExit(
                f"Image source introuvable : ni {SOURCE_COMMIT}:{SOURCE_PATH} "
                f"dans l'historique Git, ni {local}")
        return Image.open(local).convert("RGB")


def smooth_mask(mask_float: np.ndarray) -> np.ndarray:
    """Flou léger puis seuillage : des bords réguliers, sans marches."""
    img = Image.fromarray((np.clip(mask_float, 0, 1) * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.GaussianBlur(BLUR))
    return np.asarray(img) >= 128


def trace(mask: np.ndarray, scale: float) -> str:
    path = potrace.Bitmap(~mask).trace(
        turdsize=TURD, alphamax=ALPHAMAX, opticurve=True, opttolerance=OPTTOL
    )
    out = []
    s = scale

    def P(pt) -> str:
        return "%.2f %.2f" % (pt.x * s, pt.y * s)

    for curve in path:
        out.append("M" + P(curve.start_point))
        for seg in curve:
            if seg.is_corner:
                out.append("L" + P(seg.c) + "L" + P(seg.end_point))
            else:
                out.append("C" + P(seg.c1) + " " + P(seg.c2) + " " + P(seg.end_point))
        out.append("Z")
    return "".join(out)


def main() -> None:
    im = source_image()
    n = im.size[0]
    big = im.resize((n * UP, n * UP), Image.LANCZOS)
    a = np.asarray(big).astype(np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]

    # Appartenance douce à chaque couleur (0 = non, 1 = oui), anticrénelage inclus
    vert = np.clip((g - np.maximum(r, b) - 6) / 24.0, 0, 1) * np.clip((g - 60) / 40.0, 0, 1)
    or_ = np.clip((r - 120) / 45.0, 0, 1) * np.clip((g - 90) / 45.0, 0, 1) \
        * np.clip((r - b - 20) / 40.0, 0, 1) * (1 - vert)

    m_vert = smooth_mask(vert)
    m_or = smooth_mask(or_) & ~m_vert

    # on reste strictement à l'intérieur du disque
    S = n * UP
    Y, X = np.mgrid[0:S, 0:S]
    c = (S - 1) / 2
    inside = ((X - c) ** 2 + (Y - c) ** 2) <= (c - 3 * UP) ** 2
    m_or &= inside
    m_vert &= inside

    scale = 2000.0 / S
    d_or = trace(m_or, scale)
    d_vert = trace(m_vert, scale)
    print(f"or : {d_or.count('M')} contours, feuillage : {d_vert.count('M')} contours")

    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000" role="img" aria-label="La Colline Gambetta - Bar Restaurant">
  <title>La Colline Gambetta - logo medaillon couleur</title>
  <desc>Formes vectorielles lissees (courbes de Bezier), canevas 2000x2000 px soit 169,3 mm a 300 dpi.</desc>
  <defs>
    <radialGradient id="lcgDisc" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#8d1c72"/>
      <stop offset="55%" stop-color="#6d1360"/>
      <stop offset="100%" stop-color="#3d0836"/>
    </radialGradient>
    <linearGradient id="lcgGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c9982f"/>
      <stop offset="18%" stop-color="#fff3bf"/>
      <stop offset="42%" stop-color="#e9c368"/>
      <stop offset="68%" stop-color="#c39a37"/>
      <stop offset="88%" stop-color="#ffefb8"/>
      <stop offset="100%" stop-color="#d8ad48"/>
    </linearGradient>
    <linearGradient id="lcgGreen" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#7ae4a0"/>
      <stop offset="50%" stop-color="#2fb25c"/>
      <stop offset="100%" stop-color="#11913f"/>
    </linearGradient>
  </defs>
  <g id="medaillon">
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#lcgDisc)"/>
    <path id="or" fill="url(#lcgGold)" fill-rule="evenodd" d="{d_or}"/>
    <path id="feuillage" fill="url(#lcgGreen)" fill-rule="evenodd" d="{d_vert}"/>
  </g>
</svg>
"""
    DEST.write_text(svg, encoding="utf-8")
    print(f"{DEST.relative_to(ROOT)}  ({DEST.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
