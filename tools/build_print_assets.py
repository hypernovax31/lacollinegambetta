#!/usr/bin/env python3
"""Build the press-ready A4 menu pages from the menu data.

The website remains the source for the interactive PC experience.  This small
renderer gives the requested deliverables a deterministic 300 dpi output when
no browser is available in the build environment: nine A4 portrait pages,
individual JPGs and one multi-page PDF.
"""
from pathlib import Path
import subprocess
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "print-assets"
TMP = ROOT / ".print-build"
W, H = 2480, 3508
M = 150
CREAM = "#fcfbf7"
WHITE = "#ffffff"
V950 = "#24102e"
V900 = "#432155"
V800 = "#592e6f"
V700 = "#6b3c87"
INK = "#2f1740"
MUTED = "#5d4a6c"
GOLD = "#d8b257"
GOLD_LIGHT = "#fef9db"
GOLD_BRIGHT = "#ffe88f"
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def q(value: str) -> str:
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'


class Page:
    def __init__(self, dark=False):
        self.c = [f"viewbox 0 0 {W} {H}"]
        self.rect(0, 0, W, H, V950 if dark else CREAM, None, 0)
        self.dark = dark

    def raw(self, line):
        self.c.append(line)

    def rect(self, x, y, w, h, fill, stroke=GOLD, sw=2, radius=0):
        self.c.append(f"fill {fill}")
        self.c.append(f"stroke {stroke if stroke else 'none'}")
        self.c.append(f"stroke-width {sw}")
        if radius:
            self.c.append(f"roundrectangle {x},{y} {x+w},{y+h} {radius},{radius}")
        else:
            self.c.append(f"rectangle {x},{y} {x+w},{y+h}")

    def line(self, x1, y1, x2, y2, color=GOLD, sw=2, dash=None):
        self.c.append("fill none")
        self.c.append(f"stroke {color}")
        self.c.append(f"stroke-width {sw}")
        if dash:
            self.c.append(f"stroke-dasharray {dash}")
        self.c.append(f"line {x1},{y1} {x2},{y2}")
        if dash:
            self.c.append("stroke-dasharray none")

    def circle(self, cx, cy, r, color=GOLD, sw=2):
        self.c.append("fill none")
        self.c.append(f"stroke {color}")
        self.c.append(f"stroke-width {sw}")
        self.c.append(f"circle {cx},{cy} {cx+r},{cy}")

    def filled_circle(self, cx, cy, r, color):
        self.c.append(f"fill {color}")
        self.c.append("stroke none")
        self.c.append(f"circle {cx},{cy} {cx+r},{cy}")

    def text(self, x, y, value, size=26, color=INK, font=SANS, bold=False, center=False, align="left"):
        if not value:
            return
        face = SERIF_BOLD if bold and font == SERIF else (SANS_BOLD if bold else font)
        self.c.append(f"fill {color}")
        self.c.append("stroke none")
        self.c.append(f"font {q(face)}")
        self.c.append(f"font-size {size}")
        # Center relative to the supplied x coordinate (not only to the page).
        # This matters for the two-column menu cards.
        gravity = "northwest"
        self.c.append(f"gravity {gravity}")
        if center:
            start = max(0, int(x - len(str(value)) * size * .29))
            self.c.append(f"text {start},{y} {q(value)}")
        elif align == "right":
            # MVG's northeast gravity treats coordinates as offsets from the
            # page corner.  Use a measured approximation with a normal origin
            # so prices remain inside their card on every page.
            start = max(0, int(x - len(str(value)) * size * .58))
            self.c.append(f"text {start},{y} {q(value)}")
        else:
            self.c.append(f"text {x},{y} {q(value)}")

    def wrap(self, value, max_chars):
        words = str(value).split()
        lines, current = [], ""
        for word in words:
            candidate = word if not current else current + " " + word
            if len(candidate) <= max_chars or not current:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]

    def block(self, x, y, value, width, size=24, color=MUTED, font=SANS, bold=False, leading=None, max_lines=None):
        max_chars = max(8, int(width / (size * .55)))
        lines = self.wrap(value, max_chars)
        if max_lines:
            lines = lines[:max_lines]
        leading = leading or int(size * 1.28)
        for i, line in enumerate(lines):
            self.text(x, y + i * leading, line, size, color, font, bold)
        return len(lines) * leading

    def title_pill(self, x, y, w, title, dark=True):
        self.rect(x, y, w, 58, V800 if dark else V950, GOLD, 2, 28)
        self.text(x + w/2, y + 12, f"✦  {title.upper()}  ✦", 25, WHITE, SERIF, True, center=True)

    def panel(self, x, y, w, h, title=None, fill=WHITE):
        self.rect(x, y, w, h, fill, "#c9a554", 2, 20)
        if title:
            pill_w = min(w - 80, max(350, len(title) * 22 + 170))
            self.title_pill(x + (w-pill_w)/2, y + 22, pill_w, title)

    def save(self, path):
        path.write_text("\n".join(self.c), encoding="utf-8")


