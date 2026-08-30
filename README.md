# La Colline Gambetta

Carte web interactive et carte imprimable A4 portrait.

## Carte imprimable (`carte.html`)

`carte.html` **recopie la mise en page du site** : mêmes textes, mêmes fontes,
mêmes titres à pastille violette liseré or, mêmes colonnes, mêmes interlignes.
Le générateur ne retape plus la carte en points — il compose chaque onglet à la
largeur d'écran du site (1 180 px) et applique **un seul facteur de réduction**,
calculé pour remplir la feuille sans jamais couper un bloc.

```bash
python3 tools/build_carte.py      # mesure, met en page, écrit carte.html
npm run build:carte-pdf           # les 10 JPEG, puis carte-a4.pdf
```

- Une feuille par onglet ; les onglets denses (Boissons, Cocktails) en occupent
  deux. Le nombre de pages et la répartition viennent de `tools/measure_carte.mjs`,
  qui mesure le rendu réel (Chromium, fontes du site) — pas d'à-peu-près.
- **Cocktails : une seule colonne, sur deux feuilles.** Le site présente cet
  onglet en deux colonnes ; sur une feuille A4, il tenait alors tout entier sur
  la première (96 %) et laissait la seconde à 35 %. `tools/build_carte.py` force
  donc une colonne pour cet onglet (`html.carte-doc .carte-flow[data-sec="cocktails"] …
  grid-template-columns: 1fr`) : les quatre panneaux se répartissent en deux
  feuilles de poids égal (98 % et 90 %) et le pointillé meneur de prix court sur
  toute la largeur, comme pour les whiskies et les bières.
- **Le rythme passe avant la taille de texte.** Les hauteurs étant des blocs
  entiers (jamais coupés), passer d'une colonne à l'autre demande un cran de
  réduction de plus : la carte garde son facteur global (× 0,5687, intitulés à
  7,6 pt) et **lui seul** — l'onglet cocktails se compose à × 0,5353. Une carte
  entière à 7,2 pt pour éviter une feuille orpheline n'aurait pas été un bon
  échange ; deux feuilles un peu plus serrées, si.
- **Le bloc est centré dans la feuille, après réduction.** La composition fait
  1 140 px et la zone utile 184 mm : la marge se calcule donc en millimètres de
  papier, `margin-left: max(0px, calc((var(--carte-zone-w) - var(--carte-base-w) *
  var(--carte-fit)) / 2))` — calculée dans le repère de composition, elle partait
  de 36 px à droite (9 mm sur papier). Le `max()` protège le cadre : le contenu
  reste à 11 mm du filet, jamais dessus. Chaque feuille suit son propre facteur,
  y compris les deux qui se composent plus serré. Ces deux promesses sont vérifiées
  à chaque build par `build_carte_pdf.mjs` (`cadrage : symétrique à ± 0,01 mm et
  11,2 mm avant le filet`) : un centrage faux ou un contenu qui toucherait le cadre
  arrête la construction, au lieu de passer inaperçu sur dix pages d'images.
- Les feuilles gardent le bandeau **COLLINE GAMBETTA** en tête, le pied légal et
  la pagination en bas à droite : un document imprimé isolé doit se suffire.
- Aperçu : ouvrir `carte.html` — les pages gardent le ratio A4 et s'adaptent à la
  largeur de la fenêtre, sans déformation. Impression : icône de téléchargement,
  Imprimer → Enregistrer au format PDF (A4 portrait réel).

Après un libellé ou un prix modifié, relancer `python3 tools/build_carte.py` :
l'empreinte SHA-256 d'`index.html` **et** celle de la CSS de carte sont comparées
à celles des mesures, et une mesure périmée déclenche une nouvelle mesure (ou une
erreur explicite). La mesure ne se fait plus dans `index.html` : la carte a ses
propres règles (la colonne unique des cocktails), le générateur écrit donc
`carte-measure.html` — même CSS, mêmes imbriquations, sans feuille ni mise à
l'échelle — et c'est là que les hauteurs sont relevées. `tools/carte-metrics.json`
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
deux colonnes de l'onglet Boissons ne serront jamais assez pour gêner un prix.

Sous 640 px la typographie ne rétrécit plus (plancher de lisibilité en `!important`) :
quand ça manque de place, c'est la mise en page qui change de mode, jamais la taille de
police qui descend sous le lisible.

### Nos Vins sur téléphone : deux bandes par bouteille

L'onglet Vins est le seul à avoir **quatre prix par ligne** (12,5 / 25 / 50 / 75 cl) :
c'est lui qui sature en premier. Sous le repère `@stack-rows vins` (706 px), chaque vin
forme une grille à deux bandes — `2.4em` pour le numéro, puis quatre parts égales :

- l'appellation occupe les quatre parts, **alignée à gauche au ras du numéro** (le numéro
  est centré sur elle, `align-items: center`), et non rejetée au quart de la ligne comme
  quand le numéro formait une colonne `1fr` ;
- sous elle, les quatre prix tombent **d'aplomb** dans leurs parts, chacun coiffé de son
  format (`::before` reprenant `data-label`), en `1rem` gras pendant que l'étiquette reste
  à `0,74rem` ;
- interligne de l'appellation à `1,55` et **deux lignes réservées** (`min-height: 3,1em`),
  plus 10 px / 12 px autour de chaque vin : un vin qui tient sur une ligne occupe la même
  hauteur que les autres et le défilement reste équidistant — 108 px par vin à 390 px, au
  lieu de 95 / 113 / 130 px en escalier. Le `!important` n'est pas une coquetterie : le
  plancher de lisibilité du site impose `line-height: 1,3 !important` sous 640 px, et sans
  lui l'interligne de la liste des vins ne bougeait pas d'un poil ;
- un seul filet sépare deux vins (les bordures par cellule créaient trois tirets
  décalés sous chaque ligne) ;
- `Bulles`, qui n'a ni numéro ni 12,5 cl, prend deux moitiés (`wine-table--short`) et
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
