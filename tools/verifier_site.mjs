// Controles automatiques du site : CSS valide, HTML coherent, donnees
// structurees conformes et navigation. A lancer avec :
//   node tools/verifier_site.mjs
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
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
try {
  const reviewCss = postcss.parse(lire('assets/css/google-reviews.css'));
  let regles = 0;
  reviewCss.walkRules(() => regles++);
  ok(`avis Google : feuille responsive ${regles} regles validee`);
} catch (e) { ko(`avis Google : feuille responsive invalide (${e.message})`); }

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
const ligneHoraires = d.querySelector('#cover-section .cover-hours__range');
const libelleHeures = d.querySelector('#cover-section [data-hours-range]');
const statutHoraires = d.querySelector('#cover-section [data-hours-status]');
ligneHoraires?.contains(libelleHeures) && ligneHoraires.contains(statutHoraires) &&
  libelleHeures.nextElementSibling === statutHoraires
  ? ok('horaires : le statut suit la plage horaire dans la même ligne')
  : ko('horaires : le statut doit suivre la plage horaire dans la même ligne');
index.includes('--cover-address-font-size:clamp(.68rem,1.15vw,.86rem)') &&
  index.includes('--cover-hours-line-font-size:clamp(.816rem,1.38vw,1.032rem)') &&
  index.includes('--cover-address-font-size:clamp(.5rem,2.1vw,.66rem)') &&
  index.includes('--cover-hours-line-font-size:clamp(.6rem,2.52vw,.792rem)')
  ? ok('horaires : police de toute la ligne, badge compris, proportionnelle à l’adresse')
  : ko('horaires : rapport de taille 1,2× non défini sur tous les écrans');
index.includes('.medallion-frame.is-load-reflection::after') &&
  index.includes("window.addEventListener('load'") &&
  index.includes("'(prefers-reduced-motion: reduce)'") &&
  index.includes("frame.classList.remove('is-load-reflection')")
  ? ok('médaillon : reflet après chargement complet, retrait avant le survol suivant')
  : ko('médaillon : reflet de chargement, fin d’animation ou mouvement réduit absent');
const noelCanvas = d.getElementById('xmas-snow');
noelCanvas?.parentElement === d.body &&
  index.includes("timeZone:'Europe/Paris'") &&
  index.includes("window.addEventListener('pageshow', seasonalReturn)") &&
  index.includes('30 * 60 * 1000') &&
  index.includes("query === '1' || isDecemberInParis()")
  ? ok('Noël : activation en décembre (heure de Paris), persistance sur les deux vues et reprise après retour')
  : ko('Noël : activation saisonnière ou reprise après navigation incomplète');
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

// ------------------------------------- 3 bis. avis Google de la couverture
const blocAvisGoogle = d.getElementById('cover-reviews-section');
const boutonAvisGoogle = d.getElementById('google-reviews-load');
const attributionMaps = d.getElementById('google-reviews-maps');
const positionAvisGoogle = d.getElementById('google-reviews-position');
const zoneCommentaires = d.getElementById('google-reviews-slide');
const tousLesAvisGoogle = d.getElementById('google-reviews-all');
const rotationAvisGoogle = d.getElementById('google-reviews-rotation');
const cssAvisGoogle = lire('assets/css/google-reviews.css');
const scriptAvisGoogle = lire('assets/js/google-reviews.js');
let configurationAvis = null;
try { configurationAvis = JSON.parse(lire('assets/data/avis-google.json')); } catch (e) {}
blocAvisGoogle && boutonAvisGoogle && boutonAvisGoogle.hidden && boutonAvisGoogle.disabled &&
  positionAvisGoogle?.getAttribute('role') === 'status' && attributionMaps && tousLesAvisGoogle &&
  rotationAvisGoogle?.getAttribute('aria-controls') === 'google-reviews-viewport' &&
  rotationAvisGoogle?.getAttribute('type') === 'button' &&
  attributionMaps.tagName === 'SPAN' && attributionMaps.textContent.trim() === 'Google Maps' &&
  attributionMaps.getAttribute('translate') === 'no' && !attributionMaps.hasAttribute('href') &&
  tousLesAvisGoogle.href.startsWith('https://www.google.com/maps/') &&
  !d.getElementById('google-reviews-count') && !zoneCommentaires?.querySelector('blockquote')
  ? ok('avis Google : note sans nombre d’avis visible, navigation accessible et secours sans avis statique')
  : ko('avis Google : structure du bloc, attribution ou contenu statique incorrect');
