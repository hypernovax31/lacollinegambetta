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
        # The old printed card uses a generous floating purple heading rather
        # than a boxed panel title.
        self.rect(x, y, w, 82, V900 if dark else V950, GOLD, 3, 41)
        self.text(x + w/2, y + 21, f"✦  {title.upper()}  ✦", 29, WHITE, SERIF, True, center=True)

    def panel(self, x, y, w, h, title=None, fill=WHITE):
        self.rect(x, y, w, h, fill, "#c9a554", 2, 20)
        if title:
            pill_w = min(w - 80, max(350, len(title) * 22 + 170))
            self.title_pill(x + (w-pill_w)/2, y + 22, pill_w, title)

    def save(self, path):
        path.write_text("\n".join(self.c), encoding="utf-8")


def border(page, dark=False):
    # Fine side rule borrowed from the former printed card. The old card's
    # strong visual frame remains the full-width purple header and footer.
    page.rect(12, 12, W-24, H-24, "none", GOLD, 2, 2)
    page.line(0, 392, W, 392, GOLD, 6)
    page.line(0, H-205, W, H-205, GOLD, 6)

def footer(page, n, dark=False):
    y = H - 205
    page.rect(0, y, W, H-y, V800 if not dark else V950, None, 0)
    page.line(0, y, W, y, GOLD, 6)
    page.text(W/2, y+24, "✦  PRIX NETS EN EUROS • SERVICE COMPRIS  ✦", 18, GOLD_LIGHT, SERIF, False, center=True)
    page.text(W/2, y+61, "LA COLLINE GAMBETTA", 25, GOLD_LIGHT, SERIF, True, center=True)
    page.text(W/2, y+99, "BAR • RESTAURANT  •  01 43 49 05 93  •  ◎ lacolline.gambetta", 17, WHITE, SANS, True, center=True)
    page.text(W/2, y+132, "L’abus d’alcool est dangereux pour la santé — À consommer avec modération", 14, "#dbcfe0", SANS, False, center=True)
    page.text(W-115, y+54, str(n), 34, GOLD_LIGHT, SERIF, True, align="right")

def interior_header(page):
    # Reprise du bandeau de l'ancienne carte : logo typographique centré,
    # filets décoratifs et informations d'ouverture lisibles.
    page.rect(0, 0, W, 390, V800, None, 0)
    page.text(W/2, 25, "LA", 26, GOLD_LIGHT, SERIF, True, center=True)
    page.text(W/2, 58, "COLLINE", 70, WHITE, SERIF, True, center=True)
    page.text(W/2, 138, "GAMBETTA", 36, GOLD_BRIGHT, SERIF, True, center=True)
    page.line(760, 204, 1720, 204, "#b89042", 2)
    page.text(W/2, 221, "BAR • RESTAURANT • PARIS 20ᵉ", 24, GOLD_LIGHT, SERIF, True, center=True)
    page.text(W/2, 270, "✦  FAIT MAISON • SERVICE CONTINU • TERRASSE  ✦", 20, GOLD_LIGHT, SERIF, False, center=True)
    page.line(0, 388, W, 388, GOLD, 6)

