# La Colline Gambetta

Carte web interactive et carte imprimable A4 portrait.

## Générer les livrables imprimables

Le PDF est composé directement par Chromium à partir du HTML et du CSS du website. Le générateur attend le chargement des polices `Cinzel` et `Montserrat`, construit les neuf pages d’impression du site, puis produit :

- `print-assets/carte-menus-boissons-a4.pdf` — carte complète en 9 pages A4 portrait ;
- `print-assets/page-01.jpg` à `page-09.jpg` — chaque page en 2480 × 3508 px.

Installation initiale :

```bash
npm install
```

Le package `@sparticuz/chromium` fournit le navigateur Chromium utilisé par le générateur, sans installation système supplémentaire.

Génération :

```bash
npm run build:print
```

Le PDF et les JPG reprennent le rendu d’impression du site : polices, couleurs, gradients, composants et règles `@media print`. La carte A3 de référence est conservée dans `print-assets/Carte-La-Colline-Gambetta-A3_compressed.pdf`.
