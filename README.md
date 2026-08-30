# La Colline Gambetta

Carte web interactive et carte imprimable A4 portrait.

## Carte imprimable (`carte.html`)

`carte.html` **recopie la mise en page du site** : mêmes textes, mêmes fontes,
mêmes titres à pastille violette liseré or, mêmes colonnes, mêmes interlignes.
Le générateur ne retape plus la carte en points — il compose chaque onglet **à la
largeur qui remplit la feuille**, puis réduit d'un facteur lié à cette largeur.

```bash
python3 tools/build_carte.py      # mesure, met en page, écrit carte.html
npm run build:carte-pdf           # les 10 JPEG, puis carte-a4.pdf
```

- Une feuille par onglet, dans l'ordre des onglets du site (`entrees, plats, menus,
  boissons, cocktails, vins, desserts`) ; les onglets denses (Boissons, Cocktails) en occupent
  deux. Le nombre de pages et la répartition viennent de `tools/measure_carte.mjs`,
  qui mesure le rendu réel (Chromium, fontes du site) — pas d'à-peu-près.
- **Cocktails : une seule colonne, sur deux feuilles.** Le site présente cet
  onglet en deux colonnes ; sur une feuille A4, il tenait alors tout entier sur
  la première (96 %) et laissait la seconde à 35 %. `tools/build_carte.py` force
  donc une colonne pour cet onglet (`html.carte-doc .carte-flow[data-sec="cocktails"] …
  grid-template-columns: 1fr`) : les quatre panneaux se répartissent en deux
  feuilles de poids égal et le pointillé meneur de prix court sur toute la
  largeur, comme pour les whiskies et les bières.
- **La zone utile se déduit du cadre doré.** Le filet est posé à 8 mm des bords,
  43 mm du haut, 25,5 mm du bas : la zone utile vaut donc 188,8 × 223,3 mm, à
  **2,6 mm** du filet — jamais dessus, parce que ces six nombres ne sont pas libres
  (`CADRE_MM` + `JEU_DANS_CADRE_MM` dans `tools/build_carte.py` en produisent
  quatre autres).
- **La largeur de composition est une variable, pas la copie de l'écran.** Tenir
  compte que le site compose à 1 140 px ne veut pas dire que le papier doit le
  faire : à facteur égal, un bloc de 1 140 px laisse 12 à 20 mm de blanc de
  chaque côté dès que l'échelle descend sous × 0,626 — c'est ce qui faisait dire
  que « toutes les pages ne sont pas bord à bord ». Chaque onglet cherche donc sa
  propre largeur `w` dans une échelle de treize (de 0,70 à 1,30 × 1 140 px, en
  haut et en bas de la largeur du site : au-dessus, le bloc s'étire sans rien
  casser, en dessous il se resserre et monte) et **son facteur est `zone / w`** :
  border le cadre en largeur n'est plus une intention, c'est l'identité. La
  hauteur, elle, décide du nombre de feuilles — on prend la largeur la plus
  étroite qui ne fait pas dépasser l'enveloppe de dix pages, donc le plus gros
  caractère possible. Journal d'un build : × 0,5690 (plats, boissons, cocktails)
  à × 0,7824 (menus), soit des intitulés de 7,6 à 10,5 pt, feuilles à 91-100 % de
  la hauteur et 100 % de la largeur.
- **Le blanc restant en bas devient du jeu entre panneaux.** Une feuille remplie
  à 82 % n'a pas un problème de caractères mais de souffle : la hauteur restante
  est répartie dans `row-gap` du flux (porté en style inline sur `.tab-flow`, donc
  en pixels non scalés), borné à 2,4 × l'écart du site (`JUSTIFY_MAX_RATIO`) pour
  que cela reste une carte et non une mise en page espacée au triple. Une page y
  a le droit de rester un peu courte plutôt que d'ouvrir ses panneaux comme un
  classeur : la dernière feuille des cocktails s'arrête à 91 %.
- **Plancher de lisibilité, pas de plafond.** `TITRE_MIN_PT` (7,2 pt sur le
  papier) est une limite basse signalée par le build — l'enveloppe de dix pages
  passe avant elle, mais aucune des neuf feuilles de contenu n'y descend
  aujourd'hui. Il n'y a pas de plafond assumé : une page qui ne se remplit
  qu'en grossissant son caractère doit pouvoir le grossir. Le revers est connu
  et voulu : le corps de la carte varie d'un onglet à l'autre. `--uniforme` fige
  tous les onglets sur le plus grand facteur qui les laisse tous à dix pages
  (× 0,5690, 7,6 pt partout, avec des feuilles de 70 à 99 %).
- **La feuille des vins n'est pas un tableur.** Le site pose ses vins en tableau :
  bandes alternées sous les lignes, filet plein sous chaque cellule, quatre
  colonnes bord à bord — à l'écran un outil de lecture, sur papier un tableau
  Excel. La carte reprend l'idiome de ses propres listes (en-tête en capitales
  dorées à `letter-spacing: .14em`, ligne aérée, pointillé `rgba(156,122,45,.38)`
  comme les prix des whiskies, prix en Cinzel 700 tabulaire) **sans toucher au
  site** : tout est sous `html.carte-doc`. Le gain de place est rendu en taille :
  le corps des lignes passe de 15,6 à 18,4 px de composition et le blanc de
  cellule de 10 à 5 px, ce qui fait retomber l'onglet sur sa largeur d'origine
  (1 140 px, × 0,6259) — une seule feuille, à 100 % dans le cadre, intitulés à
  8,4 pt et noms de bouteilles à 8,6 pt, au lieu de 7,1 pt sur deux feuilles.
  Les cocktails bénéficient du même échange (8 → 5,5 px de padding de ligne) et
  remontent de 7,0 à 7,6 pt.
- **Page « Nos Menus » : trois cartons d'une seule hauteur.** « Formule Duo » et
  « La formule complète » étaient deux cartons bas posés au-dessus d'un « Menu enfant »
  plus haut ; ils prennent désormais la hauteur de ce dernier (244 px de composition),
  le contenu se centre dans le carton, et la rangée est dimensionnée par
  `grid-auto-rows: minmax(…, auto)` — pas par `min-height` sur la carte : le site rejoue
  dans la carte sa règle `#menus .offer-card { min-height: 0 !important }`, assise sur un
  id, donc aucune hauteur minimale ne la ferait plier, alors qu'une rangée est libre.
  La valeur n'est pas crue : `MESURE_REFS` fait mesurer par `measure_carte.mjs` la hauteur
  réelle du carton de référence à **chaque** largeur candidate, et `garde_uniformite`
  arrête le build si elle s'écarte de plus de 8 px de la cible — la carte d'un restaurant
  n'a pas à porter trois gabarits différents parce qu'un libellé a changé. La page
  recomposée se cale à 100 % du cadre (× 0,7824, intitulés à 10,5 pt).
