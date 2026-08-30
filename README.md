# La Colline Gambetta

Carte web interactive et carte imprimable A4 portrait.

## Carte imprimable (`carte.html`)

`carte.html` reprend **les mêmes contenus, polices, couleurs et styles** que le site (`index.html`). La page de garde est la couverture du site. L’ordre des pages suit les boutons de navigation :

1. Couverture
2. Entrées
3. Plats
4. Desserts
5. Menus
6. Boissons fraîches & chaudes
7. Apéritifs, whiskies, digestifs & bières
8. Vins
9. Cocktails classiques, spritz & mules
10. Élégance & mocktails

Les pages intérieures portent l’en-tête **COLLINE GAMBETTA** (pas de titre « NOS … »).

- Aperçu : ouvrir `carte.html` (sans impression automatique). À l’écran, les pages gardent le ratio A4 et s’adaptent à la largeur de la fenêtre, sans déformation.
- Enregistrer en PDF : icône de téléchargement en haut à droite, puis Imprimer → Enregistrer au format PDF (A4 portrait réel)

Régénérer après une modification du site :

```bash
python3 tools/build_carte.py
npm run build:carte-pdf
```

## PDF A4 téléchargeable (`carte-a4.pdf`)

L’icône de téléchargement du header de `index.html` ouvre **`carte-a4.pdf`** : la carte A4 (10 pages, même contenu que `carte.html`) au format PDF, avec les polices du site intégrées. Le navigateur l’affiche et propose le téléchargement.

Généré par `tools/build_carte_pdf.mjs` (Chromium headless à partir de `carte.html`) :

```bash
npm install
npm run build:carte-pdf
```

À régénérer après chaque modification du site (avec `build_carte.py`).

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
utilisent la même source et **vérifient les polices embarquées dans le PDF produit** :
un build hors-ligne ne peut plus sortir une carte composée en Open Sans par erreur. Après un libellé ou un prix modifié, relancer `--breakpoints --write`
puis le contrôle : les repères suivent le contenu. Un repère à `0px` est volontaire
(aucune largeur ne descend à 0) : il désactive un mode devenu inutile, par exemple les
deux colonnes de l'onglet Boissons ne serront jamais assez pour gêner un prix.

Sous 640 px la typographie ne rétrécit plus (plancher de lisibilité en `!important`) :
quand ça manque de place, c'est la mise en page qui change de mode, jamais la taille de
police qui descend sous le lisible.

## Bières pression : la contenance remplace « Pinte »

La colonne jadis intitulée « Pinte » porte la contenance exacte, **50 cl**, comme
`25 cl` et `HH`. En mode petit écran chaque prix reprend l'étiquette de sa colonne grâce
à `data-label` (`data-label="25 cl"`, `data-label="50 cl"`, `data-label="HH"`), posé dans
le HTML de `index.html` — l'en-tête de colonnes devient alors inutile et disparaît.
