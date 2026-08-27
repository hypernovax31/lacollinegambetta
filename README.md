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
7. Apéritifs, whiskies & digestifs
8. Bières
9. Vins
10. Cocktails classiques, spritz & mules
11. Élégance & mocktails

Les pages intérieures portent l’en-tête **COLLINE GAMBETTA** (pas de titre « NOS … »).

- Aperçu : ouvrir `carte.html`
- Enregistrer en PDF : lien **Télécharger carte** (ou Imprimer → Enregistrer au format PDF)
- `carte.html?print=1` lance l’impression automatiquement

Régénérer après une modification du site :

```bash
python3 tools/build_carte.py
```

## Générer les livrables imprimables (pipeline Chromium)

Le PDF historique est aussi composé par Chromium à partir du website :

```bash
npm install
npm run build:print
```

- `print-assets/carte-menus-boissons-a4.pdf` — carte website en 9 pages A4
- `print-assets/page-01.jpg` à `page-09.jpg`
- `print-assets/Carte-La-Colline-Gambetta-A3_compressed.pdf` — référence A3