- **En-têtes de contenances de la feuille Vins remontés à 6,6 pt.** Le site les
  compose à 12,48 px, soit 5,3 pt une fois la feuille réduite — trop petit pour
  un libellé dont dépend la lecture d'un prix. `tools/build_carte.py` les passe à
  15,4 px et reprend la place gagnée sous la ligne d'en-tête (`padding-bottom`).
- **Le bloc est centré dans la feuille, après réduction.** La marge se calcule en
  millimètres de papier, `margin-left: max(0px, calc((var(--carte-zone-w) -
  var(--carte-base-w) * var(--carte-fit)) / 2))` — calculée dans le repère de
  composition, elle partait de 36 px à droite (9 mm sur papier). Le `max()` protège
  le cadre. Chaque feuille porte son propre `--carte-base-w` et son `--carte-fit`
  en style inline. Ces promesses sont vérifiées à chaque build par
  `build_carte_pdf.mjs` (`cadrage : symétrique à ± 0,00 mm et 2,6 mm avant le
  filet du cadre`) : un centrage faux ou un contenu qui toucherait le cadre
  arrête la construction, au lieu de passer inaperçu sur dix pages d'images.
- Les feuilles gardent le bandeau **COLLINE GAMBETTA** en tête et le pied légal :
  un document imprimé isolé doit se suffire. **Elles ne sont pas numérotées** —
  la carte se feuille dans l'ordre des onglets du site, ce numéro ne servait donc
  à rien (et le `data-page` des pages ne sert plus qu'aux outils).
- **L'ordre des feuilles est celui du site**, même s'il ne suit pas l'ordre d'un
  menu type : `entrees, plats, menus, boissons, cocktails, vins, desserts`. Il est
  écrit une fois dans l'en-tête de `tools/build_carte.py` (`SECTIONS`) et doit être
  répercuté dans la navigation du site (les boutons `.nav-btn`, qui suivent le même
  ordre que les sections du document) **et** dans `buildPrintDocument()`, le
  document A4 que le site construit pour l'impression depuis le navigateur : les
  trois listes (onglets, sections du document, feuilles) doivent rester identiques,
  sinon le client qui imprime et celui qui télécharge le PDF ne feuillettent pas la
  même carte. Celle-ci non plus ne numérote plus ses feuilles ; les onglets denses
  gardent leurs deux feuilles, dans le même ordre.
- Aperçu : ouvrir `carte.html` — les pages gardent le ratio A4 et s'adaptent à la
  largeur de la fenêtre, sans déformation. Impression : icône de téléchargement,
  Imprimer → Enregistrer au format PDF (A4 portrait réel).

Après un libellé ou un prix modifié, relancer `python3 tools/build_carte.py` :
l'empreinte SHA-256 d'`index.html` **et** celle de la CSS de carte sont comparées
à celles des mesures, et une mesure périmée déclenche une nouvelle mesure (ou une
erreur explicite). La mesure ne se fait plus dans `index.html` : la carte a ses
propres règles (la colonne unique des cocktails), le générateur écrit donc
`carte-measure.html` — même CSS, mêmes imbriquations, sans feuille ni mise à
l'échelle — et c'est là que les hauteurs sont relevées, **à chaque largeur de
l'échelle** (le document porte `data-carte-width-ratios`, seule source de vérité :
`build_carte.py` la lit pour choisir sa largeur, le mjs n'invente jamais de
liste). La largeur du site est forcée en inline `!important` sur `.tab-flow`, sans
quoi le plafond `#onglet > .tab-flow { max-width: var(--flowmax) }` du site
figeait toute variante au-dessus de 1 140 px sans jamais se plaindre. `tools/carte-metrics.json`
est committé avec les deux empreintes : sans Node ni Chromium, `build_carte.py`
réutilise ces chiffres et annonce qu'ils sont périmés plutôt que d'inventer.