configurationAvis && typeof configurationAvis.place_id === 'string' &&
  configurationAvis.place_id.startsWith('ChIJ') && typeof configurationAvis.cle_api === 'string' &&
  configurationAvis.cle_api.length > 20 && !('avis' in configurationAvis) &&
  !('note' in configurationAvis) && !('nombre_avis' in configurationAvis)
  ? ok('avis Google : configuration Places présente, sans note ni avis mis en cache')
  : ko('avis Google : configuration Places absente ou contenant des données statiques');
scriptAvisGoogle.includes("fields:['rating','googleMapsURI','reviews']") &&
  !scriptAvisGoogle.includes('userRatingCount') &&
  !scriptAvisGoogle.includes("fields:['rating','googleMapsURI','reviews','attributions']") &&
  scriptAvisGoogle.includes('renderAttributions(target.attributions)') &&
  scriptAvisGoogle.includes('callback:callbackName') &&
  scriptAvisGoogle.includes('window[callbackName] = function ()') &&
  !scriptAvisGoogle.includes('script.onload') &&
  scriptAvisGoogle.includes('  loadReviews();') &&
  scriptAvisGoogle.includes('function scheduleAutoAdvance()') &&
  scriptAvisGoogle.includes('Math.ceil(characters / 14 * 1000)') &&
  scriptAvisGoogle.includes('stopRotationForInteraction') &&
  scriptAvisGoogle.includes('handleReducedMotionChange') &&
  !cssAvisGoogle.includes('line-clamp') &&
  !scriptAvisGoogle.includes('google-reviews-source') &&
  scriptAvisGoogle.includes('authorUrl') && scriptAvisGoogle.includes('google-reviews-author-profile') &&
  !scriptAvisGoogle.includes('reviewUrl') &&
  !scriptAvisGoogle.includes('localStorage') && !scriptAvisGoogle.includes('sessionStorage')
  ? ok('avis Google : rotation temporisée, texte intégral, attribution Places et absence de cache vérifiés')
  : ko('avis Google : rotation, lecture intégrale, champs Places ou absence de cache non garantis');
index.includes('assets/css/google-reviews.css?v=2026100601') &&
  index.includes('assets/js/google-reviews.js?v=2026100601') &&
  d.querySelector('script[src^="assets/js/i18n.js"]')?.closest('head') &&
  d.querySelector('script[src^="assets/js/google-reviews.js"]')?.closest('head') &&
  d.querySelector('script[src^="assets/js/google-reviews.js"]')?.defer
  ? ok('avis Google : assets mis en cache, chargement automatique dès la page et affichage relié')
  : ko('avis Google : assets, auto-chargement ou script manquant sur la page de garde');

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

