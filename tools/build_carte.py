#!/usr/bin/env python3
"""Carte A4 : la mise en page du site, posée telle quelle sur des feuilles.

Le générateur ne retypographie plus rien. Il copie la feuille de style du site,
lui rend les règles que la neutralisation « html:not(.carte-doc) » écartait,
compose chaque onglet à la largeur d'écran mesurée (1180 px), puis applique un
seul facteur de réduction uniforme pour remplir le A4. Titres, pastilles,
colonnes, interlignes, alignements de prix : ce que voit le navigateur.

La répartition sur les feuilles vient de mesures réelles
(tools/measure_carte.mjs, rendu Chromium avec les fontes du site) : un bloc est
placé tant qu'il tient, sinon il passe à la feuille suivante. Rien n'est coupé,
aucun corps n'est bricolé à la main.

    python3 tools/build_carte.py     → carte.html
    npm run build:carte-pdf          → carte-a4-pages/*.jpg + carte-a4.pdf

Options : --no-measure (réutiliser carte-metrics.json même périmé),
          --per-onglet (taille de police par onglet au lieu de l'échelle unique),
          --no-aeration (ne pas répartir l'espace libre dans les lignes/titres).
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
OUT = ROOT / "carte.html"
METRICS = ROOT / "tools" / "carte-metrics.json"
MEASURE = ROOT / "tools" / "measure_carte.mjs"
MEASURE_DOC = ROOT / "carte-measure.html"
AERATE = ROOT / "tools" / "aerate_carte.mjs"
BASE_VIEWPORT = 1180        # largeur d'écran à laquelle le site est composé

# Ordre des feuilles de la carte, identique à celui du site (boutons de navigation
# et sections du document) : entrées, plats, menus, boissons, cocktails, vins,
# desserts. Ce n'est pas l'ordre d'un menu type « Entrées / Plats / Desserts » —
# c'est celui que la maison a choisi, et le PDF doit se feuilleter comme le site
# se parcourt. Le générateur compose les feuilles dans cet ordre ; les onglets
# denses gardent leurs deux feuilles, dans le même ordre.
SECTIONS = ["entrees", "plats", "menus", "boissons", "cocktails", "vins", "desserts"]

# Blocs qui ne doivent jamais être séparés entre deux feuilles : « Boissons
# fraîches » + « Boissons chaudes » se partagent une seule page (demande
# expresse), le packeur les traite donc comme une unité insécable. Les indices
# sont ceux des blocs de .tab-flow, dans l'ordre du document. Ces blocs sont
# marqués data-merge="1" dans la carte comme dans le document de mesure : la
# CSS de la carte (CARD_OVERRIDES) les reconnaît par ce marqueur — et pas par
# leur position de frère, qui change quand le découpage en pages les isole.
MERGE = {"boissons": [(0, 1), (2, 3, 4, 5, 6)],
        # cocktails : le duo-grid du site (Spritz + Mules) est séparé en deux
        # blocs par split_duo_grids — les indices ci-dessous sont ceux du flux
        # APRÈS cette séparation : 0 Cocktails classiques, 1 Spritz & fraîcheur,
        # 2 Mules & fizz sur une feuille ; 3 Élégance & saveurs, 4 Mocktails sur
        # l'autre (demande expresse).
        "cocktails": [(0, 1, 2), (3, 4)]}

# Groupes de MERGE autorisés à passer en DEUX colonnes de lignes sur leur
# feuille quand la hauteur manque (les quatre catégories boissons + bandeau
# HH) : par défaut les catégories s'empilent pleine largeur, comme
# « Boissons fraîches + chaudes » ; si leur hauteur cumulée dépasse la
# feuille, le plan de mise en page bascule en deux colonnes de lignes les
# sections les plus grandes (mesurées par le probe .carte-twocolsec-probe)
# jusqu'à ce que tout tienne. Le bandeau HH (hh-banner) n'est jamais basculé :
# sa hauteur ne change pas, la bascule ne l'atteint donc pas. La hauteur de
# l'unité est la somme des hauteurs de ses blocs dans leur mode + les gaps,
# pas la hauteur d'une disposition côte à côte. Les cocktails, eux, restent
# toujours en une colonne (ligne par ligne, notes sous chaque libellé) : leur
# police est volontairement plus petite, ce sont les pages les plus denses.
TWOC = {"boissons": [(2, 3, 4, 5, 6)]}

# Géométrie de la feuille, en accord avec les règles « contenant » plus bas.
#
# La zone utile n'est pas un chiffre au hasard : elle se déduit du cadre doré
# posé par CHROME_CSS (un filet à 8 mm des bords, à 43 mm du haut et 25,5 mm du
# bas) et de la respiration qu'on lui laisse. Le contenu prend donc tout le
# papier disponible SANS JAMAIS toucher le cadre — agrandir la zone agrandit
# d'office les caractères, la contrainte restant l'intérieur du filet.
SHEET_W_MM, SHEET_H_MM = 210.0, 297.0
CADRE_MM = {"cote": 8.0, "haut": 43.0, "bas": 25.5}   # le filet, pas le trait violet
JEU_DANS_CADRE_MM = 2.6      # entre l'encre la plus proche et le filet doré
ZONE_LEFT_MM = CADRE_MM["cote"] + JEU_DANS_CADRE_MM            # 10,6 mm
ZONE_TOP_MM = CADRE_MM["haut"] + JEU_DANS_CADRE_MM             # 45,6 mm
ZONE_BOTTOM_MM = CADRE_MM["bas"] + JEU_DANS_CADRE_MM          # 28,1 mm
ZONE_W_MM = SHEET_W_MM - 2 * ZONE_LEFT_MM                      # 188,8 mm
PX_PER_MM = 96 / 25.4
ZONE_W_PX = ZONE_W_MM * PX_PER_MM                                    # 695,43 px
ZONE_H_PX = (SHEET_H_MM - ZONE_TOP_MM - ZONE_BOTTOM_MM) * PX_PER_MM  # 842,86 px

# Échelle unique de police pour toute la carte, sauf la page « Nos Menus »
# (FORMULES) qui garde sa taille propre (demande expresse). Le gabarit est la
# page des plats — la plus dense : la seule taille qui la laisse tenir sur sa
# feuille, 7,6 pt, devient la taille de toute la carte. `--per-onglet` rend la
# main au réglage individuel (chaque feuille au plus grand corps qui tient).
UNIFORME = "--per-onglet" not in sys.argv
UNIFORME_EXCEPT = {"menus"}
# Largeurs de composition essayées, en fractions de celle du site. Au-dessus de 1,
# le bloc est étiré (le site compose à 1 140 px mais rien ne l'oblige à rester à sa
# largeur de conteneur quand on le pose sur papier) ; en dessous, il se resserre et
# monte : c'est ce levier qui fait border le cadre sans changer le nombre de pages.
WIDTH_RATIOS = [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00,
                0.95, 0.90, 0.85, 0.80, 0.75, 0.70]
JUSTIFY_MAX_RATIO = 2.4   # le inter-panneaux ne dépasse pas 2,4× celui du site
# Taille minimale de caractère sur le papier, mesurée sur l'intitulé de panneau
# (17,9 px sur le site) : sous ce plancher la carte devient pénible à lire en salle, et
# le build le signale. Il n'y a pas de plafond volontaire — une page qui ne se remplit
# qu'en grossissant son caractère doit pouvoir le grossir, c'est la demande explicite ;
# FIT_MAX n'intervient plus que comme repère du journal.
TITRE_MIN_PT, TITRE_MAX_PT = 7.2, 11.0
# Hauteur commune des cartons de la page « Nos Menus », en pixels de composition.
# Sur le papier, « Formule Duo » et « La formule complète » étaient deux cartons
# bas posés au-dessus d'un « Menu enfant » plus haut : trois cartons de même
# famille, trois gabarits. Ils prennent tous la hauteur du carton « Menu enfant »,
# mesuree a la largeur choisie pour l'onglet — d'ou MESURE_REFS, et la garde plus
# bas : si le carton de reference bouge de plus de quelques pixels, le build refuse
# de laisser une valeur cible qui ne serait plus la bonne.
OFFRE_H = 244
OFFRE_H_TOLERANCE = 8
# --- Les deux signes que Cinzel ne contient pas ----------------------------
# « ✦ » et « → » sont dessinés en CSS (voir remplacer_glyphes_a_risque). Leur
# tracé n'est écrit qu'ici : il était recopié à trois endroits, et deux copies
# avaient le même sommet répété deux fois — la branche haut-gauche de l'étoile
# manquait, ce qui se voyait surtout aux petites tailles (pied de page).
#
# L'étoile est un losange à quatre branches : quatre pointes sur les axes
# (haut, droite, bas, gauche) et, entre elles, quatre sommets rentrants sur la
# diagonale. On les énumère dans le sens horaire en partant de la pointe haute.
_CREUX = 38  # distance du centre des sommets rentrants, en % du côté
ETOILE_CLIP = "polygon({})".format(", ".join((
    "50% 0",                       # pointe haute
    f"{100 - _CREUX}% {_CREUX}%",  # creux haut-droit
    "100% 50%",                    # pointe droite
    f"{100 - _CREUX}% {100 - _CREUX}%",  # creux bas-droit
    "50% 100%",                    # pointe basse
    f"{_CREUX}% {100 - _CREUX}%",  # creux bas-gauche
    "0 50%",                       # pointe gauche
    f"{_CREUX}% {_CREUX}%",        # creux haut-gauche — celui qui manquait
)))
# La flèche est dessinée dans un carré : hampe au milieu, tête en triangle. Le
# tracé précédent plaçait deux sommets à -70 % et 170 % de la hauteur, hors de
# la boîte donc rognés ; comme la boîte ne faisait que .12em de haut, il ne
# restait qu'un filet et la tête disparaissait — « 17h → 23h » se lisait
# « 17h 23h ». Ici tout tient entre 0 et 100 %.
_HAMPE = 38  # demi-épaisseur de la hampe, en % de la hauteur
_TETE = 58   # abscisse où commence la tête, en % de la largeur
FLECHE_CLIP = "polygon({})".format(", ".join((
    f"0 {50 - _HAMPE / 2}%",
    f"{_TETE}% {50 - _HAMPE / 2}%",
    f"{_TETE}% 0",
    "100% 50%",
    f"{_TETE}% 100%",
    f"{_TETE}% {50 + _HAMPE / 2}%",
    f"0 {50 + _HAMPE / 2}%",
)))
# Éléments dont la carte a besoin de connaître la taille réelle, par onglet.
MESURE_REFS = {"menus": {"menu-enfant": ".special-card--compact"}}
TITRE_SITE_PX = 17.9
FIT_MIN = TITRE_MIN_PT / (TITRE_SITE_PX * 0.75)
FIT_MAX = TITRE_MAX_PT / (TITRE_SITE_PX * 0.75)
GAP_PACK = 5              # à l'empilement, on ne réserve que peu de jeu : le reste est
                          # distribué par la justification, une fois la largeur choisie
SAFETY = 0.985     # les hauteurs sont mesurées, mais pas dans la feuille elle-même
FIT_FLOOR = 0.90   # sous 10 % de l'échelle de composition, on préfère une feuille de plus
BALANCE_MIN_FILL = 0.60   # une feuille sous ce remplissage est un déséquilibre à corriger
RELAX_FLOOR = 0.87        # mais un seul onglet se resserre, jamais toute la carte


def index_text() -> str:
    return INDEX.read_text(encoding="utf-8")


def take_element(src: str, tag: str) -> tuple[str, str]:
    open_tag = f"<{tag}"
    if not src.startswith(open_tag):
        raise ValueError(f"expected <{tag}, got {src[:40]!r}")
    i = src.find(">")
    if i < 0:
        raise ValueError("unterminated tag")
    if src[i - 1] == "/":
        return src[: i + 1], src[i + 1 :]
    depth = 1
    p = i + 1
    open_tok = f"<{tag}"
    close_tok = f"</{tag}>"
    while p < len(src) and depth:
        nxt_open = src.find(open_tok, p)
        nxt_close = src.find(close_tok, p)
        if nxt_close < 0:
            raise ValueError(f"no closing </{tag}>")
        if nxt_open >= 0 and nxt_open < nxt_close:
            depth += 1
            p = nxt_open + len(open_tok)
        else:
            depth -= 1
            p = nxt_close + len(close_tok)
    return src[:p], src[p:]


def split_flow(inner: str) -> list[str]:
    """Les enfants de premier niveau de .tab-flow, dans l'ordre du document.

    Commentaires et texte nu sont ignorés : ce ne sont pas des blocs
    mesurables. S'arrêter au premier commentaire, comme le faisait l'ancienne
    version, amputait la carte d'un panneau entier.
    """
    parts: list[str] = []
    i = 0
    n = len(inner)
    while i < n:
        lt = inner.find("<", i)
        if lt < 0:
            break
        if inner.startswith("<!--", lt):
            end = inner.find("-->", lt)
            i = n if end < 0 else end + 3
            continue
        m = re.match(r"<([a-zA-Z][\w-]*)", inner[lt:])
        if not m:
            i = lt + 1
            continue
        node, rest = take_element(inner[lt:], m.group(1))
        parts.append(node)
        i = n - len(rest)
    return parts


# Les notes des panneaux « Boissons fraîches / chaudes » sont remontées dans
# la ligne de leur article (voir inline_notes) : la feuille gagne la hauteur de
# chaque note et le facteur d'échelle monte — c'est le levier « taille de
# police » demandé. Appliqué AVANT la mesure comme avant la composition : les
# deux documents restent alignés (empreinte + hauteurs).
_ARTICLE_RE = re.compile(r'<article class="price-line"[^>]*>.*?</article>', re.S)


def _inline_note_in_article(article: str) -> str:
    """Les notes (.price-list__note) d'un article remontent dans sa ligne,
    juste après le nom — l'article ne tient plus qu'une ligne. La classe
    note-cl (contenance) est conservée : la CSS lui garde son corps propre
    (--qty-size), distinct du corps des notes descriptives."""
    notes = re.findall(r'<p class="price-list__note([^"]*)">(.*?)</p>', article, re.S)
    if not notes:
        return article
    name = re.search(r'(<div class="(?:price-line__name|hh-line__name)">)(.*?)(</div>)', article, re.S)
    if not name:
        return article
    article = re.sub(r'<p class="price-list__note[^"]*">.*?</p>', '', article, flags=re.S)
    inline = "".join(f'<span class="carte-inline-note{cls}">{n}</span>' for cls, n in notes)
    return article.replace(
        name.group(0), name.group(1) + name.group(2) + inline + name.group(3), 1)


def inline_notes(block: str) -> str:
    return _ARTICLE_RE.sub(lambda m: _inline_note_in_article(m.group(0)), block)


# Les cellules « Appellation — Producteur » de la table des vins : seule
# l'appellation est le nom ; la mention après le tiret passe en sans gras,
# comme les informations (le span .carte-wine-producer, stylé en italique
# doux dans CARD_OVERRIDES). Appliqué AVANT la mesure comme avant la
# composition : les deux documents restent alignés (empreinte + hauteurs).
_WINE_NAME_RE = re.compile(r'(<td class="wine-name">)([^<]*?)( — )([^<]*)(</td>)', re.S)


def wine_producer_light(block: str) -> str:
    """Le producteur après le premier « — » d'une cellule wine-name passe en
    span .carte-wine-producer (sans gras) ; l'appellation garde son gras."""
    def _repl(m):
        return (m.group(1) + m.group(2) + m.group(3)
                + f'<span class="carte-wine-producer">{m.group(4)}</span>'
                + m.group(5))
    return _WINE_NAME_RE.sub(_repl, block)