def border(page, dark=False):
    page.rect(105, 105, W-210, H-210, "none", GOLD, 7, 4)
    page.rect(132, 132, W-264, H-264, "none", "#efd99b", 2, 3)


def footer(page, n, dark=False):
    y = H - 205
    if not dark:
        page.text(W/2, y - 94, "✦  PRIX NETS EN EUROS • SERVICE COMPRIS 15 %  ✦", 16, GOLD, SERIF, False, center=True)
        page.text(W/2, y - 64, "Allergènes : informations sur demande • L’abus d’alcool est dangereux pour la santé", 14, MUTED, SANS, False, center=True)
    page.line(250, y - 34, W-250, y - 34, GOLD, 2)
    page.text(W/2, y, str(n), 24, GOLD, SERIF, False, center=True)


def interior_header(page):
    x, y, w, h = M, 152, W - 2*M, 250
    page.rect(x, y, w, h, V800, GOLD, 2, 12)
    page.text(W/2, y+26, "✦  LA CARTE  ✦", 25, GOLD_LIGHT, SERIF, True, center=True)
    page.text(W/2, y+75, "COLLINE", 57, WHITE, SERIF, True, center=True)
    page.text(W/2, y+139, "GAMBETTA", 29, GOLD_BRIGHT, SERIF, True, center=True)
    page.text(W/2, y+202, "BAR • RESTAURANT • PARIS 20ᵉ", 18, GOLD_LIGHT, SERIF, False, center=True)


def food_panel(page, y, title, items, columns=2, card_min=120):
    x, w, gap = M, W-2*M, 24
    col_w = (w-gap) / columns
    rows = [items[i:i+columns] for i in range(0, len(items), columns)]
    row_heights = []
    for row in rows:
        max_h = card_min
        for name, price, note in row:
            note_lines = page.wrap(note, max(12, int((col_w-90)/(24*.55)))) if note else []
            max_h = max(max_h, 78 + len(note_lines)*30)
        row_heights.append(max_h)
    h = 108 + sum(row_heights) + max(0, len(rows)-1)*18
    page.panel(x, y, w, h, title)
    cy = y + 107
    for r, row in enumerate(rows):
        for c, (name, price, note) in enumerate(row):
            cx = x + c*(col_w+gap)
            ch = row_heights[r]
            page.rect(cx, cy, col_w, ch, "#fffefd", "#e4d09a", 2, 13)
            page.block(cx+22, cy+17, name, col_w-175, 24, INK, SERIF, True, 29, 2)
            page.text(cx+col_w-22, cy+17, price, 25, INK, SERIF, True, align="right")
            if note:
                page.block(cx+22, cy+53, note, col_w-44, 19, MUTED, SANS, False, 25, 2)
        cy += row_heights[r] + (16 if r < len(rows)-1 else 0)
    return y + h + 22


