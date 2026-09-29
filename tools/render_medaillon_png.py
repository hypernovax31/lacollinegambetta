#!/usr/bin/env python3
"""Rendu PNG du logo médaillon à partir des tracés vectoriels.

Aucun moteur SVG n'étant disponible dans l'environnement, ce script rasterise
directement les courbes de Bézier (suréchantillonnage x3 puis réduction) et
applique les dégradés. Il sert uniquement à produire les PNG utilisés par le
site ; les fichiers de référence restent les SVG.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lcg_logo as L  # noqa: E402

ROOT = L.ROOT
SS = 3  # suréchantillonnage


def flatten(d: str, steps: int = 10):
    toks = re.findall(r"[MLCZ]|-?\d+\.?\d*", d)
    polys, cur, i, pt = [], [], 0, (0.0, 0.0)
    while i < len(toks):
        t = toks[i]
        if t == "M":
            if cur:
                polys.append(cur)
            pt = (float(toks[i + 1]), float(toks[i + 2])); cur = [pt]; i += 3
        elif t == "L":
            pt = (float(toks[i + 1]), float(toks[i + 2])); cur.append(pt); i += 3
        elif t == "C":
            p1 = (float(toks[i + 1]), float(toks[i + 2]))
            p2 = (float(toks[i + 3]), float(toks[i + 4]))
            p3 = (float(toks[i + 5]), float(toks[i + 6]))
            p0 = pt
            for s in range(1, steps + 1):
                u = s / steps; v = 1 - u
                cur.append((v**3*p0[0] + 3*v*v*u*p1[0] + 3*v*u*u*p2[0] + u**3*p3[0],
                            v**3*p0[1] + 3*v*v*u*p1[1] + 3*v*u*u*p2[1] + u**3*p3[1]))
            pt = p3; i += 7
        elif t == "Z":
            if cur:
                cur.append(cur[0]); polys.append(cur); cur = []
            i += 1
        else:
            i += 1
    if cur:
        polys.append(cur)
    return polys


def fill(polys, size: int, scale: float) -> np.ndarray:
    edges = []
    for p in polys:
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if y0 != y1:
                edges.append((x0 * scale, y0 * scale, x1 * scale, y1 * scale))
    img = np.zeros((size, size), bool)
    if not edges:
        return img
    E = np.array(edges)
    x0, y0, x1, y1 = E[:, 0], E[:, 1], E[:, 2], E[:, 3]
    ymin, ymax = np.minimum(y0, y1), np.maximum(y0, y1)
    for y in range(size):
        yc = y + 0.5
        m = (ymin <= yc) & (ymax > yc)
        if not m.any():
            continue
        xs = np.sort(x0[m] + (yc - y0[m]) * (x1[m] - x0[m]) / (y1[m] - y0[m]))
        for a, b in zip(xs[0::2], xs[1::2]):
            ia, ib = int(np.ceil(a - 0.5)), int(np.ceil(b - 0.5))
            if ib > ia:
                img[y, max(ia, 0):min(ib, size)] = True
    return img


def hex2rgb(h: str):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def ramp(stops, t: np.ndarray) -> np.ndarray:
    offs = np.array([o / 100 for o, _ in stops])
    cols = np.stack([hex2rgb(c) for _, c in stops])
    out = np.zeros(t.shape + (3,))
    for k in range(3):
        out[..., k] = np.interp(t, offs, cols[:, k])
    return out


def render(S: int = 3000) -> Image.Image:
    """Rendu couleur du medaillon sur un canevas carre de S pixels."""
    scale = S / 2000
    gold = fill(flatten(L.OR_COMPLET), S, scale)
    green = fill(flatten(L.VERT_COMPLET), S, scale)

    img = np.zeros((S, S, 4), np.uint8)
    yy = np.arange(S, dtype=np.float32)[:, None]
    xx = np.arange(S, dtype=np.float32)[None, :]
    c = (S - 1) / 2
    disc = ((xx - c) ** 2 + (yy - c) ** 2) <= c ** 2

    def paint(mask, stops, tfun):
        idx = np.nonzero(mask)
        t = tfun(idx[1].astype(np.float32) / S, idx[0].astype(np.float32) / S)
        img[idx[0], idx[1], :3] = ramp(stops, np.clip(t, 0, 1) * 100).astype(np.uint8)
        img[idx[0], idx[1], 3] = 255

    paint(disc, [(0, "#8d1c72"), (55, "#6d1360"), (100, "#3d0836")],
          lambda x, y: np.sqrt((x - 0.5) ** 2 + (y - 0.42) ** 2) / 0.72)
    paint(gold, L.GOLD_STOPS, lambda x, y: (x + y) / 2)
    paint(green, [(0, "#7ae4a0"), (50, "#2fb25c"), (100, "#11913f")],
          lambda x, y: 0.3 * x + 0.7 * y)
    return Image.fromarray(img, "RGBA")


if __name__ == "__main__":
    master = render(4000)
    cover = ROOT / "assets" / "cover"

    petit = master.resize((1000, 1000), Image.LANCZOS)
    petit.save(cover / "medaillon-logo.png")
    print("assets/cover/medaillon-logo.png  1000x1000")

    grand = master.resize((2000, 2000), Image.LANCZOS)
    grand.save(cover / "medaillon-logo-noir-brillant-transparent.png")
    noir = Image.new("RGBA", grand.size, (0, 0, 0, 255))
    noir.alpha_composite(grand)
    noir.convert("RGB").save(cover / "medaillon-logo-noir-brillant.png")
    print("assets/cover/medaillon-logo-noir-brillant[-transparent].png  2000x2000")
