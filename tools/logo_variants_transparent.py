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

TXT_1 = text_path("BAR \u00b7 RESTAURANT", 1000, 1490, 50, largeur=860)
TXT_2 = text_path("BAR \u00b7 RESTAURANT", 1000, 1470, 48, largeur=820)
TXT_3 = text_path("BAR \u00b7 RESTAURANT", 1000, 1500, 52, largeur=900)
TXT_4 = text_path("BAR \u00b7 RESTAURANT", 1000, 1550, 54, largeur=920)
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
# 1. Tampon circulaire : textes courbés dans une bande dédiée
#    Les rayons sont calculés pour qu'aucune lettre ne touche les filets
#    ni le dessin central.
# ---------------------------------------------------------------------------
FILET_EXT = L.annulus(990, 982)          # filet extérieur
FILET_INT = L.annulus(700, 693)          # filet intérieur, borne la bande de texte
HAUT = text_on_arc("LA COLLINE GAMBETTA", 1000, 1000, 792, 112,
                   angle_centre=-90, tracking=30, sens=1)
BAS = text_on_arc("BAR \u00b7 RESTAURANT", 1000, 1000, 902, 76,
                  angle_centre=90, tracking=34, sens=-1)
LOSANGE_G = L.polygon_path(4, 30, rotation=0, cx=1000 - 845, cy=1000)
LOSANGE_D = L.polygon_path(4, 30, rotation=0, cx=1000 + 845, cy=1000)
EMBLEME = (
    '<g transform="translate(1000,930) scale(0.78) translate(-1000,-705)">'
    f'<path fill-rule="evenodd" d="{ARBRE}"/>'
    f'<path fill-rule="evenodd" d="{VERT}"/></g>'
    '<g transform="translate(1000,1310) scale(1.15) translate(-1000,-1778)">'
    f'<path fill-rule="evenodd" d="{GRAINS}"/></g>'
)
FICHIERS["logo-t-tampon-circulaire"] = doc(
    "Minimal transparent - tampon circulaire, textes courbes dans leur bande",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)">
    <path fill-rule="evenodd" d="{FILET_EXT}"/>
    <path fill-rule="evenodd" d="{FILET_INT}"/>
    <path d="{HAUT}"/>
    <path d="{BAS}"/>
    <path d="{LOSANGE_G}"/>
    <path d="{LOSANGE_D}"/>
    {EMBLEME}
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




# ---------------------------------------------------------------------------
# 9. Anneau négatif : le nom est évidé dans un large bandeau doré
# ---------------------------------------------------------------------------
BANDEAU = L.annulus(990, 745)
HAUT_N = text_on_arc("LA COLLINE GAMBETTA", 1000, 1000, 820, 108,
                     angle_centre=-90, tracking=28, sens=1)
BAS_N = text_on_arc("BAR \u00b7 RESTAURANT", 1000, 1000, 915, 74,
                    angle_centre=90, tracking=32, sens=-1)
FICHIERS["logo-t-anneau-negatif"] = doc(
    "Minimal transparent - nom evide dans un bandeau dore",
    "\n".join([
        L.linear("or", GOLD),
        f"""    <mask id="nom">
      <path fill="#fff" fill-rule="evenodd" d="{BANDEAU}"/>
      <g fill="#000">
        <path d="{HAUT_N}"/>
        <path d="{BAS_N}"/>
        <path d="{L.polygon_path(4, 26, 0, 1000 - 867, 1000)}"/>
        <path d="{L.polygon_path(4, 26, 0, 1000 + 867, 1000)}"/>
      </g>
    </mask>"""]),
    f"""  <path fill="url(#or)" fill-rule="evenodd" d="{BANDEAU}" mask="url(#nom)"/>
  <g fill="url(#or)">
    <g transform="translate(1000,930) scale(0.74) translate(-1000,-705)">
      <path fill-rule="evenodd" d="{ARBRE}"/>
      <path fill-rule="evenodd" d="{VERT}"/>
    </g>
    <g transform="translate(1000,1290) scale(1.1) translate(-1000,-1778)">
      <path fill-rule="evenodd" d="{GRAINS}"/>
    </g>
  </g>""")


