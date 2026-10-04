#!/usr/bin/env python3
"""Ligne \u00ab Dans le quartier \u00bb en pied de page, sous l'adresse.

Quelques liens vers les reperes du quartier (P\u00e8re-Lachaise, mairie du 20e,
Th\u00e9\u00e2tre de la Colline, m\u00e9tro Gambetta). Ils sont tr\u00e8s discrets mais
visibles : des liens dissimul\u00e9s seraient contraires aux regles de Google.
Script idempotent, il remplace son propre bloc entre marqueurs.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

CSS = """/* quartier:css:debut */
/* ===== Pied de page : reperes du quartier ==================================
   Une ligne en tres petits caracteres sous l'adresse, dans la meme fonte que
   le reste du pied de page. Discrete a l'oeil, parfaitement lisible pour les
   moteurs : ce sont de vrais liens, jamais du texte dissimule. */
html:not(.carte-doc) .footer-quartier {
  display:flex; flex-wrap:wrap; justify-content:center; align-items:center;
  gap:3px 10px; margin:5px auto 0; max-width:62ch;
  font-family:'Cinzel',serif; font-size:clamp(.5rem,.95vw,.6rem);
  letter-spacing:.09em; text-transform:uppercase; line-height:1.5;
  color:var(--gold-100,#f0dca8); opacity:.46;
}
html:not(.carte-doc) .footer-quartier a { color:inherit; text-decoration:none; }
html:not(.carte-doc) .footer-quartier a:hover { text-decoration:underline; opacity:1; }
html:not(.carte-doc) .footer-quartier__sep { opacity:.5; }
/* quartier:css:fin */"""

LIENS = [
    ("https://www.paris.fr/lieux/cimetiere-du-pere-lachaise-4082", "P\u00e8re-Lachaise"),
    ("https://www.colline.fr/", "Th\u00e9\u00e2tre de la Colline"),
    ("https://mairie20.paris.fr/", "Mairie du 20\u1d49"),
    ("https://www.ratp.fr/", "M\u00e9tro Gambetta \u2022 ligne 3"),
]

HTML = ('<!-- quartier:html:debut --><nav class="footer-quartier" aria-label="Rep\u00e8res du quartier">'
        '<span>Dans le quartier</span><span class="footer-quartier__sep" aria-hidden="true">\u2022</span>'
        + '<span class="footer-quartier__sep" aria-hidden="true">\u2022</span>'.join(
            f'<a href="{u}" target="_blank" rel="noopener">{t}</a>' for u, t in LIENS)
        + '</nav><!-- quartier:html:fin -->')


def main() -> None:
    s = INDEX.read_text(encoding="utf-8")

    if "/* quartier:css:debut */" in s:
        i = s.index("/* quartier:css:debut */")
        j = s.index("/* quartier:css:fin */") + len("/* quartier:css:fin */")
        s = s[:i] + CSS + s[j:]
    else:
        i = s.index("</style>")
        s = s[:i] + CSS + "\n" + s[i:]

    if "<!-- quartier:html:debut -->" in s:
        i = s.index("<!-- quartier:html:debut -->")
        j = s.index("<!-- quartier:html:fin -->") + len("<!-- quartier:html:fin -->")
        s = s[:i] + HTML + s[j:]
    else:
        ancre = '<span class="footer-details__metro">M\u00c9TRO GAMBETTA \u2022 LIGNE 3</span></div>'
        i = s.index(ancre) + len(ancre)
        s = s[:i] + "\n      " + HTML + s[i:]

    INDEX.write_text(s, encoding="utf-8")
    print(f"index.html : ligne \u00ab Dans le quartier \u00bb ({len(LIENS)} rep\u00e8res) sous l'adresse")


if __name__ == "__main__":
    main()
