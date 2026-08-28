#!/usr/bin/env python3
"""Build carte.html from index.html — same PC styles, A4 pages, nav order."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
OUT = ROOT / "carte.html"


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
    parts = []
    rest = inner.strip()
    while rest:
        rest = rest.lstrip()
        if not rest:
            break
        if rest.startswith("<article"):
            node, rest = take_element(rest, "article")
            parts.append(node)
        elif rest.startswith("<div"):
            node, rest = take_element(rest, "div")
            parts.append(node)
        elif rest.startswith("<p"):
            node, rest = take_element(rest, "p")
            parts.append(node)
        else:
            break
    return parts


def section_flow(sid: str) -> str:
    start = INDEX.find(f'<section id="{sid}"')
    if start < 0:
        raise SystemExit(f"missing section {sid}")
    nxt = INDEX.find("<section id=", start + 10)
    block = INDEX[start:nxt] if nxt > 0 else INDEX[start:]
    i = block.find('<div class="tab-flow">')
    inner = block[i + len('<div class="tab-flow">') :]
    inner = inner.rsplit("</div>", 1)[0]
    return inner


def media_print_bodies(css: str) -> str:
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


def extract_cover() -> str:
    start = INDEX.find('<div class="cover-page">')
    node, _ = take_element(INDEX[start:], "div")
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


def page_shell(number: int, kind: str, content: str, cover_html: str | None = None) -> str:
    if kind == "cover":
        return f'''<div class="print-page-frame"><section class="print-page print-page--cover" id="carte-p{number}" data-page="{number}">
{cover_html}
<div class="print-page__number">{number}</div>
</section></div>'''
    header = '''<header class="print-page__header">
<div class="print-page__kicker">LA</div>
<div class="print-page__brand">COLLINE</div>
<div class="print-page__brand print-page__brand--sub">GAMBETTA</div>
<div class="print-page__meta">BAR • RESTAURANT • PARIS 20ᵉ</div>
<div class="print-page__meta print-page__meta--sub">✦ FAIT MAISON • SERVICE CONTINU • TERRASSE ✦</div>
</header>'''
    footer = '''<footer class="print-page__footer">
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
</footer>'''
    kinds = " ".join(f"print-page--{k}" for k in kind.split())
    return f'''<div class="print-page-frame"><section class="print-page {kinds}" id="carte-p{number}" data-page="{number}">
{header}
<div class="print-page__content tab-flow">
{content}
</div>
{footer}
<div class="print-page__number">{number}</div>
</section></div>'''


EXTRA_CSS = r"""
/* ===== Carte A4 : équilibre, cadres hors textes, mêmes styles PC ===== */
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

/* Titres pastilles violettes : une seule taille partout. */
html.carte-doc .print-page .panel__title {
  font-size: 9.2pt !important;
  letter-spacing: .12em !important;
  padding: 1.7mm 6mm !important;
}

/* Rythme régulier lignes / colonnes. */
html.carte-doc .print-page .food-card-grid,
html.carte-doc .print-page .food-card-grid--wide {
  gap: 2.6mm 8mm !important;
}
html.carte-doc .print-page .price-list:not(.price-list--cols) {
  column-gap: 8mm !important;
}
html.carte-doc .print-page .price-list--cols,
html.carte-doc .print-page .hh-list--cols {
  column-gap: 8mm !important;
}

html.carte-doc .print-page {
  display: block !important;
  width: 210mm;
  height: 297mm;
  margin: 0 auto 18px;
  position: relative;
  overflow: hidden !important;
  background: var(--cream);
  color: var(--royal-violet-ink);
  box-shadow: 0 16px 40px rgba(0,0,0,.35);
}


/* Les blocs grandissent : plus de trou entre les rubriques. */
html.carte-doc .print-page__content {
  display: flex !important;
  flex-direction: column !important;
  justify-content: stretch !important;
  gap: 3.6mm !important;
  overflow: hidden !important;
}
html.carte-doc .print-page__content > .panel,
html.carte-doc .print-page__content > .menus-duo,
html.carte-doc .print-page__content > .duo-grid {
  min-width: 0;
  min-height: 0;
  flex: 0 1 auto;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden;
}
html.carte-doc .print-page__content > .panel:last-child,
html.carte-doc .print-page__content > .menus-duo:last-child,
html.carte-doc .print-page__content > .duo-grid:last-child {
  flex: 1 1 auto;
}
html.carte-doc .print-page .panel__head {
  margin-bottom: 2mm !important;
}
html.carte-doc .print-page .food-card-grid,
html.carte-doc .print-page .food-card-grid--wide,
html.carte-doc .print-page .wine-table {
  flex: 1 1 auto;
  align-content: start;
  row-gap: 2.4mm;
}
html.carte-doc .print-page .price-list:not(.price-list--cols) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 8mm;
  flex: 1 1 auto;
  align-content: start;
}

