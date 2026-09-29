#!/usr/bin/env python3
"""Déclinaisons minimalistes du logo, toutes sur fond transparent.

Aucune de ces déclinaisons ne pose de disque ni de rectangle de fond : elles se
posent directement sur n'importe quel support. Toutes les formes sont
vectorielles (cercles mathématiques, contours de la police Cinzel, grains
paramétriques, illustration retracée en lissage maximal).

Sortie : assets/vector/
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import lcg_logo as L  # noqa: E402
from lcg_text import text_on_arc, text_path  # noqa: E402

ROOT = L.ROOT
OUT = ROOT / "assets" / "vector"

OR_FORMES = L.OR_FORMES
OR_TEXTE = L.OR_TEXTE
ANNEAU = L.OR_ANNEAU
ANNEAU_FIN = L.OR_ANNEAU_FIN
ARBRE = L.OR_ARBRE
VERT = L.VERT_COMPLET
GRAINS = L.GRAINS

GOLD = L.GOLD_STOPS
ENCRE = "#14100f"


def doc(title: str, defs: str, body: str, vb: str = "0 0 2000 2000",
        w: int = 2000, h: int = 2000) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" '
        'role="img" aria-label="La Colline Gambetta - Bar Restaurant">\n'
        f"  <title>{title}</title>\n"
        "  <desc>La Colline Gambetta - formes vectorielles lisses, fond transparent, "
        f"canevas {w}x{h} px (169,3 mm a 300 dpi pour le format carre), "
        "agrandissable sans perte.</desc>\n"
        f"  <defs>\n{defs}\n  </defs>\n{body}\n</svg>\n"
    )


FICHIERS: dict[str, str] = {}


# ---------------------------------------------------------------------------
# 1. Tampon circulaire : textes courbés le long du cadre
# ---------------------------------------------------------------------------
haut = text_on_arc("LA COLLINE GAMBETTA", 1000, 1000, 800, 118, angle_centre=-90,
                   tracking=26, sens=1)
bas = text_on_arc("BAR \u00b7 RESTAURANT", 1000, 1000, 810, 78, angle_centre=90,
                  tracking=30, sens=-1)
arbre_centre = ('<g transform="translate(1000,1080) scale(1.06) translate(-1000,-700)">'
                f'<path fill-rule="evenodd" d="{ARBRE}"/>'
                f'<path fill-rule="evenodd" d="{VERT}"/></g>')
FICHIERS["logo-t-tampon-circulaire"] = doc(
    "Minimal transparent - tampon circulaire, textes courbes",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)">
    <path fill-rule="evenodd" d="{ANNEAU}"/>
    {arbre_centre}
    <path d="{haut}"/>
    <path d="{bas}"/>
    <g transform="translate(0,-236)"><path fill-rule="evenodd" d="{GRAINS}"/></g>
  </g>""")


# ---------------------------------------------------------------------------
# 2. Épure dorée : le médaillon complet, sans disque
# ---------------------------------------------------------------------------
FICHIERS["logo-t-epure-or"] = doc(
    "Minimal transparent - medaillon or, sans disque ni effet",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)">
    <path fill-rule="evenodd" d="{OR_FORMES}"/>
    <path d="{OR_TEXTE}"/>
  </g>
  <path fill="url(#or)" fill-rule="evenodd" d="{VERT}"/>""")


# ---------------------------------------------------------------------------
# 3. Bicolore : arbre or, texte encre, grains verts
# ---------------------------------------------------------------------------
FICHIERS["logo-t-bicolore-encre"] = doc(
    "Minimal transparent - arbre or, texte encre, grains verts",
    L.linear("or", GOLD),
    f"""  <path fill="url(#or)" fill-rule="evenodd" d="{ANNEAU}"/>
  <path fill="url(#or)" fill-rule="evenodd" d="{ARBRE}"/>
  <path fill="#2f7d4a" fill-rule="evenodd" d="{VERT}"/>
  <path fill="{ENCRE}" d="{OR_TEXTE}"/>
  <path fill="#2f7d4a" fill-rule="evenodd" d="{GRAINS}"/>""")


# ---------------------------------------------------------------------------
# 4. Emblème compact : sans texte, arbre agrandi (favicon, tampon, broderie)
# ---------------------------------------------------------------------------
FICHIERS["logo-t-embleme-compact"] = doc(
    "Minimal transparent - embleme compact sans texte",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)">
    <path fill-rule="evenodd" d="{ANNEAU_FIN}"/>
    <g transform="translate(1000,1080) scale(1.16) translate(-1000,-700)">
      <path fill-rule="evenodd" d="{ARBRE}"/>
      <path fill-rule="evenodd" d="{VERT}"/>
    </g>
    <g transform="translate(1000,1640) scale(1.45) translate(-1000,-1778)">
      <path fill-rule="evenodd" d="{GRAINS}"/>
    </g>
  </g>""")