def food_panel(page, y, title, items, columns=2, card_min=140):
    """Airy, unboxed two-column list inspired by the former A3 card."""
    x, w, gap = M, W-2*M, 32
    col_w=(w-gap)/columns
    # The former card used true framed cards for ice creams and a single row
    # of cheese tiles. Keep those two visual signatures instead of flattening
    # every category into the same list.
    if title == "Glaces":
        page.title_pill(W/2-390,y,780,"NOS GLACES")
        card_gap=28; card_w=(w-card_gap)/2; top=y+140
        rows=[items[i:i+2] for i in range(0,len(items),2)]
        cy=top
        for row in rows:
            rh=150
            for c,(name,price,note) in enumerate(row):
                cx=x+c*(card_w+card_gap)
                page.rect(cx,cy,card_w,rh,"#fffdf8",GOLD,3,18)
                page.text(cx+28,cy+25,name.upper(),23,INK,SERIF_BOLD,False)
                page.text(cx+card_w-28,cy+25,price,26,"#9c7a2d",SERIF_BOLD,False,align="right")
                if note: page.block(cx+28,cy+72,note,card_w-56,19,"#817888",SANS,False,25,3)
            cy+=rh+20
        return cy+42
    if title == "Fromages":
        page.title_pill(W/2-390,y,780,"NOS FROMAGES")
        tile_gap=24; tile_w=(w-4*tile_gap)/5; top=y+137
        for i,(name,price,note) in enumerate(items):
            cx=x+i*(tile_w+tile_gap)
            page.rect(cx,top,tile_w,150,"#fffdf8",GOLD,3,18)
            page.text(cx+tile_w/2,top+34,name.upper(),17,INK,SANS_BOLD,False,center=True)
            page.text(cx+tile_w/2,top+91,price,30,"#9c7a2d",SERIF_BOLD,False,center=True)
        return top+190
    half=(len(items)+columns-1)//columns
    cols=[items[:half], items[half:]] if columns==2 else [items]
    page.title_pill(W/2-390, y, 780, f"NOS {title}")
    top=y+142
    heights=[]
    for col in cols:
        total=0
        for name,price,note in col:
            note_lines=page.wrap(note,max(14,int((col_w-200)/(21*.55)))) if note else []
            total += max(82, 62+len(note_lines)*30)
        heights.append(total)
    content_h=max(heights or [80])
    if columns==2:
        page.line(x+col_w+gap/2, top-15, x+col_w+gap/2, top+content_h-12, "#e2c97f", 3)
    for c,col in enumerate(cols):
        cx=x+c*(col_w+gap); cy=top
        for name,price,note in col:
            page.text(cx,cy,name,28,INK,SANS_BOLD,False)
            page.text(cx+col_w-18,cy,price,29,V900,SERIF_BOLD,False,align="right")
            # Dotted leader leaves the price and description visually separate.
            name_est=min(col_w-260, len(name)*15+18)
            line_start=cx+name_est
            page.line(line_start,cy+27,cx+col_w-40,cy+27,"#b9b2bd",2,"2,8")
            if note:
                page.block(cx+name_est,cy+32,note,col_w-name_est-90,21,"#897e8d",SANS,False,28,2)
                cy+=max(82,62+len(page.wrap(note,max(14,int((col_w-200)/(21*.55)))))*30)
            else:
                cy+=82
    return y+142+content_h+58