# ---------------------------------------------------------------------------
# 10. Anneau segmenté : cadre en tirets, écriture contemporaine
# ---------------------------------------------------------------------------
FICHIERS["logo-t-anneau-segmente"] = doc(
    "Minimal transparent - anneau segmente",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{L.dashed_ring(992, 968, n=72, ratio=0.52)}"/>
    <path d="{L.annulus(930, 925)}"/>
    <g transform="translate(1000,880) scale(0.82) translate(-1000,-705)">
      <path d="{ARBRE}"/>
      <path d="{VERT}"/>
    </g>
    <g transform="translate(1000,1600) scale(1.05) translate(-1000,-1778)">
      <path d="{GRAINS}"/>
    </g>
  </g>
  <g fill="url(#or)">
    <path d="{text_path("LA COLLINE GAMBETTA", 1000, 1360, 104, largeur=1420)}"/>
    <path d="{TXT_1}"/>
  </g>""")


# ---------------------------------------------------------------------------
# 11. Cadre hexagonal : géométrie contemporaine
# ---------------------------------------------------------------------------
FICHIERS["logo-t-hexagone"] = doc(
    "Minimal transparent - cadre hexagonal",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{L.polygon_path(6, 975, rotation=-90) + L.polygon_path(6, 961, rotation=-90)}"/>
    <path d="{L.polygon_path(6, 905, rotation=-90) + L.polygon_path(6, 899, rotation=-90)}"/>
    <g transform="translate(1000,880) scale(0.8) translate(-1000,-705)">
      <path d="{ARBRE}"/>
      <path d="{VERT}"/>
    </g>
    <g transform="translate(1000,1580) scale(1.05) translate(-1000,-1778)">
      <path d="{GRAINS}"/>
    </g>
  </g>
  <g fill="url(#or)">
    <path d="{text_path("LA COLLINE GAMBETTA", 1000, 1350, 100, largeur=1360)}"/>
    <path d="{TXT_2}"/>
  </g>""")


# ---------------------------------------------------------------------------
# 12. Cadre carré à coins arrondis : signalétique moderne
# ---------------------------------------------------------------------------
FICHIERS["logo-t-carre-arrondi"] = doc(
    "Minimal transparent - cadre carre a coins arrondis",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{L.rounded_rect(60, 60, 1880, 1880, 260) + L.rounded_rect(74, 74, 1852, 1852, 248)}"/>
    <path d="{L.rounded_rect(140, 140, 1720, 1720, 210) + L.rounded_rect(146, 146, 1708, 1708, 205)}"/>
    <g transform="translate(1000,870) scale(0.84) translate(-1000,-705)">
      <path d="{ARBRE}"/>
      <path d="{VERT}"/>
    </g>
    <g transform="translate(1000,1620) scale(1.1) translate(-1000,-1778)">
      <path d="{GRAINS}"/>
    </g>
  </g>
  <g fill="url(#or)">
    <path d="{text_path("LA COLLINE GAMBETTA", 1000, 1370, 108, largeur=1470)}"/>
    <path d="{TXT_3}"/>
  </g>""")


# ---------------------------------------------------------------------------
# 13. Couronne d'arc : arc segmenté au-dessus, composition ouverte
# ---------------------------------------------------------------------------
FICHIERS["logo-t-arc-couronne"] = doc(
    "Minimal transparent - couronne d'arc segmentee, composition ouverte",
    L.linear("or", GOLD),
    f"""  <g fill="url(#or)" fill-rule="evenodd">
    <path d="{L.annulus_sector(988, 952, -170, -10)}"/>
    <path d="{L.dashed_ring(902, 888, n=44, ratio=0.5, depart=-165)}"/>
    <g transform="translate(1000,900) scale(0.86) translate(-1000,-705)">
      <path d="{ARBRE}"/>
      <path d="{VERT}"/>
    </g>
    <g transform="translate(1000,1700) scale(1.2) translate(-1000,-1778)">
      <path d="{GRAINS}"/>
    </g>
  </g>
  <g fill="url(#or)">
    <path d="{text_path("LA COLLINE GAMBETTA", 1000, 1410, 116, largeur=1520)}"/>
    <path d="{TXT_4}"/>
  </g>"""
)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, contenu in FICHIERS.items():
        dest = OUT / f"{slug}.svg"
        dest.write_text(contenu, encoding="utf-8")
        print(f"{dest.relative_to(ROOT)}  ({dest.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