// une seule mention du metro par page, en texte simple, sans renvoi RATP
for (const f of ['index.html', 'reservation.html', 'mentions-legales.html',
  'confidentialite.html']) {
  const t = lire(f);
  const dom = new JSDOM(t).window.document;
  const metros = [...dom.querySelectorAll('.footer-details__metro')];
  const adresse = dom.querySelector('.footer .footer-address-link');
  const localisation = dom.querySelector('.footer .footer-details__location');
  const separateurAdresseMetro = dom.querySelector('.footer .footer-details__separator');
  const alent = dom.querySelector('.footer .footer-quartier');
  const legal = dom.querySelector('.footer .legal-bottom-nav');
  const stylesPied = [...dom.querySelectorAll('style')].map((style) => style.textContent).join('\n');
  metros.length === 1 && !/gambetta|ratp|m\u00e9tro/i.test(alent.textContent)
    ? ok(`${f} : mention du metro une seule fois, sans redite dans les alentours`)
    : ko(`${f} : ${metros.length} mention(s) du metro dans le pied, ou redite`);
  metros[0].tagName === 'SPAN' && metros[0].textContent.trim() === 'MÉTRO GAMBETTA • LIGNE 3' &&
    !metros[0].hasAttribute('href') && !metros[0].hasAttribute('data-ratp-itineraire')
    ? ok(`${f} : mention du metro en texte simple, sans lien ni renvoi RATP`)
    : ko(`${f} : la mention du metro doit rester du texte simple`);
  adresse && adresse.textContent.trim() === '4 RUE BELGRAND • 75020 PARIS' &&
    localisation && localisation.contains(adresse) && localisation.contains(metros[0]) &&
    separateurAdresseMetro &&
    separateurAdresseMetro.previousElementSibling === adresse &&
    separateurAdresseMetro.nextElementSibling === metros[0]
    ? ok(`${f} : adresse et métro groupés sans retour à la ligne`)
    : ko(`${f} : le groupe adresse/métro est incomplet`);
  const styleLigne = stylesPied.match(/html:not\(\.carte-doc\)\s*\.footer-details\s*\{([^}]*)\}/);
  const styleLocalisation = stylesPied.match(/html:not\(\.carte-doc\)\s*\.footer-details__location\s*\{([^}]*)\}/);
  const styleAlentours = stylesPied.match(/html:not\(\.carte-doc\)\s*\.footer-quartier\s*\{([^}]*)\}/);
  styleLigne && /flex-flow:\s*row nowrap/.test(styleLigne[1]) &&
    styleLocalisation && /flex-flow:\s*row nowrap/.test(styleLocalisation[1]) &&
    /color:\s*#fff\s*!important/.test(styleLigne[1]) &&
    stylesPied.includes('border:1px solid rgba(255,255,255,.46)')
    ? ok(`${f} : adresse sur une ligne, blanche, et boutons légaux en pills`)
    : ko(`${f} : styles responsive du pied ou pills légales absents`);
  styleAlentours && /width:\s*100%/.test(styleAlentours[1]) &&
    /max-width:\s*none/.test(styleAlentours[1]) &&
    stylesPied.includes('@media (max-width:860px)') &&
    stylesPied.includes('html:not(.carte-doc) .footer-details > span:first-child') &&
    stylesPied.includes('html:not(.carte-doc) .footer-details__location > a')
    ? ok(`${f} : marque, adresse, métro et alentours reflués sans largeur plafonnée`)
    : ko(`${f} : reflow mobile ou largeur pleine des alentours absent`);
  alent && legal ? ok(`${f} : alentours + mentions legales en pied de page`)
                 : ko(`${f} : pied de page incomplet`);
  alent.previousElementSibling.classList.contains('footer-details')
    ? ok(`${f} : la ligne des alentours est juste sous l'adresse`)
    : ko(`${f} : la ligne des alentours n'est pas sous l'adresse`);
}

const adresseAr = new JSDOM(lire('reservation.html'), {
  runScripts: 'outside-only', url: 'https://lacollinegambetta.com/reservation.html?lang=ar'
});
adresseAr.window.eval(lire('assets/js/i18n.js'));
adresseAr.window.document.querySelector('.footer-address-link')?.textContent.trim() ===
  '4 شارع بيلغراند، 75020 باريس'
  ? ok('i18n : traduction arabe de l’adresse conservée avec la nouvelle clé')
  : ko('i18n : traduction arabe de l’adresse perdue');
adresseAr.window.close();