def list_panel(page, y, title, items, columns=2, subtitle=None, compact=False):
    """Unboxed price list used for drinks and cocktails, with old-card rhythm."""
    x,w,gap=M,W-2*M,32; col_w=(w-gap)/columns
    half=(len(items)+columns-1)//columns
    cols=[items[i*half:min((i+1)*half,len(items))] for i in range(columns)]
    page.title_pill(W/2-340,y,680,title)
    top=y+125 if not subtitle else y+153
    if subtitle: page.text(W/2,y+98,subtitle,19,GOLD,SERIF,True,center=True)
    sizes=[]
    for col in cols:
        total=0
        for name,price,note in col:
            lines=page.wrap(note,max(12,int((col_w-230)/(20*.55)))) if note else []
            total+=max(72,60+len(lines)*27)
        sizes.append(total)
    maxh=max(sizes or [0])
    if columns==2: page.line(x+col_w+gap/2,top-12,x+col_w+gap/2,top+maxh-10,"#e2c97f",2)
    for c,col in enumerate(cols):
        cx=x+c*(col_w+gap); cy=top
        for name,price,note in col:
            size=25 if compact else 27
            page.text(cx,cy,name,size,INK,SANS,False)
            page.text(cx+col_w-18,cy,price,26,V900,SERIF_BOLD,False,align="right")
            start=cx+min(col_w-250,max(170,len(name)*14+20))
            page.line(start,cy+26,cx+col_w-38,cy+26,"#c7c1ca",2,"2,8")
            if note:
                nh=page.block(cx+20,cy+34,note,col_w-90,19,"#918694",SANS,False,25,2)
                cy+=max(72,60+nh+8)
            else: cy+=72
    return y+top-y+maxh+58

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
    p=Page(dark=True); border(p)
    p.text(W/2, 140, "LA CARTE", 64, GOLD_LIGHT, SERIF_BOLD, False, center=True)
    p.text(W/2, 255, "BAR • RESTAURANT • PARIS 20ᵉ", 29, GOLD_LIGHT, SERIF, False, center=True)
    p.text(W/2, 315, "✦  FAIT MAISON • SERVICE CONTINU • TERRASSE  ✦", 24, GOLD_LIGHT, SERIF, False, center=True)
    # A more generous circular presentation keeps the supplied illustration
    # crisp, with the former card's fine-gold ornamental frame around it.
    p.circle(W/2, 1590, 705, GOLD, 8)
    p.circle(W/2, 1590, 650, "#e7c873", 2)
    p.raw("gravity northwest")
    p.raw(f"image over 560,910 1360,1360 {q(str(TMP/'cover-art.png'))}")
    p.text(W/2, 2825, "LA COLLINE GAMBETTA", 48, GOLD_LIGHT, SERIF_BOLD, False, center=True)
    p.text(W/2, 2920, "4 RUE BELGRAND • 75020 PARIS • PLACE GAMBETTA", 29, WHITE, SERIF, False, center=True)
    p.text(W/2, 2990, "lacolline.gambetta   •   01 43 49 05 93", 26, GOLD_LIGHT, SANS, False, center=True)
    footer(p,n,True); return p

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
    p=Page(); border(p); interior_header(p)
    x,w,gap=M,W-2*M,42
    p.title_pill(W/2-340,450,680,"NOS MENUS")
    # Formules : large, calm cards with the former menu's gold badges.
    y=610; card_w=(w-gap)/2; card_h=310
    p.rect(x,y,card_w,card_h,WHITE,GOLD,3,22)
    p.rect(x+card_w+gap,y,card_w,card_h,"#fffdf2",GOLD,4,22)
    for cx,label,sub,price in [(x,"ENTRÉE + PLAT","OU PLAT + DESSERT","24,90"),(x+card_w+gap,"LA FORMULE COMPLÈTE","ENTRÉE + PLAT + DESSERT","29,90")]:
        bw=min(card_w-40,430)
        p.rect(cx+card_w/2-bw/2,y-30,bw,76,"#efd076",GOLD,2,38)
        p.text(cx+card_w/2,y-8,label,20,V950,SERIF_BOLD,False,center=True)
        p.text(cx+card_w/2,y+19,sub,18,V950,SERIF,False,center=True)
        p.text(cx+card_w/2,y+112,price,62,V900,SERIF_BOLD,False,center=True)
        p.text(cx+card_w/2,y+224,"AU CHOIX",18,"#9c7a2d",SERIF_BOLD,False,center=True)
    # Choice columns.
    y=1065; choice_h=500; cw=(w-2*gap)/3
    choices=[("1","ENTRÉE AU CHOIX",["Salade au poulet","Escargots de Bourgogne","Pâté de campagne","Œuf cocotte","Assiette de charcuterie"]),("2","PLAT AU CHOIX",["Escalope de veau","Bavette d’aloyau — Sauce au choix","Cuisse de canard confite"]),("3","DESSERT AU CHOIX",["Panna cotta","Crème brûlée","Mousse au chocolat","Tiramisu","2 boules de glace"])]
    for i,(num,title,lines) in enumerate(choices):
        cx=x+i*(cw+gap)
        p.rect(cx,y,cw,choice_h,WHITE,"#ded8df",2,18)
        p.line(cx+22,y+86,cx+cw-22,y+86,GOLD,3)
        p.filled_circle(cx+45,y+45,24,V900)
        p.text(cx+45,y+29,num,20,WHITE,SERIF_BOLD,False,center=True)
        p.text(cx+83,y+30,title,19,INK,SERIF_BOLD,False)
        ly=y+126
        for line in lines:
            p.text(cx+28,ly,"✦",15,GOLD,SERIF_BOLD,False)
            p.block(cx+55,ly,line,cw-88,19,MUTED,SANS,False,26,2); ly+=55
    # Menu enfant and menu du jour: two feature cards.
    y=1725; bottom_h=610; bw=(w-gap)/2; rx=x+bw+gap
    p.rect(x,y,bw,bottom_h,WHITE,GOLD,4,22)
    p.rect(rx,y,bw,bottom_h,V950,GOLD,4,22)
    for cx,label,color in [(x,"MOINS DE 12 ANS",V950),(rx,"SELON L’ARDOISE",V950)]:
        badge_w=340 if cx==x else 360
        p.rect(cx+bw/2-badge_w/2,y-30,badge_w,72,"#efd076",GOLD,2,36)
        p.text(cx+bw/2,y-8,label,19,color,SERIF_BOLD,False,center=True)
    p.text(x+bw/2,y+135,"LE MENU ENFANT",32,INK,SERIF_BOLD,False,center=True)
    p.block(x+52,y+225,"Eau ou soda • Burger enfant ou cordon bleu • Frites maison • 1 boule de glace au choix",bw-104,21,MUTED,SANS,False,30,4)
    p.text(x+bw/2,y+475,"11,90",54,V900,SERIF_BOLD,False,center=True)
    p.text(rx+bw/2,y+145,"LE MENU DU JOUR",31,WHITE,SERIF_BOLD,False,center=True)
    for iy,(label,desc,price) in enumerate([("2 SERVICES","ENTRÉE + PLAT OU PLAT + DESSERT","17,90"),("3 SERVICES","ENTRÉE + PLAT + DESSERT","21,90")]):
        cy=y+215+iy*145
        p.text(rx+65,cy,label,18,GOLD_LIGHT,SERIF_BOLD,False)
        p.block(rx+65,cy+34,desc,bw-270,18,WHITE,SANS_BOLD,False,24,2)
        p.text(rx+bw-55,cy+23,price,29,GOLD_LIGHT,SERIF_BOLD,False,align="right")
    p.text(rx+bw/2,y+545,"Uniquement les midis — sauf weekends et jours fériés",15,"#d6c9d9",SANS,False,center=True)
    # Breakfast bar kept separate, as on the old card.
    y=2465; p.rect(x,y,w,180,"#fff8df",GOLD,3,20)
    p.text(x+55,y+64,"✦  PETIT DÉJEUNER  ✦",24,INK,SERIF_BOLD,False)
    p.block(x+600,y+42,"Boisson chaude au choix • Croissant ou tartine au beurre • Verre de jus de fruits au choix",w-920,18,MUTED,SANS,False,25,3)
    p.text(x+w-80,y+62,"7,00",38,V900,SERIF_BOLD,False,align="right")
    footer(p,n); return p

