#!/usr/bin/env python3
"""Aperçu PNG d'un ou plusieurs SVG de la bibliothèque (contrôle qualité).

Rasteriseur maison : aucun moteur SVG n'est disponible dans l'environnement.
Il gère les chemins (M L H V C Q Z), les groupes, les transformations
translate/scale/rotate, les règles evenodd et nonzero, les masques simples et
les couleurs unies ; les dégradés sont rendus par une teinte moyenne.

Usage : python3 tools/apercu_png.py sortie.png fichier1.svg [fichier2.svg ...]
"""
from __future__ import annotations

import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_medaillon_png as R  # noqa: E402

NS = "{http://www.w3.org/2000/svg}"
OR = (233, 195, 104)
FOND = (14, 10, 14)


def parse_transform(s: str | None) -> np.ndarray:
    m = np.eye(3)
    for nom, args in re.findall(r"(translate|scale|rotate)\(([^)]*)\)", s or ""):
        v = [float(x) for x in re.split(r"[,\s]+", args.strip()) if x]
        t = np.eye(3)
        if nom == "translate":
            t[0, 2], t[1, 2] = v[0], (v[1] if len(v) > 1 else 0)
        elif nom == "scale":
            t[0, 0], t[1, 1] = v[0], (v[1] if len(v) > 1 else v[0])
        else:
            a = math.radians(v[0])
            t[0, 0] = t[1, 1] = math.cos(a)
            t[0, 1], t[1, 0] = -math.sin(a), math.sin(a)
        m = m @ t
    return m


def couleur(valeur: str | None, defaut=OR):
    if not valeur or valeur in ("none", "currentColor"):
        return defaut
    if valeur.startswith("#"):
        h = valeur[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    if valeur.startswith("url("):
        return defaut
    noms = {"white": (255, 255, 255), "black": (0, 0, 0)}
    return noms.get(valeur, defaut)


def masque_booleen(el, T, Wp, Hp, sc, fill="#fff"):
    """Rend un <mask> : les formes blanches montrent, les noires cachent."""
    acc = np.zeros((Hp, Wp), bool)

    def parcours(noeud, T2, f, r):
        f = noeud.get("fill", f)
        r = noeud.get("fill-rule", r)
        T3 = T2 @ parse_transform(noeud.get("transform"))
        d = noeud.get("d") if noeud.tag.replace(NS, "") == "path" else None
        if d:
            polys = [[(T3[0, 0] * x + T3[0, 1] * y + T3[0, 2],
                       T3[1, 0] * x + T3[1, 1] * y + T3[1, 2]) for (x, y) in poly]
                     for poly in R.flatten(d)]
            m = R.fill(polys, max(Wp, Hp), sc,
                       rule=("nonzero" if r == "nonzero" else "evenodd"))[:Hp, :Wp]
            clair = couleur(f, (255, 255, 255))[0] > 127
            if clair:
                acc[m] = True
            else:
                acc[m] = False
        for enfant in noeud:
            parcours(enfant, T3, f, r)

    for enfant in el:
        parcours(enfant, T, fill, "evenodd")
    return acc


def render(path: str, taille: int = 460) -> Image.Image:
    root = ET.parse(path).getroot()
    masques = {m.get("id"): m for m in root.iter(NS + "mask")}
    vb = [float(v) for v in root.get("viewBox").split()]
    W, H = vb[2], vb[3]
    SS = 2
    w = int(taille * W / max(W, H))
    h = int(taille * H / max(W, H))
    Wp, Hp, sc = w * SS, h * SS, (w * SS) / W
    img = np.zeros((Hp, Wp, 3), np.uint8)
    img[...] = FOND

    def dessiner(el, T, fill, rule):
        tag = el.tag.replace(NS, "")
        if tag in ("defs", "title", "desc", "mask"):
            return
        f = el.get("fill", fill)
        r = el.get("fill-rule", rule)
        T2 = T @ parse_transform(el.get("transform"))
        d = None
        if tag == "path":
            d = el.get("d")
        elif tag == "rect":
            x, y = float(el.get("x", 0)), float(el.get("y", 0))
            ww, hh = float(el.get("width")), float(el.get("height"))
            d = f"M{x} {y}L{x + ww} {y}L{x + ww} {y + hh}L{x} {y + hh}Z"
        elif tag == "circle":
            import lcg_logo as L
            cx, cy = float(el.get("cx")), float(el.get("cy"))
            rr = float(el.get("r"))
            sw = float(el.get("stroke-width") or 0)
            if el.get("stroke") and sw:
                d = L.circle_path(cx, cy, rr + sw / 2) + L.circle_path(cx, cy, rr - sw / 2)
                r, f = "evenodd", el.get("stroke")
            else:
                d = L.circle_path(cx, cy, rr)
        if d:
            polys = [[(T2[0, 0] * x + T2[0, 1] * y + T2[0, 2],
                       T2[1, 0] * x + T2[1, 1] * y + T2[1, 2]) for (x, y) in poly]
                     for poly in R.flatten(d)]
            if f not in (None, "none"):
                mask = R.fill(polys, max(Wp, Hp), sc,
                              rule=("nonzero" if r == "nonzero" else "evenodd"))[:Hp, :Wp]
                ref = el.get("mask")
                if ref:
                    mid = ref.strip("url(#)").strip()
                    if mid in masques:
                        mask &= masque_booleen(masques[mid], T2, Wp, Hp, sc)
                img[mask] = couleur(f)
        for enfant in el:
            dessiner(enfant, T2, f, r)

    for enfant in root:
        dessiner(enfant, np.eye(3), None, "evenodd")
    return Image.fromarray(img).resize((w, h), Image.LANCZOS)


def main() -> None:
    sortie, fichiers = sys.argv[1], sys.argv[2:]
    imgs = [render(f) for f in fichiers]
    W = sum(i.width + 12 for i in imgs)
    H = max(i.height for i in imgs)
    planche = Image.new("RGB", (W, H), FOND)
    x = 0
    for i in imgs:
        planche.paste(i, (x, 0))
        x += i.width + 12
    planche.save(sortie)
    print(f"{sortie}  {planche.size[0]}x{planche.size[1]}")


if __name__ == "__main__":
    main()
