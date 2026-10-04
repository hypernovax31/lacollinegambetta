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
npm run build:carte            # carte.html puis Carte_LaCollineGambetta.pdf
npm run build:carte-imprimeur  # version 300 dpi pour l'imprimeur
python3 tools/comparer_cartes.py  # controle : memes 8 pages, meme contenu
```

Les deux PDF sont **versionnés** et composés depuis le même `carte.html` :
8 pages A4 identiques au contenu près du rendu, en 180 dpi (1488 × 2105 px par
page, 2,4 Mo) pour la diffusion et en **300 dpi** (2480 × 3508 px par page,
17,5 Mo) pour l'imprimeur. `tools/comparer_cartes.py` vérifie page à page que
les deux versions disent exactement la même chose.

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
python3 tools/render_medaillon_png.py      # PNG du site + image de partage
```

Le site n'affiche que les SVG : le PNG opaque 2000 × 2000 du médaillon noir
brillant (4 Mo) n'est plus versionné, il reste régénérable par
`tools/render_medaillon_png.py`.

Galerie de la bibliothèque : `assets/vector/apercu.html`.

## Performance et SEO

- Fontes **auto-hébergées** en woff2 (`assets/fonts/`), préchargées, plus
  aucune requête vers Google Fonts (`tools/fontes_locales.py`).
- Images allégées sans changement de chemin : `python3 tools/optimiser_images.py`.
- Métadonnées (canonical, robots, Open Graph, Twitter, `theme-color`,
  image de partage 1200 × 630) harmonisées sur les quatre pages :
  `python3 tools/seo_meta.py`.
- Contenu et balisage : `python3 tools/seo_contenu.py` — un vrai `<h1>` sur
  la page de garde (rendu strictement identique : les règles CSS en `h2` sont
  élargies à `:is(h1,h2)`), `hreflang` vers les 15 langues servies par
  `?lang=`, canonique propre à chaque langue, et données structurées
  complètes : `Restaurant` (horaires, équipements, action de réservation),
  `WebSite`, `Menu` avec les 173 articles et leurs prix, fil d'Ariane sur les
  pages annexes.
- `python3 tools/sitemaps.py` : `sitemap.xml` (pages + versions linguistiques),
  `sitemap-images.xml` (les 172 photos, invisibles autrement car chargées en
  JavaScript) et `robots.txt`.
- Page `404.html` sobre, aux couleurs du site.

### Avis Google de la page de garde

Le bandeau lit `assets/data/avis-google.json`. Deux façons de l'alimenter :

**A — automatique (recommandé).** Renseignez `place_id` (identifiant de la
fiche Google du restaurant) et `cle_api` (clé d'API Google Places restreinte
au domaine `lacollinegambetta.com`) : la note, le nombre d'avis et les
meilleurs commentaires se mettent à jour tout seuls, avec un cache de 12 h.

**B — manuel.** Passez `publie` à `true` et recopiez la note, le nombre
d'avis et vos meilleurs commentaires :

```json
{ "publie": true, "note": 4.8, "nombre_avis": 57,
  "url": "https://g.page/...",
  "avis": [{ "auteur": "Marc L.", "note": 5, "texte": "Terrasse agréable." }] }
```

Seuls les avis à 4 étoiles ou plus sont mis en avant, et les textes sont
tronqués à 150 caractères. Tant qu'aucune source n'est renseignée, **le
bandeau reste invisible** et la page de garde est strictement inchangée. La
note n'est volontairement pas balisée en `aggregateRating` : Google interdit
de rebaliser sur son site des notes collectées ailleurs.

```bash
python3 tools/avis_google.py     # (re)pose le bandeau : styles, balisage, chargeur
python3 tools/pied_quartier.py   # ligne « Dans le quartier » du pied de page
```

### Vérification

```bash
node tools/verifier_site.mjs   # CSS, HTML, h1 unique, JSON-LD, bloc avis, liens
```

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