// Vérifie que les éléments visibles du pied et leurs libellés accessibles
// utilisent bien l’écriture native dans les six langues non latines proposées.
const piedsLocaux = {
  ar: {
    heading: 'الأماكن القريبة',
    brand: 'لا كولين غامبيتا',
    addressMain: '4 شارع بيلغراند، 75020 باريس',
    addressLegal: '4 شارع بيلغراند، 75020 باريس',
    coverAddress: '4 شارع بيلغراند • 75020 باريس',
    metro: 'مترو غامبيتا • الخط 3',
    places: ['بلدية الدائرة العشرين', 'مسرح لا كولين', 'مقبرة بير لاشيز', 'مركز كاريه دو بودوان الثقافي', 'حديقة بيلفيل', 'قاعة باتاكلان', 'سيرك الشتاء', 'أوبرا الباستيل'],
    distance: 'على بُعد 100 متر من المطعم',
    addressTitle: 'فتح العنوان على الخريطة',
  },
  zh: {
    heading: '附近景点',
    brand: '拉科林·冈贝塔',
    addressMain: '贝勒格朗街4号，75020 巴黎',
    addressLegal: '贝勒格朗街4号，75020 巴黎',
    coverAddress: '贝勒格朗街4号 • 75020 巴黎',
    metro: '甘贝塔地铁站 • 3号线',
    places: ['巴黎第二十区市政厅', '拉科利讷剧院', '拉雪兹神父公墓', '博杜安文化中心', '贝尔维尔公园', '巴塔克兰演出厅', '冬季马戏团', '巴士底歌剧院'],
    distance: '距餐厅100米',
    addressTitle: '在地图中打开地址',
  },
  uk: {
    heading: 'Поблизу',
    brand: 'ЛА КОЛЛІН ҐАМБЕТТА',
    addressMain: '4 ВУЛ. БЕЛЬГРАН, 75020 ПАРИЖ',
    addressLegal: '4 вул. Бельгран, 75020 Париж',
    coverAddress: '4 вул. Бельгран • 75020 Париж',
    metro: 'метро Ґамбетта • Лінія 3',
    places: ['Мерія 20-го округу', 'Театр «Ла Коллін»', 'Кладовище Пер-Лашез', 'Культурний центр «Карре-де-Бодуен»', 'Парк Бельвіль', 'Батаклан', 'Зимовий цирк', 'Опера Бастилії'],
    distance: 'За 100 м від ресторану',
    addressTitle: 'Відкрити адресу на мапі',
  },
  ja: {
    heading: '近隣スポット',
    brand: 'ラ・コリーヌ・ガンベッタ',
    addressMain: 'ベルグラン通り4番、75020パリ',
    addressLegal: 'ベルグラン通り4番、75020 パリ',
    coverAddress: 'ベルグラン通り4番 • 75020パリ',
    metro: 'ガンベッタ駅 • 3号線',
    places: ['パリ20区役所', 'ラ・コリーヌ劇場', 'ペール・ラシェーズ墓地', 'カレ・ド・ボードゥアン文化センター', 'ベルヴィル公園', 'バタクラン', '冬のサーカス', 'バスティーユ・オペラ'],
    distance: 'レストランから100メートル',
    addressTitle: '地図で住所を開く',
  },
  ko: {
    heading: '주변 명소',
    brand: '라 콜린 감베타',
    addressMain: '벨그랑 거리 4, 75020 파리',
    addressLegal: '벨그랑 거리 4, 75020 파리',
    coverAddress: '벨그랑 거리 4 • 75020 파리',
    metro: '감베타역 • 3호선',
    places: ['파리 20구청', '라 콜린 극장', '페르 라셰즈 묘지', '카레 드 보두앵 문화센터', '벨빌 공원', '바타클랑', '겨울 서커스', '바스티유 오페라'],
    distance: '식당에서 100미터',
    addressTitle: '지도에서 주소 열기',
  },
  hi: {
    heading: 'आस-पास के स्थल',
    brand: 'ला कोलीन गांबेता',
    addressMain: 'रू बेलग्रां 4, 75020 पेरिस',
    addressLegal: 'बेलग्रां सड़क 4, 75020 पेरिस',
    coverAddress: 'रू बेलग्रां 4 • 75020 पेरिस',
    metro: 'गांबेता मेट्रो • लाइन 3',
    places: ['पेरिस के 20वें ज़िले का नगर भवन', 'ला कोलीन थिएटर', 'पेरे लाशेज़ कब्रिस्तान', 'कारे द बोदुआँ सांस्कृतिक केंद्र', 'बेलविल पार्क', 'बताक्लां', 'शीतकालीन सर्कस', 'बास्तील ओपेरा'],
    distance: 'रेस्तरां से 100 मीटर दूर',
    addressTitle: 'मानचित्र पर पता खोलें',
  }
};
for (const [lang, expected] of Object.entries(piedsLocaux)) {
  const siteLocal = new JSDOM(lire('reservation.html'), {
    runScripts: 'outside-only', url: `https://lacollinegambetta.com/reservation.html?lang=${lang}`
  });
  siteLocal.window.eval(lire('assets/js/i18n.js'));
  const siteDoc = siteLocal.window.document;
  const siteNav = siteDoc.querySelector('.footer .footer-quartier');
  const siteLinks = siteNav ? [...siteNav.querySelectorAll('a')] : [];
  const siteMetro = siteDoc.querySelector('.footer-details__metro');
  const siteAdresse = siteDoc.querySelector('.footer-address-link');
  const siteBrand = siteDoc.querySelector('.footer .footer-details > span:first-child');
  const siteOk = siteDoc.documentElement.lang === lang &&
    siteNav?.getAttribute('aria-label') === expected.heading &&
    siteNav?.querySelector('span')?.textContent.trim() === expected.heading &&
    siteLinks.length === expected.places.length &&
    siteLinks.every((a, i) => a.textContent.trim() === expected.places[i]) &&
    siteLinks[0]?.title === expected.distance &&
    siteBrand?.textContent.trim() === expected.brand &&
    siteMetro?.textContent.trim() === expected.metro &&
    siteAdresse?.textContent.trim() === expected.addressMain && siteAdresse.title === expected.addressTitle;
  siteOk ? ok(`i18n ${lang} : pied de page, itinéraire et adresse en écriture native`)
         : ko(`i18n ${lang} : traduction du pied de page incomplète`);
  siteLocal.window.close();

  const coverLocal = new JSDOM(lire('index.html'), {
    runScripts: 'outside-only', url: `https://lacollinegambetta.com/?lang=${lang}`
  });
  coverLocal.window.eval(lire('assets/js/i18n.js'));
  const coverAdresse = coverLocal.window.document.querySelector('.cover-footer-address a[data-default-map]');
  const coverMetro = coverLocal.window.document.querySelector('.cover-footer-address .cover-footer-address__metro');
  const coverOk = coverAdresse?.textContent.trim() === expected.coverAddress &&
    coverAdresse.title === expected.addressTitle &&
    coverMetro?.textContent.trim() === expected.metro;
  coverOk ? ok(`couverture ${lang} : adresse et métro en écriture native`)
          : ko(`couverture ${lang} : traduction de l’adresse ou du métro incomplète`);
  coverLocal.window.close();

  const legalLocal = new JSDOM(lire('confidentialite.html'), {
    runScripts: 'outside-only', url: `https://lacollinegambetta.com/confidentialite.html?lang=${lang}`
  });
  legalLocal.window.eval(lire('assets/js/legal-i18n.js'));
  const legalDoc = legalLocal.window.document;
  const legalNavLocal = legalDoc.querySelector('.footer .footer-quartier');
  const legalLinksLocal = legalNavLocal ? [...legalNavLocal.querySelectorAll('a')] : [];
  const legalMetro = legalDoc.querySelector('.footer-details__metro');
  const legalAdresse = legalDoc.querySelector('.footer-address-link');
  const legalBrand = legalDoc.querySelector('.footer .footer-details > span:first-child');
  const legalOk = legalDoc.documentElement.lang === lang &&
    legalNavLocal?.getAttribute('aria-label') === expected.heading &&
    legalNavLocal?.querySelector('span')?.textContent.trim() === expected.heading &&
    legalLinksLocal.length === expected.places.length &&
    legalLinksLocal.every((a, i) => a.textContent.trim() === expected.places[i]) &&
    legalLinksLocal[0]?.title === expected.distance &&
    legalBrand?.textContent.trim() === expected.brand &&
    legalMetro?.textContent.trim() === expected.metro &&
    legalAdresse?.textContent.trim() === expected.addressLegal && legalAdresse.title === expected.addressTitle;
  legalOk ? ok(`pages légales ${lang} : pied de page en écriture native`)
          : ko(`pages légales ${lang} : traduction du pied de page incomplète`);
  legalLocal.window.close();
}
const extraireObjetPied = (fichier, nom) => {
  const source = lire(fichier);
  const correspondance = source.match(new RegExp('var ' + nom + ' = (\\{[\\s\\S]*?\\n  \\});'));
  if (!correspondance) throw new Error(`objet ${nom} absent dans ${fichier}`);
  return { valeur: vm.runInNewContext(`(${correspondance[1]})`), source: correspondance[1] };
};
try {
  const copieAccueil = extraireObjetPied('assets/js/i18n.js', 'FOOTER_COPY');
  const copieLegale = extraireObjetPied('assets/js/legal-i18n.js', 'FOOTER_COPY');
  const distancesAccueil = extraireObjetPied('assets/js/i18n.js', 'FOOTER_DISTANCE_FORMATS');
  const distancesLegales = extraireObjetPied('assets/js/legal-i18n.js', 'FOOTER_DISTANCE_FORMATS');
  JSON.stringify(copieAccueil.valeur) === JSON.stringify(copieLegale.valeur) &&
    distancesAccueil.source === distancesLegales.source
    ? ok('i18n : mêmes traductions et infobulles sur les pages classiques et légales')
    : ko('i18n : les traductions du pied divergent entre les pages classiques et légales');
} catch (e) { ko(`i18n : comparaison des traductions de pied impossible (${e.message})`); }

