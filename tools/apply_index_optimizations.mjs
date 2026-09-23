import fs from 'fs';

let html = fs.readFileSync('index.html', 'utf8');

// 1. Update logo preload to webp
html = html.replace(
  /<link rel="preload" as="image" href="Logo_LaColline_Gambetta\.png"[^>]*>/,
  '<link rel="preload" as="image" href="Logo_LaColline_Gambetta.webp" type="image/webp" fetchpriority="high">\n<link rel="dns-prefetch" href="https://fonts.googleapis.com">\n<link rel="dns-prefetch" href="https://fonts.gstatic.com">\n<link rel="prefetch" href="reservation.html">'
);

// 2. Update font links to optimized weights
html = html.replace(
  'family=Cinzel:wght@500;600;700;800&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  'family=Cinzel:wght@600;700&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap'
);

// 3. Replace giant style block with main.css + critical minimal styles
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>') + 8;
if (styleStart !== -1 && styleEnd !== -1) {
  const replacement = `<link rel="stylesheet" href="assets/css/main.css?v=2026092401">\n<style>\n:root{--violet-950:#24102e;--violet-900:#432155;--violet-800:#592e6f;--gold-500:#d8b257;--cream:#fcfbf7;--ink:#24102e;}\nbody{margin:0;font-family:'Montserrat',sans-serif;background:linear-gradient(180deg,#24102e 0,#24102e 100vh,#fcfbf7 100vh,#fcfbf7 100%);color:var(--ink);overflow-x:hidden;}\n</style>`;
  html = html.slice(0, styleStart) + replacement + html.slice(styleEnd);
}

// 4. Update cover logo SVG to webp
html = html.replace(
  '<image href="Logo_LaColline_Gambetta.png"',
  '<image href="Logo_LaColline_Gambetta.webp"'
);

// 5. Update data-photo JPGs to WebPs
html = html.replace(/data-photo="(assets\/(?:plats|boissons)\/[^"]+)\.jpg"/g, 'data-photo="$1.webp"');

fs.writeFileSync('index.html', html, 'utf8');
console.log('index.html updated! New size:', (html.length / 1024).toFixed(1), 'KB');