## PDF A4 téléchargeable (`carte-a4.pdf`)

L'icône de téléchargement du header de `index.html` ouvre **`carte-a4.pdf`** : la carte en
**10 pages images** — une page = une feuille de `carte.html` photographiée à 300 dpi.
Les mêmes feuilles sont livrées en JPEG dans **`carte-a4-pages/`** (`page-01.jpg` … `page-10.jpg`),
prêtes à envoyer telles quelles à un imprimeur.

```bash
npm install                      # Playwright + Chromium (@sparticuz) + fontes @fontsource
npm run build:carte              # mesure → carte.html → JPEG → PDF
npm run build:carte-pdf          # uniquement les images et le PDF
```

Le choix du tout-image est assumé : le PDF rendu est identique à la carte affichée à l'écran,
sur n'importe quelle machine, sans police à installer ni substitution au moment d'imprimer.
Contrepartie : le texte n'est plus sélectionnable ni rechercheable, et le fichier pèse
~7 Mo au lieu de 3,7 Mo en vectoriel.

Comment ça marche (`tools/build_carte_pdf.mjs`) :

- Chromium rend `carte.html` sous média **screen**, à la largeur de composition mesurée
  (1 180 px, lue dans `data-carte-viewport`) et à `deviceScaleFactor` 3,125 : une feuille de
  210 mm (= 793,7 px CSS) sort à 2 480 px, soit 300 dpi ;
- les polices du site sont servies par `tools/local-fonts.mjs` (Cinzel et Montserrat depuis
  `node_modules/@fontsource`) — le build **s'arrête** si elles ne sont pas réellement chargées,
  et si une feuille déborde de sa zone utile (le rognage serait sinon silencieux) ;
- les JPEG sont ramenés à 2 480 × 3 508 exact quand ImageMagick est présent (Chromium arrondit
  les millimètres selon les feuilles et le liseré doré ajoute un pixel par bord ; sans `convert`,
  ±6 px sont tolérés) ;
