// Controles automatiques du site : CSS valide, HTML coherent, donnees
// structurees conformes, bloc d'avis fonctionnel. A lancer avec :
//   node tools/verifier_site.mjs
import { readFileSync, existsSync } from 'node:fs';
import postcss from 'postcss';
import { JSDOM } from 'jsdom';

const racine = new URL('..', import.meta.url).pathname;
const lire = (f) => readFileSync(racine + f, 'utf8');
let erreurs = 0;
const ok = (m) => console.log('  ok   ' + m);
const ko = (m) => { erreurs++; console.log('  ECHEC ' + m); };

// ---------------------------------------------------------------- 1. CSS ---
const index = lire('index.html');
for (const [i, bloc] of [...index.matchAll(/<style>([\s\S]*?)<\/style>/g)].entries()) {
  try {
    const racineCss = postcss.parse(bloc[1]);
    let regles = 0;
    racineCss.walkRules(() => regles++);
    ok(`feuille de style ${i + 1} : ${regles} regles analysees sans erreur`);
  } catch (e) { ko(`feuille de style ${i + 1} : ${e.message}`); }
}

// --------------------------------------------------- 2. structure du HTML ---
const dom = new JSDOM(index);
const d = dom.window.document;
const h1 = d.querySelectorAll('h1');
h1.length === 1 ? ok(`un seul h1 : "${h1[0].textContent.trim().slice(0, 70)}..."`)
                : ko(`${h1.length} h1 (il en faut exactement un)`);
d.querySelector('#titre-principal > h1') ? ok('le h1 est bien le titre de la page de garde')
                                         : ko('le h1 n\'est pas dans #titre-principal');
d.querySelector('#interior-menu h2') ? ok('l\'en-tete interieur garde son h2')
                                     : ko('h2 interieur perdu');
const desc = d.querySelector('meta[name=description]').content;
desc.length <= 160 ? ok(`meta description : ${desc.length} caracteres`)
                   : ko(`meta description trop longue (${desc.length})`);
const alts = [...d.querySelectorAll('link[rel=alternate][hreflang]')];
alts.length === 16 ? ok(`hreflang : ${alts.length} declarations (15 langues + x-default)`)
                   : ko(`hreflang : ${alts.length} declarations`);
const sansDim = [...d.querySelectorAll('img')].filter((i) => !i.getAttribute('width'));
sansDim.length === 0 ? ok('toutes les images ont width/height')
                     : ko(`${sansDim.length} image(s) sans dimensions`);

// --------------------------------------------- 3. donnees structurees ------
const blocs = [...d.querySelectorAll('script[type="application/ld+json"]')]
  .map((s) => JSON.parse(s.textContent));
const types = blocs.map((b) => b['@type']);
['Restaurant', 'WebSite', 'Menu'].every((t) => types.includes(t))
  ? ok('donnees structurees : ' + types.join(', '))
  : ko('donnees structurees incompletes : ' + types.join(', '));
const resto = blocs.find((b) => b['@type'] === 'Restaurant');
for (const champ of ['name', 'address', 'geo', 'telephone', 'openingHoursSpecification',
  'potentialAction', 'hasMenu', 'image', 'priceRange', 'sameAs']) {
  resto[champ] ? null : ko(`Restaurant : champ ${champ} manquant`);
}
ok('Restaurant : tous les champs cles presents');
resto.hasMenu['@id'] === blocs.find((b) => b['@type'] === 'Menu')['@id']
  ? ok('hasMenu pointe bien sur la carte') : ko('hasMenu ne pointe sur rien');
const menu = blocs.find((b) => b['@type'] === 'Menu');
let items = 0, sansPrix = [];
for (const sec of menu.hasMenuSection)
  for (const sous of sec.hasMenuSection)
    for (const it of sous.hasMenuItem) {
      items++;
      if (!it.offers || !/^\d+\.\d{2}$/.test(it.offers.price)) sansPrix.push(it.name);
    }
