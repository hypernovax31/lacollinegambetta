import fs from 'fs';

function minifyCSS(css) {
  return css
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Normalize whitespace
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    // Remove space around delimiters
    .replace(/\s*([\{\};:,>~+])\s*/g, '$1')
    // Remove optional semicolons before closing brace
    .replace(/;}/g, '}')
    // Clean up spaces in url() or calc()
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .trim();
}

// 1. Extract CSS from index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
const indexStyleMatch = indexHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
if (indexStyleMatch) {
  const indexCss = indexStyleMatch[1];
  const minifiedIndexCss = minifyCSS(indexCss);
  fs.writeFileSync('assets/css/main.css', minifiedIndexCss, 'utf8');
  console.log('assets/css/main.css created: ' + (minifiedIndexCss.length / 1024).toFixed(1) + ' KB (from ' + (indexCss.length / 1024).toFixed(1) + ' KB)');
}

// 2. Extract CSS from reservation.html
const resHtml = fs.readFileSync('reservation.html', 'utf8');
const resStyleMatch = resHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
if (resStyleMatch) {
  const resCss = resStyleMatch[1];
  const minifiedResCss = minifyCSS(resCss);
  fs.writeFileSync('assets/css/reservation.css', minifiedResCss, 'utf8');
  console.log('assets/css/reservation.css created: ' + (minifiedResCss.length / 1024).toFixed(1) + ' KB (from ' + (resCss.length / 1024).toFixed(1) + ' KB)');
}