- chaque fichier est contrôlé avant d'être retenu : format A4, ratio, RVB 8 bits, poids minimal
  (une page blanche ou un rendu cassé sont écartés d'office) ;
- `tools/jpeg-pdf.mjs` assemble le PDF **sans aucune dépendance** : les JPEG entrent tels quels
  (`/DCTDecode`), octet pour octet, chaque page mesurant un A4 strict (595,276 × 841,89 pt).

Options : `--jpgs-only` (les images seules, sans PDF), `--quality 82` (JPEG et PDF plus légers),
`--pages 10` (imposer le nombre de feuilles, pour un test).

## Générer les livrables imprimables (pipeline Chromium)

Le PDF historique est aussi composé par Chromium à partir du website :

```bash
npm install
npm run build:print
```

- `print-assets/carte-menus-boissons-a4.pdf` — carte website en 9 pages A4
- `print-assets/page-01.jpg` à `page-09.jpg`
- `print-assets/Carte-La-Colline-Gambetta-A3_compressed.pdf` — référence A3

## Responsive : aucun intitulé ne chevauche jamais son prix

Chaque onglet de la carte passe par trois modes, du plus large au plus étroit :
**deux colonnes** → **une colonne** → **une colonne, prix sous l'intitulé** (mode petit
écran). Le basculement est réglé **par onglet** et non par une largeur « téléphone »
globale : il dépend du contenu, et l'onglet entier bascule dès que son intitulé le plus
long cesserait de tenir sur une ligne à côté de son prix (gouttière de 12 px comprise).

Les deux repères, en pixels, vivent dans `index.html` (bloc « ZÉRO CHEVAUCHEMENT »),
autour de marqueurs que l'outil lit et réécrit :

```css
/* @stack-wide desserts */   /* en dessous : une seule colonne */
@media screen and (max-width: 797px) { … }
/* @stack-rows desserts */   /* en dessous : le prix passe sous l'intitulé */
@media screen and (max-width: 420px) { … }
```

Contrôle et recalcul (Chromium headless, mesures sur le rendu réel — pas de formule) :

```bash
npm install
node tools/check-responsive.mjs                                  # balayage 1300 → 320 px
node tools/check-responsive.mjs --min 272 --max 1700 --step 8    # contrôle large
node tools/check-responsive.mjs --breakpoints --write            # re-mesure les repères
```

Les mesures exigent les vraies fontes du site : `tools/local-fonts.mjs` sert Cinzel et
Montserrat depuis `node_modules/@fontsource` (déjà en `devDependencies`), et l'outil
refuse de mesurer si elles ne sont pas réellement chargées — sans elles, les largeurs de
texte — donc les repères — seraient fausses. `--remote-fonts` force le passage par
Google Fonts. Les deux générateurs de PDF (`build_carte_pdf.mjs`, `build_browser_print.mjs`)
utilisent la même source et vérifient les fontes réellement chargées dans la page avant de
composer : un build hors-ligne ne peut plus sortir une carte en Open Sans par erreur.
`build_browser_print.mjs`, qui produit un PDF vectoriel, contrôle de plus les polices
embarquées dans le fichier ; le pipeline image (`build_carte_pdf.mjs`) n'a plus de polices
dans son PDF — ce sont les captures qui doivent être justes. Après un libellé ou un prix modifié, relancer `--breakpoints --write`
puis le contrôle : les repères suivent le contenu. Un repère à `0px` est volontaire
(aucune largeur ne descend à 0) : il désactive un mode devenu inutile, par exemple les
deux colonnes de l'onglet Boissons ne serront jamais assez pour gêner un prix — et
`menus` est à `0px` pour la même raison : son duo « Menu enfant / Petit déjeuner »
contre « Menu du jour » reste lisible jusqu'au plus étroit des écrans balayés.

