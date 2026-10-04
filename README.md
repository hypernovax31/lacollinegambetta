# La Colline Gambetta

Site officiel du bar-restaurant **La Colline Gambetta** — 4 rue Belgrand,
75020 Paris. Carte web interactive, réservation en ligne et carte imprimable
A4 générée depuis les mêmes données.

🔗 <https://lacollinegambetta.com>

## Sommaire

- [Aperçu](#aperçu)
- [Structure du dépôt](#structure-du-dépôt)
- [Développement local](#développement-local)
- [Réservations](#réservations)
- [Carte imprimable et PDF](#carte-imprimable-et-pdf)
- [Identité visuelle](#identité-visuelle)
- [Performance et SEO](#performance-et-seo)
- [Déploiement](#déploiement)

## Aperçu

| Page | Rôle |
| --- | --- |
| `index.html` | Page unique : carte complète (entrées, plats, menus, boissons, cocktails, vins, desserts), horaires, Happy Hour, accès, traductions. |
| `reservation.html` | Formulaire de réservation relié à Firestore et à Google Apps Script. |
| `mentions-legales.html`, `confidentialite.html` | Pages légales et RGPD. |

Le site est statique : aucun build n'est nécessaire pour le publier, les
fichiers HTML/CSS/JS sont servis tels quels.

## Structure du dépôt

```
index.html                 page principale (carte, horaires, i18n)
reservation.html           formulaire de réservation
assets/
  plats/ boissons/ cocktails/   photographies de la carte
  fonts/                        fontes auto-hébergées (woff2)
  cover/                        médaillon de la page de garde
  vector/                       bibliothèque de logos vectoriels + apercu.html
  js/i18n.js                    traductions du site
tools/                     scripts de génération (carte, logos, images, SEO)
docs/                      documentation technique détaillée
firestore.rules            règles d'accès aux réservations
```

## Développement local

```bash
python3 -m http.server 8080      # le plus simple : http://localhost:8080
npm install && npm run dev       # ou l'émulateur Firebase (hosting + firestore)
```

Après toute modification d'une photo ou d'un asset, incrémenter le paramètre
`?v=` associé dans `index.html` pour forcer le rafraîchissement des caches.

## Réservations

Les demandes sont écrites dans **Firebase Cloud Firestore**. Chaque
réservation occupe 60 minutes dans une fenêtre glissante, avec un maximum de
**15 tables ou 30 couverts simultanés** (1 à 2 personnes = 1 table, 3 à
4 personnes = 2 tables). Le calcul est automatique, sans créneaux à créer à la
main.

- Capacité et configuration Firebase : [`docs/reservation-capacity.md`](docs/reservation-capacity.md)
- Mails de confirmation et agenda : [`docs/reservation-emails-agenda.md`](docs/reservation-emails-agenda.md)
- Code Apps Script : [`tools/apps-script/`](tools/apps-script)

## Carte imprimable et PDF

```bash
npm run build:carte           # carte.html puis Carte_LaCollineGambetta.pdf
npm run build:carte-imprimeur # version 300 dpi pour l'imprimeur
```

La composition reprend exactement la mise en page du site (fontes, pastilles,
colonnes, interlignes) et mesure le rendu réel sous Chromium. Toutes les règles
de mise en page sont documentées dans
[`docs/carte-imprimable.md`](docs/carte-imprimable.md).

## Identité visuelle

Le médaillon et ses déclinaisons sont de **vrais tracés vectoriels** (courbes
de Bézier, aucun bitmap encapsulé), livrés en 2000 × 2000 à 300 dpi minimum.

```bash
python3 tools/vectorize_master.py          # tracé maître du médaillon
python3 tools/logo_variants.py             # déclinaisons sur fond
python3 tools/logo_variants_transparent.py # déclinaisons transparentes
python3 tools/vectorize_logos.py
python3 tools/render_medaillon_png.py      # PNG utilisés par le site
```

Galerie de la bibliothèque : `assets/vector/apercu.html`.

## Performance et SEO

- Fontes **auto-hébergées** en woff2 (`assets/fonts/`), préchargées, plus
  aucune requête vers Google Fonts (`tools/fontes_locales.py`).
- Images allégées sans changement de chemin : `python3 tools/optimiser_images.py`.
- Métadonnées (canonical, robots, Open Graph, Twitter, `theme-color`,
  image de partage 1200 × 630) harmonisées sur les quatre pages :
  `python3 tools/seo_meta.py`.
- Données structurées JSON-LD `Restaurant` dans `index.html`,
  `sitemap.xml` et `robots.txt` à la racine.

Ces trois scripts sont **idempotents** : on peut les relancer après toute
modification du site.

## Déploiement

Le site est publié par **GitHub Pages** depuis la branche de travail courante
(mise en ligne en une à deux minutes, domaine `lacollinegambetta.com` via
`CNAME`). Le seul workflow GitHub Actions,
[`.github/workflows/firebase-deploy.yml`](.github/workflows/firebase-deploy.yml),
déploie uniquement les règles Firestore lorsqu'elles changent sur `main`.

---

© La Colline Gambetta — tous droits réservés. Le code de ce dépôt et les
visuels du restaurant ne sont pas réutilisables sans autorisation.