def add_cls(block: str, cls: str) -> str:
    """Ajoute une classe à l'élément racine d'un bloc (qui en a déjà une)."""
    m = re.match(r"^(<\w+)([^>]*)>", block)
    if not m:
        return block
    tag, attrs = m.group(1), m.group(2)
    if 'class="' in attrs:
        attrs = re.sub(r'class="([^"]*)"', f'class="\\1 {cls}"', attrs, count=1)
    else:
        attrs += f' class="{cls}"'
    return tag + attrs + ">" + block[m.end():]


def secs_markup(blocks: list[str], group, mode=()) -> str:
    """Les blocs d'un groupe TWOC, empilés pleine largeur (comme fraîches +
    chaudes), les blocs de `mode` en deux colonnes de lignes.

    Chaque catégorie garde sa pleine largeur ; celles que la hauteur force
    (mode) voient leurs lignes s'étaler sur deux colonnes (classe carte-2col,
    qui rend les wrappers .price-list__col en display:contents). Le bandeau HH
    traverse toute la largeur en bas. Même structure dans la carte et dans le
    probe de mesure — les hauteurs mesurées sont donc celles de la page réelle.
    """
    mode = {int(i) for i in mode}
    out = []
    for i in (int(i) for i in group):
        b = blocks[i]
        if i in mode:
            b = add_cls(b, "carte-2col")
        out.append(b)
    return "\n".join(out)


def probe_secs_markup(blocks: list[str], group) -> str:
    """Comme secs_markup, mais toutes les sections en deux colonnes de lignes
    (sauf le bandeau hh-banner) et chaque bloc marqué data-block pour la
    mesure : c'est la borne haute — si le plan doit basculer, c'est vers ces
    hauteurs-là qu'il le fait, et le probe dit aussi si une largeur fait
    déborder une note (overflow).
    """
    g = [int(i) for i in group]
    out = []
    for i in g:
        b = blocks[i]
        b = re.sub(r"^(<\w+)", rf'\1 data-block="{i}"', b, count=1)
        if "hh-banner" not in b:
            b = add_cls(b, "carte-2col")
        out.append(b)
    return "\n".join(out)


def split_duo_grids(blocks: list[str]) -> list[str]:
    """Les blocs « duo-grid » du site (deux panneaux côte à côte à l'écran)
    deviennent deux blocs empilables : la page cocktails demande Spritz et
    Mules séparés, avec leur propre bascule en deux colonnes. Le découpage se
    fait par take_element, pas par regex : les panneaux contiennent des
    articles imbriqués (les hh-line)."""
    out = []
    for b in blocks:
        if not re.match(r'<div class="duo-grid">', b):
            out.append(b)
            continue
        m0 = re.match(r'<div class="duo-grid">', b)
        if not m0:
            out.append(b)
            continue
        rest = b[m0.end():]   # sauter la balise racine : on ne prend que ses enfants
        parts = []
        while rest.strip():
            lt = rest.find("<")
            if lt < 0:
                break
            m = re.match(r"<([a-zA-Z][\w-]*)", rest[lt:])
            if not m:
                break
            node, rest = take_element(rest[lt:], m.group(1))
            if node.startswith("<article"):
                parts.append(node)
        if len(parts) >= 2:
            out.extend(parts)
        else:
            out.append(b)
    return out


def block_signature(block: str) -> tuple[str, str]:
    m = re.match(r"<(\w+)([^>]*)>", block)
    if not m:
        return ("?", "")
    cls = re.search(r'class="([^"]*)"', m.group(2))
    return (m.group(1).lower(), " ".join((cls.group(1) if cls else "").split()))


def section_flow(src: str, sid: str) -> str:
    start = src.find(f'<section id="{sid}"')
    if start < 0:
        raise SystemExit(f"missing section {sid}")
    block, _ = take_element(src[start:], "section")   # borné à la section, pas à la suivante
    i = block.find('<div class="tab-flow">')
    if i < 0:
        raise SystemExit(f"{sid} : pas de .tab-flow")
    inner = block[i + len('<div class="tab-flow">') :]
    j = inner.rfind("</div>")
    return inner[:j]


def print_containing_only(css: str) -> tuple[str, int, int]:
    """Remplace chaque « @media print » du site par sa seule partie contenant.

    La feuille d'impression du site re-typographie la carte en points : gardée
    telle quelle, elle ferait diverger l'impression depuis le navigateur et les
    JPEG (qui, eux, sont la mise en page écran). Les règles de contenant
    (.print-page, @page, en-têtes et pieds de feuille) sont conservées, celles
    qui touchent le contenu sont retirées sur place, le reste du fichier garde
    sa forme d'origine.
    """
    out: list[str] = []
    i = 0
    kept = 0
    dropped = 0
    while True:
        j = css.find("@media print", i)
        if j < 0:
            out.append(css[i:])
            break
        k = css.find("{", j)
        depth = 0
        p = k
        while p < len(css):
            if css[p] == "{":
                depth += 1
            elif css[p] == "}":
                depth -= 1
                if depth == 0:
                    break
            p += 1
        if p >= len(css):                       # bloc déséquilibré : on n'y touche pas
            out.append(css[i:])
            break
        inner, k2, d2 = chrome_only(css[k + 1 : p])
        kept += k2
        dropped += d2
        out.append(css[i : k + 1] + "\n" + inner + "\n")
        i = p
    return "".join(out), kept, dropped


def media_print_bodies(css: str) -> str:
    """Les corps des blocs « @media print », extraits tels quels."""
    bodies = []
    i = 0
    while True:
        j = css.find("@media print", i)
        if j < 0:
            break
        k = css.find("{", j)
        depth = 0
        p = k
        while p < len(css):
            if css[p] == "{":
                depth += 1
            elif css[p] == "}":
                depth -= 1
                if depth == 0:
                    bodies.append(css[k + 1 : p])
                    i = p + 1
                    break
            p += 1
        else:
            break
    return "\n\n".join(bodies)


# Le contenu obéit au site ; ne passent la porte que les règles de contenant.
CONTENT_TOKENS = (
    "panel", "food-card", "price-", "hh-", "beer-", "wine-", "offer-", "choice-",
    "special-", "breakfast-", "day-option", "day-lines", "accent-band", "duo-grid",
    "menus-duo", "menu-points", "tab-flow", ".qty", "note-cl", "menu-card",
)


