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

Options : --no-measure (réutiliser carte-metrics.json même périmé).
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

SECTIONS = ["entrees", "plats", "desserts", "menus", "boissons", "vins", "cocktails"]

# Géométrie de la feuille, en accord avec les règles « contenant » plus bas.
SHEET_H_MM = 297.0
ZONE_LEFT_MM = 13.0
ZONE_TOP_MM = 47.0
ZONE_BOTTOM_MM = 27.0
ZONE_W_MM = 184.0
PX_PER_MM = 96 / 25.4
ZONE_W_PX = ZONE_W_MM * PX_PER_MM                                    # 695,43 px
ZONE_H_PX = (SHEET_H_MM - ZONE_TOP_MM - ZONE_BOTTOM_MM) * PX_PER_MM  # 842,86 px

SAFETY = 0.985     # les hauteurs sont mesurées sur le site, pas dans la feuille
FIT_FLOOR = 0.90   # on ne descend pas de plus de 10 % sous l'échelle de composition


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
               fit: float | None = None) -> str:
    if kind == "cover":
        return (
            f'<div class="print-page-frame"><section class="print-page print-page--cover" '
            f'id="carte-p{number}" data-page="{number}">\n{cover_html}\n'
            f'<div class="print-page__number">{number}</div>\n</section></div>'
        )
    fit_attr = f' style="--carte-fit: {fit:.6f}"' if fit else ""
    return (
        f'<div class="print-page-frame"><section class="print-page print-page--{kind}" '
        f'id="carte-p{number}" data-page="{number}">\n{HEADER}\n'
        f'<div class="print-page__content">\n'
        f'<div class="carte-flow" data-sec="{kind}"{fit_attr}>\n<div class="tab-flow">\n'
        f"{content}\n"
        f"</div>\n</div>\n</div>\n{FOOTER}\n"
        f'<div class="print-page__number">{number}</div>\n</section></div>'
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
html.carte-doc .print-page__number { bottom: 6.2mm !important; }

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
   qui imprime le ferait sortir en carré. */
html.carte-doc .print-page i.carte-star {
  display: inline-block;
  width: .6em;
  height: .6em;
  vertical-align: .04em;
  background: currentColor;
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 62%);
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
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
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
html.carte-doc .print-page--cover .print-page__number {
  display: none !important;
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
html.carte-doc .carte-flow {
  width: var(--carte-base-w);
  margin-left: var(--carte-pad-x, 0px);
  transform: scale(var(--carte-fit));
  transform-origin: top left;
}
/* Un libellé plus long qu'une colonne ne doit jamais élargir le bloc : sinon la
   mise à l'échelle ne correspond plus à la mesure et le prix sortirait de la
   feuille. */
html.carte-doc .carte-flow .tab-flow > * { min-width: 0; }
html.carte-doc .carte-flow .tab-flow { max-width: none; }
""" % dict(left=ZONE_LEFT_MM, zone_w=ZONE_W_MM, top=ZONE_TOP_MM, bottom=ZONE_BOTTOM_MM)


# Étoiles et flèches du site sont des glyphes « ✦ »/« → » : absents de Cinzel,
# ils sortiraient en carré sur une machine sans police de secours. Ils sont donc
# dessinés en CSS, à la place exacte où le site les écrit.
GLYPH_CSS = """
html.carte-doc .print-page .panel__title::before,
html.carte-doc .print-page .panel__title::after,
html.carte-doc .print-page .choice-card li::before {
  content: '' !important;
  display: inline-block !important;
  width: .78em;
  height: .78em;
  background: currentColor;
  text-shadow: none !important;
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 62%);
}
html.carte-doc .print-page i.carte-arrow {
  display: inline-block;
  width: 1.15em;
  height: .12em;
  vertical-align: .18em;
  background: currentColor;
  clip-path: polygon(0 0, 72% 0, 72% -70%, 100% 50%, 72% 170%, 72% 100%, 0 100%);
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


def load_metrics(allow_stale: bool = False) -> dict:
    digest = hashlib.sha256(index_text().encode("utf-8")).hexdigest()[:16]
    if METRICS.exists():
        try:
            data = json.loads(METRICS.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{METRICS.name} illisible : {exc}")
        if data.get("index_hash") == digest:
            return data
        if allow_stale:
            print(f"avertissement : empreinte {data.get('index_hash')} ≠ {digest} — "
                  "mesures périmées utilisées (--no-measure)")
            return data
    if not MEASURE.exists():
        raise SystemExit(f"outil de mesure manquant : {MEASURE}")
    print("mesure des hauteurs sur le site (Chromium, fontes réelles)…")
    res = subprocess.run(["node", str(MEASURE)], cwd=ROOT)
    if res.returncode != 0:
        raise SystemExit("la mesure a échoué — `npm install`, puis node tools/measure_carte.mjs")
    data = json.loads(METRICS.read_text(encoding="utf-8"))
    if data.get("index_hash") != digest:
        raise SystemExit("l'empreinte enregistrée ne correspond toujours pas : "
                         "index.html a changé pendant la mesure, relancer")
    return data


def check_blocks(metrics: dict, flows: dict[str, list[str]]) -> None:
    for sid, blocks in flows.items():
        seen = metrics["sections"][sid]["blocks"]
        if len(blocks) != len(seen):
            raise SystemExit(
                f"{sid} : le générateur trouve {len(blocks)} blocs, le navigateur {len(seen)} — "
                "la structure de .tab-flow a changé, la pagination serait fausse. "
                "Relancer node tools/measure_carte.mjs."
            )
        for mine, m in zip((block_signature(b) for b in blocks), seen):
            if mine[0] != m["tag"]:
                raise SystemExit(f"{sid} : bloc {m['i']} <{mine[0]}> ici, <{m['tag']}> mesuré — "
                                 "mesure à refaire.")


def plan_sheets(metrics: dict, flows: dict[str, list[str]]):
    """Choisit l'échelle de composition puis répartit les blocs sur les feuilles."""
    flow_w = min(v["flow_width"] for v in metrics["sections"].values())
    base_fit = ZONE_W_PX / flow_w

    def pack(fit: float):
        cap = ZONE_H_PX / fit * SAFETY
        plan: dict[str, list[tuple[list[int], float]]] = {}
        for sid in SECTIONS:
            sec = metrics["sections"][sid]
            gap = sec["gap"]
            sheets: list[list[int]] = []
            cur: list[int] = []
            load = 0.0
            for i, block in enumerate(sec["blocks"]):
                add = block["h"] + (gap if cur else 0.0)
                if cur and load + add > cap:
                    sheets.append(cur)
                    cur, load = [], 0.0
                    add = block["h"]
                cur.append(i)
                load += add
            if cur:
                sheets.append(cur)
            plan[sid] = [(idx, sum(sec["blocks"][i]["h"] for i in idx) + gap * (len(idx) - 1))
                         for idx in sheets]
        return plan, cap

    best = None
    fit = base_fit
    while fit >= base_fit * FIT_FLOOR:
        plan, cap = pack(fit)
        count = sum(len(v) for v in plan.values())
        worst_fill = min(load / (ZONE_H_PX / fit) for v in plan.values() for _, load in v)
        score = (count, -round(worst_fill, 3))
        if best is None or score < best[0]:
            best = (score, fit, plan, cap)
        fit *= 0.995
    _, fit, plan, cap = best
    note = "" if abs(fit - base_fit) < 1e-9 else (
        f" (l'échelle de composition {base_fit:.4f} ramenée à {fit:.4f} pour éviter une feuille quasi vide)")
    return base_fit, fit, plan, cap, flow_w, note


def main() -> None:
    src = index_text()
    allow_stale = "--no-measure" in sys.argv
    style = src.split("<style>", 1)[1].split("</style>", 1)[0]
    flows = {sid: split_flow(section_flow(src, sid)) for sid in SECTIONS}

    metrics = load_metrics(allow_stale)
    check_blocks(metrics, flows)
    base_fit, fit, plan, cap, flow_w, note = plan_sheets(metrics, flows)

    css, stats = rescope_site_css(style)
    print("CSS du site : " + ", ".join(f"{k} → {v}" for k, v in stats.items()))
    css, kept, dropped = print_containing_only(css)
    # Le contenant doit aussi s'appliquer à l'écran : c'est là que la feuille est
    # rendue, photographiée, et vue dans l'aperçu. On le re-déclare hors média.
    skin, kept2, _ = chrome_only(media_print_bodies(css))
    print(f"@media print du site : {kept} règles de contenant conservées sur place, "
          f"{dropped} règles de contenu écartées (le site garde la main) ; "
          f"{kept2} rejouées hors média pour l'écran")
    cover = extract_cover(src)

    pad_x = max(0.0, (ZONE_W_PX / fit - flow_w) / 2)
    pages: list[str] = [page_shell(1, "cover", "", cover)]
    labels = ["couverture (site, encadrée sur la feuille)"]
    for sid in SECTIONS:
        for idx, load in plan[sid]:
            n = len(pages) + 1
            sheet_fit = fit
            if load > cap:            # un bloc plus haut qu'une feuille : on le serre, on le dit
                sheet_fit = ZONE_H_PX * SAFETY / load
            pages.append(page_shell(n, sid, "\n".join(flows[sid][i] for i in idx),
                                    fit=None if abs(sheet_fit - fit) < 1e-9 else sheet_fit))
            pct = load * fit / ZONE_H_PX * 100
            labels.append(f"{sid:9} blocs {'+'.join(str(i + 1) for i in idx):9} — {pct:4.0f} % de la hauteur utile")

    html = f"""<!DOCTYPE html>
<html lang="fr" class="carte-doc" data-carte-viewport="{metrics['viewport']}" data-carte-base-w="{flow_w:g}">
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

/* ===== Contenant de la feuille, rejoué hors média (l'aperçu et la capture
       sont en média screen ; l'impression garde ses règles @media print) ===== */
{skin}

{CHROME_CSS}

{FIT_CSS}

{GLYPH_CSS}

html.carte-doc {{
  --carte-base-w: {flow_w:g}px;
  --carte-fit: {fit:.6f};
  --carte-pad-x: {pad_x:.2f}px;   /* le bloc réduit est centré dans la zone utile */
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
    html = remplacer_glyphes_a_risque(html)
    OUT.write_text(html, encoding="utf-8")

    pts = 72.0 / 96.0     # 1 px CSS = 0,75 pt
    print(f"\ncarte.html : {len(pages)} feuilles — composition {metrics['viewport']} px "
          f"× {flow_w:g} px, réduite × {fit:.4f}{note}")
    print(f"  zone utile {ZONE_W_PX:.0f} × {ZONE_H_PX:.0f} px ; titres site 16,3 px → "
          f"{16.3 * fit * pts:.1f} pt, intitulés 17,9 px → {17.9 * fit * pts:.1f} pt")
    for label in labels:
        print(f"  {label}")


if __name__ == "__main__":
    main()