FRESH = [("Vittel", "3,90 / 4,90 / 5,90", "25 cl / 50 cl / 1 L"), ("San Pellegrino", "4,90 / 6,20", "50 cl / 1 L"), ("Badoit", "4,90 / 6,20", "33 cl / 1 L"), ("Perrier", "4,90", "33 cl"), ("Coca / Zéro / Cherry", "4,90", "33 cl"), ("Fanta / Sprite / Fuze Tea", "4,90", "25 cl"), ("Orangina / Citronnade / Ginger Beer", "4,90", "25 cl"), ("Diabolo / Limonade", "4,90", "25 cl"), ("Schweppes Tonic / Agrumes", "4,90", "25 cl"), ("Jus / Nectar de fruits", "4,90", "25 cl"), ("Sirop à l’eau", "3,00", ""), ("Supplément sirop · 2 cl", "0,50", "grenadine • fraise • citron • menthe • pêche • violette • passion • vanille • coco • orgeat • cassis"), ("Orange pressée / Citron pressé", "5,50", "25 cl"), ("Milkshake", "5,90", ""), ("Café frappé", "4,90", ""), ("Latte frappé", "5,50", "")]
HOT = [("Café", "2,40", ""), ("Décaféiné", "2,50", ""), ("Café noisette / allongé", "2,60", ""), ("Double café / décaféiné", "4,80", ""), ("Café crème / chocolat chaud", "4,50", ""), ("Cappuccino", "5,10", ""), ("Crème / chocolat viennois", "5,10", ""), ("Café viennois", "4,90", ""), ("Infusion / thé parfumé", "4,90", ""), ("Grog", "5,90", ""), ("Vin chaud aux épices", "4,90", ""), ("Irish coffee", "9,90", ""), ("Café allongé", "2,90", "Caramel ou vanille"), ("Lait chaud", "3,20", "")]
APERITIFS = [("Martini", "4,50", "5 cl — Blanc, rouge"), ("Ricard / Pastis", "3,90", "2 cl"), ("Kir", "4,50", "12 cl — Cassis, framboise, mûre, pêche"), ("Kir Royal", "10,90", "12 cl"), ("Americano", "8,60", "8 cl"), ("Negroni", "8,90", "8 cl"), ("Porto", "4,50", "5 cl — Blanc, rouge"), ("Suze / Campari", "4,50", "5 cl"), ("Muscat / Salers", "4,50", "6 cl"), ("Cidre brut", "4,90", "25 cl")]
WHISKIES = [("Clan Campbell", "7,60", ""), ("Jameson", "7,80", ""), ("Jack Daniels", "8,60", ""), ("Johnny Walker", "8,80", ""), ("Chivas Regal", "8,80", "")]
DIGESTIFS = [("Bas Armagnac VSOP", "7,20", ""), ("Rhum des Îles, Calvados", "6,20", ""), ("Vodka", "6,90", ""), ("Get 27 / 31, Bailey’s, Malibu", "7,10", ""), ("Cognac VSOP", "7,20", ""), ("Manzana Verde", "6,10", ""), ("Vieille Prune de Souillac", "7,20", ""), ("Poire, Mirabelle, Framboise", "7,20", ""), ("Amaretto, Fernet Branca", "7,20", ""), ("Grand Marnier, Cointreau", "7,20", "")]
BEERS = [("La Semeuse", "3,40 / 6,20 / 3,90", "25 cl • Pinte • HH"), ("Valmy Blanche bio", "4,30 / 7,90 / 6,00", "25 cl • Pinte • HH"), ("Triple d’Orgemont bio", "4,80 / 9,50 / 8,50", "25 cl • Pinte • HH"), ("Légionnaire IPA", "4,50 / 8,80 / 7,00", "25 cl • Pinte • HH"), ("Heineken", "4,90", "25 cl • bouteille"), ("1664 Blanc", "4,90", "25 cl • bouteille"), ("Desperados", "5,90", "33 cl • bouteille"), ("Corona", "6,20", "33 cl • bouteille"), ("Bière sans alcool", "4,90", "25 cl • bouteille")]