# ---------------------------------------------------------------------------
# 5. Monogramme LCG, cercle fin et grains
# ---------------------------------------------------------------------------
mono = text_path("LCG", 1000, 1180, 430, largeur=1020)
MONO_LIGNE = text_path("LA COLLINE GAMBETTA", 1000, 1420, 66, largeur=1080)
FICHIERS["logo-t-monogramme-lcg"] = doc(
    "Minimal transparent - monogramme LCG",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)">
    <path fill-rule="evenodd" d="{ANNEAU_FIN}"/>
    <path d="{mono}"/>
    <path d="{MONO_LIGNE}"/>
    <g transform="translate(1000,1640) scale(1.1) translate(-1000,-1778)">
      <path fill-rule="evenodd" d="{GRAINS}"/>
    </g>
  </g>""")


# ---------------------------------------------------------------------------
# 6. Signature horizontale : emblème à gauche, texte à droite
# ---------------------------------------------------------------------------
ligne1 = text_path("LA COLLINE", 1000, 340, 150, largeur=1150)
ligne2 = text_path("GAMBETTA", 1000, 560, 150, largeur=1150)
ligne3 = text_path("BAR \u00b7 RESTAURANT", 1000, 700, 58, largeur=900)
FICHIERS["logo-t-signature-horizontale"] = doc(
    "Minimal transparent - signature horizontale",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)">
    <g transform="translate(60,60) scale(0.44)">
      <path fill-rule="evenodd" d="{ANNEAU_FIN}"/>
      <g transform="translate(1000,1080) scale(1.16) translate(-1000,-700)">
        <path fill-rule="evenodd" d="{ARBRE}"/>
        <path fill-rule="evenodd" d="{VERT}"/>
      </g>
      <g transform="translate(1000,1640) scale(1.45) translate(-1000,-1778)">
        <path fill-rule="evenodd" d="{GRAINS}"/>
      </g>
    </g>
    <g transform="translate(1060,90)">
      <path d="{ligne1}"/>
      <path d="{ligne2}"/>
      <path d="{ligne3}"/>
      <rect x="425" y="637" width="1150" height="5" rx="2.5"/>
    </g>
  </g>""",
    vb="0 0 3000 1000", w=3000, h=1000)


# ---------------------------------------------------------------------------
# 7. Trait de plume : filets très fins, composition aérée
# ---------------------------------------------------------------------------
FILET_1 = L.annulus(975, 971)
FILET_2 = L.annulus(940, 936)
FIN_L1 = text_path("LA COLLINE GAMBETTA", 1000, 1420, 96, largeur=1380)
FIN_L2 = text_path("BAR \u00b7 RESTAURANT", 1000, 1570, 48, largeur=820)
FICHIERS["logo-t-trait-fin"] = doc(
    "Minimal transparent - filets tres fins, composition aeree",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{FILET_1}"/>
    <path d="{FILET_2}"/>
  </g>
  <g fill="url(#or)">
    <g transform="translate(1000,960) scale(0.92) translate(-1000,-700)">
      <path fill-rule="evenodd" d="{ARBRE}"/>
      <path fill-rule="evenodd" d="{VERT}"/>
    </g>
    <path d="{FIN_L1}"/>
    <path d="{FIN_L2}"/>
    <g transform="translate(1000,1700) scale(0.9) translate(-1000,-1778)">
      <path fill-rule="evenodd" d="{GRAINS}"/>
    </g>
  </g>""")


# ---------------------------------------------------------------------------
# 8. Contraste inversé : tout blanc, pour fonds sombres, fond transparent
# ---------------------------------------------------------------------------
FICHIERS["logo-t-blanc-pur"] = doc(
    "Minimal transparent - blanc pur pour fonds sombres",
    '    <linearGradient id="rien"><stop offset="0%" stop-color="#ffffff"/></linearGradient>',
    f"""  <g fill="#ffffff">
    <path fill-rule="evenodd" d="{OR_FORMES}"/>
    <path d="{OR_TEXTE}"/>
    <path fill-rule="evenodd" d="{VERT}"/>
  </g>""")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, contenu in FICHIERS.items():
        dest = OUT / f"{slug}.svg"
        dest.write_text(contenu, encoding="utf-8")
        print(f"{dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