def split_rules(css: str) -> list[tuple[str, str]]:
    """[(sélecteur ou at-règle, contenu du bloc)], commentaires retirés."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out: list[tuple[str, str]] = []
    i = 0
    n = len(css)
    while i < n:
        while i < n and css[i] in " \n\t;":
            i += 1
        if i >= n:
            break
        brace = -1
        p = i
        while p < n:
            if css[p] == "{":
                brace = p
                break
            if css[p] == "}":
                break
            p += 1
        if brace < 0:
            break
        sel = css[i:brace].strip()
        depth = 1
        q = brace + 1
        while q < n and depth:
            if css[q] == "{":
                depth += 1
            elif css[q] == "}":
                depth -= 1
            q += 1
        out.append((sel, css[brace + 1 : q - 1]))
        i = q
    return out


def chrome_only(css: str) -> tuple[str, int, int]:
    """Garde les règles d'impression qui ne mettent en page que la feuille.

    Celles qui retypographient le contenu (.panel, .food-card, .wine-table…)
    sont écartées : sur la carte, le contenu est réglé par le site lui-même.
    Renvoie (css filtré, règles conservées, règles écartées).
    """
    kept = 0
    dropped = 0
    out: list[str] = []
    for sel, body in split_rules(css):
        if sel.startswith("@media") or sel.startswith("@supports"):
            inner, k, d = chrome_only(body)
            dropped += d
            if inner.strip():
                out.append(f"{sel} {{\n{inner}\n}}")
                kept += k
            continue
        if sel.startswith("@"):        # @page, @font-face…
            out.append(f"{sel} {{{body.strip()}}}")
            kept += 1
            continue
        parts = [s.strip() for s in sel.split(",")]
        if any(any(tok in part for tok in CONTENT_TOKENS) for part in parts):
            dropped += 1
            continue
        out.append(f"{sel} {{{body.strip()}}}")
        kept += 1
    return "\n".join(out), kept, dropped


def rescope_site_css(css: str) -> tuple[str, dict]:
    """Rend au document de carte les règles que le site réservait à l'écran.

    - « html:not(.carte-doc) » neutralisait tout ce qui touche la carte. Ici
      carte-doc est le marqueur des feuilles, et le contenu doit obéir au site :
      la neutralisation est retirée.
    - Les règles sont écrites sous #interior-menu, #cover-section ou les ids
      d'onglet. Dans la carte, le contenu vit dans #print-document, chaque
      feuille porte data-sec="onglet" et la couverture a sa classe : l'ancêtre
      est réécrit, en position d'ancêtre seulement — une règle qui vise le
      conteneur lui-même (#interior-menu { display:none }) reste sans effet.
    """
    stats: dict[str, int] = {}
    css, stats["neutralisation levée"] = re.subn(r"html:not\(\.carte-doc\)", "html", css)
    css, stats["#interior-menu"] = re.subn(
        r"#interior-menu(?=\s+[^\s{,])", ":is(#interior-menu, #print-document)", css)
    css, stats["#cover-section"] = re.subn(
        r"#cover-section(?=\s+[^\s{,])", ":is(#cover-section, .print-page--cover)", css)
    for sid in SECTIONS:
        css, k = re.subn(rf"#{sid}(?=[\s>+~ ])", f':is(#{sid}, [data-sec="{sid}"])', css)
        if k:
            stats[f"#{sid}"] = k
    return css, stats


def extract_cover(src: str) -> str:
    start = src.find('<div class="cover-page">')
    node, _ = take_element(src[start:], "div")
    node = node.replace(' onclick="showView(\'menu\')"', "")
    node = node.replace('href="#menu-nav-anchor"', 'href="index.html#menu-nav-anchor"')
    while '<a class="download-card"' in node:
        a = node.find('<a class="download-card"')
        frag, rest = take_element(node[a:], "a")
        node = node[:a] + rest
    inner_start = node.find('<svg class="relief-inner-svg"')
    if inner_start < 0:
        raise SystemExit("cover inner medallion missing")
    inner_end = node.find("</svg>", inner_start)
    if inner_end < 0:
        raise SystemExit("cover inner medallion unclosed")
    inner_end += len("</svg>")
    facade = (
        '<svg class="relief-inner-svg" viewBox="0 0 280 280" '
        'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        '<image href="medallion-facade.png" width="280" height="280" '
        'preserveAspectRatio="xMidYMid slice"/>'
        "</svg>"
    )
    return node[:inner_start] + facade + node[inner_end:]


HEADER = """<header class="print-page__header">
<div class="print-page__kicker">LA</div>
<div class="print-page__brand">COLLINE</div>
<div class="print-page__brand print-page__brand--sub">GAMBETTA</div>
<div class="print-page__meta">BAR • RESTAURANT • PARIS 20ᵉ</div>
<div class="print-page__meta print-page__meta--sub">✦ FAIT MAISON • SERVICE CONTINU • TERRASSE ✦</div>
</header>"""

FOOTER = """<footer class="print-page__footer">
<div>✦ PRIX NETS EN EUROS • SERVICE COMPRIS ✦</div>
<strong>LA COLLINE GAMBETTA</strong>
<div class="print-page__footer-contact">
<span class="print-foot-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.25" fill="currentColor" stroke="none"/></svg>lacolline.gambetta</span>
<span aria-hidden="true">·</span>
<span class="print-foot-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>01 43 49 05 93</span>
<span aria-hidden="true">·</span>
<span class="print-foot-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/></svg>lacollinegambetta@mailo.com</span>
</div>
<small>Allergènes : informations sur demande — L’abus d’alcool est dangereux pour la santé — À consommer avec modération</small>
</footer>"""


def page_shell(number: int, kind: str, content: str, cover_html: str | None = None,
               fit: float | None = None, base_w: float | None = None,
               row_gap: float | None = None,
               air_side: float | None = None, air_title: float | None = None) -> str:
    if kind == "cover":
        return (
            f'<div class="print-page-frame"><section class="print-page print-page--cover" '
            f'id="carte-p{number}" data-page="{number}">\n{cover_html}\n'
            f'</section></div>'
        )
    reglages = []
    if fit is not None:
        reglages.append(f"--carte-fit: {fit:.6f}")
    if base_w is not None:
        reglages.append(f"--carte-base-w: {base_w:.2f}px")
    # aération : l'espace libre du bas de feuille revient dans les lignes
    # (--carte-air-side) et sous les titres (--carte-air-title) — voir le bloc
    # « Aération » de CARD_OVERRIDES. Classe portée par les feuilles de la
    # carte composée uniquement (le document de mesure reste sans aération).
    cls = "carte-flow"
    if air_side is not None:
        cls += " carte-aerate"
        reglages.append(f"--carte-air-side: {air_side:.2f}px")
        reglages.append(f"--carte-air-title: {air_title:.2f}px")
    fit_attr = f' style="{"; ".join(reglages)}"' if reglages else ""
    # max-width en inline + !important : le site plafonne .tab-flow à son conteneur
    # d'écran (--flowmax), ce qui interdirait toute composition plus large.
    reglages_flow = ["max-width: none !important"]
    if row_gap is not None:
        reglages_flow.append(f"row-gap: {row_gap:.2f}px")
    gap_attr = f' style="{"; ".join(reglages_flow)}"' 
    return (
        f'<div class="print-page-frame"><section class="print-page print-page--{kind}" '
        f'id="carte-p{number}" data-page="{number}">\n{HEADER}\n'
        f'<div class="print-page__content">\n'
        f'<div class="{cls}" data-sec="{kind}"{fit_attr}>\n<div class="tab-flow"{gap_attr}>\n'
        f"{content}\n"
        f"</div>\n</div>\n</div>\n{FOOTER}\n"
        f'</section></div>'
    )


CHROME_CSS = r"""/* ===== Carte A4 : équilibre, cadres hors textes, mêmes styles PC ===== */
html.carte-doc, html.carte-doc body {
  background: #1a0b22 !important;
  margin: 0;
  overflow: auto !important;
  width: auto !important;
  min-width: 0 !important;
}
html.carte-doc {
  --carte-scale: 1;
}
html.carte-doc #print-document {
  display: block !important;
  width: 210mm;
  margin: 0 auto;
  padding: 22px 0 40px;
}
html.carte-doc .carte-toolbar { display: none !important; }
html.carte-doc .download-card,
html.carte-doc .download-btn { display: none !important; }

/* En-tête : titres plus grands, bande violette mieux remplie. */
html.carte-doc .print-page:not(.print-page--cover) .print-page__header {
  height: 39mm !important;
  padding: 2.1mm 7mm 1.8mm !important;
  row-gap: 0.7mm !important;
  align-content: space-evenly !important;
}
html.carte-doc .print-page__kicker {
  font-size: 9pt !important;
  letter-spacing: .38em !important;
}
html.carte-doc .print-page__brand {
  font-size: 29pt !important;
  letter-spacing: .22em !important;
  line-height: .88 !important;
}
html.carte-doc .print-page__brand--sub {
  font-size: 14.8pt !important;
  letter-spacing: .34em !important;
}
html.carte-doc .print-page__meta {
  font-size: 9.4pt !important;
  letter-spacing: .2em !important;
}
html.carte-doc .print-page__meta--sub {
  font-size: 8.2pt !important;
  letter-spacing: .18em !important;
}

/* Pied : logo IG, e-mail en toutes lettres, allergènes avant l’alcool. */
html.carte-doc .print-page__footer {
  height: 21mm !important;
  padding: 1.6mm 9mm 1.2mm !important;
}
html.carte-doc .print-page__footer-contact {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.6mm;
  flex-wrap: nowrap;
  margin: .35mm 0;
  font-family: 'Montserrat', sans-serif !important;
  font-weight: 400 !important;
  font-size: 5.6pt !important;
  letter-spacing: .02em !important;
  text-transform: none !important;
  font-style: normal !important;
}
html.carte-doc .print-page__footer-contact .print-foot-item {
  display: inline-flex;
  align-items: center;
  gap: 1mm;
  font-family: inherit;
  font-weight: 400;
  font-size: inherit;
  letter-spacing: inherit;
  text-transform: none;
}
html.carte-doc .print-page__footer-contact svg {
  width: 3.3mm;
  height: 3.3mm;
  flex: 0 0 auto;
  stroke: #fff;
  color: #fff;
}
/* Pas de numéro de page sur la carte : la feuille se lit dans l'ordre du site,
   et le document est pensé pour être agrafé — un « 5 » en bas à droite ne sert à
   rien dès lors que l'en-tête porte le nom de la maison et le pied ses contacts.
   (La règle du site, elle, reste : elle sert l'impression depuis le navigateur.) */
/* Cadres / zone utile : pied un peu plus haut. */
html.carte-doc .print-page:not(.print-page--cover)::before {
  inset: 41mm 6mm 23.5mm !important;
  border-color: #592e6f !important;
  z-index: 4;
}
html.carte-doc .print-page:not(.print-page--cover)::after {
  inset: 43mm 8mm 25.5mm !important;
  border-color: rgba(89,46,111,.4) !important;
  z-index: 4;
}
html.carte-doc .print-page__content {
  top: 47mm !important;
  bottom: 27mm !important;
}

/* Ornements ✦ du bandeau et du pied de page : losanges dessinés, jamais un
   glyphe — Cinzel ne le contient pas, et une police système absente du poste
   qui imprime le ferait sortir en carré.
   Le tracé lui-même est écrit une seule fois (ETOILE_CLIP) : le losange à
   quatre branches a huit sommets, et il suffisait d'en recopier un de travers
   pour que la branche haut-gauche s'effondre — c'était le cas ici, et sur les
   petites étoiles du pied de page le reste ne ressemblait plus qu'à un éclat. */