const chiffres = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'outside-only'
});
chiffres.window.eval(lire('assets/js/localized-digits.js'));
const exempleNumerique = '07:00 • 75020 • 01 43 49 05 93';
chiffres.window.LCGLocalizeDisplayDigits(exempleNumerique, 'uk') === exempleNumerique &&
  chiffres.window.LCGLocalizeDisplayDigits('07:00', 'ar') === '٠٧:٠٠'
  ? ok('chiffres : numéraux ukrainiens compacts, chiffres arabes toujours localisés')
  : ko('chiffres : localisation compacte ukrainienne ou arabe incorrecte');
chiffres.window.close();
const cacheChiffres = ['index.html', 'reservation.html', 'mentions-legales.html', 'confidentialite.html']
  .every((f) => lire(f).includes('localized-digits.js?v=2026100501'));
cacheChiffres
  ? ok('chiffres : toutes les pages invalidant l’ancien cache du script localisé')
  : ko('chiffres : une page sert encore une version en cache du script localisé');
['index.html', 'reservation.html'].every((f) => lire(f).includes('i18n.js?v=2026100502'))
  ? ok('i18n : scripts actualisés sur la page d’accueil et la réservation')
  : ko('i18n : une page conserve l’ancienne version en cache');
['mentions-legales.html', 'confidentialite.html'].every((f) => lire(f).includes('legal-i18n.js?v=2026100504'))
  ? ok('i18n légal : scripts actualisés sur les pages juridiques')
  : ko('i18n légal : une page conserve l’ancienne version en cache');