/* Grilles PC forcées sous 1480px / 860px. */
html.carte-doc .print-page .food-card-grid,
html.carte-doc .print-page .food-card-grid--wide,
html.carte-doc .print-page .price-list--cols,
html.carte-doc .print-page .hh-list--cols {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  align-items: stretch !important;
  flex: 1 1 auto;
}
html.carte-doc .print-page .price-list__col,
html.carte-doc .print-page .hh-list__col {
  display: flex !important;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 0;
  height: auto;
}
html.carte-doc .print-page .offer-grid,
html.carte-doc .print-page .duo-grid,
html.carte-doc .print-page .menus-duo {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}
html.carte-doc .print-page .choice-grid {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}
html.carte-doc .print-page .price-line__row { flex-wrap: nowrap !important; }
html.carte-doc .print-page .price-line__dots { display: block !important; }
html.carte-doc .print-page .hh-line__name,
html.carte-doc .print-page .price-line__name,
html.carte-doc .print-page .food-card__head h5,
html.carte-doc .print-page .wine-name,
html.carte-doc .print-page .beer-row__name {
  min-width: 0 !important;
  overflow-wrap: anywhere;
}
html.carte-doc .print-page .hh-line__price,
html.carte-doc .print-page .hh-line__hh,
html.carte-doc .print-page .hh-line__row .grand-price,
html.carte-doc .print-page .price-line__price,
html.carte-doc .print-page .food-card__head strong {
  white-space: nowrap !important;
}

/* Page menus : Duo / Complète aussi hautes que l’enfant ; bas plus compact. */
html.carte-doc .print-page--menus .print-page__content > .panel {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
}
html.carte-doc .print-page--menus .print-page__content {
  gap: 4.4mm !important;
}
html.carte-doc .print-page--menus .offer-grid {
  align-items: stretch;
  flex: 1.22 1 0;
  gap: 4.4mm !important;
}
html.carte-doc .print-page--menus .choice-grid {
  align-items: stretch;
  flex: 0.92 1 0;
  gap: 3.6mm !important;
}
html.carte-doc .print-page--menus .offer-card,
html.carte-doc .print-page--menus .choice-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: stretch;
}
html.carte-doc .print-page--menus .offer-card {
  padding: 6mm 5mm 5.2mm !important;
}
html.carte-doc .print-page--menus .offer-card__badge {
  align-self: center;
  width: auto !important;
  max-width: 92%;
  font-size: 11.4pt !important;
  letter-spacing: .1em !important;
  padding: 2.5mm 7mm !important;
}
html.carte-doc .print-page--menus .offer-card__foot {
  font-size: 8.2pt !important;
  letter-spacing: .16em !important;
}
html.carte-doc .print-page--menus .choice-card ul {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
}
html.carte-doc .print-page--menus .choice-card li {
  font-size: 7.6pt !important;
}
html.carte-doc .print-page--menus .menus-duo {
  flex: 0.88 1 0 !important;
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  align-items: stretch !important;
  gap: 4mm !important;
}
html.carte-doc .print-page--menus .menus-duo__left {
  display: grid !important;
  grid-template-rows: auto auto !important;
  gap: 3.2mm !important;
  min-height: 0;
}
html.carte-doc .print-page--menus .menus-duo > .panel,
html.carte-doc .print-page--menus .menus-duo > .special-card {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0;
  height: 100%;
}
html.carte-doc .print-page--menus .special-card,
html.carte-doc .print-page--menus .breakfast-card,
html.carte-doc .print-page--menus .special-card--dark {
  height: auto;
  flex: 0 1 auto;
  display: flex !important;
  flex-direction: column;
  justify-content: flex-start;
  gap: 1.4mm;
  padding: 3mm 4.2mm 3.2mm !important;
}
html.carte-doc .print-page--menus .menus-duo > .special-card--dark {
  height: 100%;
  justify-content: space-evenly;
  padding: 3.4mm 4.4mm !important;
}
html.carte-doc .print-page--menus .menu-points {
  gap: 1.5mm !important;
  font-size: 7.4pt !important;
}
html.carte-doc .print-page--menus .special-card strong,
html.carte-doc .print-page--menus .breakfast-card strong {
  font-size: 14.5pt !important;
}
html.carte-doc .print-page--menus .special-card__badge {
  align-self: center;
  width: auto !important;
  font-size: 9pt !important;
  padding: 1.5mm 5mm !important;
}
html.carte-doc .print-page--menus .day-options {
  display: grid !important;
  gap: 2.4mm !important;
}

