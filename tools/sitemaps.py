#!/usr/bin/env python3
"""Genere sitemap.xml (pages + versions linguistiques) et sitemap-images.xml.

Les 170 photos de la carte sont chargees en JavaScript : sans sitemap
d'images, Google ne les voit pas. On les declare donc explicitement, avec
le nom du plat ou de la boisson en legende.
"""
from __future__ import annotations

import html
import re
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://lacollinegambetta.com"
LANGUES = ["fr", "en", "es", "de", "it", "pt", "nl", "pl", "zh", "uk", "ja",
           "ko", "ar", "tr", "hi"]
PAGES = [("", "weekly", "1.0"), ("reservation.html", "daily", "0.9"),
         ("mentions-legales.html", "yearly", "0.3"),
         ("confidentialite.html", "yearly", "0.3")]


def _texte(x: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", x)).replace("\u00a0", " ").strip()


def photos() -> list[tuple[str, str]]:
    """(chemin, legende) pour chaque photo reellement utilisee par la carte."""
    s = (ROOT / "index.html").read_text(encoding="utf-8")
    trouve: dict[str, str] = {}
    motifs = [
        r'data-photo="([^"]+)"[^>]*>.*?<h5>(.*?)</h5>',
        r'data-photo="([^"]+)"[^>]*>.*?class="price-line__name">(.*?)</div>',
        r'data-photo="([^"]+)"[^>]*>.*?class="hh-line__name">(.*?)</div>',
        r'data-photo="([^"]+)"[^>]*>.*?<td class="wine-name">(.*?)</td>',
    ]
    for motif in motifs:
        for m in re.finditer(motif, s, re.S):
            chemin = m.group(1).split("?")[0]
            legende = _texte(m.group(2))
            if len(legende) > 90 or not legende:
                continue
            trouve.setdefault(chemin, legende)
    for m in re.finditer(r'data-photo="([^"]+)"', s):
        trouve.setdefault(m.group(1).split("?")[0], "La Colline Gambetta")
    return [(c, l) for c, l in sorted(trouve.items()) if (ROOT / c).exists()]


def sitemap_pages(jour: str) -> str:
    alternatives = "".join(
        f'\n      <xhtml:link rel="alternate" hreflang="{lg}" '
        f'href="{BASE}/{"" if lg == "fr" else f"?lang={lg}"}"/>'
        for lg in LANGUES)
    alternatives += f'\n      <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}/"/>'
    lignes = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
              '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for page, freq, prio in PAGES:
        lignes += [f"  <url>", f"    <loc>{BASE}/{page}</loc>",
                   f"    <lastmod>{jour}</lastmod>",
                   f"    <changefreq>{freq}</changefreq>",
                   f"    <priority>{prio}</priority>"]
        if page == "":
            lignes.append("   " + alternatives.strip())
        lignes.append("  </url>")
    lignes.append("</urlset>")
    return "\n".join(lignes) + "\n"


def sitemap_images(jour: str, images: list[tuple[str, str]]) -> str:
    lignes = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
              '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
              "  <url>", f"    <loc>{BASE}/</loc>", f"    <lastmod>{jour}</lastmod>"]
    for chemin, legende in images:
        lignes += ["    <image:image>",
                   f"      <image:loc>{BASE}/{chemin}</image:loc>",
                   f"      <image:title>{escape(legende)} \u2014 La Colline Gambetta,"
                   f" Paris 20e</image:title>",
                   "    </image:image>"]
    lignes += ["  </url>", "</urlset>"]
    return "\n".join(lignes) + "\n"


def main() -> None:
    jour = date.today().isoformat()
    images = photos()
    (ROOT / "sitemap.xml").write_text(sitemap_pages(jour), encoding="utf-8")
    (ROOT / "sitemap-images.xml").write_text(sitemap_images(jour, images), encoding="utf-8")
    robots = (ROOT / "robots.txt")
    texte = ("User-agent: *\nAllow: /\n\n"
             f"Sitemap: {BASE}/sitemap.xml\n"
             f"Sitemap: {BASE}/sitemap-images.xml\n")
    robots.write_text(texte, encoding="utf-8")
    print(f"sitemap.xml : {len(PAGES)} pages + {len(LANGUES)} langues")
    print(f"sitemap-images.xml : {len(images)} photos declarees")
    print("robots.txt : deux sitemaps")


if __name__ == "__main__":
    main()