const tracesRatp = ['index.html', 'reservation.html', 'mentions-legales.html', 'confidentialite.html', '404.html']
  .filter((f) => /bonjour-?ratp|ratp\.fr|fabernovel|data-ratp/i.test(lire(f)))
  .concat(['i18n.js', 'legal-i18n.js', 'map-links.js', 'localized-digits.js']
    .filter((f) => /bonjour-?ratp|ratp\.fr|fabernovel|data-ratp/i.test(lire('assets/js/' + f)))
    .map((f) => 'assets/js/' + f));
tracesRatp.length === 0
  ? ok('ratp : plus aucun renvoi vers l’application ou le site sur les pages du site')
  : ko('ratp : references residuelles dans ' + tracesRatp.join(', '));

!existsSync(racine + 'ratp-fallback.html') && !existsSync(racine + 'assets/js/ratp-fallback.js')
  ? ok('ratp : page de secours et script de geolocalisation supprimes')
  : ko('ratp : la page de secours ou son script existe encore');

const fichiersLiensExternes = ['index.html', 'reservation.html', 'mentions-legales.html', 'confidentialite.html', '404.html'];
const liensExternesSansNouvelOnglet = [];
for (const fichier of fichiersLiensExternes) {
  const pageLiens = new JSDOM(lire(fichier), { url:`https://lacollinegambetta.com/${fichier}` });
  for (const lien of pageLiens.window.document.querySelectorAll('a[href]')) {
    let destination;
    try { destination = new URL(lien.getAttribute('href'), `https://lacollinegambetta.com/${fichier}`); }
    catch (e) { continue; }
    const hote = destination.hostname.toLowerCase().replace(/^www\./, '');
    if (!['http:', 'https:'].includes(destination.protocol) || hote === 'lacollinegambetta.com') continue;
    const relations = lien.rel.toLowerCase().split(/\s+/);
    if (lien.target !== '_blank' || !relations.includes('noopener')) {
      liensExternesSansNouvelOnglet.push(`${fichier}: ${lien.textContent.trim().slice(0, 36) || destination.hostname}`);
    }
  }
  pageLiens.window.close();
}
liensExternesSansNouvelOnglet.length === 0
  ? ok(`liens externes : toutes les ancres HTTP(S) s’ouvrent dans un nouvel onglet (${fichiersLiensExternes.length} pages)`)
  : ko(`liens externes sans nouvel onglet/rel noopener : ${liensExternesSansNouvelOnglet.slice(0, 8).join(' | ')}`);

