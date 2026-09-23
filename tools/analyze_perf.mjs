import fs from 'fs';

const index = fs.readFileSync('index.html', 'utf8');
const reservation = fs.readFileSync('reservation.html', 'utf8');

console.log('=== INDEX.HTML ===');
console.log('File size:', (index.length / 1024).toFixed(1), 'KB');

const styleMatch = index.match(/<style[\s\S]*?<\/style>/i);
if (styleMatch) {
  const css = styleMatch[0];
  console.log('CSS length:', (css.length / 1024).toFixed(1), 'KB');
  const dataUris = [...css.matchAll(/data:[^"')]+/gi)];
  console.log('Data URIs count:', dataUris.length, 'Size:', (dataUris.reduce((a,c)=>a+c[0].length, 0)/1024).toFixed(1), 'KB');
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)];
  console.log('Comments count:', comments.length, 'Size:', (comments.reduce((a,c)=>a+c[0].length, 0)/1024).toFixed(1), 'KB');
}

console.log('=== RESERVATION.HTML ===');
console.log('File size:', (reservation.length / 1024).toFixed(1), 'KB');
const resStyleMatch = reservation.match(/<style[\s\S]*?<\/style>/i);
if (resStyleMatch) {
  const css = resStyleMatch[0];
  console.log('CSS length:', (css.length / 1024).toFixed(1), 'KB');
}