def drinks_page(n, groups):
    p=Page(); border(p); interior_header(p); y=450
    if n == 6:
        p.title_pill(W/2-350,y,700,"NOS BOISSONS")
        y += 142
    for title, items, subtitle in groups:
        y=list_panel(p,y,title,items,2,subtitle,compact=True)
    footer(p,n); return p


WINES = [
("Vin rouge", [("Côtes du Rhône AOP Bio — Les 3 Garçons", ["4,90","9,50","17,90","21,90"]),("Bordeaux AOP — L’Attrape Rêve", ["5,20","9,90","18,90","22,90"]),("Bourgueil AOP — Prestige & Tradition", ["5,40","10,40","19,50","23,90"]),("Côtes de Bourg AOP — Hipster de Barbe", ["5,60","10,50","19,80","24,90"]),("Lussac-Saint-Émilion AOP — Grand Ricombre", ["6,60","12,80","23,90","29,90"]),("Brouilly AOP — Réserve de Beauvoisie", ["6,90","13,60","26,50","32,90"]),("IGP Pays d’Oc Bio — Laroche La Chevrière Pinot Noir", ["5,90","10,90","19,90","26,90"]),("Bourgogne Côte Chalonnaise AOP — Millebuis Pinot Noir", ["8,30","15,90","29,90","37,60"]),("Pic Saint-Loup AOP — Puech de Fourques", ["—","—","—","38,70"]),("Crozes-Hermitage AOP — Chante Passo", ["—","—","—","45,90"]),("Gigondas AOP Bio — Pierre Amadieu Romane Machotte", ["—","—","—","58,00"])]),
("Vin blanc", [("Bourgogne Côte Chalonnaise AOP — Millebuis Chardonnay", ["7,80","15,50","29,90","36,90"]),("Petit Chablis AOP — La Revrie", ["8,30","16,20","30,50","42,10"]),("IGP Pays d’Oc — Le Sudiste Chardonnay", ["4,60","8,90","15,90","22,50"]),("IGP Pays de l’Hérault Bio — Dom. De Petit Roubié Sauvignon", ["5,60","10,80","19,80","27,90"]),("IGT Terre Siciliane Bio — Vinisella Pinot Grigio La Passione", ["4,50","8,60","15,50","21,90"]),("IGP Côtes de Thau Moelleux — L’Or de l’Ange", ["6,90","13,50","25,90","35,80"])]),
("Vin rosé", [("Côtes de Provence AOP Bio — MV Presqu’île de St-Tropez", ["7,60","14,50","26,90","33,90"]),("IGP Méditerranée Bio — La Demoiselle sans Gêne", ["5,60","10,50","19,90","29,90"]),("IGP Méditerranée — Le Roi Soleil", ["5,30","9,40","18,40","26,10"])]),
("Bulles", [("Champagne H. Richard — Cuvée Henri", ["10,50","62,00"]),("Champagne Nicolas Feuillatte — Brut Réserve Exclusive", ["—","81,00"]),("Prosecco Il Poggio — Blanc de Noirs Extra Dry", ["4,90","28,90"])])]