d.querySelector('meta[name="apple-itunes-app"]')
  ? ko('iOS Safari : une Smart App Banner est encore declaree dans la page')
  : ok('iOS Safari : aucune bannière d’application tierce dans la page de garde');

!index.includes("window.open('about:blank'") &&
  !index.includes('api-adresse.data.gouv.fr/reverse/') && !index.includes('navigator.geolocation')
  ? ok('confidentialite : aucune page blanche ni geolocalisation sur le site principal')
  : ko('confidentialite : ancien intercepteur de geolocalisation encore present');
const garde = d.querySelector('#cover-more .footer-quartier--cover');
const couverture = d.getElementById('cover-section');
const sousCouverture = d.getElementById('cover-more');
const sectionAvisGoogle = d.getElementById('cover-reviews-section');
const mailCouverture = d.querySelector('#cover-section .contact-link--mail');
garde && d.querySelector('#cover-more .legal-bottom-nav--cover')
  ? ok('page de garde : alentours et mentions legales apres la premiere vue')
  : ko('page de garde : bloc d’informations du quartier incomplet');
couverture && sectionAvisGoogle && sousCouverture &&
  couverture.nextElementSibling === sectionAvisGoogle && sectionAvisGoogle.nextElementSibling === sousCouverture &&
  mailCouverture
  ? ok('page de garde : avis juste après la couverture, avant les alentours et les liens légaux')
  : ko('page de garde : ordre de la couverture, des avis et des informations de quartier incorrect');
index.includes("if (coverReviewsSection) coverReviewsSection.style.display = 'none';") &&
  index.includes("if (coverReviewsSection) coverReviewsSection.style.display = '';")
  ? ok('page de garde : le bloc avis suit les vues garde/menu')
  : ko('page de garde : le bloc avis reste visible dans la vue menu');

