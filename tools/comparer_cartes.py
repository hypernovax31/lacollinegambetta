#!/usr/bin/env python3
"""Compare page a page la carte PDF du site et la version imprimeur 300 dpi.

Les deux PDF sont composes depuis le meme `carte.html` : seule la resolution
doit changer. Le script ramene chaque page a la meme taille, mesure l'ecart
moyen et ecrit une planche de controle quand une page differe vraiment.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "Carte_LaCollineGambetta.pdf"
IMPRIMEUR = ROOT / "Carte_LaCollineGambetta_Imprimeur_300DPI.pdf"
LARGEUR = 900     # largeur de comparaison, en pixels
FLOU = 1.6        # flou applique aux deux pages : neutralise l'anticrenelage,
                  # qui differe forcement entre un rendu 180 dpi et un 300 dpi
SEUIL_MOYEN = 2.5  # ecart moyen tolere, sur 255
BLOC = 30          # cote des blocs : un bloc tres different = un contenu different
SEUIL_BLOC = 15.0


def pages(pdf: Path):
    for p in PdfReader(str(pdf)).pages:
        im = p.images[0]
        img = Image.open(io.BytesIO(im.data)).convert("L")
        h = round(img.height * LARGEUR / img.width)
        img = img.resize((LARGEUR, h), Image.LANCZOS)
        yield img.filter(ImageFilter.GaussianBlur(FLOU))


def main() -> int:
    a = list(pages(SITE))
    b = list(pages(IMPRIMEUR))
    print(f"pages : site {len(a)} / imprimeur {len(b)}")
    if len(a) != len(b):
        print("DIFFERENCE : nombre de pages different")
        return 1
    souci = 0
    for i, (x, y) in enumerate(zip(a, b), 1):
        if x.size != y.size:
            y = y.resize(x.size, Image.LANCZOS)
        d = np.asarray(ImageChops.difference(x, y), dtype=np.float32)
        H, W = d.shape
        blocs = d[:H // BLOC * BLOC, :W // BLOC * BLOC].reshape(
            H // BLOC, BLOC, W // BLOC, BLOC).mean(axis=(1, 3))
        moy, pire = d.mean(), blocs.max()
        etat = "identique" if moy <= SEUIL_MOYEN and pire <= SEUIL_BLOC else "A VERIFIER"
        print(f"  page {i} : ecart moyen {moy:5.2f}  pire bloc {BLOC}px {pire:5.2f}"
              f"  -> {etat}")
        if etat != "identique":
            souci += 1
            Image.fromarray(255 - np.clip(d * 3, 0, 255).astype("uint8")).save(
                ROOT / f"tools/.diff-page{i}.png")
    print("resultat :", "contenus identiques" if not souci else f"{souci} page(s) a verifier")
    return 0 if not souci else 2


if __name__ == "__main__":
    raise SystemExit(main())