def list_panel(page, y, title, items, columns=2, subtitle=None, compact=False):
    x, w, gap = M, W-2*M, 24
    col_w = (w-gap)/columns
    cols = [[] for _ in range(columns)]
    for i, item in enumerate(items):
        cols[min(columns-1, i*columns//len(items) if len(items) else 0)].append(item)
    # split evenly in source order, which matches the two-column website lists
    if columns == 2:
        half = (len(items)+1)//2
        cols = [items[:half], items[half:]]
    sizes = []
    for col in cols:
        total = 0
        for name, price, note in col:
            note_lines = page.wrap(note, max(10, int((col_w-210)/(20*.55)))) if note else []
            name_lines = page.wrap(name, max(12, int((col_w-210)/(20*.55))))
            total += max(76, len(name_lines)*28 + len(note_lines)*26 + (12 if note else 0))
        sizes.append(total)
    top_offset = 93 if not subtitle else 116
    # Keep a deliberate air pocket under the last line: the border must never
    # touch a description or a price, even for the longest two-column list.
    h = top_offset + max(sizes or [0]) + 68
    page.panel(x, y, w, h, title)
    if subtitle:
        page.text(W/2, y+86, subtitle, 18, GOLD if not page.dark else GOLD_LIGHT, SERIF, False, center=True)
    top = y + top_offset
    for c, col in enumerate(cols):
        cx = x + c*(col_w+gap)
        cy = top
        for name, price, note in col:
            page.text(cx+20, cy, name, 25 if compact else 27, INK, SERIF, True)
            page.text(cx+col_w-20, cy, price, 26, INK, SERIF, True, align="right")
            page.line(cx+20, cy+33, cx+col_w-20, cy+33, "#c9a554", 1, "2,7")
            if note:
                note_h = page.block(cx+20, cy+44, note, col_w-40, 20 if compact else 21, MUTED, SANS, False, 26, 2)
                cy += max(78, 44 + note_h + 10)
            else:
                cy += 78
    return y + h + 22


def simple_feature(page, x, y, w, h, title, body, price, dark=False):
    fill = V900 if dark else WHITE
    text = WHITE if dark else INK
    page.rect(x, y, w, h, fill, GOLD, 2, 18)
    badge_w = min(w-50, max(220, len(title)*20+90))
    page.rect(x+(w-badge_w)/2, y+22, badge_w, 46, "#efd38a", GOLD, 1, 23)
    page.text(x+w/2, y+34, title.upper(), 20, V950, SERIF, True, center=True)
    page.block(x+35, y+94, body, w-70, 21, text if dark else MUTED, SANS, False, 28, 4)
    page.text(x+w/2, y+h-52, price, 36, GOLD_LIGHT if dark else V800, SERIF, True, center=True)


def cover_page(n):
    p = Page(dark=True)
    border(p, True)
    p.text(W/2, 190, "✦  LA CARTE  ✦", 52, GOLD_LIGHT, SERIF, True, center=True)
    p.text(W/2, 285, "BAR • RESTAURANT • PARIS 20ᵉ", 24, GOLD_LIGHT, SERIF, False, center=True)
    p.text(W/2, 335, "✦  FAIT MAISON • SERVICE CONTINU • TERRASSE  ✦", 20, GOLD_LIGHT, SERIF, False, center=True)
    # The source illustration is masked to a soft circle before it is placed.
    p.circle(W/2, 1570, 690, GOLD, 7)
    p.circle(W/2, 1570, 625, "#e7c873", 2)
    p.raw("gravity northwest")
    p.raw(f"image over 640,970 1200,1200 {q(str(TMP/'cover-art.png'))}")
    p.text(W/2, 2835, "LA COLLINE GAMBETTA", 33, GOLD_LIGHT, SERIF, True, center=True)
    p.text(W/2, 2902, "4 RUE BELGRAND • 75020 PARIS • PLACE GAMBETTA", 20, WHITE, SERIF, False, center=True)
    p.text(W/2, 2960, "lacolline.gambetta   •   01 43 49 05 93", 20, GOLD_LIGHT, SANS, False, center=True)
    footer(p, n, True)
    return p


ENTREES = [
("Assiette de foie gras du Sud-Ouest", "17,90", "Pain toasté, confiture d’abricots"),
("Œuf cocotte du moment", "7,90", ""), ("Pâté de campagne et cornichons", "6,50", ""),
("Œuf dur mayonnaise", "6,20", ""), ("6 Escargots de Bourgogne", "7,90", ""),
("6 Escargots au Roquefort", "7,90", ""), ("Assiette de saumon fumé", "7,50", ""),
("Tartare d’avocat et crevettes", "8,90", ""), ("Salade au poulet", "8,90", ""),
("Œufs au plat", "9,90", "Salade"),
]
PLANCHES = [("La Cochonnaille", "17,50", ""), ("La Fromagère", "15,90", ""), ("La Paysanne", "21,90", "Charcuterie et fromages"), ("Croque-Monsieur", "12,70", "Frites et salade"), ("Croque-Madame", "13,70", "Frites et salade")]
OMELETTES = [("Omelette nature", "9,90", "Salade"), ("Omelette au fromage", "10,90", "Salade"), ("Omelette au jambon", "10,90", "Salade"), ("Omelette mixte", "14,90", "Salade"), ("Omelette aux champignons", "13,90", "Salade")]
PLATS = [("Entrecôte 300 g", "25,90", "Fleur de sel, sauce au poivre"), ("Bavette d’aloyau", "17,50", "Sauce au choix"), ("Escalope de veau", "19,90", "Sauce champignons, pâtes"), ("Cuisse de canard confite", "19,70", ""), ("Poisson", "17,90", "Selon l’arrivée"), ("Tartare de bœuf", "17,80", ""), ("Cuisse de poulet rôtie", "16,20", "Riz basmati"), ("Carpaccio de bœuf", "17,50", "")]
BURGERS = [("Burger La Colline", "18,20", "Pain brioché, cheddar, steak haché, bacon, oignons caramélisés, salade, tomate, sauce burger."), ("Le Royal Fishburger", "17,90", "Pain brioché, cheddar, poisson pané, légumes grillés, salade, tomate, sauce burger."), ("Burger Chicken Croustillant", "17,90", "Pain brioché, cheddar, escalope de poulet pané croustillant, oignons caramélisés, salade, tomate, sauce burger."), ("Burger Végétarien", "17,70", "Pain brioché, cheddar, steak végétarien, légumes grillés, salade, tomate, sauce burger.")]
SALADES = [("La Colline", "17,10", "Salade verte, tomate, escalope de poulet pané, œuf mimosa, croûtons toastés, chèvre."), ("Chèvre Chaud", "16,90", "Salade verte, tomate, jambon sec, toast de cabécou, miel."), ("Végétarienne", "13,60", "Salade verte, tomate, concombre, carottes râpées, légumes, avocat."), ("Nordique", "17,90", "Salade verte, saumon fumé, crevettes, avocat, concombre, tomate, feta, croûtons.")]
DESSERTS = [("Crème brûlée", "6,80", ""), ("Mousse au chocolat", "7,10", ""), ("Panna cotta", "7,50", "Coulis de fruits rouges"), ("Tiramisu", "7,50", ""), ("Tarte aux pommes", "8,50", "Glace vanille"), ("Pain perdu de la Colline", "8,50", "Glace vanille ou caramel beurre salé"), ("Moelleux au chocolat", "7,90", ""), ("Café gourmand", "8,90", "Thé gourmand +1 € • Assortiment de mignardises"), ("Profiteroles", "7,90", "")]
GLACES = [("Crème glacée (3 boules)", "8,50", "Vanille, caramel beurre salé, chocolat, café, pistache, noisette"), ("Sorbet (3 boules)", "8,50", "Citron vert, fraise, framboise"), ("Dame blanche", "8,90", "Éclats de chocolat chaud, 2 boules vanille, chantilly"), ("Chocolat liégeois", "8,90", "2 boules chocolat, sauce chocolat, chantilly"), ("Café liégeois", "8,90", "2 boules café, expresso, chantilly"), ("Caramello", "8,90", "2 boules caramel beurre salé, sauce caramel, chantilly"), ("Le Colonel de la Colline", "8,90", "2 boules citron vert arrosées de vodka (2 cl)")]
FROMAGES = [("Pont-l’Évêque", "5,90", ""), ("Fourme d’Ambert", "6,90", ""), ("Cantal", "6,90", ""), ("Chèvre", "5,90", ""), ("Assiette mixte", "8,50", "")]


def food_page(n, groups):
    p = Page(); border(p); interior_header(p); y = 450
    for title, items in groups:
        y = food_panel(p, y, title, items)
    footer(p, n); return p


def menus_page(n):
    p = Page(); border(p); interior_header(p); x, w = M, W-2*M; y = 450
    form_h = 730
    p.panel(x, y, w, form_h, "Formules")
    gap=24; card_w=(w-gap)/2
    p.rect(x+24, y+100, card_w, 176, WHITE, "#e4d09a", 2, 16)
    p.rect(x+24+card_w+gap, y+100, card_w, 176, V700, GOLD, 2, 16)
    p.text(x+24+card_w/2, y+128, "ENTRÉE + PLAT", 22, INK, SERIF, True, center=True)
    p.text(x+24+card_w/2, y+162, "OU PLAT + DESSERT", 20, INK, SERIF, False, center=True)
    p.text(x+24+card_w/2, y+207, "24,90", 42, V800, SERIF, True, center=True)
    p.text(x+24+card_w+gap+card_w/2, y+137, "LA FORMULE COMPLÈTE", 20, GOLD_LIGHT, SERIF, True, center=True)
    p.text(x+24+card_w+gap+card_w/2, y+170, "Entrée + plat + dessert", 18, WHITE, SERIF, False, center=True)
    p.text(x+24+card_w+gap+card_w/2, y+215, "29,90", 42, WHITE, SERIF, True, center=True)
    choices=[("1", "Entrée au choix", ["Salade au poulet", "Escargots de Bourgogne", "Pâté de campagne", "Œuf cocotte", "Assiette de charcuterie"]), ("2", "Plat au choix", ["Escalope de veau", "Bavette d’aloyau — Sauce au choix", "Cuisse de canard confite"]), ("3", "Dessert au choix", ["Panna cotta", "Crème brûlée", "Mousse au chocolat", "Tiramisu", "2 boules de glace"])]
    cw=(w-2*gap)/3
    for i,(num,title,lines) in enumerate(choices):
        cx=x+i*(cw+gap); cy=y+310
        p.rect(cx, cy, cw, 365, WHITE, "#e4d09a", 2, 16)
        p.filled_circle(cx+54, cy+39, 22, V800)
        p.text(cx+54, cy+28, num, 20, WHITE, SERIF, True, center=True)
        p.block(cx+84, cy+24, title, cw-105, 20, INK, SERIF, True, 25, 2)
        ly=cy+105
        for line in lines:
            p.text(cx+24, ly, "✦", 15, GOLD, SERIF, True); p.block(cx+50, ly, line, cw-72, 18, MUTED, SANS, False, 23, 2); ly+=47
    y += form_h + 24
    duo_w=(w-gap)/2
    # Left column follows the printed reading order: child menu, then breakfast.
    child_h, breakfast_h = 330, 173
    p.panel(x, y, duo_w, child_h, "Menu enfant")
    p.rect(x+25, y+96, duo_w-50, 188, WHITE, "#e4d09a", 2, 15)
    p.rect(x+duo_w/2-120, y+113, 240, 42, "#efd38a", GOLD, 1, 21)
    p.text(x+duo_w/2, y+124, "MOINS DE 12 ANS", 17, V950, SERIF, True, center=True)
    p.block(x+45, y+174, "Eau ou soda • Burger enfant ou cordon bleu • Frites maison • 1 boule de glace au choix", duo_w-90, 17, MUTED, SANS, False, 23, 3)
    p.text(x+duo_w/2, y+253, "11,90", 29, V800, SERIF, True, center=True)
    by = y + child_h + 22
    p.panel(x, by, duo_w, breakfast_h, "Petit déjeuner")
    p.block(x+32, by+87, "Boisson chaude au choix • Croissant ou tartine au beurre • Verre de jus de fruits au choix", duo_w-64, 16, MUTED, SANS, False, 22, 3)
    p.text(x+duo_w/2, by+137, "7,00", 28, V800, SERIF, True, center=True)
    # Right column: menu du jour, full-height and vertically balanced.
    p.panel(x+duo_w+gap, y, duo_w, child_h+22+breakfast_h, "Menu du jour")
    rx=x+duo_w+gap
    p.text(rx+duo_w/2, y+105, "SELON L’ARDOISE", 20, GOLD, SERIF, False, center=True)
    p.rect(rx+28, y+145, duo_w-56, 132, V900, GOLD, 2, 14)
    p.text(rx+duo_w/2, y+163, "2 SERVICES", 18, GOLD_LIGHT, SERIF, True, center=True)
    p.text(rx+duo_w/2, y+199, "Entrée + plat ou plat + dessert", 18, WHITE, SANS, False, center=True)
    p.text(rx+duo_w/2, y+235, "17,90", 32, GOLD_LIGHT, SERIF, True, center=True)
    p.rect(rx+28, y+300, duo_w-56, 132, V900, GOLD, 2, 14)
    p.text(rx+duo_w/2, y+318, "3 SERVICES", 18, GOLD_LIGHT, SERIF, True, center=True)
    p.text(rx+duo_w/2, y+354, "Entrée + plat + dessert", 18, WHITE, SANS, False, center=True)
    p.text(rx+duo_w/2, y+390, "21,90", 32, GOLD_LIGHT, SERIF, True, center=True)
    p.text(rx+duo_w/2, y+475, "Uniquement les midis — sauf weekends et jours fériés", 15, MUTED, SANS, False, center=True)
    footer(p, n); return p


FRESH = [("Vittel", "3,90 / 4,90 / 5,90", "25 cl / 50 cl / 1 L"), ("San Pellegrino", "4,90 / 6,20", "50 cl / 1 L"), ("Badoit", "4,90 / 6,20", "33 cl / 1 L"), ("Perrier", "4,90", "33 cl"), ("Coca / Zéro / Cherry", "4,90", "33 cl"), ("Fanta / Sprite / Fuze Tea", "4,90", "25 cl"), ("Orangina / Citronnade / Ginger Beer", "4,90", "25 cl"), ("Diabolo / Limonade", "4,90", "25 cl"), ("Schweppes Tonic / Agrumes", "4,90", "25 cl"), ("Jus / Nectar de fruits", "4,90", "25 cl"), ("Sirop à l’eau", "3,00", ""), ("Supplément sirop · 2 cl", "0,50", "grenadine • fraise • citron • menthe • pêche • violette • passion • vanille • coco • orgeat • cassis"), ("Orange pressée / Citron pressé", "5,50", "25 cl"), ("Milkshake", "5,90", ""), ("Café frappé", "4,90", ""), ("Latte frappé", "5,50", "")]
HOT = [("Café", "2,40", ""), ("Décaféiné", "2,50", ""), ("Café noisette / allongé", "2,60", ""), ("Double café / décaféiné", "4,80", ""), ("Café crème / chocolat chaud", "4,50", ""), ("Cappuccino", "5,10", ""), ("Crème / chocolat viennois", "5,10", ""), ("Café viennois", "4,90", ""), ("Infusion / thé parfumé", "4,90", ""), ("Grog", "5,90", ""), ("Vin chaud aux épices", "4,90", ""), ("Irish coffee", "9,90", ""), ("Café allongé", "2,90", "Caramel ou vanille"), ("Lait chaud", "3,20", "")]
APERITIFS = [("Martini", "4,50", "5 cl — Blanc, rouge"), ("Ricard / Pastis", "3,90", "2 cl"), ("Kir", "4,50", "12 cl — Cassis, framboise, mûre, pêche"), ("Kir Royal", "10,90", "12 cl"), ("Americano", "8,60", "8 cl"), ("Negroni", "8,90", "8 cl"), ("Porto", "4,50", "5 cl — Blanc, rouge"), ("Suze / Campari", "4,50", "5 cl"), ("Muscat / Salers", "4,50", "6 cl"), ("Cidre brut", "4,90", "25 cl")]
WHISKIES = [("Clan Campbell", "7,60", ""), ("Jameson", "7,80", ""), ("Jack Daniels", "8,60", ""), ("Johnny Walker", "8,80", ""), ("Chivas Regal", "8,80", "")]
DIGESTIFS = [("Bas Armagnac VSOP", "7,20", ""), ("Rhum des Îles, Calvados", "6,20", ""), ("Vodka", "6,90", ""), ("Get 27 / 31, Bailey’s, Malibu", "7,10", ""), ("Cognac VSOP", "7,20", ""), ("Manzana Verde", "6,10", ""), ("Vieille Prune de Souillac", "7,20", ""), ("Poire, Mirabelle, Framboise", "7,20", ""), ("Amaretto, Fernet Branca", "7,20", ""), ("Grand Marnier, Cointreau", "7,20", "")]
BEERS = [("La Semeuse", "3,40 / 6,20 / 3,90", "25 cl • Pinte • HH"), ("Valmy Blanche bio", "4,30 / 7,90 / 6,00", "25 cl • Pinte • HH"), ("Triple d’Orgemont bio", "4,80 / 9,50 / 8,50", "25 cl • Pinte • HH"), ("Légionnaire IPA", "4,50 / 8,80 / 7,00", "25 cl • Pinte • HH"), ("Heineken", "4,90", "25 cl • bouteille"), ("1664 Blanc", "4,90", "25 cl • bouteille"), ("Desperados", "5,90", "33 cl • bouteille"), ("Corona", "6,20", "33 cl • bouteille"), ("Bière sans alcool", "4,90", "25 cl • bouteille")]


def drinks_page(n, groups):
    p=Page(); border(p); interior_header(p); y=450
    for title, items, subtitle in groups:
        y=list_panel(p,y,title,items,2,subtitle,compact=True)
    footer(p,n); return p


WINES = [
("Vin rouge", [("Côtes du Rhône AOP Bio — Les 3 Garçons", ["4,90","9,50","17,90","21,90"]),("Bordeaux AOP — L’Attrape Rêve", ["5,20","9,90","18,90","22,90"]),("Bourgueil AOP — Prestige & Tradition", ["5,40","10,40","19,50","23,90"]),("Côtes de Bourg AOP — Hipster de Barbe", ["5,60","10,50","19,80","24,90"]),("Lussac-Saint-Émilion AOP — Grand Ricombre", ["6,60","12,80","23,90","29,90"]),("Brouilly AOP — Réserve de Beauvoisie", ["6,90","13,60","26,50","32,90"]),("IGP Pays d’Oc Bio — Laroche La Chevrière Pinot Noir", ["5,90","10,90","19,90","26,90"]),("Bourgogne Côte Chalonnaise AOP — Millebuis Pinot Noir", ["8,30","15,90","29,90","37,60"]),("Pic Saint-Loup AOP — Puech de Fourques", ["—","—","—","38,70"]),("Crozes-Hermitage AOP — Chante Passo", ["—","—","—","45,90"]),("Gigondas AOP Bio — Pierre Amadieu Romane Machotte", ["—","—","—","58,00"])]),
("Vin blanc", [("Bourgogne Côte Chalonnaise AOP — Millebuis Chardonnay", ["7,80","15,50","29,90","36,90"]),("Petit Chablis AOP — La Revrie", ["8,30","16,20","30,50","42,10"]),("IGP Pays d’Oc — Le Sudiste Chardonnay", ["4,60","8,90","15,90","22,50"]),("IGP Pays de l’Hérault Bio — Dom. De Petit Roubié Sauvignon", ["5,60","10,80","19,80","27,90"]),("IGT Terre Siciliane Bio — Vinisella Pinot Grigio La Passione", ["4,50","8,60","15,50","21,90"]),("IGP Côtes de Thau Moelleux — L’Or de l’Ange", ["6,90","13,50","25,90","35,80"])]),
("Vin rosé", [("Côtes de Provence AOP Bio — MV Presqu’île de St-Tropez", ["7,60","14,50","26,90","33,90"]),("IGP Méditerranée Bio — La Demoiselle sans Gêne", ["5,60","10,50","19,90","29,90"]),("IGP Méditerranée — Le Roi Soleil", ["5,30","9,40","18,40","26,10"])]),
("Bulles", [("Champagne H. Richard — Cuvée Henri", ["10,50","62,00"]),("Champagne Nicolas Feuillatte — Brut Réserve Exclusive", ["—","81,00"]),("Prosecco Il Poggio — Blanc de Noirs Extra Dry", ["4,90","28,90"])])]


def wine_panel(page, y, title, rows, short=False):
    x,w=M,W-2*M; rowh=[]; name_w=w-(2 if short else 4)*180-80
    for name, vals in rows:
        rowh.append(69 if len(page.wrap(name,max(12,int(name_w/(19*.55)))) )==1 else 92)
    h=105+sum(rowh)+18*len(rows)
    page.panel(x,y,w,h,title)
    labels=["COUPE 12 CL","75 CL"] if short else ["12,5 CL","25 CL","50 CL","75 CL"]
    cols=len(labels); price_w=175 if not short else 260
    page.text(x+24,y+78,"APPELLATION",17,MUTED,SERIF,True)
    for i,label in enumerate(labels): page.text(x+w-(cols-i)*price_w,y+78,label,15,MUTED,SERIF,True)
    cy=y+116
    for (name,vals),rh in zip(rows,rowh):
        page.block(x+24,cy,name,name_w,19,INK,SERIF,True,24,2)
        for i,val in enumerate(vals): page.text(x+w-(cols-i)*price_w,cy,val,20,INK,SERIF,True)
        page.line(x+24,cy+rh-9,x+w-24,cy+rh-9,"#e6d8b1",1)
        cy += rh+18
    return y+h+22


def wines_page(n):
    p=Page(); border(p); interior_header(p); y=450
    for title,rows in WINES: y=wine_panel(p,y,title,rows,title=="Bulles")
    footer(p,n); return p


COCKTAILS_CLASSIC=[("Mojito","7,90 / 6,00","Rhum, menthe fraîche, citron vert, sucre de canne, eau gazeuse"),("Caïpirinha","7,50 / 5,00","Cachaça, citron vert, sucre de canne"),("Caïpiroska","7,50 / 6,00","Vodka, citron vert, sucre de canne"),("Ti-Punch","7,50 / 5,00","Rhum, citron vert, sucre de canne"),("Mai Tai","8,90 / 7,00","Rhum blanc, rhum ambré, citron vert, Cointreau, sirop d’orgeat"),("Piña Colada","7,50 / 5,00","Rhum, jus d’ananas, crème de coco"),("Strawberry Colada","7,90 / 6,00","Rhum, jus d’ananas, sirop de fraise, crème de coco"),("Cuba Libre","7,50 / 5,00","Rhum, Coca-Cola, jus de citron"),("Tequila Sunrise","7,50 / 6,00","Tequila, jus d’orange, sirop de grenadine")]
COCKTAILS_SPRITZ=[("Spritz","8,90 / 7,00","Apérol, Prosecco, orange, eau gazeuse"),("St-Germain Spritz","9,90 / 8,50","Liqueur de fleurs de sureau, Prosecco, orange, eau gazeuse"),("Suze Tonic","7,50 / 5,00","Suze, Schweppes Tonic, citron"),("La Colline","7,90 / 6,00","Tequila, citron vert, sirop de cassis, Schweppes Tonic"),("Gin Tonic","7,50 / 6,00","Gin, Schweppes Tonic, citron")]
COCKTAILS_MULES=[("Moscow Mule","7,90 / 6,00","Vodka, citron vert, ginger beer"),("Jamaïcan Mule","7,90 / 6,00","Rhum, citron vert, ginger beer"),("London Mule","7,90 / 6,00","Gin, citron vert, ginger beer"),("Gin Fizz","7,50 / 6,00","Gin, citron vert, sucre de canne, limonade")]
COCKTAILS_ELEGANCE=[("Havane Passion","7,50 / 5,00","Rhum, sirop de fruit de la passion, citron"),("Passion Royal","7,90 / 6,00","Prosecco, vodka, sirop de passion, citron vert"),("Margarita","7,90 / 6,00","Tequila, Cointreau, citron vert"),("Black Russian","8,50 / 7,50","Vodka, liqueur de café, cerise"),("Madeleine","8,90 / 7,50","Cointreau, amaretto, jus d’ananas"),("Cosmopolitan","8,90 / 7,50","Vodka, Cointreau, cranberry, citron vert"),("Sex on the Beach","8,90 / 7,50","Vodka, Cointreau, crème de pêche, orange, cranberry"),("Bloody Mary","8,90 / 7,50","Vodka, tomate, citron et épices"),("Expresso Martini","8,90 / 7,50","Vodka, liqueur de café, expresso, sucre de canne"),("Violette Royale","12,90 / —","Crème de violette, champagne, cerise"),("Spritz Violette","10,90 / 9,00","Prosecco, crème de violette, eau gazeuse, myrtilles"),("Aviation","10,50 / 9,00","Gin, crème de violette, citron jaune")]
MOCKTAILS=[("St Valentin","5,90","Sirop de violette, citron vert, Schweppes Tonic"),("Bora Bora","5,90","Jus d’ananas, jus d’orange, sirop de grenadine"),("Virgin Colline","5,90","Jus d’orange, jus d’ananas, citron, sirop de cassis"),("Virgin Mojito","5,90","Citron vert, menthe, sucre de canne, eau gazeuse"),("Virgin Colada","5,90","Jus d’ananas, crème de coco"),("Virgin Bloody Mary","5,90","Jus de tomate, citron, épices")]


def cocktails_page(n):
    p=Page(); border(p); interior_header(p); y=450
    y=list_panel(p,y,"Cocktails classiques",COCKTAILS_CLASSIC,2,"PRIX / HAPPY HOUR (HH) · 17H → 23H",True)
    duo_gap=24; duo_w=(W-2*M-duo_gap)/2; h=535
    p.panel(M,y,duo_w,h,"Spritz & fraîcheur"); p.panel(M+duo_w+duo_gap,y,duo_w,h,"Mules & fizz")
    for bx,items in [(M,COCKTAILS_SPRITZ),(M+duo_w+duo_gap,COCKTAILS_MULES)]:
        cy=y+98
        for name,price,note in items:
            p.text(bx+22,cy,name,20,INK,SERIF,True); p.text(bx+duo_w-22,cy,price,19,INK,SERIF,True,align="right")
            p.block(bx+22,cy+31,note,duo_w-44,16,MUTED,SANS,False,21,2); cy+=88
    y+=h+22
    y=list_panel(p,y,"Élégance & saveurs",COCKTAILS_ELEGANCE,2,"PRIX / HAPPY HOUR (HH) · 17H → 23H",True)
    y=list_panel(p,y,"Mocktails",MOCKTAILS,2,"✦ SANS ALCOOL ✦",True)
    footer(p,n); return p


def make_cover_art():
    TMP.mkdir(exist_ok=True)
    base=TMP/'cover-base.png'; mask=TMP/'cover-mask.png'; out=TMP/'cover-art.png'
    subprocess.run(['convert',str(ROOT/'logo-gambetta.png'),'-resize','1500x1500','-background',V950,'-gravity','center','-extent','1500x1500',str(base)],check=True)
    subprocess.run(['convert','-size','1500x1500','radial-gradient:white-black',str(mask)],check=True)
    subprocess.run(['convert',str(base),str(mask),'-compose','CopyOpacity','-composite',str(out)],check=True)


def render_page(page, name):
    mvg=TMP/(name+'.mvg'); png=OUT/(name+'.png'); jpg=OUT/(name+'.jpg')
    page.save(mvg)
    subprocess.run(['convert','mvg:'+str(mvg),str(png)],check=True)
    subprocess.run(['convert',str(png),'-quality','95',str(jpg)],check=True)
    return png


def write_pdf(jpgs, destination):
    """Write a small image-based, multi-page PDF without relying on Ghostscript."""
    objects = []
    def add(data):
        objects.append(data if isinstance(data, bytes) else data.encode('ascii'))
        return len(objects)
    pages_id = add(b'')
    catalog_id = add(b'')
    page_ids = []
    for jpg in jpgs:
        image = jpg.read_bytes()
        image_id = add((f'<< /Type /XObject /Subtype /Image /Width {W} /Height {H} '
                        f'/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode '
                        f'/Length {len(image)} >>\nstream\n').encode('ascii') + image + b'\nendstream')
        content = f'q 595.276 0 0 841.89 0 0 cm /Im0 Do Q'.encode('ascii')
        content_id = add(f'<< /Length {len(content)} >>\nstream\n'.encode('ascii') + content + b'\nendstream')
        page_id = add((f'<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595.276 841.89] '
                       f'/Resources << /XObject << /Im0 {image_id} 0 R >> >> /Contents {content_id} 0 R >>').encode('ascii'))
        page_ids.append(page_id)
    objects[pages_id-1] = (f'<< /Type /Pages /Kids [{" ".join(f"{i} 0 R" for i in page_ids)}] '
                           f'/Count {len(page_ids)} >>').encode('ascii')
    objects[catalog_id-1] = f'<< /Type /Catalog /Pages {pages_id} 0 R >>'.encode('ascii')
    with destination.open('wb') as f:
        f.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
        offsets = [0]
        for i, obj in enumerate(objects, 1):
            offsets.append(f.tell())
            f.write(f'{i} 0 obj\n'.encode('ascii')); f.write(obj); f.write(b'\nendobj\n')
        xref = f.tell()
        f.write(f'xref\n0 {len(objects)+1}\n'.encode('ascii'))
        f.write(b'0000000000 65535 f \n')
        for offset in offsets[1:]: f.write(f'{offset:010d} 00000 n \n'.encode('ascii'))
        f.write(f'trailer\n<< /Size {len(objects)+1} /Root {catalog_id} 0 R >>\n'.encode('ascii'))
        f.write(f'startxref\n{xref}\n%%EOF\n'.encode('ascii'))

def main():
    if shutil.which('convert') is None:
        raise SystemExit('ImageMagick (convert) is required')
    OUT.mkdir(exist_ok=True); TMP.mkdir(exist_ok=True); make_cover_art()
    pages=[cover_page(1), food_page(2,[("Entrées",ENTREES),("Planches & croques",PLANCHES),("Omelettes",OMELETTES)]), food_page(3,[("Plats",PLATS),("Burgers",BURGERS),("Salades",SALADES)]), food_page(4,[("Desserts",DESSERTS),("Glaces",GLACES),("Fromages",FROMAGES)]), menus_page(5), drinks_page(6,[("Boissons fraîches",FRESH,None),("Boissons chaudes",HOT,None)]), drinks_page(7,[("Apéritifs",APERITIFS,None),("Whiskies",WHISKIES,"Doses de 4 cl"),("Digestifs",DIGESTIFS,None),("Bières",BEERS,"Pression • bouteille • HH")]), wines_page(8), cocktails_page(9)]
    pngs=[]
    for i,page in enumerate(pages,1): pngs.append(render_page(page,f'page-{i:02d}'))
    jpgs=[OUT/(f'page-{i:02d}.jpg') for i in range(1,len(pages)+1)]
    write_pdf(jpgs, OUT/'carte-menus-boissons-a4.pdf')
    for png in pngs:
        png.unlink(missing_ok=True)
    print(f'generated {len(jpgs)} pages in {OUT}')


if __name__ == '__main__': main()