// -------------------------------------------------------- 5. fichiers ------
for (const f of ['404.html', 'sitemap.xml', 'sitemap-images.xml', 'robots.txt',
  'assets/cover/og-cover.jpg']) {
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
  'https://policies.google.com/privacy',
  'https://support.google.com/contributionpolicy/answer/7422880',
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

// L'information sur les liens externes doit rester traduite dans la politique de confidentialité.
const legalEn = new JSDOM(lire('confidentialite.html'), {
  runScripts: 'outside-only', url: 'https://lacollinegambetta.com/confidentialite.html?lang=en'
});
legalEn.window.eval(lire('assets/js/legal-i18n.js'));
legalEn.window.document.querySelector('.footer-address-link')?.textContent.trim() ===
  '4 RUE BELGRAND • 75020 PARIS'
  ? ok('confidentialite : traduction de l’adresse conservée avec le nouveau libellé')
  : ko('confidentialite : libellé traduit de l’adresse incomplet');
const disclosureGoogle = [...legalEn.window.document.querySelectorAll('.legal-card p')]
  .find((p) => p.querySelector('a[href^="https://policies.google.com/privacy"]'));
const liensGoogle = disclosureGoogle ? [...disclosureGoogle.querySelectorAll('a')].map((a) => a.textContent.trim()) : [];
disclosureGoogle && disclosureGoogle.textContent.startsWith('The site contains external links') &&
  disclosureGoogle.textContent.includes('automatically loads Google Maps Platform services') &&
  disclosureGoogle.textContent.includes('as the page opens') &&
  disclosureGoogle.textContent.includes('Maps JavaScript API and Places API') &&
  liensGoogle.length === 1 && liensGoogle[0] === 'Google Privacy Policy'
  ? ok('confidentialite : affichage des avis Places et politique Google traduits en anglais')
  : ko('confidentialite : traduction de la declaration sur les liens Google incomplete');
legalEn.window.document.querySelector('time[datetime="2026-10-05"]')?.textContent.trim() === '5 October 2026'
  ? ok('confidentialite : date de mise a jour traduite')
  : ko('confidentialite : date de mise a jour non traduite');
const traductionsGoogle = {
  ar: ['يحتوي الموقع على روابط خارجية', 'يحمّل قسم التقييمات تلقائيًا'],
  zh: ['本网站包含外部链接', '评价区块会自动加载'],
  uk: ['Сайт містить зовнішні посилання', 'блок відгуків автоматично завантажує'],
  ja: ['サイトには、レストランの場所を確認するための', 'ウィジェットが Google Maps Platform（Maps JavaScript API と Places API）を自動的に読み込みます'],
  ko: ['사이트에는 레스토랑 위치를 찾기 위한', '리뷰 영역이 Google Maps Platform 서비스(Maps JavaScript API 및 Places API)를 자동으로 불러옵니다'],
  hi: ['साइट में रेस्तरां का स्थान बताने के लिए', 'यह अनुभाग Google Maps Platform सेवाएँ (Maps JavaScript API और Places API) अपने आप लोड करता है']
};
for (const [lang, [debutAttendu, mentionAuto]] of Object.entries(traductionsGoogle)) {
  const legal = new JSDOM(lire('confidentialite.html'), {
    runScripts: 'outside-only', url: `https://lacollinegambetta.com/confidentialite.html?lang=${lang}`
  });
  legal.window.eval(lire('assets/js/legal-i18n.js'));
  const paragraphe = [...legal.window.document.querySelectorAll('.legal-card p')]
    .find((p) => p.querySelector('a[href^="https://policies.google.com/privacy"]'));
  paragraphe && paragraphe.textContent.includes(debutAttendu) &&
    paragraphe.textContent.includes(mentionAuto) &&
    paragraphe.textContent.includes('Maps JavaScript API')
    ? ok(`confidentialite : chargement automatique traduit en écriture native (${lang})`)
    : ko(`confidentialite : déclaration Places automatique non traduite en écriture native (${lang})`);
  legal.window.close();
}
legalEn.window.close();

console.log(erreurs ? `\n${erreurs} controle(s) en echec` : '\nTous les controles sont au vert');
process.exit(erreurs ? 1 : 0);
