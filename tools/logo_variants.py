#!/usr/bin/env python3
"""Déclinaisons vectorielles du logo médaillon de La Colline Gambetta.

Toutes les formes proviennent d'une vectorisation réelle (séparation des
couleurs puis tracé des contours en courbes de Bézier) : aucun pixel n'est
embarqué. Le trio de feuilles du bas est remplacé par trois grains de café
dessinés en vectoriel (voir tools/lcg_logo.py).

Sortie : assets/vector/
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import lcg_logo as L  # noqa: E402

ROOT = L.ROOT
OUT = ROOT / "assets" / "vector"

OR = L.OR_COMPLET
VERT = L.VERT_COMPLET
GRAINS = L.GRAINS
ANNEAU = L.OR_ANNEAU
ANNEAU_FIN = L.OR_ANNEAU_FIN
ARBRE = L.OR_ARBRE
TITRE = L.OR_TITRE
SOUSTITRE = L.OR_SOUSTITRE

GOLD = L.GOLD_STOPS
COPPER = [(0, "#8c4a25"), (20, "#f7c6a0"), (45, "#d98452"), (72, "#a85a2c"), (100, "#f0b183")]
SILVER = [(0, "#7c8a99"), (20, "#ffffff"), (45, "#c8d4dd"), (70, "#8d9aa8"), (100, "#eef3f7")]

VARIANTS: dict[str, dict] = {}


def V(slug: str, title: str, defs: str, body: str) -> None:
    VARIANTS[slug] = dict(title=title, defs=defs, body=body)


# ===========================================================================
# Série classique — couleurs, reliefs et ombres
# ===========================================================================
V("logo-or-violet-relief",
  "Logo or et violet - relief bombe, ombre portee douce",
  "\n".join([
      L.radial("disc", [(0, "#8d1c72"), (55, "#6d1360"), (100, "#3d0836")]),
      L.linear("or", GOLD),
      L.linear("vert", [(0, "#7ae4a0"), (50, "#2fb25c"), (100, "#11913f")], "20%", "0%", "80%", "100%"),
      """    <filter id="relief" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="26" stdDeviation="26" flood-color="#000" flood-opacity="0.55"/>
    </filter>
    <radialGradient id="bombe" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.42"/>
    </radialGradient>"""]),
  f"""  <g filter="url(#relief)">
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#disc)"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{OR}"/>
    <path fill="url(#vert)" fill-rule="evenodd" d="{VERT}"/>
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#bombe)"/>
  </g>""")

V("logo-or-noir-grave",
  "Logo or sur noir profond - effet grave",
  "\n".join([
      L.radial("noir", [(0, "#22191d"), (60, "#120d10"), (100, "#000000")], "50%", "40%", "78%"),
      L.linear("or", GOLD),
      """    <filter id="grave" x="-20%" y="-20%" width="140%" height="140%">
      <feOffset dx="0" dy="6" in="SourceAlpha" result="bas"/>
      <feGaussianBlur in="bas" stdDeviation="5" result="basF"/>
      <feFlood flood-color="#000000" flood-opacity="0.85" result="noirF"/>
      <feComposite in="noirF" in2="basF" operator="in" result="ombreBasse"/>
      <feOffset dx="0" dy="-5" in="SourceAlpha" result="haut"/>
      <feGaussianBlur in="haut" stdDeviation="4" result="hautF"/>
      <feFlood flood-color="#ffe9a8" flood-opacity="0.55" result="clairF"/>
      <feComposite in="clairF" in2="hautF" operator="in" result="lumiereHaute"/>
      <feMerge><feMergeNode in="ombreBasse"/><feMergeNode in="lumiereHaute"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>"""]),
  f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="url(#noir)"/>
  <g filter="url(#grave)">
    <path fill="url(#or)" fill-rule="evenodd" d="{OR}"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{VERT}"/>
  </g>""")

