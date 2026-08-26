# La Colline Gambetta

Carte web interactive et carte imprimable A4 portrait.

## Livrables imprimables

Le dossier [`print-assets/`](./print-assets/) contient :

- `carte-menus-boissons-a4.pdf` — carte complète en 9 pages A4 portrait ;
- `page-01.jpg` à `page-09.jpg` — chaque page en 2480 × 3508 px, adaptée à une impression 300 dpi.

L’ordre est : couverture, entrées, plats, desserts, menus, boissons fraîches et chaudes, apéritifs / whiskies / digestifs / bières, vins, cocktails.

Le script `tools/build_print_assets.py` permet de régénérer les exports après une modification de prix ou de contenu :

```bash
python3 tools/build_print_assets.py
```