html.carte-doc .print-page i.carte-star {
  display: inline-block;
  width: .62em;
  height: .62em;
  vertical-align: -.02em;
  background: currentColor;
  clip-path: @@ETOILE@@;
}
html.carte-doc .print-page--cover {
  background: #24102e !important;
}
html.carte-doc .print-page--cover::before,
html.carte-doc .print-page--cover::after {
  display: none !important;
}
html.carte-doc .print-page--cover > .cover-page {
  position: absolute !important;
  inset: 0 !important;
  width: 210mm !important;
  height: 297mm !important;
  min-height: 297mm !important;
  padding: 16mm 16mm 16mm !important;
  display: flex !important;
  flex-flow: column nowrap !important;
  justify-content: safe center !important;
  align-items: center !important;
  gap: 0 !important;
  overflow: hidden !important;
  box-sizing: border-box;
  border: 0 !important;
}
html.carte-doc .print-page--cover .cover-page::after {
  inset: 0 !important;
  border: 0.45mm solid rgba(216,178,87,.55) !important;
  border-radius: 0 !important;
  pointer-events: none;
}
html.carte-doc .print-page--cover .cover-brand {
  flex: 0 0 auto;
  width: 100%;
  max-width: 170mm;
  margin: 0 0 100px !important; /* 100px entre le titre et le médaillon */
  gap: 3mm !important;
}
html.carte-doc .print-page--cover .cover-brand--menu-leader-lite .eyebrow,
html.carte-doc .print-page--cover .leader-title {
  font-size: 26pt !important;
  letter-spacing: .14em !important;
  overflow: visible !important;
  line-height: 1.15 !important;
}
html.carte-doc .print-page--cover .leader-meta {
  font-size: 11.5pt !important;
  letter-spacing: .14em !important;
  line-height: 1.25 !important;
}
html.carte-doc .print-page--cover .menu-leader-subline,
html.carte-doc .print-page--cover .leader-meta--sub {
  font-size: 10.5pt !important;
  letter-spacing: .12em !important;
  line-height: 1.3 !important;
}
html.carte-doc .print-page--cover .cover-brand .star-gold {
  display: inline-block !important;
  width: 10px;
  height: 10px;
  margin: 0 8px;
  vertical-align: 2px;
  background: #fcf6ba;
  clip-path: @@ETOILE@@;
  color: transparent !important;
  font-size: 0 !important;
  overflow: hidden;
  text-shadow: none !important;
}
html.carte-doc .print-page--cover .menu-leader-subline .star-gold {
  width: 7px;
  height: 7px;
  margin: 0 6px;
}
html.carte-doc .print-page--cover a.contact-link.cover-action {
  display: inline-flex !important;
  background: linear-gradient(135deg, #bf953f 0%, #fcf6ba 30%, #d8b257 60%, #fef9db 100%) !important;
  border-color: #fcf6ba !important;
  color: #24102e !important;
  box-shadow: 0 8px 22px rgba(156, 122, 45, .35);
}
html.carte-doc .print-page--cover a.contact-link.cover-action,
html.carte-doc .print-page--cover a.contact-link.cover-action * {
  color: #24102e !important;
}
html.carte-doc .print-page--cover .medallion-container {
  flex: 0 0 auto;
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  max-height: none !important;
  margin: 0 !important;
  aspect-ratio: auto !important;
}
html.carte-doc .print-page--cover .medallion-container .medallion-frame {
  width: 520px !important;
  height: 520px !important;
  margin-bottom: 100px !important; /* 100px entre le médaillon et le bouton */
}
html.carte-doc .print-page--cover .medallion-container .cover-action {
  margin: 0 !important;
  align-self: center !important;
}
html.carte-doc .print-page--cover .relief-inner-svg {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
  width: 66% !important;
  height: 66% !important;
  border-radius: 50%;
}
html.carte-doc .print-page--cover .cover-footer {
  flex: 0 0 auto;
  width: 100%;
  max-width: 168mm;
  gap: 3.5mm !important;
  margin: 14px 0 0 !important; /* pied collé sous le bouton */
}
html.carte-doc .print-page--cover .cover-links {
  width: 168mm !important;
  max-width: 100%;
  gap: 2.4mm !important;
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
html.carte-doc .print-page--cover .cover-links {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}
html.carte-doc .print-page--cover .cover-links .contact-link {
  min-height: 9mm !important;
  padding: 0 2.6mm !important;
  box-sizing: border-box;
  font-family: 'Montserrat', sans-serif !important;
  font-weight: 400 !important;
  font-size: 6.2pt !important;
  letter-spacing: .02em !important;
  text-transform: none !important;
  font-style: normal !important;
}
html.carte-doc .print-page--cover .cover-links .contact-link svg {
  width: 3.4mm !important;
  height: 3.4mm !important;
}
html.carte-doc .print-page--cover a.contact-link.cover-action {
  position: relative;
  z-index: 6;
  pointer-events: auto;
  cursor: pointer;
}


/* Écran : pages A4 mises à l’échelle dans la fenêtre, sans déformer le format. */
@media screen {
  html.carte-doc {
    --carte-scale: min(1, calc((100vw - 20px) / 210mm));
  }
  html.carte-doc,
  html.carte-doc body {
    overflow-x: hidden !important;
    max-width: 100% !important;
    width: 100% !important;
    min-width: 0 !important;
    touch-action: pan-y pinch-zoom;
  }
  html.carte-doc #print-document {
    width: 100% !important;
    max-width: 100%;
    padding: 12px 0 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  html.carte-doc .print-page-frame {
    width: calc(210mm * var(--carte-scale));
    height: calc(297mm * var(--carte-scale));
    margin: 0 auto 14px;
    position: relative;
    overflow: hidden;
    flex: 0 0 auto;
    box-shadow: 0 16px 40px rgba(0,0,0,.35);
  }
  html.carte-doc .print-page {
    width: 210mm !important;
    height: 297mm !important;
    margin: 0 !important;
    position: absolute !important;
    top: 0;
    left: 0;
    transform: scale(var(--carte-scale));
    transform-origin: top left;
    box-shadow: none !important;
  }
}

@page {
  size: A4 portrait;
  margin: 0;
}
@media print {
  html.carte-doc { --carte-scale: 1 !important; }
  html.carte-doc, html.carte-doc body {
    background: #fff !important;
    width: 210mm !important;
    min-width: 210mm !important;
    overflow: visible !important;
  }
  html.carte-doc .carte-toolbar { display: none !important; }
  html.carte-doc #print-document {
    padding: 0 !important;
    width: 210mm !important;
    display: block !important;
  }
  html.carte-doc .print-page-frame {
    width: 210mm !important;
    height: 297mm !important;
    margin: 0 !important;
    overflow: visible !important;
    box-shadow: none !important;
  }
  html.carte-doc .print-page {
    margin: 0 !important;
    box-shadow: none !important;
    transform: none !important;
    position: relative !important;
    top: auto !important;
    left: auto !important;
    width: 210mm !important;
    height: 297mm !important;
    page-break-after: always;
    break-after: page;
  }
  html.carte-doc .print-page-frame:last-child .print-page {
    page-break-after: auto;
    break-after: auto;
  }
}"""

FIT_CSS = """
/* ===== La feuille pose le site, elle ne le recompose pas =====

   Le contenu est composé à --carte-base-w — la largeur du flux sur l'écran du
   site, mesurée — puis réduit du facteur --carte-fit pour entrer dans la zone
   utile. Proportions, graisses, gouttières et pastilles restent les siennes :
   la feuille ne fait pas de typographie, elle fait du cadrage. */
html.carte-doc .print-page__content {
  position: absolute !important;
  z-index: 1;
  left: %(left).3fmm;
  width: %(zone_w).3fmm;
  top: %(top).3fmm;
  bottom: %(bottom).3fmm;
  padding: 0 !important;
  overflow: hidden !important;
  display: block !important;
}
/* Sur le site, .print-page est réservé à l'impression et reste caché à l'écran.
   Ici, c'est le document lui-même : il doit être visible dans les deux médias. */
html.carte-doc #print-document .print-page { display: block !important; }
/* Le bloc est composé à --carte-base-w puis réduit : son emplacement, lui, est
   en millimètres de papier. Le centrage se calcule donc APRÈS réduction, dans la
   feuille — et non dans le repère de composition, sinon le contenu part à droite
   de la largeur perdue. max() protège le cadre (filet à 8 mm du bord) si un
   jour la composition débordait de la zone utile. */
html.carte-doc { --carte-zone-w: %(zone_w).3fmm; }
html.carte-doc .carte-flow {
  width: var(--carte-base-w);
  margin-left: max(0px, calc((var(--carte-zone-w) - var(--carte-base-w) * var(--carte-fit)) / 2));
  transform: scale(var(--carte-fit));
  transform-origin: top left;
}
/* Un libellé plus long qu'une colonne ne doit jamais élargir le bloc : sinon la
   mise à l'échelle ne correspond plus à la mesure et le prix sortirait de la
   feuille. */
html.carte-doc .carte-flow .tab-flow > * { min-width: 0; }
html.carte-doc .carte-flow .tab-flow { max-width: none; }
""" % dict(left=ZONE_LEFT_MM, zone_w=ZONE_W_MM, top=ZONE_TOP_MM, bottom=ZONE_BOTTOM_MM)


# Les ✦ que le site écrit en CSS (::before/::after des titres de panneau, puces
# des listes « au choix ») : sur la carte, ce sont les mêmes losanges dessinés
# que ceux du bandeau et du pied de page. Le remplacement de texte, lui, ne peut
# rien pour eux — un content: '✦' n'est pas dans le corps du document.
GLYPH_CSS = f"""
html.carte-doc .print-page .panel__title::before,
html.carte-doc .print-page .panel__title::after,
html.carte-doc .print-page .choice-card li::before {{
  content: '' !important;
  display: inline-block !important;
  width: .74em;
  height: .74em;
  background: currentColor;
  text-shadow: none !important;
  clip-path: {ETOILE_CLIP};
}}
/* La puce des listes « au choix » est posée en absolu : sans hauteur de ligne
   pour la caler, on l'aligne à la main sur la première ligne de texte. */
html.carte-doc .print-page .choice-card li::before {{
  top: .34em;
}}
html.carte-doc .print-page i.carte-arrow {{
  display: inline-block;
  width: .92em;
  height: .62em;
  vertical-align: -.06em;
  background: currentColor;
  clip-path: {FLECHE_CLIP};
}}
"""
# Règles propres au papier : elles n'existent pas sur le site, donc la mesure
# doit se faire dans la carte elle-même (voir carte-measure.html), pas dans
# index.html.
CARD_OVERRIDES = """
/* Cocktails : une seule colonne. À deux colonnes, l'onglet tout entier tenait
   sur une feuille à 96 % et laissait la suivante à 35 % ; en une colonne, il
   se répartit sur deux feuilles du même poids, et le pointillé meneur de prix
   reste lisible sur toute la largeur, comme pour les whiskies et les bières.
   NB : « une colonne » ne se décrète pas — la règle du site pose
   grid-column: 1 / 2 sur les lignes des deux colonnes, et un simple
   grid-template-columns: 1fr laisserait la colonne 2 s'échapper dans une
   piste implicite auto (deux colonnes asymétriques, comme en paysage très
   bas sur le site). Il faut aussi rendre le placement automatique.
   NB2 : le sélecteur porte #print-document — sans lui, la règle écran du
   site (« deux colonnes max-content »), rescopée dans la carte avec une
   spécificité d'id, gagnerait sur ces règles purement classées. */
#print-document .carte-flow[data-sec="cocktails"] .hh-list--cols,
#print-document .carte-flow[data-sec="cocktails"] .duo-grid,
#print-document .carte-flow[data-sec="cocktails"] .hh-list,
#print-document .carte-flow[data-sec="cocktails"] .price-list--cols {
  grid-template-columns: 1fr !important;
}
#print-document .carte-flow[data-sec="cocktails"] .hh-list--cols .hh-line,
#print-document .carte-flow[data-sec="cocktails"] .hh-list--cols .hh-list__note,
#print-document .carte-flow[data-sec="cocktails"] .hh-list--cols .hh-head,
#print-document .carte-flow[data-sec="cocktails"] .price-list--cols .price-line,
#print-document .carte-flow[data-sec="cocktails"] .price-list--cols .price-list__note {
  grid-column: auto !important;
}
/* Les panneaux marqués data-merge (le générateur pose ce marqueur sur les
   blocs insécables de MERGE — boissons, puis cocktails) passent en une seule
   colonne pleine largeur. La règle
   du site étale leurs lignes sur deux colonnes dès 720 px ; ici on n'en garde
   qu'une (piste 1fr + placement automatique des lignes, même neutralisation
   que pour les cocktails).
   L'analyse de hauteur (voir le plan de build) montre que les listes en une
   colonne ne tiennent pas sur la feuille à l'espacement du site : on resserre
   l'interligne de ces panneaux seulement (padding 3 px au lieu de 8) — les
   noms, notes et prix gardent les corps uniformes de la carte (ceux de la
   page des plats). Les sélecteurs sont en descendant (pas `>`) : un bloc
   basculé en deux colonnes de lignes (carte-2col) garde ses règles de
   panneau, seule la grille de lignes change. */
#print-document .carte-flow [data-merge="1"] .price-list--cols,
#print-document .carte-flow [data-merge="1"] .hh-list--cols,
#print-document .carte-flow [data-merge="1"] .hh-list {
  grid-template-columns: 1fr !important;
}
/* Une liste --cols en une colonne : les deux moitiés (wrappers __col) se
   suivent sans l'espace de grille du site (10 px) — les lignes reprennent
   leur espacement normal (padding 3 px) et la section forme une seule liste
   continue, comme « la section du bas regroupée avec celle du haut ». En
   mode deux colonnes de lignes (carte-2col), la règle plus spécifique
   repasse la gouttière à 40 px (lecture) — l'écart de rangées, lui, reste 0. */
#print-document .carte-flow [data-merge="1"] .price-list--cols,
#print-document .carte-flow [data-merge="1"] .hh-list--cols {
  gap: 0 !important;
}
/* En-tête fantôme de la colonne 2 (celui que le site montre à ≥1480 px quand
   les deux colonnes sont côte à côte) : dans la carte il réapparaissait au
   MILIEU de la liste — le texte « Prix / HH » dupliqué entre les deux
   moitiés. Il n'a pas lieu d'être : l'en-tête de tête suffit. */
#print-document .carte-flow [data-merge="1"] .hh-list--cols .hh-head--ghost {
  display: none !important;
  visibility: hidden !important;
}
/* Pleine largeur de la feuille : la règle écran du site (« deux colonnes
   max-content ») pose width: fit-content + margin-inline: auto, rescopée dans
   la carte elle fait que la grille épouse son contenu et laisse la page à
   63 % de sa largeur. Ici les lignes courent d'un bord à l'autre du panneau
   (le pointillé meneur absorbe le blanc), et la page entière se tient sur
   toute la largeur comme sur toute la hauteur du A4. */