V("logo-creme-aubergine-plat",
  "Logo creme et aubergine - style plat mat",
  '    <linearGradient id="rien"><stop offset="0%" stop-color="#4a1145"/></linearGradient>',
  f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="#f5ecd8"/>
  <path fill="#4a1145" fill-rule="evenodd" d="{OR}"/>
  <path fill="#2f7d4a" fill-rule="evenodd" d="{VERT}"/>""")

V("logo-or-monochrome-estampe",
  "Logo or monochrome sur fond transparent - relief estampe",
  "\n".join([L.linear("or", GOLD),
            """    <filter id="estampe" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/>
      <feDropShadow dx="0" dy="-3" stdDeviation="2" flood-color="#fff6cf" flood-opacity="0.35"/>
    </filter>"""]),
  f"""  <g filter="url(#estampe)">
    <path fill="url(#or)" fill-rule="evenodd" d="{OR}"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{VERT}"/>
  </g>""")

V("logo-cuivre-vert-sapin",
  "Logo cuivre et vert sapin - ombre longue",
  "\n".join([
      L.radial("sapin", [(0, "#1d5e43"), (60, "#134534"), (100, "#07231c")]),
      L.linear("cuivre", COPPER),
      """    <filter id="longue" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="34" dy="34" stdDeviation="0" flood-color="#000" flood-opacity="0.35"/>
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/>
    </filter>"""]),
  f"""  <g filter="url(#longue)">
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#sapin)"/>
    <path fill="url(#cuivre)" fill-rule="evenodd" d="{OR}"/>
    <path fill="#d7e9c9" fill-rule="evenodd" d="{VERT}"/>
  </g>""")

V("logo-blanc-decoupe",
  "Logo blanc monochrome - decoupe vinyle, sans ombre",
  '    <linearGradient id="rien"><stop offset="0%" stop-color="#ffffff"/></linearGradient>',
  f"""  <path fill="#ffffff" fill-rule="evenodd" d="{OR}"/>
  <path fill="#ffffff" fill-rule="evenodd" d="{VERT}"/>""")

V("logo-or-halo-neon",
  "Logo or lumineux - halo neon pour surface noire brillante",
  "\n".join([
      L.linear("or", [(0, "#ffe9a3"), (30, "#fffbe6"), (60, "#f0cd6e"), (100, "#ffeaa8")]),
      """    <filter id="halo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="flou"/>
      <feFlood flood-color="#ffd76a" flood-opacity="0.85" result="teinte"/>
      <feComposite in="teinte" in2="flou" operator="in" result="lueur"/>
      <feMerge><feMergeNode in="lueur"/><feMergeNode in="lueur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>"""]),
  f"""  <g filter="url(#halo)">
    <path fill="url(#or)" fill-rule="evenodd" d="{OR}"/>
    <path fill="#8ff0b4" fill-rule="evenodd" d="{VERT}"/>
  </g>""")

V("logo-argent-nuit",
  "Logo argent et bleu nuit - relief biseaute",
  "\n".join([
      L.radial("nuit", [(0, "#22375c"), (60, "#13223c"), (100, "#060c18")]),
      L.linear("argent", SILVER),
      """    <filter id="biseau" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="10" flood-color="#000" flood-opacity="0.6"/>
      <feDropShadow dx="0" dy="-4" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.45"/>
    </filter>"""]),
  f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="url(#nuit)"/>
  <g filter="url(#biseau)">
    <path fill="url(#argent)" fill-rule="evenodd" d="{OR}"/>
    <path fill="#9fd8ff" fill-rule="evenodd" d="{VERT}"/>
  </g>""")

# ===========================================================================
# Série minimaliste — épures contemporaines
# ===========================================================================
V("logo-minimal-epure",
  "Minimal - epure : filet fin, arbre et grains, sans texte",
  L.linear("or", GOLD),
  f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{ANNEAU_FIN}"/>
    <path d="{ARBRE}"/>
    <path d="{VERT}"/>
    <path d="{GRAINS}"/>
  </g>""")

V("logo-minimal-negatif-or",
  "Minimal - disque or plein, motifs evides en negatif",
  "\n".join([
      L.linear("or", GOLD),
      f"""    <mask id="evide">
      <rect width="2000" height="2000" fill="#fff"/>
      <g fill="#000" fill-rule="evenodd">
        <path d="{ARBRE}"/><path d="{VERT}"/><path d="{TITRE}"/>
        <path d="{SOUSTITRE}"/><path d="{GRAINS}"/>
      </g>
    </mask>"""]),
  """  <circle cx="999.5" cy="999.5" r="999.5" fill="url(#or)" mask="url(#evide)"/>""")

V("logo-minimal-noir-mat",
  "Minimal - encre noire mate sur creme, sans anneau",
  '    <linearGradient id="rien"><stop offset="0%" stop-color="#14100f"/></linearGradient>',
  f"""  <rect width="2000" height="2000" fill="#f2ece0"/>
  <g fill="#14100f" fill-rule="evenodd">
    <path d="{ARBRE}"/><path d="{VERT}"/><path d="{TITRE}"/><path d="{GRAINS}"/>
  </g>""")