ok(`carte balisee : ${items} articles`);
sansPrix.length === 0 ? ok('tous les articles ont un prix valide')
                      : ko(`${sansPrix.length} article(s) sans prix : ${sansPrix.slice(0, 5)}`);

// --------------------------------------------------- 4. bloc d'avis --------
const marqueurDebut = index.indexOf('<!-- avis-google:js:debut -->');
const marqueurFin = index.indexOf('<!-- avis-google:js:fin -->', marqueurDebut);
const baliseOuverture = index.indexOf('<script>', marqueurDebut);
const baliseFermeture = index.indexOf('</script>', baliseOuverture);
const script = marqueurDebut >= 0 && marqueurFin > baliseFermeture
  ? index.slice(baliseOuverture + 8, baliseFermeture) : '';
script ? ok('chargeur des avis place dans le body') : ko('chargeur des avis absent ou hors du body');
const occurrences = (texte, motif) => texte.split(motif).length - 1;
occurrences(index.toLowerCase(), '<body') === 1 && occurrences(index.toLowerCase(), '</body>') === 1
  ? ok('index.html : une seule ouverture et fermeture du body')
  : ko('index.html : balises body dupliquees');
const gabarit = d.getElementById('cover-reviews').outerHTML;
function domAvis(fetchConfig) {
  const dom = new JSDOM(`<body>${gabarit}</body>`, {
    runScripts: 'outside-only', pretendToBeVisual: true,
    url: 'https://lacollinegambetta.com/'
  });
  dom.window.fetch = fetchConfig;
  return dom;
}
function reponseJson(value) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(value) });
}

const manuel = {
  publie: true, note: 4.6, nombre_avis: 128,
  url: 'https://www.google.com/maps/search/?api=1&query=restaurant',
  avis: [
    { auteur: 'Claire D.', profil: 'https://www.google.com/maps/contrib/1',
      photo: 'https://lh3.googleusercontent.com/a/test', note: 5,
      texte: 'Accueil parfait et cuisine maison.',
      url_avis: 'https://www.google.com/maps/reviews/data=1', date_visite: '2026-09' },
    { auteur: 'Marc L.', profil: 'https://www.google.com/maps/contrib/2',
      note: 4, texte: 'Très bonne adresse dans le quartier.',
      url_avis: 'https://www.google.com/maps/reviews/data=2', date_visite: '2026-08' }
  ]
};
const essai = domAvis(() => reponseJson(manuel));
essai.window.eval(script);
await new Promise((r) => setTimeout(r, 30));
const b = essai.window.document.getElementById('cover-reviews');
!b.hidden ? ok('bloc avis : affiche la source manuelle publiee') : ko('bloc avis manuel : reste masque');
const texte = b.textContent.replace(/\s+/g, ' ').trim();
const slidesManuels = [...b.querySelectorAll('.cover-reviews__slide:not([data-carousel-clone])')];
const avisActif = b.querySelector('.cover-reviews__slide[aria-hidden="false"]');
texte.includes('4,6/5') && texte.includes('128 avis Google') && texte.includes('Claire') &&
  !texte.includes('Claire D.') && !texte.includes('Marc L.') &&
  slidesManuels.length === 2 && avisActif
  ? ok(`bloc avis manuel : prénom seul et ${slidesManuels.length} diapos`)
  : ko('bloc avis manuel : contenu inattendu : ' + texte);
const dateManuelle = avisActif && avisActif.querySelector('.cover-reviews__date')?.textContent;
dateManuelle === 'Visite : septembre 2026'
  ? ok('avis manuel : mois et annee de visite affiches')
  : ko('avis manuel : date de visite inattendue : ' + dateManuelle);
essai.window.document.getElementById('cover-reviews-maps').textContent === 'Google Maps'
  ? ok('attribution Google Maps visible') : ko('attribution Google Maps absente');
const lienAvisManuel = avisActif && avisActif.querySelector('.cover-reviews__source');
lienAvisManuel?.href.includes('/reviews/data=1')
  ? ok('avis manuel : lien direct vers l’avis conserve') : ko('avis manuel : lien direct absent');