**Le duo « Nos menus » : un carton par bloc, la largeur du voisin, et le titre
dedans.** Les trois cartons de bas de page (Menu enfant, Petit déjeuner, Menu du
jour) sont assis sur une grille à deux colonnes égales ; le « Petit déjeuner »
était en fait une carte *dans* un panneau, soit deux liserés l'un dans l'autre ; son
titre restait dehors et ses lignes avaient 32 px de moins que le bloc côte à côte.
La règle « un seul encadrement » qui devait le prévenir visait une structure
disparue (`.menus-duo__left > .panel:first-child` : le premier enfant est le carton
« Menu enfant », pas un panneau) et ne s'appliquait à rien. Le doublon est repris
dans le sens où tout le reste de la carte est déjà fait — **le panneau porte le
cadre** (et donc le titre, comme chaque `.panel`), **la carte interne ne porte plus
que le contenu**, pleine largeur, sans liseré ; et `grid-template-rows` laisse la
2ᵉ ligne de la colonne prendre le reste, donc les deux cartons de gauche finissent
au pied du « Menu du jour ». Un carton d'information et son titre ne sont pas deux
objets à empiler : ce sont les deux faces du même. Le seuil qui décide du côte à
côte est celui du duo lui-même (720 px, règle existante) : en dessous chaque bloc
occupe déjà toute la largeur, il n'y a plus rien à aligner — et `check-responsive`
vérifie qu'aucun intitulé ne gêne aucun prix de 1300 à 320 px.

Sous 640 px la typographie ne rétrécit plus (plancher de lisibilité en `!important`) :
quand ça manque de place, c'est la mise en page qui change de mode, jamais la taille de
police qui descend sous le lisible.

### Nos Vins sur téléphone : deux bandes par bouteille

L'onglet Vins est le seul à avoir **quatre prix par ligne** (14 / 25 / 50 / 75 cl — la
première colonne s'intitule `14 cl` depuis que le verre est servi à 14 centilitres ; le
libellé figure dans l'en-tête et dans le `data-label` de chaque prix, puisque c'est ce
`data-label` que le mode téléphone affiche au-dessus du prix. Les bulles, elles, gardent
« Coupe 12 cl ») :
c'est lui qui sature en premier. Sous le repère `@stack-rows vins` (706 px), chaque vin
forme une grille à deux bandes — `2.4em` pour le numéro, puis quatre parts égales :

- l'appellation occupe les quatre parts, **alignée à gauche au ras du numéro** (le numéro
  est centré sur elle, `align-items: center`), et non rejetée au quart de la ligne comme
  quand le numéro formait une colonne `1fr` ;
- sous elle, les quatre prix tombent **d'aplomb** dans leurs parts, chacun coiffé de son
  format (`::before` reprenant `data-label`) ; appellation et prix au **même corps**,
  `0,95rem` en gras — la convention du site partout ailleurs, nom et prix identiques —,
  l'étiquette de contenance restant à `0,74rem` ;
- interligne de l'appellation à `1,55` et **deux lignes réservées** (`min-height: 3,1em`),
  plus 10 px / 12 px autour de chaque vin : un vin qui tient sur une ligne occupe la même
  hauteur que les autres et le défilement reste équidistant — 108 px par vin à 390 px, au
  lieu de 95 / 113 / 130 px en escalier (à 706 px, les vingt-trois lignes sont
  strictement égales). Ces `!important` ne sont pas une coquetterie : le plancher de
  lisibilité du site impose `0,85rem` et `line-height: 1,3` en `!important` sous 640 px —
  sans règle équivalente, ni le corps ni l'interligne de la liste des vins ne bougeaient ;
- un seul filet sépare deux vins (les bordures par cellule créaient trois tirets
  décalés sous chaque ligne) ;
- `Bulles`, qui n'a ni numéro ni 14 cl, prend deux moitiés (`wine-table--short`) et
  l'appellation toute la ligne.

Les colonnes de prix portent `!important` : le mode « comme les Bières pression » du site
les fixe en `minmax(max-content, 48px) !important`, et sans lui la première part gonflait
à 106 px sous le poids de l'appellation. Contrôle : `node tools/check-responsive.mjs --tabs vins`
— zéro chevauchement et zéro débordement de 1300 à 320 px.

## Bières pression : la contenance remplace « Pinte »

La colonne jadis intitulée « Pinte » porte la contenance exacte, **50 cl**, comme
`25 cl` et `HH`. En mode petit écran chaque prix reprend l'étiquette de sa colonne grâce
à `data-label` (`data-label="25 cl"`, `data-label="50 cl"`, `data-label="HH"`), posé dans
le HTML de `index.html` — l'en-tête de colonnes devient alors inutile et disparaît.

## Le pointillé meneur : sur toutes les lignes, y compris les grilles