#print-document .carte-flow [data-merge="1"] .price-list--cols,
#print-document .carte-flow [data-merge="1"] .hh-list--cols {
  width: 100% !important;
  max-width: 100% !important;
  margin-inline: 0 !important;
}
#print-document .carte-flow [data-merge="1"] .price-list--cols .price-line,
#print-document .carte-flow [data-merge="1"] .price-list--cols .price-list__note,
#print-document .carte-flow [data-merge="1"] .hh-list--cols .hh-line,
#print-document .carte-flow [data-merge="1"] .hh-list--cols .hh-head,
#print-document .carte-flow [data-merge="1"] .hh-list--cols .hh-list__note {
  grid-column: auto !important;
}
#print-document .carte-flow [data-merge="1"] .price-line,
#print-document .carte-flow [data-merge="1"] .hh-line {
  padding: 3px 0;
}
/* Taille de police unique (la page des plats fait gabarit) : les noms, les
   notes et les prix des blocs insécables retombent sur les corps du site —
   1,12 rem / 0,98 rem / 1,28 rem — les mêmes que la page des plats. Rien ne
   les réduit plus : seule la contenance (.note-cl) garde son corps propre. */
#print-document .carte-flow [data-merge="1"] .hh-line__price,
#print-document .carte-flow [data-merge="1"] .hh-line__hh {
  font-size: 1.28rem !important;
}
/* Notes remontées dans la ligne (le générateur les a déplacées après le nom,
   en .carte-inline-note) : en italique comme sur le site, en retrait — ce
   sont les informations de la ligne, même corps que les notes de la carte
   (0,98 rem). La contenance (.note-cl) garde son corps propre (--qty-size),
   un cran sous les notes, comme sur le site. nowrap : une note ne fait
   jamais déborder sa ligne ; si la place manque, la variante de largeur est
   écartée par la mesure (overflow) avant de servir. */
#print-document .carte-flow [data-merge="1"] .carte-inline-note {
  display: inline;
  font-size: 0.98rem !important;
  font-weight: 400 !important;
  font-style: italic;
  line-height: 1.3;
  color: var(--muted);
  white-space: nowrap;
  margin-left: .55em;
}
#print-document .carte-flow [data-merge="1"] .carte-inline-note.note-cl {
  font-size: var(--qty-size) !important;
}
#print-document .carte-flow [data-merge="1"] .carte-inline-note + .carte-inline-note {
  margin-left: 0;
}
#print-document .carte-flow [data-merge="1"] .carte-inline-note + .carte-inline-note::before {
  content: " · ";
  margin-left: .55em;
}
/* --- Pages empilées à bascule (boissons, cocktails) ---
   Les catégories s'empilent pleine largeur, comme fraîches + chaudes. Quand
   la hauteur manque, le générateur pose carte-2col sur les sections les plus
   grandes : leurs lignes s'étalent alors sur deux colonnes — même règle que
   le mode deux colonnes du site : wrappers .price-list__col / .hh-list__col
   rendus en display:contents, chaque wrapper nourrit sa colonne (les listes
   HH simples, sans wrappers, répartissent leurs lignes en rangées, l'en-tête
   traversant). La spécificité est plus forte que la neutralisation 1fr posée
   plus haut (1,4,0 contre 1,3,0), donc la levée l'emporte sur les blocs
   marqués seulement. */
#print-document .carte-flow [data-merge="1"].carte-2col .price-list--cols,
#print-document .carte-flow [data-merge="1"].carte-2col .hh-list--cols,
#print-document .carte-flow [data-merge="1"].carte-2col .hh-list {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  /* !important : la neutralisation 1-col pose gap: 0 !important (shorthand),
     qui écraserait ces longhands sans !important — la gouttière doit gagner.
     Seule la gouttière CENTRALE est élargie (40 px) : entre les prix de la
     colonne de gauche et les intitulés de celle de droite, l'œil suit sa
     rangée. Les rangées gardent l'espacement de la carte (padding 3 px),
     comme les listes en une colonne — row-gap 0, sinon la page boissons
     perdrait 2 points de police pour un air qui existe déjà. */
  column-gap: 40px !important;
  row-gap: 0 !important;
}
#print-document .carte-flow [data-merge="1"].carte-2col .price-list--cols .price-list__col,
#print-document .carte-flow [data-merge="1"].carte-2col .hh-list--cols .hh-list__col {
  display: contents !important;
}
#print-document .carte-flow [data-merge="1"].carte-2col .price-list--cols .price-list__col:nth-child(1) > *,
#print-document .carte-flow [data-merge="1"].carte-2col .hh-list--cols .hh-list__col:nth-child(1) > * {
  grid-column: 1;
}
#print-document .carte-flow [data-merge="1"].carte-2col .price-list--cols .price-list__col:nth-child(2) > *,
#print-document .carte-flow [data-merge="1"].carte-2col .hh-list--cols .hh-list__col:nth-child(2) > * {
  grid-column: 2;
}
/* Listes HH simples (Spritz, Mules, Mocktails) : l'en-tête traverse les deux
   colonnes, les lignes se répartissent en rangées. */
#print-document .carte-flow [data-merge="1"].carte-2col .hh-list > .hh-head {
  grid-column: 1 / -1;
}
/* Le document de mesure (probe) : mêmes règles, même écart entre les blocs. */
.carte-twocolsec-probe .tab-flow { row-gap: 18px; }
/* Côté carte des cocktails : une ligne = un nom et un prix, le blanc de
   respiration est donc entièrement dans le padding de ligne. En le serrant de
   8 à 5,5 px, la page se compose plus étroite — donc plus grande — sans
   changer une ligne du site. Le nom garde le corps uniforme de la carte
   (1,12 rem, comme la page des plats). */
html.carte-doc .carte-flow[data-sec="cocktails"] .price-line,
html.carte-doc .carte-flow[data-sec="cocktails"] .hh-line {
  padding: 5.5px 0;
}

/* --- La page « Nos Menus » : trois cartons d'une seule hauteur --------------
   « Formule Duo » et « La formule complète » se rangent sur le gabarit du
   « Menu enfant », et le contenu se centre dans le carton au lieu de rester
   collé en haut. Valeur en pixels de composition : la feuille entière est
   réduite d'un coup, le rapport entre les blocs est donc respecté à l'impression.
   Le site, lui, garde ses cartons courts (la règle est sous html.carte-doc). */
html.carte-doc .carte-flow[data-sec="menus"] .offer-grid {
  /* la ligne porte la hauteur, pas la carte : le site rejoue dans la carte sa
     règle « .offer-card { min-height: 0 !important } », assise sur un id — aucune
     hauteur minimale ne la ferait plier. Une rangée, elle, est libre. */
  grid-auto-rows: minmax(@@OFFRE_H@@px, auto);
}
/* « Formule Duo » et « La formule complète » : le texte occupe toute la hauteur
   du carton.
   Ces deux cartons sont plus hauts que leur contenu — c'est la rangée qui leur
   donne la hauteur du carton « Menu enfant » d'en face. Le contenu, simplement
   centré, laissait donc une bande vide en bas de chacun.
   Ils portent quatre éléments — cartouche doré, composition, prix, renvoi — et
   la lecture veut qu'ils se suivent sans se toucher : on répartit le blanc
   entre eux (`space-between`) plutôt que de l'entasser au-dessous, et on borne
   l'écart pour que deux cartons de contenus inégaux (« Entrée + plat ou plat +
   dessert » tient sur une ligne, pas toujours) restent visuellement jumeaux.
   Le rembourrage haut et bas est identique : la symétrie tient à cela. */
html.carte-doc .carte-flow[data-sec="menus"] .offer-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;       /* sinon le cartouche doré, enfant du flex, s'étire en bandeau */
  gap: 2mm;
  padding-top: 4mm;
  padding-bottom: 4mm;
}
/* Le prix est le centre de gravité du carton : on lui laisse prendre le blanc
   qui reste, à parts égales au-dessus et au-dessous, pour qu'il tombe au milieu
   quelle que soit la hauteur du bloc de composition qui le précède. */
html.carte-doc .carte-flow[data-sec="menus"] .offer-card .offer-card__price {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
}

/* En-têtes de contenances du tableau des vins : le site les compose à 12,48 px,
   ce qui donne 5,3 pt une fois la feuille réduite — le seul endroit de la carte
   où un chiffre aussi petit sert à quelque chose d'essentiel (savoir à quel
   format correspond un prix). On les remonte au corps d'un prix et on reprend
   immédiatement la place gagnée sous l'en-tête, pour que la feuille tienne
   toujours sur une page : la hauteur du flux reste à portée du cap. */
html.carte-doc .carte-flow[data-sec="vins"] .wine-table th {
  font-size: 15.4px !important;
  padding-bottom: 4.5px !important;
}

/* --- La feuille des vins ne doit pas ressembler à un tableur ---------------
   Le site pose ses vins en tableau : bandes alternées, un filet sous chaque
   cellule, quatre colonnes bord à bord. À l'écran, c'est un outil de lecture
   en ligne ; sur une carte, cela fait tableau Excel. Le cadre des autres
   listes du site est ailleurs — un en-tête en capitales dorées, une ligne
   aérée, un filet discret — et c'est lui que la feuille adopte, sans que le
   site y change rien (tout est sous html.carte-doc). */
html.carte-doc .carte-flow[data-sec="vins"] .wine-table tbody tr:nth-child(even) td {
  background: transparent !important;          /* pas de bandes */
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table td {
  border-bottom: 1px dotted rgba(156, 122, 45, .38) !important;  /* pointillé du site, pas trait plein */
  padding: 5px 0;                              /* l'air vient du filet, pas de la cellule */
}
/* Le corps d'une carte des vins suit la taille uniforme de la carte (1,12 rem
   pour le nom, 1,28 rem pour les prix — les corps de la page des plats) : le
   site compose ses lignes plus petites (clamp()), la carte leur rend le corps
   commun au lieu d'un corps propre. La place est reprise sur le blanc de
   cellule (padding 5 px). Le site, lui, garde ses clamp() intacts. */
html.carte-doc .carte-flow[data-sec="vins"] .wine-table .wine-name {
  line-height: 1.32;
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table tbody tr:last-child td {
  border-bottom: 0 !important;                 /* le panneau se ferme sans filet */
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table th {
  border-bottom: 1px solid rgba(216, 178, 87, .45) !important;
  color: var(--gold-600) !important;
  letter-spacing: .14em;
  text-transform: uppercase;
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table td:not(.wine-name):not(.wine-no) {
  font-family: 'Cinzel', serif;
  font-weight: 700;
  color: var(--violet-900);
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table td.wine-no {
  color: var(--gold-600);
  font-weight: 800;
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table td.wine-name {
  line-height: 1.45;                           /* deux lignes d'appellation respirent */
}
/* « Appellation — Producteur » : le producteur après le tiret n'est pas le nom
   de la bouteille ; sans gras, comme les informations — italique, encre douce
   (la même que les notes), un cran plus petit pour que l'appellation reste le
   premier mot. Le générateur pose .carte-wine-producer sur cette partie. */
/* « Prix unifiés » du site (≥1100 px) : la règle qui porte les prix à
   1,28 rem oublie #desserts — sa base 0,84 rem (le #desserts rescopé en
   :is(#desserts, …) garde sa spécificité d'id) gagne donc sur la page des
   desserts, dont les prix sortent plus petits que ceux des plats. La carte
   rétablit le corps commun : les prix sont partout ceux de la page des
   plats (le sélecteur porte #print-document pour reprendre l'avantage d'id). */
#print-document .carte-flow[data-sec="desserts"] .food-card__head strong {
  font-size: 1.28rem !important;
}
/* Notes des cocktails : la base 0,84 rem du site porte une variante
   :is(#cocktails, …) (spécificité d'id) que la règle ≥1100 px (0,98 rem) n'a
   pas — les notes sous les libellés sortiraient plus petites que celles des
   plats. La carte rétablit le corps commun des informations (0,98 rem). */
#print-document .carte-flow[data-sec="cocktails"] .price-list__note,
#print-document .carte-flow[data-sec="cocktails"] .hh-list__note {
  font-size: 0.98rem !important;
}
/* Cellules de prix du tableau des vins : la règle « prix unifiés » ≥1100 px
   ne couvre pas .wine-table td (clamp 0,85-1,08 rem) — les prix des
   bouteilles sortiraient plus petits que ceux des plats. Même corps commun. */
#print-document .carte-flow[data-sec="vins"] .wine-table td:not(.wine-name) {
  font-size: 1.28rem !important;
}
html.carte-doc .carte-flow[data-sec="vins"] .wine-table td.wine-name .carte-wine-producer {
  font-weight: 400;
  font-style: italic;
  color: var(--muted);
  font-size: .88em;
}
/* un format indisponible reste muet : le tiret ne doit pas crier « donnée
   manquante », il doit se fondre comme sur les listes du site */
html.carte-doc .carte-flow[data-sec="vins"] .wine-table td:not(.wine-name):not(.wine-no) {
  font-variant-numeric: tabular-nums;
}
/* ===== Aération : la hauteur libre du bas de feuille revient dans les lignes ====
   Le générateur mesure chaque feuille rendue (tools/aerate_carte.mjs, mêmes
   fontes que le PDF) et répartit l'espace restant avant le plancher de garde
   (SAFETY) entre l'interligne des lignes (--carte-air-side, ajouté au padding
   vertical de chaque ligne) et la marge sous les titres de panneau
   (--carte-air-title). La classe carte-aerate n'est posée que sur les
   feuilles de la carte composée — jamais sur le document de mesure, qui reste
   sans aération. Les bases (3 px lignes, 12 px cartes, 5 px cellules de vins,
   12 px marge de titre) sont contrôlées par le générateur au moment de la
   mesure, et les sélecteurs reprennent les spécificités des règles qu'ils
   complètent pour gagner à coup sûr. */
#print-document .carte-flow.carte-aerate [data-merge="1"] .price-line,
#print-document .carte-flow.carte-aerate [data-merge="1"] .hh-line {
  padding-top: calc(3px + var(--carte-air-side, 0px)) !important;
  padding-bottom: calc(3px + var(--carte-air-side, 0px)) !important;
}
#print-document .carte-flow.carte-aerate .food-card {
  padding-top: calc(12px + var(--carte-air-side, 0px)) !important;
  padding-bottom: calc(12px + var(--carte-air-side, 0px)) !important;
}
#print-document .carte-flow.carte-aerate[data-sec="vins"] .tab-flow .wine-table td {
  padding-top: calc(5px + var(--carte-air-side, 0px)) !important;
  padding-bottom: calc(5px + var(--carte-air-side, 0px)) !important;
}
#print-document .carte-flow.carte-aerate .panel__head {
  margin-bottom: calc(12px + var(--carte-air-title, 0px)) !important;
}
"""


MEASURE_CSS = """
/* carte-measure.html : les blocs de la carte, à plat, sans feuille et sans
   mise à l échelle — c est ici que les hauteurs sont relevées, avec les règles
   propres au papier. */