/* Boissons 6 : rythme de la page 5 — écarts nets, lignes aérées et alignées. */
html.carte-doc .print-page--drinks .print-page__content {
  gap: 4.4mm !important;
  justify-content: stretch !important;
}
html.carte-doc .print-page--drinks .print-page__content > .panel,
html.carte-doc .print-page--drinks .print-page__content > .panel:first-child,
html.carte-doc .print-page--drinks .print-page__content > .panel:last-child {
  flex: 1 1 0 !important;
  overflow: visible !important;
  min-height: 0 !important;
}
html.carte-doc .print-page--drinks .price-list--cols {
  flex: 1 1 0 !important;
  min-height: 0 !important;
  align-items: stretch !important;
}
html.carte-doc .print-page--drinks .panel__head {
  margin-bottom: 2.4mm !important;
}
html.carte-doc .print-page--drinks .price-list__note {
  font-size: 5.8pt !important;
  line-height: 1.25 !important;
}
html.carte-doc .print-page--drinks .price-list__col {
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-evenly !important;
  height: 100% !important;
  min-height: 0 !important;
  gap: 0.5mm !important;
}
html.carte-doc .print-page--drinks .price-line {
  flex: 1 1 0 !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  padding: 0.7mm 0 !important;
  min-height: 0 !important;
}

/* Boissons 7 : mêmes écarts de rubriques que la page 6, sans trou ni coupe. */
html.carte-doc .print-page--drinks-secondary .print-page__content {
  gap: 2.4mm !important;
  justify-content: flex-start !important;
}
html.carte-doc .print-page--drinks-secondary .print-page__content > .panel,
html.carte-doc .print-page--drinks-secondary .print-page__content > .panel:first-child {
  flex: 0 0 auto !important;
  overflow: visible !important;
  min-height: auto !important;
  justify-content: flex-start !important;
}
html.carte-doc .print-page--drinks-secondary .print-page__content > .panel:last-child {
  flex: 0 0 auto !important;
  overflow: visible !important;
  min-height: auto !important;
  justify-content: flex-start !important;
}
html.carte-doc .print-page--drinks-secondary .price-list--cols {
  flex: 0 0 auto !important;
  align-items: start !important;
}
html.carte-doc .print-page--drinks-secondary .price-list:not(.price-list--cols) {
  flex: 0 0 auto !important;
  align-content: start !important;
}
html.carte-doc .print-page--drinks-secondary .price-list__note {
  font-size: 5.6pt !important;
  line-height: 1.2 !important;
}
html.carte-doc .print-page--drinks-secondary .price-list__col {
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  height: auto !important;
  gap: 0.5mm !important;
}
html.carte-doc .print-page--drinks-secondary .price-line {
  flex: 0 0 auto !important;
  padding: 0.32mm 0 !important;
}
html.carte-doc .print-page .beer-table__head,
html.carte-doc .print-page .beer-row {
  grid-template-columns: minmax(0, 1fr) 16mm 16mm 16mm !important;
}
html.carte-doc .print-page--drinks-secondary .panel__head {
  margin-bottom: 1.5mm !important;
}
html.carte-doc .print-page--drinks-secondary .beer-note {
  margin: 0.9mm 0 0.4mm !important;
  flex: 0 0 auto !important;
}
html.carte-doc .print-page--drinks-secondary .beer-note--second {
  margin-top: 0.7mm !important;
}
html.carte-doc .print-page--drinks-secondary .beer-table {
  display: flex !important;
  flex-direction: column !important;
  margin-top: 0.6mm !important;
  flex: 0 0 auto !important;
  gap: 0 !important;
}
html.carte-doc .print-page--drinks-secondary .beer-table__head {
  flex: 0 0 auto !important;
}
html.carte-doc .print-page--drinks-secondary .beer-row {
  flex: 0 0 auto !important;
  display: grid !important;
  align-items: center !important;
  padding: 0.25mm 0 !important;
}
html.carte-doc .print-page--drinks-secondary .hh-banner {
  flex: 0 0 auto !important;
  margin-top: auto !important;
  margin-bottom: 0 !important;
  padding: 0.6mm 0 0 !important;
  text-align: center;
  font-family: 'Cinzel', serif !important;
  font-weight: 700 !important;
  font-size: 8pt !important;
  letter-spacing: .1em !important;
  color: var(--gold-700) !important;
}
html.carte-doc .print-page--drinks-secondary .hh-banner .hh-ico {
  display: inline-block;
  width: 8.5pt;
  height: 8.5pt;
  margin: 0 0.32em -1pt;
  vertical-align: middle;
}
html.carte-doc .print-page--drinks-secondary .hh-banner .hh-ico-arrow {
  width: 12pt;
  height: 7pt;
  margin: 0 0.2em -0.6pt;
}

