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
const script = index.match(/\(function \(\) \{\s*var bloc = document\.getElementById\('cover-reviews'\)[\s\S]*?\}\)\(\);/)[0];
const gabarit = d.getElementById('cover-reviews').outerHTML;
const essai = new JSDOM(`<body>${gabarit}</body>`, { runScripts: 'outside-only' });
essai.window.fetch = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    publie: true, note: 4.6, nombre_avis: 128, url: 'https://exemple',
    avis: [{ auteur: 'Claire D.', texte: 'Accueil parfait et cuisine maison.' }],
  }),
});
essai.window.eval(script);
await new Promise((r) => setTimeout(r, 30));
const b = essai.window.document.getElementById('cover-reviews');
!b.hidden ? ok('bloc avis : affiche quand le fichier est rempli') : ko('bloc avis : reste masque');
const texte = b.textContent.replace(/\s+/g, ' ').trim();
/4,6\/5/.test(texte) && /128 avis Google/.test(texte) && /Claire D\./.test(texte)
  ? ok(`bloc avis : "${texte.slice(0, 80)}"`) : ko('bloc avis : contenu inattendu : ' + texte);

const vide = new JSDOM(`<body>${gabarit}</body>`, { runScripts: 'outside-only' });
vide.window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ publie: false }) });
vide.window.eval(script);
await new Promise((r) => setTimeout(r, 30));
vide.window.document.getElementById('cover-reviews').hidden
  ? ok('bloc avis : invisible tant qu\'aucun avis reel n\'est saisi')
  : ko('bloc avis : visible alors qu\'il est vide');


// --------------------------------------- 4 bis. etoiles et mode Places ----
const remplissage = essai.window.document.getElementById('cover-reviews-stars-fill').style.width;
remplissage === '92%' ? ok(`etoiles : remplissage exact pour 4,6/5 (${remplissage})`)
                         : ko(`etoiles : remplissage inattendu (${remplissage})`);

const live = new JSDOM(`<body>${gabarit}</body>`, { runScripts: 'outside-only' });
live.window.fetch = (u) => Promise.resolve(String(u).includes('places.googleapis.com') ? {
  ok: true,
  json: () => Promise.resolve({
    rating: 4.8, userRatingCount: 57, googleMapsUri: 'https://maps.google.com/?cid=1',
    reviews: [{ rating: 5, text: { text: 'Terrasse agreable et planches genereuses.' },
                authorAttribution: { displayName: 'Marc L.' } },
              { rating: 3, text: { text: 'Avis moyen a ne pas mettre en avant.' },
                authorAttribution: { displayName: 'X.' } }],
  }),
} : {
  ok: true,
  json: () => Promise.resolve({ place_id: 'ChIJxxxx', cle_api: 'AIzaCLE', publie: false }),
});
live.window.eval(script);
await new Promise((r) => setTimeout(r, 60));
const t2 = live.window.document.getElementById('cover-reviews').textContent.replace(/\s+/g, ' ').trim();
/4,8\/5/.test(t2) && /57 avis Google/.test(t2) && /Marc L\./.test(t2) && !/Avis moyen/.test(t2)
  ? ok(`mode Places : "${t2.slice(0, 80)}" (les avis sous 4 etoiles sont ecartes)`)
  : ko('mode Places : ' + t2);

// ------------------------------------------- 4 ter. reperes du quartier ---
const quartier = [...d.querySelectorAll('.footer-quartier a')];
quartier.length === 4 && quartier.every((a) => a.href.startsWith('https://'))
  ? ok(`pied de page : ${quartier.length} reperes de quartier (${quartier.map((a) => a.textContent).join(', ')})`)
  : ko(`pied de page : ${quartier.length} lien(s) de quartier`);
d.querySelector('.footer-quartier').previousElementSibling.classList.contains('footer-details')
  ? ok('la ligne de quartier est bien placee sous l\'adresse')
  : ko('la ligne de quartier n\'est pas sous l\'adresse');

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

console.log(erreurs ? `\n${erreurs} controle(s) en echec` : '\nTous les controles sont au vert');
process.exit(erreurs ? 1 : 0);
