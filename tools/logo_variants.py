#!/usr/bin/env python3
"""Déclinaisons vectorielles du logo médaillon de La Colline Gambetta.

Reprend les tracés vectoriels du logo principal (assets/cover/medaillon-logo-
noir-brillant.svg) et produit plusieurs modèles : couleurs, styles, reliefs et
ombres différents. Produit également le fichier des arabesques du médaillon.

Sortie : assets/vector/
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "vector"
SRC = ROOT / "assets" / "cover" / "medaillon-logo-noir-brillant.svg"
SIZE = 2000

src = SRC.read_text(encoding="utf-8")
D_OR = re.search(r'id="or"[^>]*d="([^"]+)"', src).group(1)
D_FEUILLE = re.search(r'id="feuillage"[^>]*d="([^"]+)"', src).group(1)

HEADER = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" '
    f'width="{SIZE}" height="{SIZE}" role="img" '
    'aria-label="La Colline Gambetta - Bar Restaurant">\n'
)


def document(title: str, defs: str, body: str) -> str:
    return (
        HEADER
        + f"  <title>{title}</title>\n"
        + f"  <desc>La Colline Gambetta - trace vectoriel, canevas {SIZE}x{SIZE} px "
        "(169,3 mm a 300 dpi), agrandissable sans perte.</desc>\n"
        + f"  <defs>\n{defs}\n  </defs>\n{body}\n</svg>\n"
    )


def linear(gid: str, stops: list[tuple[int, str]], x1="0%", y1="0%", x2="100%", y2="100%") -> str:
    inner = "".join(
        f'\n      <stop offset="{o}%" stop-color="{c}"/>' for o, c in stops
    )
    return (
        f'    <linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
        f"{inner}\n    </linearGradient>"
    )


def radial(gid: str, stops: list[tuple[int, str]], cx="50%", cy="42%", r="72%") -> str:
    inner = "".join(
        f'\n      <stop offset="{o}%" stop-color="{c}"/>' for o, c in stops
    )
    return (
        f'    <radialGradient id="{gid}" cx="{cx}" cy="{cy}" r="{r}">'
        f"{inner}\n    </radialGradient>"
    )


GOLD = [(0, "#c9982f"), (18, "#fff3bf"), (42, "#e9c368"),
        (68, "#c39a37"), (88, "#ffefb8"), (100, "#d8ad48")]
COPPER = [(0, "#8c4a25"), (20, "#f7c6a0"), (45, "#d98452"),
          (72, "#a85a2c"), (100, "#f0b183")]
SILVER = [(0, "#7c8a99"), (20, "#ffffff"), (45, "#c8d4dd"),
          (70, "#8d9aa8"), (100, "#eef3f7")]

# --------------------------------------------------------------------------
# Modèles
# --------------------------------------------------------------------------
VARIANTS: dict[str, dict] = {}

# 1 — Or et violet, relief bombé et ombre portée douce (modèle de référence)
VARIANTS["logo-or-violet-relief"] = dict(
    title="Logo or et violet - relief bombe, ombre portee douce",
    defs="\n".join([
        radial("disc", [(0, "#8d1c72"), (55, "#6d1360"), (100, "#3d0836")]),
        linear("or", GOLD),
        linear("vert", [(0, "#7ae4a0"), (50, "#2fb25c"), (100, "#11913f")], "20%", "0%", "80%", "100%"),
        """    <filter id="relief" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="26" stdDeviation="26" flood-color="#000" flood-opacity="0.55"/>
    </filter>
    <radialGradient id="bombe" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.42"/>
    </radialGradient>""",
    ]),
    body=f"""  <g filter="url(#relief)">
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#disc)"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{D_OR}"/>
    <path fill="url(#vert)" fill-rule="evenodd" d="{D_FEUILLE}"/>
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#bombe)"/>
  </g>""",
)

# 2 — Or sur noir profond, gravure creusée
VARIANTS["logo-or-noir-grave"] = dict(
    title="Logo or sur noir profond - effet grave",
    defs="\n".join([
        radial("noir", [(0, "#22191d"), (60, "#120d10"), (100, "#000000")], "50%", "40%", "78%"),
        linear("or", GOLD),
        """    <filter id="grave" x="-20%" y="-20%" width="140%" height="140%">
      <feOffset dx="0" dy="6" in="SourceAlpha" result="bas"/>
      <feGaussianBlur in="bas" stdDeviation="5" result="basF"/>
      <feFlood flood-color="#000000" flood-opacity="0.85" result="noirF"/>
      <feComposite in="noirF" in2="basF" operator="in" result="ombreBasse"/>
      <feOffset dx="0" dy="-5" in="SourceAlpha" result="haut"/>
      <feGaussianBlur in="haut" stdDeviation="4" result="hautF"/>
      <feFlood flood-color="#ffe9a8" flood-opacity="0.55" result="clairF"/>
      <feComposite in="clairF" in2="hautF" operator="in" result="lumiereHaute"/>
      <feMerge>
        <feMergeNode in="ombreBasse"/>
        <feMergeNode in="lumiereHaute"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>""",
    ]),
    body=f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="url(#noir)"/>
  <g filter="url(#grave)">
    <path fill="url(#or)" fill-rule="evenodd" d="{D_OR}"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{D_FEUILLE}"/>
  </g>""",
)