/* Cocktails : 1 colonne, tout le contenu visible, sans trou au milieu. */
html.carte-doc .print-page--cocktails .print-page__content {
  justify-content: flex-start !important;
  gap: 3.6mm !important;
}
html.carte-doc .print-page--cocktails .print-page__content > .panel,
html.carte-doc .print-page--cocktails .print-page__content > .panel:first-child,
html.carte-doc .print-page--cocktails .print-page__content > .panel:last-child,
html.carte-doc .print-page--cocktails .print-page__content > .duo-grid {
  flex: 0 0 auto !important;
  overflow: visible !important;
  min-height: auto !important;
}
html.carte-doc .print-page--cocktails .duo-grid {
  grid-template-rows: auto auto !important;
  gap: 3.6mm !important;
}
html.carte-doc .print-page--cocktails .hh-list--cols {
  justify-content: flex-start !important;
}
html.carte-doc .print-page--cocktails .price-list,
html.carte-doc .print-page--cocktails .price-list:not(.price-list--cols) {
  align-content: start !important;
}
html.carte-doc .print-page--cocktails .hh-list--cols {
  display: flex !important;
  flex-direction: column !important;
  grid-template-columns: none !important;
  flex: 1 1 auto;
  min-height: 0;
}
html.carte-doc .print-page--cocktails .hh-list__col {
  display: contents !important;
}
html.carte-doc .print-page--cocktails .hh-list__col:not(:first-child) .hh-head {
  display: none !important;
}
html.carte-doc .print-page--cocktails .hh-list--cols {
  justify-content: space-evenly;
}
html.carte-doc .print-page--cocktails .price-list,
html.carte-doc .print-page--cocktails .price-list:not(.price-list--cols) {
  grid-template-columns: 1fr !important;
  column-gap: 0 !important;
  align-content: space-evenly;
}
html.carte-doc .print-page--cocktails .duo-grid {
  display: grid !important;
  grid-template-columns: 1fr !important;
  grid-template-rows: 1.2fr 1fr;
  gap: 2mm !important;
  flex: 1.15 1 0;
}
html.carte-doc .print-page--cocktails .duo-grid > .panel {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0;
  overflow: hidden;
}
html.carte-doc .print-page--cocktails .hh-line__row,
html.carte-doc .print-page--cocktails .hh-head {
  grid-template-columns: minmax(0, 1fr) 15mm 15mm !important;
  column-gap: 2mm !important;
}
html.carte-doc .print-page--cocktails .hh-line {
  padding: 0.45mm 0 !important;
}
html.carte-doc .print-page--cocktails .hh-line__name {
  font-size: 8pt !important;
}
html.carte-doc .print-page--cocktails .hh-line .price-list__note,
html.carte-doc .print-page--cocktails .price-list__note {
  font-size: 5.6pt !important;
  line-height: 1.18 !important;
}
html.carte-doc .print-page--cocktails .hh-head {
  padding-bottom: 0.5mm !important;
  font-size: 5.6pt !important;
}
html.carte-doc .print-page--cocktails .panel__head {
  margin-bottom: 1.2mm !important;
}
html.carte-doc .print-page--cocktails .price-line {
  padding: 0.7mm 0 !important;
}
html.carte-doc .print-page--cocktails .hh-line__price,
html.carte-doc .print-page--cocktails .hh-line__hh {
  justify-self: end !important;
  text-align: right !important;
}