const suivantManuel = essai.window.document.getElementById('cover-reviews-next');
const precedentManuel = essai.window.document.getElementById('cover-reviews-previous');
const pisteManuelle = essai.window.document.getElementById('cover-reviews-track');
function terminerTransitionAvis(dom, piste) {
  const ev = new dom.window.Event('transitionend');
  Object.defineProperty(ev, 'propertyName', { value: 'transform' });
  piste.dispatchEvent(ev);
}
suivantManuel.hidden === false && precedentManuel.hidden === false
  ? ok('carrousel : commandes visibles pour plusieurs avis')
  : ko('carrousel : commandes manquantes');
suivantManuel.click();
const secondManuel = b.querySelector('.cover-reviews__slide[aria-hidden="false"]');
secondManuel?.querySelector('.cover-reviews__author')?.textContent === 'Marc' &&
  essai.window.document.getElementById('cover-reviews-status').textContent === 'Avis 2 sur 2'
  ? ok('carrousel : avance horizontalement vers le prénom suivant')
  : ko('carrousel : avis suivant inattendu');
terminerTransitionAvis(essai.window, pisteManuelle);
suivantManuel.click();
b.querySelector('.cover-reviews__slide[aria-hidden="false"]')?.querySelector('.cover-reviews__author')?.textContent === 'Claire' &&
  essai.window.document.getElementById('cover-reviews-status').textContent === 'Avis 1 sur 2'
  ? ok('carrousel : boucle du dernier avis vers le premier')
  : ko('carrousel : retour au premier avis absent');
terminerTransitionAvis(essai.window, pisteManuelle);
precedentManuel.click();
b.querySelector('.cover-reviews__slide[aria-hidden="false"]')?.querySelector('.cover-reviews__author')?.textContent === 'Marc'
  ? ok('carrousel : boucle du premier avis vers le dernier')
  : ko('carrousel : retour au dernier avis absent');
terminerTransitionAvis(essai.window, pisteManuelle);
const viewportManuel = essai.window.document.getElementById('cover-reviews-viewport');
const debutBalayage = new essai.window.Event('touchstart');
Object.defineProperty(debutBalayage, 'touches', { value: [{ clientX: 150, clientY: 20 }] });
viewportManuel.dispatchEvent(debutBalayage);
const finBalayage = new essai.window.Event('touchend');
Object.defineProperty(finBalayage, 'changedTouches', { value: [{ clientX: 75, clientY: 24 }] });
viewportManuel.dispatchEvent(finBalayage);
b.querySelector('.cover-reviews__slide[aria-hidden="false"]')?.querySelector('.cover-reviews__author')?.textContent === 'Claire'
  ? ok('carrousel : balayage horizontal sur mobile')
  : ko('carrousel : balayage mobile inactif');
