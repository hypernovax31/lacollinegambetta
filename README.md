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

**A — automatique.** Renseignez `place_id` (identifiant de la fiche) et
`cle_api` dans ce fichier. Le navigateur utilise la bibliothèque Places de
**Maps JavaScript API** — pas l'endpoint REST Places, qui n'est pas destiné à
un `fetch` cross-origin. Il faut activer la facturation et les API **Maps
JavaScript API** et **Places API (New)** dans Google Cloud. Chaque ouverture
de la page déclenche une requête Places (aucun cache de contenu API) : vérifiez
les quotas et budgets de facturation du projet Google Cloud.

`assets/data/avis-google.json` est public, tout comme le reste du site statique :
la clé y est donc visible côté navigateur. Utilisez une clé dédiée au site,
restreinte dans Google Cloud aux référents `https://lacollinegambetta.com/*`
(et `https://www.lacollinegambetta.com/*` si ce nom d'hôte sert le site) **et**
aux deux API ci-dessus. N'y placez jamais une clé serveur ou une clé partagée
avec d'autres applications. Une restriction de référent ne remplace pas la
restriction d'API. Voir les [recommandations de sécurité Google Maps
Platform](https://developers.google.com/maps/api-security-best-practices).

La note et le nombre d'avis sont lus à l'ouverture de la page ; aucun contenu
Places n'est conservé dans `localStorage` ou `sessionStorage`. En cas d'échec
du SDK, la valeur manuelle ci-dessous sert de secours. L'extrait affiché est
le premier avis admissible de 4 ou 5 étoiles dans l'ordre de pertinence renvoyé
par Google ; le filtre et l'ordre sont indiqués aux visiteurs. L'auteur (photo,
nom et lien de profil lorsqu'ils sont disponibles), le lien direct vers l'avis,
la date de visite retournée pour les avis en France et l'attribution **Google
Maps** et les éventuelles attributions de fournisseurs sont affichés avec
l'extrait. Si Google renvoie une traduction, le bandeau le signale et le lien
direct permet de consulter l'avis source.

**B — manuel.** Passez `publie` à `true` et recopiez la note, le nombre d'avis
et, si vous affichez un extrait, ses attributions :

```json
{
  "publie": true,
  "note": 4.8,
  "nombre_avis": 57,
  "url": "https://www.google.com/maps/...",
  "avis": [{
    "auteur": "Marc L.",
    "profil": "https://www.google.com/maps/contrib/...",
    "photo": "https://lh3.googleusercontent.com/...",
    "note": 5,
    "texte": "Terrasse agréable.",
    "url_avis": "https://www.google.com/maps/...",
    "date_visite": "2026-09"
  }]
}
```

Seuls les avis à 4 ou 5 étoiles sont mis en avant, et les textes sont
tronqués à 150 caractères. Tant qu'aucune source n'est renseignée, **le
bandeau reste invisible** et la page de garde est strictement inchangée. La
note n'est volontairement pas balisée en `aggregateRating` : Google interdit
de rebaliser sur son site des notes collectées ailleurs. Consultez aussi les
[politiques d'attribution et d'affichage Places API](https://developers.google.com/maps/documentation/places/web-service/policies).

```bash
python3 tools/avis_google.py     # (re)pose le bandeau : styles, balisage, chargeur
python3 tools/pied_quartier.py   # ligne « Dans le quartier » du pied de page
npm run test:site               # vérifications HTML, CSS, avis et liens
```

### Pied de page commun et itinéraire RATP

`tools/pied_quartier.py` pose le **même pied de page sur toutes les pages**,
page de garde comprise :

```
LA COLLINE GAMBETTA • 4 RUE BELGRAND, 75020 PARIS • MÉTRO GAMBETTA • LIGNE 3
Dans les alentours • Mairie du 20ᵉ • Théâtre de la Colline • Père-Lachaise • …
Mentions légales · Confidentialité
```

Huit repères du 20ᵉ et du 11ᵉ (jamais la mairie du 11ᵉ), **classés
automatiquement du plus proche au plus lointain** : le script calcule la
distance à vol d'oiseau depuis les coordonnées du restaurant et la rappelle
dans l'infobulle de chaque lien. Pour ajouter ou retirer un lieu, il suffit de
modifier la liste `POINTS` (libellé, adresse, latitude, longitude) : le tri se
refait tout seul.

Plus de redite : « MÉTRO GAMBETTA • LIGNE 3 » n'apparaît **qu'une fois par
page**, et c'est cette mention qui porte l'**itinéraire RATP**. L'arrivée est
toujours `4, Rue Belgrand, 75, Paris` (format attendu par
`ratp.fr/itineraires?end=…`) et le départ est la **position exacte du
visiteur** : au clic, le navigateur demande la géolocalisation, les
coordonnées sont converties en adresse postale par l'API Adresse de l'État
(`api-adresse.data.gouv.fr`, gratuite et sans clé), puis l'itinéraire s'ouvre
avec `&start=…`. Si elle est refusée, indisponible ou trop lente (9 s),
l'itinéraire s'ouvre avec la seule arrivée pré-remplie.

### Vérification

```bash
node tools/verifier_site.mjs   # CSS, HTML, h1 unique, JSON-LD, bloc avis, liens
```

Le dernier contrôle **audite tous les liens externes** des cinq pages : chacun
doit figurer dans la liste `autorises` du script, c'est-à-dire avoir été
ouvert et vérifié (bon site, en ligne, à jour). Avant d'ajouter un lien au
site, on le vérifie puis on l'inscrit dans cette liste.

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
