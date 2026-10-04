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


def flatten(d: str, steps: int = 12):
    """Aplatit un chemin SVG (M, L, H, V, C, Q, Z) en polylignes."""
    toks = re.findall(r"[MLHVCQZmlhvcqz]|-?\d+\.?\d*(?:e-?\d+)?", d)
    polys, cur, i = [], [], 0
    pt = (0.0, 0.0)
    cmd = "M"

    def bez3(p0, p1, p2, p3):
        for s in range(1, steps + 1):
            u = s / steps; v = 1 - u
            cur.append((v**3*p0[0] + 3*v*v*u*p1[0] + 3*v*u*u*p2[0] + u**3*p3[0],
                        v**3*p0[1] + 3*v*v*u*p1[1] + 3*v*u*u*p2[1] + u**3*p3[1]))

    def bez2(p0, p1, p2):
        for s in range(1, steps + 1):
            u = s / steps; v = 1 - u
            cur.append((v*v*p0[0] + 2*v*u*p1[0] + u*u*p2[0],
                        v*v*p0[1] + 2*v*u*p1[1] + u*u*p2[1]))

    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    cur.append(cur[0]); polys.append(cur); cur = []
                continue
        if cmd in "Mm":
            pt = (float(toks[i]), float(toks[i + 1])); i += 2
            if cur:
                cur.append(cur[0]); polys.append(cur)
            cur = [pt]
            cmd = "L" if cmd == "M" else "l"
        elif cmd in "Ll":
            pt = (float(toks[i]), float(toks[i + 1])); i += 2
            cur.append(pt)
        elif cmd in "Hh":
            pt = (float(toks[i]), pt[1]); i += 1
            cur.append(pt)
        elif cmd in "Vv":
            pt = (pt[0], float(toks[i])); i += 1
            cur.append(pt)
        elif cmd in "Cc":
            p1 = (float(toks[i]), float(toks[i + 1]))
            p2 = (float(toks[i + 2]), float(toks[i + 3]))
            p3 = (float(toks[i + 4]), float(toks[i + 5])); i += 6
            bez3(pt, p1, p2, p3); pt = p3
        elif cmd in "Qq":
            p1 = (float(toks[i]), float(toks[i + 1]))
            p2 = (float(toks[i + 2]), float(toks[i + 3])); i += 4
            bez2(pt, p1, p2); pt = p2
        else:
            i += 1
    if cur:
        cur.append(cur[0]); polys.append(cur)
    return polys


def fill(polys, size: int, scale: float, rule: str = "evenodd") -> np.ndarray:
    edges = []
    for p in polys:
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if y0 != y1:
                edges.append((x0 * scale, y0 * scale, x1 * scale, y1 * scale,
                              1.0 if y1 > y0 else -1.0))
    img = np.zeros((size, size), bool)
    if not edges:
        return img
    E = np.array(edges)
    x0, y0, x1, y1, w = E[:, 0], E[:, 1], E[:, 2], E[:, 3], E[:, 4]
    ymin, ymax = np.minimum(y0, y1), np.maximum(y0, y1)
    for y in range(size):
        yc = y + 0.5
        m = (ymin <= yc) & (ymax > yc)
        if not m.any():
            continue
        xs = x0[m] + (yc - y0[m]) * (x1[m] - x0[m]) / (y1[m] - y0[m])
        ordre = np.argsort(xs)
        xs = xs[ordre]
        if rule == "nonzero":
            dirs = w[m][ordre]
            cumul = np.cumsum(dirs)
            spans = [(xs[k], xs[k + 1]) for k in range(len(xs) - 1) if cumul[k] != 0]
        else:
            spans = list(zip(xs[0::2], xs[1::2]))
        for a, b in spans:
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
    gold = fill(flatten(L.OR_FORMES), S, scale)
    gold |= fill(flatten(L.OR_TEXTE), S, scale, rule="nonzero")
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
    print("assets/cover/medaillon-logo-noir-brillant-transparent.png  2000x2000")

    # image de partage (Open Graph / Twitter) : 1200x630, medaillon sur un
    # fond aubergine, legere pour ne pas ralentir les apercus de lien.
    w, h = 1200, 630
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    r = np.clip(r / 1.25, 0, 1)[..., None]
    fond = np.array([0x3B, 0x13, 0x40], np.float32) * (1 - r) + \
        np.array([0x15, 0x0A, 0x19], np.float32) * r
    og = Image.fromarray(fond.astype("uint8"), "RGB")
    vignette = grand.resize((520, 520), Image.LANCZOS)
    og.paste(vignette, ((w - 520) // 2, (h - 520) // 2), vignette)
    og.save(cover / "og-cover.jpg", quality=86, optimize=True, progressive=True)
    print("assets/cover/og-cover.jpg  1200x630")