html.carte-measure, html.carte-measure body { background: #1a0b22; }
html.carte-measure #print-document {
  display: block !important;
  width: auto !important;
  padding: 0 !important;
  margin: 0 !important;
}
html.carte-measure .carte-measure-sec { padding: 24px 0; }
html.carte-measure .carte-flow {
  width: var(--carte-base-w, 1140px);
  margin: 0 !important;
  transform: none !important;
}
"""


def remplacer_glyphes_a_risque(html: str) -> str:
    """Aucun signe ne doit dépendre d'une police absente du poste qui imprime.

    - « ✦ » et « → » ne sont pas dans Cinzel : ils sont dessinés en CSS ;
    - les exposants unicode (ᵉ, ʳ, …) non plus : rendus en <sup>.
    La feuille de style copiée depuis index.html reste intacte (séparation sur la
    première balise </style>).
    """
    head, sep, body = html.partition("</style>")
    if not sep:
        return html
    body = body.replace("ʳᵉ", "<sup>re</sup>").replace("ᵉ", "<sup>e</sup>")
    for src, dst in (("ʳ", "r"), ("ᵈ", "d"), ("ˢ", "s"), ("ᵗ", "t"), ("ᵖ", "p"), ("ᶜ", "c")):
        body = body.replace(src, f"<sup>{dst}</sup>")
    body = body.replace("✦", '<i class="carte-star" aria-hidden="true"></i>')
    body = body.replace("→", '<i class="carte-arrow" aria-hidden="true"></i>')
    return head + sep + body


# ------------------------------------------------------------------ métriques


def compose_css(src: str) -> tuple[str, dict]:
    """La feuille de style commune aux deux documents (carte et mesure).

    Le site dicte le contenu : on copie sa CSS, on lui rend les règles que la
    neutralisation écartait, on ne garde de @media print que le contenant — et
    on rejoue ce contenant hors média, parce que la carte est rendue (et
    photographiée) en média screen.
    """
    style = src.split("<style>", 1)[1].split("</style>", 1)[0]
    css, stats = rescope_site_css(style)
    css, kept, dropped = print_containing_only(css)
    skin, kept2, _ = chrome_only(media_print_bodies(css))
    stats.update(contenant=kept, ecartees=dropped, rejouees=kept2)
    full = f"""{css}

/* ===== Contenant de la feuille, rejoué hors média (l'aperçu et la capture
   sont en média screen ; l'impression garde ses règles @media print) ===== */
{skin}

{CHROME_CSS.replace('@@ETOILE@@', ETOILE_CLIP)}

{FIT_CSS}

{GLYPH_CSS}

{CARD_OVERRIDES.replace('@@OFFRE_H@@', f'{OFFRE_H:g}')}
"""
    return full, stats


def flow_markup(sid: str, blocks: list[str], tag_blocks: bool) -> str:
    """Le flux d'un onglet, tel que le site le rend (à l'heure du découpage près)."""
    out = []
    for i, b in enumerate(blocks):
        if tag_blocks:
            b = re.sub(r"^<(\w+)", rf'<\1 data-block="{i}"', b, count=1)
        out.append(b)
    return (f'<div class="carte-flow" data-sec="{sid}">\n<div class="tab-flow">\n'
            + "\n".join(out) + "\n</div>\n</div>")


def measure_doc(css: str, flows: dict[str, list[str]], viewport: int,
                idx_hash: str, css_hash: str) -> str:
    parts = []
    for sid in SECTIONS:
        inner = flow_markup(sid, flows[sid], tag_blocks=True)
        # probe : les hauteurs en deux colonnes de lignes des groupes TWOC,
        # mesurées à chaque largeur (le flux principal, lui, reste empilé pour
        # le compte des blocs et les hauteurs pleine largeur). DANS la
        # section, pour que la mesure le trouve.
        for group in TWOC.get(sid, ()):
            inner += (f'\n<div class="carte-flow carte-twocolsec-probe" data-sec="{sid}">\n'
                      + f'<div class="tab-flow">\n'
                      + probe_secs_markup(flows[sid], group) + "\n</div>\n</div>")
        parts.append(f'<div class="carte-measure-sec" data-sec="{sid}">\n'
                     + inner + "\n</div>")
    ratios = ",".join(f"{r:.2f}" for r in WIDTH_RATIOS)
    refs = json.dumps(MESURE_REFS, ensure_ascii=False)
    # le compte de blocs attendu par onglet : le générateur peut en avoir plus
    # que le site (le duo-grid des cocktails est séparé en deux panneaux)
    blocks = json.dumps({sid: len(flows[sid]) for sid in SECTIONS})
    return f"""<!DOCTYPE html>
<html lang="fr" class="carte-doc carte-measure" data-carte-viewport="{viewport}"
      data-carte-index-hash="{idx_hash}" data-carte-css-hash="{css_hash}"
      data-carte-width-ratios="{ratios}" data-carte-refs='{refs}'
      data-carte-blocks='{blocks}'>
<head>
<meta charset="UTF-8">
<title>Mesure — carte La Colline Gambetta</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800;900&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
<style>
{css}

