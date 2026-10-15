// Exécuter depuis la racine : npm run test:i18n (jsdom, sans réseau).
const {JSDOM}=require('jsdom');const fs=require('fs');
(async()=>{for(let file of ['index.html','reservation.html','mentions-legales.html','confidentialite.html','404.html']){
let dom=new JSDOM(fs.readFileSync(file,'utf8'),{url:'https://lacollinegambetta.com/'+file+'?lang=en',runScripts:'outside-only',pretendToBeVisual:true});let w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){}});w.eval(fs.readFileSync('assets/js/i18n-common.js','utf8'));let legal=!['index.html','reservation.html'].includes(file); w.eval(fs.readFileSync('assets/js/'+(legal?'legal-i18n':'i18n')+'.js','utf8'));await new Promise(r=>setTimeout(r,10));
let set=legal?w.__setLegalLang:w.__setLang;
for(let l of ['en','es','de','it','pt','nl','ar','zh','uk','ja','ko','pl','tr','hi']){set(l);if(w.document.documentElement.lang!==l)throw Error(file+' '+l);let links=[...w.document.querySelectorAll('a[href="https://tenon.aphp.fr"]')];if(!links.length||links.some(el=>el.textContent==='Hôpital Tenon'))throw Error('hospital '+file+' '+l);if(!legal){let label=w.document.querySelector('.crepe-formula-card__label');if(label&&label.textContent==='Classique')throw Error('crepes '+l);}}
if (file === 'index.html') {
  const localNutella = { ar: 'نوتيلا', zh: '能多益', uk: 'Нутелла', ja: 'ヌテラ', ko: '누텔라', hi: 'नुटेला' };
  for (const [lang, name] of Object.entries(localNutella)) {
    set(lang);
    const ingredient = w.document.querySelector('.crepe-formula-card--nutella .crepe-formula-garnish');
    if (!ingredient || ingredient.textContent.trim() !== name) throw Error('Nutella non localisé : ' + lang);
  }
}
set('fr');if(![...w.document.querySelectorAll('a[href="https://tenon.aphp.fr"]')].every(el=>el.textContent==='Hôpital Tenon'))throw Error('FR restore');console.log(file+': 14 langues + retour français OK');dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1});
