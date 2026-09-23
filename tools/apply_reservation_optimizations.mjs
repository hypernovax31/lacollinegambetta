import fs from 'fs';

let html = fs.readFileSync('reservation.html', 'utf8');

// 1. Add resource hints
html = html.replace(
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="dns-prefetch" href="https://fonts.googleapis.com">\n<link rel="dns-prefetch" href="https://fonts.gstatic.com">\n<link rel="prefetch" href="index.html">\n<link rel="preconnect" href="https://fonts.googleapis.com">'
);

// 2. Optimize font weights
html = html.replace(
  'family=Cinzel:wght@500;600;700;800&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Parisienne&display=swap',
  'family=Cinzel:wght@600;700&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Parisienne&display=swap'
);

// 3. Replace giant style block with reservation.css + critical minimal styles
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>') + 8;
if (styleStart !== -1 && styleEnd !== -1) {
  const replacement = `<link rel="stylesheet" href="assets/css/reservation.css?v=2026092401">\n<style>\n:root{--violet-950:#24102e;--violet-900:#432155;--violet-800:#592e6f;--gold-500:#d8b257;--cream:#fcfbf7;--ink:#24102e;}\nbody{margin:0;font-family:'Montserrat',sans-serif;background:linear-gradient(180deg,#24102e 0,#24102e 100vh,#fcfbf7 100vh,#fcfbf7 100%);color:var(--ink);overflow-x:hidden;}\n</style>`;
  html = html.slice(0, styleStart) + replacement + html.slice(styleEnd);
}

fs.writeFileSync('reservation.html', html, 'utf8');
console.log('reservation.html updated! New size:', (html.length / 1024).toFixed(1), 'KB');
