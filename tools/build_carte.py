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
    node = node.replace('href="#menu-nav-anchor"', 'href="#"')
    while '<a class="download-card"' in node:
        a = node.find('<a class="download-card"')
        frag, rest = take_element(node[a:], "a")
        node = node[:a] + rest
    return node


def page_shell(number: int, kind: str, content: str, cover_html: str | None = None) -> str:
    if kind == "cover":
        return f'''<section class="print-page print-page--cover" data-page="{number}">
{cover_html}
<div class="print-page__number">{number}</div>
</section>'''
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
<div>BAR • RESTAURANT · 01 43 49 05 93 · ◎ lacolline.gambetta</div>
<small>L’abus d’alcool est dangereux pour la santé — À consommer avec modération</small>
</footer>'''
    return f'''<section class="print-page print-page--{kind}" data-page="{number}">
{header}
<div class="print-page__content tab-flow">
{content}
</div>
{footer}
<div class="print-page__number">{number}</div>
</section>'''


EXTRA_CSS = r"""
/* ===== Carte A4 : mêmes styles PC, pages remplies, sans chevauchement ===== */
html.carte-doc, html.carte-doc body {
  background: #1a0b22 !important;
  margin: 0;
  overflow: auto !important;
  width: auto !important;
  min-width: 0 !important;
}
html.carte-doc #print-document {
  display: block !important;
  width: 210mm;
  margin: 0 auto;
  padding: 22px 0 40px;
}
html.carte-doc .carte-toolbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  justify-content: center;
  gap: 18px;
  padding: 10px 12px;
  background: #592e6f;
  border-bottom: 1px solid rgba(216,178,87,.35);
}
html.carte-doc .carte-toolbar a,
html.carte-doc .carte-toolbar button {
  font-family: 'Cinzel', serif;
  font-size: .62rem;
  font-weight: 600;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: rgba(216,178,87,.82);
  background: none;
  border: 0;
  text-decoration: none;
  cursor: pointer;
  padding: 4px 0;
}
html.carte-doc .carte-toolbar a:hover,
html.carte-doc .carte-toolbar button:hover { color: #fef9db; }
html.carte-doc .download-card { display: none !important; }

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

/* L’espace libre étire les blocs ; overflow hidden évite tout chevauchement. */
html.carte-doc .print-page__content {
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  gap: 5mm !important;
  overflow: hidden !important;
}
html.carte-doc .print-page__content > .panel,
html.carte-doc .print-page__content > .menus-duo,
html.carte-doc .print-page__content > .duo-grid {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden;
}
html.carte-doc .print-page .food-card-grid,
html.carte-doc .print-page .price-list,
html.carte-doc .print-page .hh-list,
html.carte-doc .print-page .wine-table {
  flex: 1 1 auto;
  align-content: space-between;
}
html.carte-doc .print-page .price-list:not(.price-list--cols) {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
html.carte-doc .print-page .duo-grid > .panel,
html.carte-doc .print-page .menus-duo > * {
  min-height: 0;
  height: auto;
}

/* Grilles PC forcées sous 1480px / 860px. */
html.carte-doc .print-page .food-card-grid,
html.carte-doc .print-page .food-card-grid--wide,
html.carte-doc .print-page .price-list--cols,
html.carte-doc .print-page .hh-list--cols {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
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

/* Gouttière cocktails : le HH de gauche ne touche pas le nom de droite. */
html.carte-doc .print-page--cocktails .hh-list--cols {
  column-gap: 11mm !important;
}
html.carte-doc .print-page--cocktails .hh-line__row,
html.carte-doc .print-page--cocktails .hh-head {
  grid-template-columns: minmax(0, 1fr) 14mm 14mm !important;
  column-gap: 1.6mm !important;
}
html.carte-doc .print-page--cocktails .hh-line__price,
html.carte-doc .print-page--cocktails .hh-line__hh {
  justify-self: end !important;
  text-align: right !important;
}

html.carte-doc .print-page .beer-table__head,
html.carte-doc .print-page .beer-row {
  grid-template-columns: minmax(0, 1fr) 18mm 18mm 18mm !important;
}

/* Couverture = page 1 du site. */
html.carte-doc .print-page--cover .cover-brand--menu-leader-lite .eyebrow {
  font-size: 22pt !important;
  letter-spacing: .12em !important;
  overflow: visible !important;
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
  max-height: none !important;
}

@media print {
  html.carte-doc, html.carte-doc body {
    background: #fff !important;
    width: 210mm !important;
    min-width: 210mm !important;
    overflow: visible !important;
  }
  html.carte-doc .carte-toolbar { display: none !important; }
  html.carte-doc #print-document { padding: 0; width: 210mm; }
  html.carte-doc .print-page {
    margin: 0;
    box-shadow: none;
    page-break-after: always;
    break-after: page;
  }
  html.carte-doc .print-page:last-child {
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
    add("drinks-secondary", "\n".join(boissons[2:4]), "aperitifs-whiskies")
    add("drinks-secondary", "\n".join(boissons[4:6]), "digestifs-bieres")
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
<nav class="carte-toolbar">
  <a href="index.html">Site</a>
  <button type="button" onclick="window.print()">Télécharger carte</button>
</nav>
<main id="print-document" aria-label="Carte des menus et boissons à imprimer">
{"".join(pages_html)}
</main>
<script>
(function () {{
  const params = new URLSearchParams(location.search);
  if (params.get("print") === "1") {{
    const start = function () {{
      document.fonts.ready.then(function () {{ setTimeout(function () {{ window.print(); }}, 280); }});
    }};
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start);
  }}
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