# 3 — Crème et aubergine, style plat mat, sans ombre
VARIANTS["logo-creme-aubergine-plat"] = dict(
    title="Logo creme et aubergine - style plat mat",
    defs='    <linearGradient id="rien"><stop offset="0%" stop-color="#4a1145"/></linearGradient>',
    body=f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="#f5ecd8"/>
  <path fill="#4a1145" fill-rule="evenodd" d="{D_OR}"/>
  <path fill="#2f7d4a" fill-rule="evenodd" d="{D_FEUILLE}"/>""",
)

# 4 — Or monochrome sur fond transparent, relief estampé léger
VARIANTS["logo-or-monochrome-estampe"] = dict(
    title="Logo or monochrome sur fond transparent - relief estampe",
    defs="\n".join([
        linear("or", GOLD),
        """    <filter id="estampe" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/>
      <feDropShadow dx="0" dy="-3" stdDeviation="2" flood-color="#fff6cf" flood-opacity="0.35"/>
    </filter>""",
    ]),
    body=f"""  <g filter="url(#estampe)">
    <path fill="url(#or)" fill-rule="evenodd" d="{D_OR}"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{D_FEUILLE}"/>
  </g>""",
)

# 5 — Cuivre et vert sapin, ombre longue portée
VARIANTS["logo-cuivre-vert-sapin"] = dict(
    title="Logo cuivre et vert sapin - ombre longue",
    defs="\n".join([
        radial("sapin", [(0, "#1d5e43"), (60, "#134534"), (100, "#07231c")]),
        linear("cuivre", COPPER),
        """    <filter id="longue" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="34" dy="34" stdDeviation="0" flood-color="#000" flood-opacity="0.35"/>
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/>
    </filter>""",
    ]),
    body=f"""  <g filter="url(#longue)">
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#sapin)"/>
    <path fill="url(#cuivre)" fill-rule="evenodd" d="{D_OR}"/>
    <path fill="#d7e9c9" fill-rule="evenodd" d="{D_FEUILLE}"/>
  </g>""",
)

# 6 — Blanc pur, tracé plein, aucune ombre (découpe vinyle, sérigraphie)
VARIANTS["logo-blanc-decoupe"] = dict(
    title="Logo blanc monochrome - decoupe vinyle, sans ombre",
    defs='    <linearGradient id="rien"><stop offset="0%" stop-color="#ffffff"/></linearGradient>',
    body=f"""  <path fill="#ffffff" fill-rule="evenodd" d="{D_OR}"/>
  <path fill="#ffffff" fill-rule="evenodd" d="{D_FEUILLE}"/>""",
)

# 7 — Or lumineux sur noir brillant, halo néon
VARIANTS["logo-or-halo-neon"] = dict(
    title="Logo or lumineux - halo neon pour surface noire brillante",
    defs="\n".join([
        linear("or", [(0, "#ffe9a3"), (30, "#fffbe6"), (60, "#f0cd6e"), (100, "#ffeaa8")]),
        """    <filter id="halo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="flou"/>
      <feFlood flood-color="#ffd76a" flood-opacity="0.85" result="teinte"/>
      <feComposite in="teinte" in2="flou" operator="in" result="lueur"/>
      <feMerge>
        <feMergeNode in="lueur"/>
        <feMergeNode in="lueur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>""",
    ]),
    body=f"""  <g filter="url(#halo)">
    <path fill="url(#or)" fill-rule="evenodd" d="{D_OR}"/>
    <path fill="#8ff0b4" fill-rule="evenodd" d="{D_FEUILLE}"/>
  </g>""",
)

# 8 — Argent et nuit bleue, relief biseauté
VARIANTS["logo-argent-nuit"] = dict(
    title="Logo argent et bleu nuit - relief biseaute",
    defs="\n".join([
        radial("nuit", [(0, "#22375c"), (60, "#13223c"), (100, "#060c18")]),
        linear("argent", SILVER),
        """    <filter id="biseau" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="10" flood-color="#000" flood-opacity="0.6"/>
      <feDropShadow dx="0" dy="-4" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.45"/>
    </filter>""",
    ]),
    body=f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="url(#nuit)"/>
  <g filter="url(#biseau)">
    <path fill="url(#argent)" fill-rule="evenodd" d="{D_OR}"/>
    <path fill="#9fd8ff" fill-rule="evenodd" d="{D_FEUILLE}"/>
  </g>""",
)


def write_variants() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, v in VARIANTS.items():
        dest = OUT / f"{slug}.svg"
        dest.write_text(document(v["title"], v["defs"], v["body"]), encoding="utf-8")
        print(f"{dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} Ko)")


def write_arabesques() -> None:
    """Extrait les arabesques du médaillon de la page de garde."""
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    i = page.index('<svg class="medallion-svg"')
    j = page.index("</svg>", i) + 6
    block = page[i:j]
    inner = block[block.index("</defs>") + len("</defs>"):block.rindex("</svg>")]
    inner = inner.replace("goldGradCover", "or").replace("goldGlowCover", "ombre")
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" '
        f'width="{SIZE}" height="{SIZE}" fill="none" role="img" '
        'aria-label="Arabesques du medaillon La Colline Gambetta">\n'
        "  <title>Arabesques du medaillon - La Colline Gambetta</title>\n"
        f"  <desc>Encadrement du medaillon, trace vectoriel, canevas {SIZE}x{SIZE} px "
        "(169,3 mm a 300 dpi).</desc>\n"
        "  <defs>\n"
        + linear("or", [(0, "#bf953f"), (20, "#fcf6ba"), (45, "#d8b257"),
                        (75, "#b38728"), (100, "#fef9db")])
        + "\n"
        '    <filter id="ombre" x="-10%" y="-10%" width="120%" height="120%">\n'
        '      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>\n'
        "    </filter>\n"
        "  </defs>"
        + inner
        + "</svg>\n"
    )
    dest = OUT / "medaillon-arabesques.svg"
    dest.write_text(doc, encoding="utf-8")
    print(f"{dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    write_arabesques()
    write_variants()