Un intitulé et son prix sont reliés par un pointillé. Les listes en flex le portent dans
le HTML (`<span class="price-line__dots">`, frère élastique posé entre le nom et le prix),
mais **les bières pression et les cocktails sont des grilles** : leurs colonnes de prix
sont alignées entre elles (25 cl / 50 cl / HH, Prix / HH), il n'y a donc pas de case libre
où glisser ce frère. Ces deux blocs étaient les seuls de la carte sans meneur — le regard
traversait un blanc de plusieurs centimètres.

Le meneur y est porté par l'intitulé lui-même : `.beer-row__name` et `.hh-line__name`
deviennent des lignes en flex et reçoivent un `::after` — même trait, même
`rgba(156,122,45,.58)`, même retrait de `-.06rem` que `.price-line__dots`. À l'œil, c'est
le même objet ; dans le flux, il n'occupe que le blanc qui reste jusqu'à la première
colonne de prix.

**Ce meneur cède toujours devant le texte** (`flex: 1 1 0`, `min-width: 0`). Un
`min-width: 12px`, comme en porte `.price-line__dots`, lui ferait prendre ces pixels à
l'intitulé : dans un panneau étroit, « St-Germain Spritz » se cassait en deux lignes dès
652 px et `check-responsive` le signalait en « serré ». Un pointillé est un guide, il
s'efface plutôt que de bousculer le nom. Là où le prix passe **sous** l'intitulé (modes
`@stack-rows` de Boissons et Cocktails), le `::after` est masqué : il n'y a plus de prix à
rejoindre à droite.

Les deux repères concernés ont suivi le contenu, comme après tout changement de mise en
page (`node tools/check-responsive.mjs --breakpoints --write`) : boissons 402 → 412 px,
cocktails 327 → 337 px. Les cinq autres onglets sont inchangés, et le contrôle repasse à
zéro chevauchement sur les sept onglets, de 1300 à 320 px.

## Les contenances : une seule définition pour toute la carte

Une contenance (`4 cl`, `12 cl`, `25 cl`, `1 L`, `Coupe 12 cl`…) n'est pas un intitulé :
c'est une précision de service. Elle se lisait pourtant de **huit façons différentes**
selon l'endroit où elle tombait — jusqu'à deux dans la même ligne d'en-tête des bières
pression, où « 25 cl » était en Montserrat bas de casse et « 50 CL » en Cinzel capitales,
faute d'une classe `qty` sur le second `<span>`. Les tailles allaient de 11,2 à 19,6 px,
les encres de `--muted` à l'encre d'intitulé.

Tout passe désormais par un seul bloc, en fin de feuille (`CONTENANCES : UN SEUL FORMAT`),
quel que soit le porteur du texte — `.qty`, la note `.note-cl`, un en-tête de colonne, ou
l'étiquette `data-label` reprise sous chaque prix en mode téléphone :

| | |
|---|---|
| police | **Montserrat**, jamais le Cinzel des noms |
| graisse | **400** — l'information est secondaire, elle ne concurrence ni l'intitulé ni le prix |
| casse | telle qu'écrite (`25 cl`, pas `25 CL`) |
| taille | `--qty-size`, un cran sous le corps des notes, plancher à 11 px |
| encre | `--qty-ink` `#6b5a78`, un violet **clair** unique — 6,0:1 sur le crème comme sur le blanc des panneaux |

Deux points valent d'être notés. Le sélecteur commence par `html` : cela suffit à passer
devant les règles de section (`#boissons …`, `#desserts …`) à spécificité de classe égale,
sans semer des `!important` par endroit. Et une contenance prise dans une phrase
(« 5 cl — Blanc, rouge », « arrosées de vodka (2 cl) ») garde **son** corps plutôt que
celui de la note qui la porte : c'est ce qui fait qu'une mesure a la même taille partout,
y compris à l'intérieur d'un texte.

Le `HH` et le `N°`, qui ne sont pas des mesures, gardent le Cinzel de leur en-tête.

Contrôle — l'inventaire relève, pour chaque nœud de texte contenant une mesure, la police,
la graisse, la casse, la taille et la couleur **réellement calculées** :

```bash
node tools/audit-mesures.mjs --width 1440   # 47 libellés → 1 seul format
node tools/audit-mesures.mjs --width 390    # 141 libellés (avec les data-label) → 1 seul format
```

`tools/shot.mjs --tab boissons --width 1440 [--selector .beer-table]` capture un onglet
(ou un seul bloc) avec les vraies fontes, pour un contrôle à l'œil.