{MEASURE_CSS}
</style>
</head>
<body>
<main id="print-document">
{"".join(parts)}
</main>
</body>
</html>
"""


# ------------------------------------------------------------------ métriques


def hashes(index_src: str, css: str) -> tuple[str, str]:
    return (hashlib.sha256(index_src.encode("utf-8")).hexdigest()[:16],
            hashlib.sha256(css.encode("utf-8")).hexdigest()[:16])


def load_metrics(index_src: str, css: str, flows, allow_stale: bool = False) -> dict:
    """Hauteurs de blocs, relevées dans la carte elle-même (voir carte-measure.html).

    Mesurer index.html ne suffirait plus : la carte a ses propres règles (les
    cocktails en une colonne, par exemple). Le document de mesure est donc écrit
    avec la CSS exactement identique à celle des feuilles, sans découpage ni mise
    à l'échelle, et l'empreinte (index.html + cette CSS) garde les chiffres
    alignés sur le document réel.
    """
    idx, sheet = hashes(index_src, css)
    if METRICS.exists():
        try:
            data = json.loads(METRICS.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{METRICS.name} illisible : {exc}")
        fresh = data.get("index_hash") == idx and data.get("css_hash") == sheet
        if fresh:
            return data
        if allow_stale:
            print(f"avertissement : mesures périmées (index {data.get('index_hash')} / css "
                  f"{data.get('css_hash')} vs {idx} / {sheet}) — --no-measure")
            return data
        print("mesures périmées (index.html ou CSS de carte modifiés) : on re-mesure")
    if not MEASURE.exists():
        raise SystemExit(f"outil de mesure manquant : {MEASURE}")
    MEASURE_DOC.write_text(measure_doc(css, flows, BASE_VIEWPORT, idx, sheet), encoding="utf-8")
    print(f"mesure : {MEASURE_DOC.name} écrit, rendu Chromium…")
    res = subprocess.run(["node", str(MEASURE)], cwd=ROOT)
    if res.returncode != 0:
        raise SystemExit("la mesure a échoué — `npm install`, puis node tools/measure_carte.mjs")
    data = json.loads(METRICS.read_text(encoding="utf-8"))
    if data.get("index_hash") != idx or data.get("css_hash") != sheet:
        raise SystemExit("l'empreinte enregistrée ne correspond pas : le document mesuré "
                         "n'est pas celui qui vient d'être écrit — relancer")
    return data


def check_blocks(metrics: dict, flows: dict[str, list[str]]) -> None:
    for sid, blocks in flows.items():
        seen = metrics["sections"][sid]["blocks"]
        mine = [block_signature(b) for b in blocks]
        if len(mine) != len(seen):
            raise SystemExit(f"{sid} : {len(mine)} blocs côté générateur, {len(seen)} mesurés — "
                             "structure de .tab-flow ou document de mesure désalignés.")
        # la sonde de mesure entoure chaque bloc d'un <block> : la balise mesurée
        # n'est donc pas celle de la carte ; le compte, lui, doit correspondre.


# ------------------------------------------------------------------ mise en page


def stack_or_2col(hs: list[float], hs2: list[float], group, gap: float,
                 cap: float) -> tuple[float, list[int]]:
    """Hauteur d'un groupe TWOC empilé, en basculant si besoin en deux colonnes.

    Tout le monde s'empile pleine largeur (comme fraîches + chaudes) ; si la
    hauteur cumulée dépasse la capacité de la feuille à cette largeur, on
    bascule en deux colonnes de lignes les sections les plus grandes (hauteur
    pleine largeur décroissante) jusqu'à ce que tout tienne. Un bloc dont la
    hauteur ne diminue pas en deux colonnes (le bandeau hh-banner) n'est
    jamais basculé. Renvoie (hauteur de l'unité, indices basculés).
    """
    g = [int(i) for i in group]
    gap *= max(0, len(g) - 1)
    hauteurs = {i: hs[i] for i in g}
    total = sum(hauteurs.values()) + gap
    if total <= cap:
        return total, []
    candidats = [i for i in g if hs2[i] is not None and hs2[i] < hs[i] - 1]
    candidats.sort(key=lambda i: -hs[i])
    mode: list[int] = []
    for i in candidats:
        if total <= cap:
            break
        hauteurs[i] = hs2[i]
        total = sum(hauteurs.values()) + gap
        mode.append(i)
    return total, mode


def merge_units(hs: list[float], gap: float, merge=(), twocol_totals=None) -> list[tuple[list[int], float]]:
    """Découpe les blocs en unités insécables.

    Les groupes de `merge` (listes d'indices de blocs) ne peuvent jamais être
    séparés entre deux feuilles : « Boissons fraîches » + « Boissons chaudes »
    doivent se partager la même page, et les quatre catégories suivantes la
    page d'après. Une unité fusionnée a la hauteur de ses blocs plus les gaps
    internes ; un groupe TWOC prend la hauteur mesurée de sa disposition en
    deux colonnes (twocol_totals, clé = tuple des indices) ; les blocs hors
    groupe restent des unités d'un seul bloc.
    """
    twocol_totals = twocol_totals or {}
    units: list[tuple[list[int], float]] = []
    used: set[int] = set()
    for group in merge:
        idx = [int(i) for i in group]
        h = twocol_totals.get(tuple(group))
        if h is None:
            h = sum(hs[i] for i in idx) + gap * (len(idx) - 1)
        units.append((idx, h))
        used.update(idx)
    for i, h in enumerate(hs):
        if i not in used:
            units.append(([i], h))
    return units


def pack_indices(hs: list[float], gap: float, cap: float, merge=(), twocol_totals=None) -> list[list[int]]:
    sheets: list[list[int]] = []
    cur: list[int] = []
    load = 0.0
    for idx, h in merge_units(hs, gap, merge, twocol_totals):
        add = h + (gap if cur else 0.0)
        if cur and load + add > cap:
            sheets.append(cur)
            cur, load = [], 0.0
            add = h
        cur.extend(idx)
        load += add
    if cur:
        sheets.append(cur)
    return sheets


def balanced_sheets(hs: list[float], gap: float, cap: float, merge=(), twocol_totals=None) -> list[list[int]]:
    """Même nombre de feuilles que le remplissage glouton, mais à poids égaux.

    Le glouton bourre la première feuille et laisse la dernière à moitié vide ;
    on remonte la charge maximale aussi bas que le permet ce nombre de feuilles,
    ce qui donne le rythme de lecture voulu — et surtout pas une page orpheline.
    """
    sheets = pack_indices(hs, gap, cap, merge, twocol_totals)
    if len(sheets) < 2:
        return sheets
    lo, hi = max(h for _, h in merge_units(hs, gap, merge, twocol_totals)), cap
    while hi - lo > 0.5:
        mid = (lo + hi) / 2
        if len(pack_indices(hs, gap, mid, merge, twocol_totals)) <= len(sheets):
            hi = mid
        else:
            lo = mid
    return pack_indices(hs, gap, hi, merge, twocol_totals)



def section_variants(metrics: dict, sid: str, w0: float) -> list[dict]:
    """Les hauteurs du flux mesurées à chaque largeur de composition candidate."""
    out = []
    for v in metrics["sections"][sid].get("variants", []):
        w = float(v["w"])
        if v.get("overflow", 0) > 1.5:
            continue                      # le contenu refuserait cette largeur
        if (v.get("overflow2col") or 0) > 1.5:
            continue        # une note déborderait en deux colonnes de lignes
        if not v["heights"] or min(v["heights"]) < 4:
            continue
        out.append({"w": w, "fit": ZONE_W_PX / w, "gap": v["gap"], "hs": v["heights"],
                   "heights2col": v.get("heights2col"),
                   "overflow2col": v.get("overflow2col", 0)})
    if not out:                            # mesure ancienne, sans variantes
        sec = metrics["sections"][sid]
        out = [{"w": w0, "fit": ZONE_W_PX / w0, "gap": sec["gap"],
                "hs": [b["h"] for b in sec["blocks"]]}]
    return out


def plan_variants(variants: list[dict], merge=(), twoc=()):
    """Pour chaque largeur : nombre de feuilles, facteur, et le remplissage obtenu.

    Le facteur est lié à la largeur par construction (f = zone / largeur) : border le
    cadre en largeur est automatique, et plus la composition est étroite plus les
    caractères grossissent — jusqu'au moment où la hauteur réclame une feuille de
    plus. On garde le plus petit nombre de feuilles, puis la plus grosse typo.

    À l'empilement on ne réserve que GAPPACK px entre panneaux : la hauteur restante
    sera comblée ensuite par la justification, qui repousse le bas de la feuille sur le
    cadre. Compter avec le jeu complet du site pénaliserait une composition large d'un
    filet qui, justement, est la variable d'ajustement. Les groupes TWOC portent
    la hauteur de leur empilement (gaps internes compris), avec les sections
    passées en deux colonnes de lignes si la hauteur manque (stack_or_2col).
    """
    out = []
    for v in variants:
        gap_pack = min(v["gap"], GAP_PACK)
        cap = ZONE_H_PX * SAFETY / v["fit"]
        twocol_totals, modes = {}, {}
        hs2 = v.get("heights2col")
        if hs2:
            for g in twoc:
                h, mode = stack_or_2col(v["hs"], hs2, g, gap_pack, cap)
                twocol_totals[tuple(g)] = h
                modes[tuple(g)] = mode
        units = merge_units(v["hs"], gap_pack, merge, twocol_totals)
        sheets = balanced_sheets(v["hs"], gap_pack, cap, merge, twocol_totals)
        loads = []
        for idx in sheets:
            in_sheet = [uh for uidx, uh in units if uidx[0] in idx]
            loads.append(sum(in_sheet) + gap_pack * (len(in_sheet) - 1))
        fill = min(load * v["fit"] / ZONE_H_PX for load in loads)
        out.append({"v": v, "sheets": sheets, "loads": loads,
                    "count": len(sheets), "fill": fill, "twocol_mode": modes})
    return out


def choose_section(metrics: dict, sid: str, w0: float, f_uniform: float | None = None,
                   merge=(), twoc=()):
    """Meilleure (largeur de composition, facteur, découpage) pour un onglet."""
    plans = plan_variants(section_variants(metrics, sid, w0), merge, twoc)
    if f_uniform is not None:
        cible = min(plans, key=lambda p: abs(p["v"]["fit"] - f_uniform))
        plans = [cible]
    if not plans:
        raise SystemExit(f"{sid} : aucune largeur de composition exploitable")
    # sous le plancher de lisibilité on ne descend que si le nombre de feuilles l'exige
    count_min = min(p["count"] for p in plans)
    acceptable = [p for p in plans if p["count"] == count_min]
    pool = acceptable or [p for p in plans if p["count"] == count_min]

    def fit_final(plan) -> float:
        """Le facteur réellement atteignable : la garde de hauteur (voir main)
        peut réduire le fit de largeur — une unité insécable, TWOC ou non, ne
        peut pas être séparée pour border la feuille, et le simple fit de
        largeur surestime alors la typo réalisable."""
        v = plan["v"]
        fits = []
        for idx, load in zip(plan["sheets"], plan["loads"]):
            is_twocol = tuple(idx) in twoc
            mode = plan.get("twocol_mode", {}).get(tuple(idx), []) if is_twocol else []
            justify = not is_twocol or not mode
            k = len(idx) if justify else 1
            gap = justify_gaps(load, k, v["gap"], v["fit"]) if justify \
                else min(v["gap"], GAP_PACK)
            total = load + (0 if not justify else max(0, len(idx) - 1) * (gap - GAP_PACK))
            cap = ZONE_H_PX * SAFETY
            if total * v["fit"] > cap:
                fits.append(cap / total)   # la garde haute recadre (débordement)
            else:
                fits.append(v["fit"])
        return min(fits)

    pool.sort(key=lambda p: (0 if p["v"]["fit"] >= FIT_MIN - 1e-9 else 1,
                             -round(fit_final(p), 4),
                             -round(p["v"]["fit"], 4)))
    return pool[0]


def justify_gaps(load: float, k: int, gap: float, fit: float) -> float:
    """Écart entre panneaux qui étire la feuille jusqu'en bas du cadre.

    Une page remplie à 75 % n'a pas un problème de caractères mais de souffle : le
    reste de la hauteur est réparti dans les inter-panneaux, borné à
    JUSTIFY_MAX_RATIO fois l'écart du site pour que cela reste une carte et non une
    mise en page espacée au triple.
    """
    if k < 2:
        return gap
    want = (ZONE_H_PX * SAFETY / fit - load) / (k - 1)
    return round(max(gap, min(want, gap * JUSTIFY_MAX_RATIO)), 2)


def garde_uniformite(metrics: dict, chosen: dict) -> None:
    """La cible de hauteur doit coller au carton de référence, à la largeur choisie."""
    for sid, refs in MESURE_REFS.items():
        plan = chosen.get(sid)
        if not plan:
            continue
        var = plan["v"]
        for nom in refs:
            mesure = (var.get("refs") or {}).get(nom)
            if mesure is None:
                continue          # mesure ancienne : la clé n'y est pas, on re-mesurera
            if abs(mesure - OFFRE_H) > OFFRE_H_TOLERANCE:
                raise SystemExit(
                    f"{sid} : le carton « {nom} » mesure {mesure:.0f} px à la largeur "
                    f"{var['w']:g} px, et OFFRE_H vaut {OFFRE_H} px. Les cartons « Formule Duo » "
                    f"et « La formule complète » ne seraient plus du même gabarit — porter "
                    f"OFFRE_H à {mesure:.0f} dans tools/build_carte.py (et re-mesurer).")


def layout(metrics: dict, uniforme: bool = False):
    """Découpage et cadrage de chaque onglet, bord à bord dans le cadre.

    En mode uniforme (défaut), un seul facteur sert à toute la carte — la
    page des plats (le plus petit corps qui tienne, 7,6 pt) fait gabarit —
    sauf la page « Nos Menus » (UNIFORME_EXCEPT), qui garde sa taille propre."""
    w0 = min(v["flow_width"] for v in metrics["sections"].values())
    if w0 < 300:
        raise SystemExit(f"largeur de composition mesurée à {w0} px : la mesure est fausse "
                         "(onglets non rendus ?) — relancer `node tools/measure_carte.mjs`.")
    par_section = {sid: plan_variants(section_variants(metrics, sid, w0),
                                   MERGE.get(sid, ()), TWOC.get(sid, ()))
                   for sid in SECTIONS}
    f_uniform = None
    if uniforme:
        # Une seule échelle pour tout le document — sauf les onglets de
        # UNIFORME_EXCEPT (la page « Nos Menus » garde son corps propre). À
        # facteur unique, la largeur de composition est la même partout
        # (w = zone / f) : on cherche donc la PLUS PETITE largeur — donc le
        # plus gros caractère — qui laisse chaque onglet au nombre de feuilles
        # qu'il atteint dans sa meilleure configuration. Grossir encore
        # coûterait une feuille, et l'enveloppe de 10 pages est un plafond dur.
        uniforme_sids = [s for s in SECTIONS if s not in UNIFORME_EXCEPT]
        largeurs = sorted({p["v"]["w"] for sid in uniforme_sids
                           for p in par_section[sid]})
        candidats = []
        for w in largeurs:
            total, complet = 0, True
            for sid in uniforme_sids:
                cand = [p for p in par_section[sid] if p["v"]["w"] == w]
                if not cand:
                    complet = False
                    break
                total += min(p["count"] for p in cand)
            if complet:
                candidats.append((total, w))
        if candidats:
            meilleurs = min(total for total, _ in candidats)
            f_uniform = ZONE_W_PX / min(w for total, w in candidats if total == meilleurs)
    chosen = {sid: choose_section(metrics, sid, w0,
                                  None if sid in UNIFORME_EXCEPT else f_uniform,
                                  MERGE.get(sid, ()), TWOC.get(sid, ()))
              for sid in SECTIONS}
    return chosen, w0, f_uniform


def compose_pages(src: str, metrics: dict, flows: dict, chosen: dict, w0: float,
                  airs: dict | None = None):
    """Toutes les feuilles : la couverture, puis une feuille par page de contenu.

    airs : {n: (air_side, air_title, rows, titles, free)} — l'aération posée
    sur la feuille n (voir main, passe d'aération).
    """
    pts = 72.0 / 96.0     # 1 px CSS = 0,75 pt
    pages: list[str] = [page_shell(1, "cover", "", extract_cover(src))]
    labels = ["couverture (site, plein cadre par construction)"]
    tailles = []
    infos: dict[int, dict] = {}
    for sid in SECTIONS:
        plan = chosen[sid]
        var, sheets, loads = plan["v"], plan["sheets"], plan["loads"]
        for idx, load in zip(sheets, loads):
            n = len(pages) + 1
            fit = var["fit"]
            is_twocol = tuple(idx) in TWOC.get(sid, ())
            mode = plan.get("twocol_mode", {}).get(tuple(idx), []) if is_twocol else []
            # sécurité : une feuille qui dépasserait malgré tout se réduit elle-même.
            # La garde porte sur le total RÉEL de la page — blocs + inter-panneaux
            # justifiés (le load du plan ne compte que GAP_PACK entre blocs, et la
            # justification repousse ensuite le bas de la feuille sur le cadre : une
            # page à 101 % de blocs débordait sans que load * fit ne le voie). Une
            # feuille TWOC dont AUCUNE section n'est basculée en deux colonnes se
            # comporte comme une page classique : ses inter-panneaux se justifient
            # pour border le cadre. Dès qu'une section est basculée (page dense),
            # on ne justifie plus : les écarts internes du load sont comptés à
            # GAP_PACK et le row-gap posé sur la page doit être GAP_PACK lui aussi,
            # pas le gap du site, sinon le rendu dépasserait le calcul de la garde.
            justify = not is_twocol or not mode
            k = len(idx) if justify else 1
            gap = justify_gaps(load, k, var["gap"], fit) if justify \
                else min(var["gap"], GAP_PACK)
            total = load + (0 if not justify else max(0, len(idx) - 1) * (gap - GAP_PACK))
            base_w = var["w"]
            if total * fit > ZONE_H_PX * SAFETY:
                # La hauteur plafonne : la feuille se réduit jusqu'à tenir
                # debout. Sans rien faire de plus, elle laisserait un blanc à
                # droite (la composition resterait à la largeur du site) ; on
                # l'élargit donc d'autant — la page se tient sur toute la
                # largeur ET toute la hauteur du A4. Borné à la plus large
                # composition mesurée, où aucune section ne déborde
                # horizontalement.
                fit = ZONE_H_PX * SAFETY / total
                base_w = min(ZONE_W_PX / fit, max(WIDTH_RATIOS) * metrics["base_width"])
                gap = justify_gaps(load, k, var["gap"], fit) if justify \
                    else min(var["gap"], GAP_PACK)
            air_side = air_title = None
            air_rows = air_titles = 0
            if airs and n in airs:
                air_side, air_title, air_rows, air_titles, _, _ = airs[n]
            content = secs_markup(flows[sid], idx, mode) if is_twocol \
                else "\n".join(flows[sid][i] for i in idx)
            pages.append(page_shell(n, sid, content,
                                    fit=fit, base_w=base_w, row_gap=gap,
                                    air_side=air_side, air_title=air_title))
            tailles.append(TITRE_SITE_PX * fit * pts)
            hauteur = (load if not justify
                       else load + max(0, len(idx) - 1) * (gap - GAP_PACK)) * fit
            if air_side is not None:
                # la feuille se remplit jusqu'au plancher de garde : la hauteur
                # finale vaut la hauteur RÉELLEMENT mesurée (rendu) + l'aération
                # distribuée — le plan (metrics) peut différer du rendu
                hauteur = airs[n][5] + airs[n][4]
            labels.append(
                f"{sid:9} blocs {'+'.join(str(i + 1) for i in idx):9} — "
                f"hauteur {hauteur / ZONE_H_PX * 100:3.0f} %, "
                f"largeur {base_w * fit / ZONE_W_PX * 100:3.0f} %, "
                f"intitulés {TITRE_SITE_PX * fit * pts:4.1f} pt"
                + (" ⚠ sous le plancher" if TITRE_SITE_PX * fit * pts < TITRE_MIN_PT - 0.05 else "")
                + (f", {len(mode)} sections en 2 colonnes de lignes" if is_twocol and mode else "")
                + ("".join([
                    f", aéré interligne +{air_side:.1f} px" if air_rows else "",
                    (f", titres +{air_title:.1f} px" if air_titles else ""),
                    ]) if air_side is not None else "")
                + f" · composition {base_w:g} px × {fit:.4f}"
                + (f", inter-panneaux {gap:g} px" if gap > var["gap"] + 0.5 else ""))
            infos[n] = {"sid": sid, "fit": fit}
    return pages, labels, tailles, infos


def assemble_html(metrics: dict, w0: float, css: str, pages: list[str]) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr" class="carte-doc" data-carte-viewport="{metrics['viewport']}" \
      data-carte-index-hash="{metrics['index_hash']}" data-carte-base-w="{w0:g}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>La Colline Gambetta — Carte des menus</title>
<link rel="icon" type="image/png" href="favicon.png">
<link rel="apple-touch-icon" href="favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800;900&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
<style>
{css}

html.carte-doc {{
  /* repli : la largeur du site ; chaque feuille porte la sienne en style inline */
  --carte-base-w: {w0:g}px;
}}
</style>
</head>
<body>
<main id="print-document" aria-label="Carte des menus et boissons à imprimer">
{"".join(pages)}
</main>
</body>
</html>
"""


def aerate_pages(infos: dict[int, dict], pages: list[str], css: str,
                 metrics: dict, w0: float, src: str, flows: dict,
                 chosen: dict) -> tuple[list[str], list[str], dict[int, dict]]:
    """Passe d'aération : mesure chaque feuille rendue (mêmes fontes que le
    PDF), répartit l'espace libre avant le plancher de garde entre l'interligne
    des lignes et la marge sous les titres, recompose, puis vérifie le rendu.

    Les hauteurs du plan (metrics) sont mesurées dans le document de mesure,
    sans feuille ni échelle ; le rendu réel d'une feuille peut s'en écarter
    (fontes, arrondis) — on ne distribue donc que l'espace constaté sur le
    rendu. La classe carte-aerate et les variables d'air ne sont posées que
    par cette passe : le document de mesure et la carte sans aération restent
    les mêmes qu'avant.
    """
    res = subprocess.run(["node", str(AERATE)], cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"l'aération a échoué :\n{res.stdout}{res.stderr}")
    try:
        meas = {m["page"]: m for m in json.loads(res.stdout)}
    except json.JSONDecodeError as exc:
        raise SystemExit(f"aerate_carte.mjs : sortie illisible ({exc})")
    attentes = {"entrees": 12, "plats": 12, "desserts": 12,
                "boissons": 3, "cocktails": 3, "vins": 5}
    airs: dict[int, tuple[float, float, int, int, float]] = {}
    for n, info in infos.items():
        m = meas.get(n)
        if not m or m.get("kind") == "cover":
            continue
        # contrôle des bases : la CSS d'aération compose sur des paddings
        # connus — si une règle du site les a changés, on ne devine pas.
        if m["kind"] in attentes:
            tag, attendu = ("td", attentes[m["kind"]]) if m["kind"] == "vins" else ("article", attentes[m["kind"]])
            base = m.get("bases", {}).get(tag)
            if m["rows"] and base is not None and abs(base - attendu) > 0.5:
                raise SystemExit(
                    f"aération {m['kind']} (page {n}) : base de ligne {base} px, "
                    f"{attendu} px attendu — la CSS des lignes a changé, revoir "
                    f"le bloc « Aération » de CARD_OVERRIDES.")
        free = ZONE_H_PX * SAFETY - m["flowH"]
        rows, titles = m["rows"], m["titles"]
        if free > 0.5 and rows + titles > 0:
            air_side = free / (2 * info["fit"] * (rows + titles))
            airs[n] = (round(max(air_side, 0.0), 2), round(2 * max(air_side, 0.0), 2),
                       rows, titles, free, m["flowH"])
    if not airs:
        return pages, [], {}
    pages2, labels2, _, infos2 = compose_pages(src, metrics, flows, chosen, w0, airs)
    OUT.write_text(remplacer_glyphes_a_risque(assemble_html(metrics, w0, css, pages2)),
                   encoding="utf-8")
    # garde : aucune feuille au-dessus du plancher (tolérance d'arrondi). Si une
    # feuille déborde malgré tout, on rabat son aération au prorata du rendu.
    for _ in range(2):
        res = subprocess.run(["node", str(AERATE)], cwd=ROOT, capture_output=True, text=True)
        meas2 = {m["page"]: m for m in json.loads(res.stdout)} if res.returncode == 0 else {}
        mauvaises = [n for n in airs
                     if meas2.get(n, {}).get("flowH", 0) > ZONE_H_PX * SAFETY + 2]
        if not mauvaises:
            break
        for n in mauvaises:
            A, T, rows, titles, free, flowH0 = airs[n]
            m1 = meas.get(n, {}).get("flowH", 0)
            m2 = meas2.get(n, {}).get("flowH", 0)
            croissance = max(m2 - m1, 0.01)
            garde = max(0.0, (ZONE_H_PX * SAFETY - m1) / croissance)
            airs[n] = (round(A * garde, 2), round(T * garde, 2), rows, titles, free, flowH0)
        pages2, labels2, _, infos2 = compose_pages(src, metrics, flows, chosen, w0, airs)
        OUT.write_text(remplacer_glyphes_a_risque(assemble_html(metrics, w0, css, pages2)),
                       encoding="utf-8")
    else:
        raise SystemExit("aération : une feuille déborde encore après rabattement — "
                         "relancer et vérifier la CSS d'aération")
    return pages2, labels2, airs


def main() -> None:
    src = index_text()
    flows = {sid: split_duo_grids(split_flow(section_flow(src, sid))) for sid in SECTIONS}
    # Les blocs insécables (MERGE) portent data-merge="1" dans la carte comme
    # dans le document de mesure : la CSS de la carte les reconnait ainsi.
    for sid, groups in MERGE.items():
        for group in groups:
            for i in group:
                flows[sid][i] = re.sub(r"^<(\w+)", r'<\1 data-merge="1"',
                                       flows[sid][i], count=1)
                # notes remontées dans la ligne de chaque article
                flows[sid][i] = inline_notes(flows[sid][i])
    # vins : le producteur après le tiret passe en sans gras (comme les notes)
    for sid in SECTIONS:
        flows[sid] = [wine_producer_light(b) for b in flows[sid]]

    css, stats = compose_css(src)
    print("CSS du site : neutralisation levée → " + ", ".join(f"{k} {v}" for k, v in stats.items()))

    allow_stale = "--no-measure" in sys.argv
    metrics = load_metrics(src, css, flows, allow_stale)
    check_blocks(metrics, flows)
    chosen, w0, f_uniform = layout(metrics, UNIFORME)
    garde_uniformite(metrics, chosen)

    pages, labels, tailles, infos = compose_pages(src, metrics, flows, chosen, w0)
    html = remplacer_glyphes_a_risque(assemble_html(metrics, w0, css, pages))
    OUT.write_text(html, encoding="utf-8")

    # Aération : l'espace libre du bas de chaque feuille revient dans
    # l'interligne des lignes et sous les titres de panneau, jusqu'au plancher
    # de garde — jamais au-delà (la passe vérifie le rendu et rabat si besoin).
    if "--no-aeration" not in sys.argv:
        pages, labels_aeres, airs = aerate_pages(infos, pages, css, metrics, w0, src, flows, chosen)
        if airs:
            labels = labels[:1] + labels_aeres[1:]
            print(f"  aération : {len(airs)} feuilles aérées — interligne "
                  f"+{min(a[0] for a in airs.values()):.1f} à +{max(a[0] for a in airs.values()):.1f} "
                  f"px/ligne, titres +{min(a[1] for a in airs.values()):.1f} à "
                  f"+{max(a[1] for a in airs.values()):.1f} px, plafond de garde "
                  f"{SAFETY * 100:.1f} %")

    total = sum(len(p["sheets"]) for p in chosen.values())
    print(f"\ncarte.html : {len(pages)} feuilles ({total} de contenu) — fenêtre "
          f"{metrics['viewport']} px, site composé à {w0:g} px")
    print(f"  zone utile {ZONE_W_MM:.1f} × {SHEET_H_MM - ZONE_TOP_MM - ZONE_BOTTOM_MM:.1f} mm, "
          f"soit {JEU_DANS_CADRE_MM:.1f} mm dans le filet doré · "
          + (f"échelle unique × {f_uniform:.4f}" if f_uniform
             else "largeur de composition réglée par onglet"))
    print(f"  intitulés (17,9 px site) de {min(tailles):.1f} pt à {max(tailles):.1f} pt sur le papier")
    for label in labels:
        print(f"  {label}")


if __name__ == "__main__":
    main()
