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

La page de garde comprend aussi un carrousel d’avis Google. Les commentaires
sont chargés automatiquement à l’ouverture de la page via Places, affichés avec
leur attribution et lien source, puis gardés seulement en mémoire pendant la
visite. La configuration navigateur se trouve dans `assets/data/avis-google.json` ;
sa clé publique doit rester restreinte au domaine du site et aux API Maps autorisées.

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
  css/google-reviews.css        style du carrousel d’avis
  data/avis-google.json         configuration Places, sans cache des commentaires
  js/google-reviews.js          chargeur et carrousel d’avis Places
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

### Pied de page commun et itinéraire RATP

`tools/pied_quartier.py` pose le **même pied de page sur toutes les pages**,
page de garde comprise :

```
LA COLLINE GAMBETTA • 4 RUE BELGRAND • 75020 PARIS • MÉTRO GAMBETTA • LIGNE 3
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
page** et c'est elle qui porte l'**itinéraire RATP**.

- Sur **mobile**, le tap vise **d'abord l'application Bonjour RATP**, dans
  l'onglet courant : iOS reçoit le lien universel `bonjour-ratp.fr` — le
  domaine que l'application déclare elle-même dans son
  `apple-app-site-association` — et Android Chrome un Intent explicite vers
  `com.fabernovel.ratp` (`S.browser_fallback_url` = trajet RATP). Cet ordre
  compte : depuis un onglet déjà passé en arrière-plan, iOS comme Android
  refusent de lancer une application.
- Si l'application ne prend pas la main (page toujours visible après 1,5 s),
  le trajet s'ouvre tout seul sur `ratp.fr/itineraires`, arrivée remplie
  (`?end=4 Rue Belgrand 75020 Paris`) : **nouvel onglet** si le navigateur
  l'autorise, sinon dans l'onglet courant. Sans application installée sur
  iOS, le lien universel affiche la page Bonjour RATP, arrivée déjà remplie.
- Sur **iOS**, c'est le clic qui propose l'application : aucune bannière
  système (`apple-itunes-app`) n'est déclarée, aucune proposition n'apparaît
  en dehors du clic sur la mention du métro.
- Sur **ordinateur**, le lien web RATP s'ouvre dans un nouvel onglet avec
  l'arrivée remplie.

Aucune page intermédiaire, aucun écran de refus, aucune redirection forcée :
le site ne demande **jamais** la géolocalisation et ne déclenche aucun Intent
sur ordinateur. Le handoff vit dans `assets/js/ratp-itinerary.js`.

### Vérification

```bash
node tools/verifier_site.mjs   # CSS, HTML, h1 unique, JSON-LD, bloc avis, liens
```

Le dernier contrôle **audite tous les liens externes** des cinq pages : chacun
doit figurer dans la liste `autorises` du script, c'est-à-dire avoir été
ouvert et vérifié (bon site, en ligne, à jour). Avant d'ajouter un lien au
site, on le vérifie puis on l'inscrit dans cette liste.

Il vérifie aussi le parcours « Métro Gambetta • Ligne 3 » : lien web RATP,
lien universel Bonjour RATP, Intent Android, absence de bannière système iOS,
de page intermédiaire et de demande de position.
`node tools/verifier_ratp_itineraires.mjs` rejoue ce parcours dans Chromium
avec des fixtures locales : sur Android l'application est visée au clic puis
le trajet arrive 1,5 s plus tard dans un nouvel onglet ; sur iPhone le clic
part sur le lien universel Bonjour RATP (arrivée remplie) ; dans un navigateur
intégré qui bloque les lancements, le trajet s'ouvre tout seul. Aucune requête
réelle ne part vers ratp.fr.

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