html.carte-doc .print-page--menus .breakfast-card .menu-points {
  font-size: 7.6pt !important;
  gap: 1.6mm !important;
}
html.carte-doc .print-page--menus .breakfast-card--simple {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding: 2mm 4mm 3mm !important;
}
html.carte-doc .print-page--desserts .print-page__content > .panel:nth-child(1) { flex: 1.35 1 0; }
html.carte-doc .print-page--desserts .print-page__content > .panel:nth-child(2) { flex: 1.22 1 0; }
html.carte-doc .print-page--desserts .print-page__content > .panel:nth-child(3) { flex: 0.82 1 0; }
html.carte-doc .print-page--vins .print-page__content > .panel:nth-child(1) { flex: 1.4 1 0; }
html.carte-doc .print-page--vins .print-page__content > .panel:nth-child(2) { flex: 1.2 1 0; }
html.carte-doc .print-page--vins .print-page__content > .panel:nth-child(3) { flex: 0.78 1 0; }
html.carte-doc .print-page--vins .print-page__content > .panel:nth-child(4) { flex: 0.72 1 0; }

/* Couverture : un seul double cadre, rien ne le touche. */
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
  padding: 18mm 16mm 20mm !important;
  display: grid !important;
  grid-template-rows: auto minmax(0, 1fr) auto auto !important;
  justify-items: center !important;
  align-content: stretch !important;
  gap: 5mm !important;
  overflow: hidden !important;
  box-sizing: border-box;
}
html.carte-doc .print-page--cover .cover-page::after {
  inset: 8mm !important;
  border: 0.45mm solid rgba(216,178,87,.5) !important;
  border-radius: 0 !important;
  pointer-events: none;
}
html.carte-doc .print-page--cover .cover-brand {
  width: 100%;
  max-width: 170mm;
  margin: 0 auto !important;
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
  align-self: center !important;
  width: 108mm !important;
  height: 108mm !important;
  max-width: 108mm !important;
  max-height: 108mm !important;
  margin: 0 auto !important;
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
  width: 100%;
  max-width: 168mm;
  gap: 3.5mm !important;
  margin: 0 !important;
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

/* Polices A4 = web : Cinzel intitulés/prix, Montserrat contenances. */
html.carte-doc .print-page .price-line__name,
html.carte-doc .print-page .hh-line__name,
html.carte-doc .print-page .beer-row__name,
html.carte-doc .print-page .food-card__head h5,
html.carte-doc .print-page .wine-name,
html.carte-doc .print-page .choice-card h5,
html.carte-doc .print-page .wine-table td.wine-name {
  font-family: 'Cinzel', serif !important;
  font-weight: 700 !important;
  font-style: normal !important;
}
html.carte-doc .print-page .price-line__price,
html.carte-doc .print-page .hh-line__price,
html.carte-doc .print-page .hh-line__hh,
html.carte-doc .print-page .hh-line__row .grand-price,
html.carte-doc .print-page .food-card__head strong,
html.carte-doc .print-page .beer-row__price,
html.carte-doc .print-page .beer-row__hh,
html.carte-doc .print-page .wine-table td:not(.wine-name):not(.wine-no) {
  font-family: 'Cinzel', serif !important;
  font-weight: 800 !important;
  font-style: normal !important;
}
html.carte-doc .print-page .qty,
html.carte-doc .print-page .note-cl,
html.carte-doc .print-page .price-list__note.note-cl,
html.carte-doc .print-page .panel__subtitle.qty,
html.carte-doc .print-page .beer-table__head,
html.carte-doc .print-page .beer-table__head .qty,
html.carte-doc .print-page .wine-table th.qty {
  font-family: 'Montserrat', sans-serif !important;
  font-weight: 400 !important;
  font-style: normal !important;
  text-transform: none !important;
  letter-spacing: .02em !important;
}
html.carte-doc .print-page .food-card__note,
html.carte-doc .print-page .price-list__note:not(.note-cl),
html.carte-doc .print-page .hh-line .price-list__note:not(.note-cl) {
  font-family: 'Montserrat', sans-serif !important;
  font-weight: 400 !important;
  font-style: italic !important;
}
html.carte-doc .print-page .beer-note {
  font-family: 'Cinzel', serif !important;
  font-weight: 600 !important;
  font-style: normal !important;
}

/* Interlignes réguliers */
html.carte-doc .print-page .price-line,
html.carte-doc .print-page .hh-line,
html.carte-doc .print-page .beer-row {
  padding-top: 0.55mm !important;
  padding-bottom: 0.55mm !important;
}
html.carte-doc .print-page .price-list__note,
html.carte-doc .print-page .note-cl {
  margin-top: 0.35mm !important;
  line-height: 1.25 !important;
}
html.carte-doc .print-page .price-list--cols {
  column-gap: 8mm !important;
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
}
"""


def main() -> None:
    style = INDEX.split("<style>", 1)[1].split("</style>", 1)[0]
    print_css = media_print_bodies(style)
    cover = extract_cover()

    flows = {
        "entrees": split_flow(section_flow("entrees")),
        "plats": split_flow(section_flow("plats")),
        "desserts": split_flow(section_flow("desserts")),
        "menus": split_flow(section_flow("menus")),
        "boissons": split_flow(section_flow("boissons")),
        "vins": split_flow(section_flow("vins")),
        "cocktails": split_flow(section_flow("cocktails")),
    }

    names = []
    pages_html = []

    def add(kind: str, content: str, label: str, cover_html: str | None = None) -> None:
        n = len(pages_html) + 1
        pages_html.append(page_shell(n, kind, content, cover_html))
        names.append(label)

    add("cover", "", "cover", cover)
    add("entrees", "\n".join(flows["entrees"]), "entrees")
    add("plats", "\n".join(flows["plats"]), "plats")
    add("desserts", "\n".join(flows["desserts"]), "desserts")
    add("menus", "\n".join(flows["menus"]), "menus")
    boissons = flows["boissons"]
    add("drinks", "\n".join(boissons[:2]), "boissons-fraiches-chaudes")
    hh = '<p class="hh-banner"><svg class="hh-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0.4 10.2 5.8 15.6 8 10.2 10.2 8 15.6 5.8 10.2 0.4 8 5.8 5.8Z"/></svg> Happy Hour (HH) · 17h <svg class="hh-ico hh-ico-arrow" viewBox="0 0 20 10" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M1 5h16M13.2 2.1 18 5l-4.8 2.9"/></svg> 23h <svg class="hh-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0.4 10.2 5.8 15.6 8 10.2 10.2 8 15.6 5.8 10.2 0.4 8 5.8 5.8Z"/></svg></p>'
    add("drinks-secondary", "\n".join(boissons[2:]) + "\n" + hh, "aperitifs-whiskies-digestifs-bieres")
    add("vins", "\n".join(flows["vins"]), "vins")
    ck = flows["cocktails"]
    add("cocktails", "\n".join(ck[:2]), "cocktails-classiques-duo")
    add("cocktails", "\n".join(ck[2:]), "cocktails-elegance-mocktails")

    html = f'''<!DOCTYPE html>
<html lang="fr" class="carte-doc">
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
{style}

/* ===== Styles d’impression du site, appliqués aussi à l’aperçu A4 ===== */
{print_css}

{EXTRA_CSS}
</style>
</head>
<body>
<main id="print-document" aria-label="Carte des menus et boissons à imprimer">
{"".join(pages_html)}
</main>
<script>
(function () {{
  const root = document.documentElement;
  const scrollHash = function () {{
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({{ block: "start" }});
  }};
  window.addEventListener("beforeprint", function () {{
    root.style.setProperty("--carte-scale", "1");
  }});
  window.addEventListener("afterprint", function () {{
    root.style.removeProperty("--carte-scale");
  }});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scrollHash);
  scrollHash();
}})();
</script>
</body>
</html>
'''
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({len(html)} bytes, {len(pages_html)} pages)")
    for i, name in enumerate(names, 1):
        print(f"  {i:02d} {name}")


if __name__ == "__main__":
    main()