def wine_panel(page,y,title,rows,short=False):
    x,w=M,W-2*M; price_w=205 if not short else 300
    labels=["COUPE 12 CL","75 CL"] if short else ["12,5 CL","25 CL","50 CL","75 CL"]
    cols=len(labels); name_w=w-cols*price_w-70
    heading="NOS BULLES" if short else title.upper()
    page.title_pill(W/2-(350 if short else 330),y,(700 if short else 660),heading)
    top=y+130
    page.text(x+12,top,"CHAMPAGNES & PROSECCO" if short else "",16,MUTED,SERIF_BOLD,False)
    for i,label in enumerate(labels): page.text(x+w-(cols-i)*price_w,top,label,16,MUTED,SERIF_BOLD,False)
    cy=top+40
    row_h=66 if not short else 64
    for name,vals in rows:
        page.text(x+12,cy,name,22,INK,SANS,False)
        for i,val in enumerate(vals): page.text(x+w-(cols-i)*price_w,cy,val,22,V900,SERIF_BOLD,False,align="right")
        page.line(x+12,cy+32,x+w-12,cy+32,"#c7c0ca",2,"2,8")
        cy+=row_h
    return cy+34

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
    p=Page(); border(p); interior_header(p)
    x,w,gap=M,W-2*M,42
    p.title_pill(W/2-360,450,720,"NOS COCKTAILS")
    p.rect(W/2-430,570,860,68,"#efd076",GOLD,2,34)
    p.text(W/2,588,"✦  HAPPY HOUR : 17H – 23H  ✦",24,V950,SERIF_BOLD,False,center=True)
    col_w=(w-2*gap)/3; top=775
    def col_heading(cx,y,title):
        p.line(cx,y+22,cx+col_w/2-130,y+22,GOLD,2)
        p.line(cx+col_w/2+130,y+22,cx+col_w,y+22,GOLD,2)
        p.text(cx+col_w/2,y,title,23,INK,SERIF_BOLD,False,center=True)
        p.text(cx+col_w/2,y+28,"✦",13,GOLD,SERIF_BOLD,False,center=True)
    def draw_items(cx,y,items,hh=True):
        cy=y
        for name,prices,note in items:
            if "/" in prices:
                normal, happy=[v.strip() for v in prices.split("/",1)]
            else: normal,happy=prices,""
            p.text(cx,cy,name.upper(),21,INK,SANS_BOLD,False)
            if normal: p.text(cx+col_w-145,cy,normal,24,V900,SERIF_BOLD,False,align="right")
            if hh and happy:
                short=happy.replace(",00","")
                p.rect(cx+col_w-86,cy-8,72,42,"#efd076",GOLD,2,21)
                p.text(cx+col_w-50,cy+1,short,17,V950,SERIF_BOLD,False,center=True)
            p.line(cx,cy+34,cx+col_w-100,cy+34,"#c7c0ca",2,"2,8")
            note_h=p.block(cx,cy+42,note,col_w-30,17,"#918694",SANS,False,23,3) if note else 0
            cy+=max(91,52+note_h)
        return cy
    # Three columns reproduce the breathing, editorial rhythm of the former card.
    cx1=x; cx2=x+col_w+gap; cx3=x+2*(col_w+gap)
    col_heading(cx1,top,"COCKTAILS CLASSIQUES")
    y1=draw_items(cx1,top+58,COCKTAILS_CLASSIC)
    col_heading(cx1,y1+26,"MULES & FIZZ")
    draw_items(cx1,y1+84,COCKTAILS_MULES)
    col_heading(cx2,top,"SPRITZ & FRAÎCHEUR")
    y2=draw_items(cx2,top+58,COCKTAILS_SPRITZ)
    col_heading(cx2,y2+26,"MOCKTAILS • 25 CL • SANS ALCOOL")
    draw_items(cx2,y2+84,MOCKTAILS,False)
    col_heading(cx3,top,"ÉLÉGANCE & SAVEURS")
    draw_items(cx3,top+58,COCKTAILS_ELEGANCE)
    footer(p,n); return p

def make_cover_art():
    TMP.mkdir(exist_ok=True)
    base=TMP/'cover-base.png'; mask=TMP/'cover-mask.png'; out=TMP/'cover-art.png'
    subprocess.run(['convert',str(ROOT/'cover-gambetta.png'),'-resize','1500x1500','-background',V950,'-gravity','center','-extent','1500x1500',str(base)],check=True)
    # A hard white circle with a very short blur keeps the illustration crisp;
    # the previous full-size radial gradient made most of the PNG translucent.
    subprocess.run(['convert','-size','1500x1500','xc:black','-fill','white','-draw','circle 750,750 750,55','-blur','0x28',str(mask)],check=True)
    subprocess.run(['convert',str(base),'(','-alpha','off',str(mask),')','-compose','CopyOpacity','-composite',str(out)],check=True)


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