V("logo-minimal-grains",
  "Minimal - arbre, ligne d'horizon et trois grains, monochrome",
  L.linear("or", GOLD),
  f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{ARBRE}"/>
    <path d="{VERT}"/>
    <path d="{L.beans_trio(cx=1000, cy=1560, scale=1.45)}"/>
  </g>
  <path d="M470 1330 H1530" stroke="url(#or)" stroke-width="7" stroke-linecap="round" fill="none"/>""")

V("logo-minimal-cercle-ouvert",
  "Minimal - cercle ouvert, typographie centree et grains",
  L.linear("or", GOLD),
  f"""  <g fill="none" stroke="url(#or)" stroke-width="10" stroke-linecap="round">
    <path d="M1000 40 A960 960 0 0 1 1900 1320"/>
    <path d="M1000 1960 A960 960 0 0 1 100 680"/>
  </g>
  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{ARBRE}"/><path d="{VERT}"/><path d="{TITRE}"/><path d="{SOUSTITRE}"/>
    <path d="{GRAINS}"/>
  </g>""")

V("logo-minimal-duotone",
  "Minimal - duotone anthracite et or, ombre tres douce",
  "\n".join([
      L.linear("or", [(0, "#e3c17f"), (50, "#f6e2b0"), (100, "#c9a862")]),
      """    <filter id="douce" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.38"/>
    </filter>"""]),
  f"""  <circle cx="999.5" cy="999.5" r="999.5" fill="#15171a"/>
  <g filter="url(#douce)">
    <path fill="url(#or)" fill-rule="evenodd" d="{ARBRE}"/>
    <path fill="#f4efe6" fill-rule="evenodd" d="{VERT}"/>
    <path fill="#f4efe6" fill-rule="evenodd" d="{TITRE}"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{SOUSTITRE}"/>
    <path fill="url(#or)" fill-rule="evenodd" d="{GRAINS}"/>
  </g>
  <circle cx="999.5" cy="999.5" r="975" fill="none" stroke="url(#or)" stroke-width="5" opacity="0.75"/>""")


def write_variants() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, v in VARIANTS.items():
        dest = OUT / f"{slug}.svg"
        dest.write_text(L.document(v["title"], v["defs"], v["body"]), encoding="utf-8")
        print(f"{dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} Ko)")


def write_masters() -> None:
    """Logo principal couleur et version or monochrome, avec les grains."""
    couleur = L.document(
        "La Colline Gambetta - logo medaillon couleur",
        "\n".join([
            L.radial("lcgDisc", [(0, "#8d1c72"), (55, "#6d1360"), (100, "#3d0836")]),
            L.linear("lcgGold", GOLD),
            L.linear("lcgGreen", [(0, "#7ae4a0"), (50, "#2fb25c"), (100, "#11913f")], "20%", "0%", "80%", "100%"),
        ]),
        f"""  <g id="medaillon">
    <circle cx="999.5" cy="999.5" r="999.5" fill="url(#lcgDisc)"/>
    <path id="or" fill="url(#lcgGold)" fill-rule="evenodd" d="{OR}"/>
    <path id="feuillage" fill="url(#lcgGreen)" fill-rule="evenodd" d="{VERT}"/>
  </g>""")
    (ROOT / "assets" / "cover" / "medaillon-logo-noir-brillant.svg").write_text(couleur, encoding="utf-8")

    mono = L.document(
        "La Colline Gambetta - logo medaillon or monochrome",
        L.linear("lcgGoldMono", GOLD),
        f"""  <g id="medaillon-or" fill="url(#lcgGoldMono)" fill-rule="evenodd">
    <path id="or" d="{OR}"/>
    <path id="feuillage" d="{VERT}"/>
  </g>""")
    (ROOT / "assets" / "cover" / "medaillon-logo-or.svg").write_text(mono, encoding="utf-8")
    print("assets/cover/medaillon-logo-noir-brillant.svg + medaillon-logo-or.svg")


def write_arabesques() -> None:
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    i = page.index('<svg class="medallion-svg"')
    j = page.index("</svg>", i) + 6
    block = page[i:j]
    inner = block[block.index("</defs>") + len("</defs>"):block.rindex("</svg>")]
    inner = inner.replace("goldGradCover", "or").replace("goldGlowCover", "ombre")
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="2000" '
        'height="2000" fill="none" role="img" aria-label="Arabesques du medaillon">\n'
        "  <title>Arabesques du medaillon - La Colline Gambetta</title>\n"
        "  <desc>Encadrement du medaillon, formes vectorielles, canevas 2000x2000 px "
        "(169,3 mm a 300 dpi).</desc>\n  <defs>\n"
        + L.linear("or", [(0, "#bf953f"), (20, "#fcf6ba"), (45, "#d8b257"),
                          (75, "#b38728"), (100, "#fef9db")]) + "\n"
        '    <filter id="ombre" x="-10%" y="-10%" width="120%" height="120%">\n'
        '      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>\n'
        "    </filter>\n  </defs>" + inner + "</svg>\n"
    )
    dest = OUT / "medaillon-arabesques.svg"
    dest.write_text(doc, encoding="utf-8")
    print(f"{dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    write_arabesques()
    write_variants()
    write_masters()
