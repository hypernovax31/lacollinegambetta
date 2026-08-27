# La Colline Gambetta

Carte web interactive et carte imprimable A4 portrait.

## Carte PDF (modifiable)

Le fichier `carte.html` est la **carte des menus** haute-fidélité, à l’identité du site (violet royal, or, Cinzel / Montserrat). Elle est conçue pour qu’un agent IA puisse modifier textes, prix et mise en page.

- Aperçu écran : ouvrir `carte.html`
- Enregistrer en PDF : bouton **Enregistrer en PDF** (ou Imprimer → Enregistrer au format PDF)
- 10 pages A4 portrait : couverture, entrées, plats, desserts, formules, boissons, alcools & bières, vins, cocktails, élégance & mocktails

Les blocs HTML sont commentés page par page (`PAGE 1 : Couverture`, etc.).

## Générer les livrables imprimables (pipeline Chromium)

Le PDF historique est aussi composé par Chromium à partir du website :

```bash
npm install
npm run build:print
```

- `print-assets/carte-menus-boissons-a4.pdf` — carte website en 9 pages A4
- `print-assets/page-01.jpg` à `page-09.jpg`
- `print-assets/Carte-La-Colline-Gambetta-A3_compressed.pdf` — référence A3