terminerTransitionAvis(essai.window, pisteManuelle);
viewportManuel.dispatchEvent(new essai.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
b.querySelector('.cover-reviews__slide[aria-hidden="false"]')?.querySelector('.cover-reviews__author')?.textContent === 'Marc'
  ? ok('carrousel : navigation au clavier')
  : ko('carrousel : navigation clavier inactive');
terminerTransitionAvis(essai.window, pisteManuelle);

const vide = domAvis(() => reponseJson({ publie: false }));
vide.window.eval(script);
await new Promise((r) => setTimeout(r, 30));
vide.window.document.getElementById('cover-reviews').hidden
  ? ok('bloc avis : invisible sans donnees reelles')
  : ko('bloc avis : visible alors qu’il est vide');

const remplissage = essai.window.document.getElementById('cover-reviews-stars-fill').style.width;
remplissage === '92%' ? ok(`etoiles : remplissage exact pour 4,6/5 (${remplissage})`)
                         : ko(`etoiles : remplissage inattendu (${remplissage})`);

// Places Library : aucune requete REST cross-origin, aucun cache Places.
const live = domAvis(() => reponseJson({
  place_id: 'ChIJxxxx', cle_api: 'CLE_DE_TEST', publie: true,
  note: 5, nombre_avis: 4, url: 'https://www.google.com/maps/search/?api=1&query=restaurant',
}));
let champsPlaces = [];
let nomLieu = '';
live.window.google = { maps: { importLibrary: (nom) => {
  nomLieu = nom;
  return Promise.resolve({ Place: class {
    constructor(options) { this.id = options.id; }
    fetchFields(options) {
      champsPlaces = options.fields;
      Object.assign(this, {
        rating: 4.8, userRatingCount: 57,
        googleMapsURI: 'https://www.google.com/maps?cid=1',
        attributions: [{ provider: 'Source des données', providerURI: 'https://www.example.com/attribution' }],
        reviews: [
          { rating: 3, text: 'Avis moyen a ne pas afficher.', googleMapsURI: 'https://www.google.com/maps/reviews/3',
            authorAttribution: { displayName: 'Alex R.' }, visitDateMonth: 0, visitDateYear: 2026 },
          { rating: 4, text: 'Avis sans date à écarter.', googleMapsURI: 'https://www.google.com/maps/reviews/4',
            authorAttribution: { displayName: 'Sans Date' } },
          { rating: 5, text: 'Terrasse agreable et planches genereuses.',
            googleMapsURI: 'https://www.google.com/maps/reviews/5', visitDateMonth: 8, visitDateYear: 2026,
            textLanguageCode: 'fr', originalTextLanguageCode: 'en',
            authorAttribution: { displayName: 'Marc L.', uri: 'https://www.google.com/maps/contrib/2',
              photoURI: 'https://lh3.googleusercontent.com/a/marc' } }
        ]
      });
      return Promise.resolve();
    }
  } });
} } };
live.window.eval(script);
await new Promise((r) => setTimeout(r, 50));
const blocLive = live.window.document.getElementById('cover-reviews');
const t2 = blocLive.textContent.replace(/\s+/g, ' ').trim();
const premierLive = blocLive.querySelector('.cover-reviews__slide[aria-hidden="false"]');
t2.includes('4,8/5') && t2.includes('57 avis Google') && t2.includes('Marc') &&
  !t2.includes('Marc L.') && !t2.includes('Avis moyen') && !t2.includes('Avis sans date') &&
  premierLive?.querySelector('.cover-reviews__author')?.textContent === 'Marc'
  ? ok(`mode Places : note live, prénom seul et avis admissible (${t2.slice(0, 90)})`)
  : ko('mode Places : ' + t2);
nomLieu === 'places' && ['rating', 'userRatingCount', 'googleMapsURI', 'reviews', 'attributions'].every((f) => champsPlaces.includes(f))
  ? ok('Places Library : charge la note, les avis, les attributions et les liens Google Maps')
  : ko('Places Library : champs Places incomplets');
const attributionDonnee = live.window.document.getElementById('cover-reviews-data-attribution');
attributionDonnee.textContent.includes('Source des données') &&
  attributionDonnee.querySelector('a')?.href === 'https://www.example.com/attribution'
  ? ok('avis Places : attributions de fournisseurs affichées')
  : ko('avis Places : attribution de fournisseur absente');
premierLive?.querySelector('.cover-reviews__date')?.textContent === 'Visite : septembre 2026'
  ? ok('avis Places : date de visite francaise affichee')
  : ko('avis Places : date de visite absente');
live.window.document.getElementById('cover-reviews-next').hidden &&
live.window.document.getElementById('cover-reviews-previous').hidden
  ? ok('carrousel : commandes masquees pour un seul avis')
  : ko('carrousel : commandes visibles sans navigation possible');
const divulgation = live.window.document.getElementById('cover-reviews-disclosure').textContent;
divulgation.includes('4 ou 5 étoiles')
  ? ok('avis Places : filtre et ordre de pertinence declares')
  : ko('avis Places : filtre non declare');
divulgation.includes('traduit par Google')
  ? ok('avis Places : traduction signalee avec lien vers la source')
  : ko('avis Places : traduction non signalee');
!script.includes('places.googleapis.com/v1') && !script.includes('sessionStorage.') && !script.includes('localStorage.')
  ? ok('avis Places : pas de REST navigateur ni de cache de contenu Google')
  : ko('avis Places : REST ou cache de contenu detecte');

const chargementSdk = domAvis(() => reponseJson({
  place_id: 'ChIJxxxx', cle_api: 'CLE_DE_TEST', publie: true, note: 5, nombre_avis: 4,
}));
let urlSdk = '', sdkAsync = false;
const appendReel = chargementSdk.window.document.head.appendChild.bind(chargementSdk.window.document.head);
chargementSdk.window.document.head.appendChild = function (element) {
  if (element.tagName === 'SCRIPT' && element.src.includes('maps.googleapis.com/maps/api/js')) {
    urlSdk = element.src;
    sdkAsync = element.async;
    chargementSdk.window.google = { maps: { importLibrary: () => Promise.resolve({ Place: class {
      constructor() { this.rating = 4.9; this.userRatingCount = 58; this.googleMapsURI = 'https://www.google.com/maps/?cid=2'; this.reviews = []; }
      fetchFields() { return Promise.resolve(); }
    } }) } };
    chargementSdk.window.setTimeout(() => element.onload(), 0);
    return element;
  }
  return appendReel(element);
};
chargementSdk.window.eval(script);
await new Promise((r) => setTimeout(r, 50));
urlSdk.startsWith('https://maps.googleapis.com/maps/api/js?') && urlSdk.includes('key=CLE_DE_TEST') &&
  urlSdk.includes('language=fr') && urlSdk.includes('region=FR') && sdkAsync
  ? ok('Maps JavaScript : SDK charge de facon asynchrone en francais')
  : ko('Maps JavaScript : URL ou chargement du SDK invalide');

const secours = domAvis(() => reponseJson({ ...manuel, place_id: 'ChIJxxxx', cle_api: 'CLE_DE_TEST' }));
secours.window.google = { maps: { importLibrary: () => Promise.reject(new Error('API indisponible')) } };
secours.window.eval(script);
await new Promise((r) => setTimeout(r, 50));
secours.window.document.getElementById('cover-reviews').textContent.includes('4,6/5')
  ? ok('mode Places : secours manuel si le SDK est indisponible')
  : ko('mode Places : secours manuel absent');

// --------------------------------- 4 ter. pied de page et alentours ------
const navs = [...d.querySelectorAll('.footer-quartier')];
navs.length === 2 ? ok('index.html : ligne des alentours sur la page de garde et dans le pied')
                  : ko(`index.html : ${navs.length} ligne(s) des alentours`);
const reperes = [...navs[0].querySelectorAll('a')];
reperes.length === 8 && reperes.every((a) => a.href.startsWith('https://'))
  ? ok(`alentours : ${reperes.length} reperes (${reperes.map((a) => a.textContent).join(', ')})`)
  : ko(`alentours : ${reperes.length} lien(s)`);
reperes.some((a) => /mairie11|mairie\.?11/i.test(a.href))
  ? ko('la mairie du 11e ne doit pas figurer dans les reperes')
  : ok('aucun lien vers la mairie du 11e');
// tri par distance : l'infobulle porte la distance, elle doit croitre
const metres = reperes.map((a) => {
  const m = a.title.match(/([\d,.]+)\s*(m|km)/);
  return parseFloat(m[1].replace(',', '.')) * (m[2] === 'km' ? 1000 : 1);
});
metres.every((v, i) => i === 0 || v >= metres[i - 1])
  ? ok('alentours classes du plus proche au plus lointain (' +
       reperes.map((a, i) => `${a.textContent} ${a.title.match(/[\d,.]+ ?k?m/)[0]}`).join(' < ') + ')')
  : ko('alentours mal classes : ' + metres.join(', '));
navs.every((n) => n.querySelectorAll('a').length === reperes.length)
  ? ok('la page de garde et le pied affichent les memes reperes')
  : ko('les deux lignes des alentours different');

// une seule mention du metro par page, et c'est elle qui porte l'itineraire
for (const f of ['index.html', 'reservation.html', 'mentions-legales.html',
  'confidentialite.html']) {
  const t = lire(f);
  const dom = new JSDOM(t).window.document;
  const metros = [...dom.querySelectorAll('.footer-details__metro')];
  const alent = dom.querySelector('.footer .footer-quartier');
  const legal = dom.querySelector('.footer .legal-bottom-nav');
  metros.length === 1 && !/gambetta|ratp|m\u00e9tro/i.test(alent.textContent)
    ? ok(`${f} : mention du metro une seule fois, sans redite dans les alentours`)
    : ko(`${f} : ${metros.length} mention(s) du metro dans le pied, ou redite`);
  metros[0].tagName === 'A' && metros[0].hasAttribute('data-ratp-itineraire')
    ? ok(`${f} : la mention du metro ouvre l'itineraire RATP`)
    : ko(`${f} : la mention du metro n'est pas un itineraire`);
  alent && legal ? ok(`${f} : alentours + mentions legales en pied de page`)
                 : ko(`${f} : pied de page incomplet`);
  alent.previousElementSibling.classList.contains('footer-details')
    ? ok(`${f} : la ligne des alentours est juste sous l'adresse`)
    : ko(`${f} : la ligne des alentours n'est pas sous l'adresse`);
}

const ratp = d.querySelector('[data-ratp-itineraire]');
ratp && ratp.href.startsWith('https://www.ratp.fr/itineraires?end=') && ratp.href.includes('Belgrand')
  ? ok('lien RATP : itineraire avec le restaurant en arrivee')
  : ko('lien RATP : ce n\'est pas un itineraire vers le restaurant');
/navigator\.geolocation/.test(index) && /api-adresse\.data\.gouv\.fr\/reverse/.test(index)
  ? ok('itineraire RATP : depart pris sur la position du visiteur, avec repli')
  : ko('itineraire RATP : la geolocalisation du visiteur est absente');
const garde = d.querySelector('#cover-more .footer-quartier--cover');
const couverture = d.getElementById('cover-section');
const sousCouverture = d.getElementById('cover-more');
const mailCouverture = d.querySelector('#cover-section .contact-link--mail');
const avisSousCouverture = d.querySelector('#cover-more #cover-reviews');
garde && d.querySelector('#cover-more .legal-bottom-nav--cover')
  ? ok('page de garde : alentours et mentions legales apres la premiere vue')
  : ko('page de garde : bloc d’informations du quartier incomplet');
couverture && sousCouverture && couverture.nextElementSibling === sousCouverture &&
  mailCouverture && avisSousCouverture && !couverture.querySelector('#cover-reviews')
  ? ok('page de garde : le bouton e-mail precede les avis et les alentours')
  : ko('page de garde : avis ou alentours encore melanges aux boutons de contact');

// -------------------------------------------------------- 5. fichiers ------
for (const f of ['404.html', 'sitemap.xml', 'sitemap-images.xml', 'robots.txt',
  'assets/data/avis-google.json', 'assets/cover/og-cover.jpg']) {
  existsSync(racine + f) ? ok(`${f} present`) : ko(`${f} manquant`);
}
const liens = [...index.matchAll(/(?:src|href)="(?!https?:|mailto:|tel:|data:|#)([^"]+)"/g)]
  .map((m) => m[1].split(/[?#]/)[0]).filter((v, i, a) => v && a.indexOf(v) === i);
const absents = liens.filter((f) => !existsSync(racine + f.replace(/^\//, '')));
absents.length === 0 ? ok(`${liens.length} ressources locales toutes presentes`)
                     : ko('ressources absentes : ' + absents.join(', '));

// ------------------------------------------- 6. audit des liens externes ---
// Liste des domaines/URL verifies un a un (reponse 200, bon site, a jour).
// Tout lien externe absent de cette liste fait echouer le controle : il faut
// d'abord le verifier, puis l'ajouter ici.
const autorises = [
  'https://www.paris.fr/lieux/cimetiere-du-pere-lachaise-4080',
  'https://www.paris.fr/lieux/parc-de-belleville-1777',
  'https://www.pavilloncarredebaudouin.fr/',
  'https://www.colline.fr/',
  'https://mairie20.paris.fr/',
  'https://www.cirquedhiver.com/',
  'https://www.bataclan.fr/',
  'https://www.operadeparis.fr/visites/opera-bastille',
  'https://www.ratp.fr/itineraires',
  'https://api-adresse.data.gouv.fr/reverse/',
  'https://www.instagram.com/lacolline.gambetta',
  'https://www.google.com/maps/search/',
  'https://www.openstreetmap.org/',
  'https://www.openmaptiles.org/',
  'https://openfreemap.org/',
  'https://tiles.openfreemap.org/styles/positron',
  'https://unpkg.com/maplibre-gl@4.7.1/',
  'https://www.cnil.fr/fr/plaintes',
  'https://docs.github.com/fr/pages',
  'https://api.web3forms.com/submit',
  'https://formsubmit.co/ajax/',
  'https://script.google.com/macros/s/',
  'https://maps.googleapis.com/maps/api/js',
  'https://developers.google.com/maps/documentation/places/web-service/policies',
  'https://policies.google.com/privacy',
  'https://get.geojs.io/v1/ip/country.json',
  'https://ipwho.is/',
  'https://www.gstatic.com/firebasejs/10.12.5/',
  'https://firestore.googleapis.com',
  'https://identitytoolkit.googleapis.com',
  'https://schema.org',
  'https://www.lacollinegambetta.com',
  'https://lacollinegambetta.com',
  'https://www.gstatic.com',
  'http://127.0.0.1:9099',
];
const pages = ['index.html', 'reservation.html', 'mentions-legales.html',
  'confidentialite.html', '404.html'];
const externes = new Set();
for (const f of pages) {
  for (const m of lire(f).matchAll(/https?:\/\/[^"'\s<)]+/g)) {
    const u = m[0].replace(/&amp;/g, '&').replace(/[.,;]$/, '');
    if (/^https?:\/\/(www\.)?(w3|schema|sitemaps)\.org/.test(u)) continue;
    externes.add(u);
  }
}
const inconnus = [...externes].filter((u) => !autorises.some((a) => u.startsWith(a)));
inconnus.length === 0
  ? ok(`${externes.size} liens externes, tous sur des adresses verifiees`)
  : ko('liens externes non verifies : ' + inconnus.join(' | '));
const enClair = [...externes].filter((u) => u.startsWith('http://') && !u.includes('127.0.0.1'));
enClair.length === 0 ? ok('aucun lien externe en http non securise')
                     : ko('liens en http : ' + enClair.join(' | '));

// La nouvelle information Google Maps de la politique de confidentialité doit
// aussi rester traduite dans une langue proposée par l'interface.
const legalEn = new JSDOM(lire('confidentialite.html'), {
  runScripts: 'outside-only', url: 'https://lacollinegambetta.com/confidentialite.html?lang=en'
});
legalEn.window.eval(lire('assets/js/legal-i18n.js'));
const disclosureGoogle = [...legalEn.window.document.querySelectorAll('.legal-card p')]
  .find((p) => p.querySelector('a[href^="https://policies.google.com/privacy"]'));
const liensGoogle = disclosureGoogle ? [...disclosureGoogle.querySelectorAll('a')].map((a) => a.textContent.trim()) : [];
disclosureGoogle && disclosureGoogle.textContent.startsWith('The homepage') &&
  liensGoogle[0] === 'Google Privacy Policy' && liensGoogle[1] === 'Places API attribution requirements'
  ? ok('confidentialite : services Google Maps et liens traduits en anglais')
  : ko('confidentialite : traduction de la declaration Google Maps incomplete');
legalEn.window.document.querySelector('time[datetime="2026-10-04"]')?.textContent.trim() === '4 October 2026'
  ? ok('confidentialite : date de mise a jour traduite')
  : ko('confidentialite : date de mise a jour non traduite');

console.log(erreurs ? `\n${erreurs} controle(s) en echec` : '\nTous les controles sont au vert');
process.exit(erreurs ? 1 : 0);
