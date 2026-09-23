import fs from 'fs';

const index = fs.readFileSync('index.html', 'utf8');
const scripts = [...index.matchAll(/<script(?:\s+([^>]*))?>([\s\S]*?)<\/script>/gi)];

scripts.forEach((s, idx) => {
  const attrs = s[1] || '';
  const body = s[2];
  const firstLine = body.trim().split('\n')[0] || '';
  console.log('Script ' + idx + ' (attrs: ' + attrs + ', len: ' + body.length + '): ' + firstLine.slice(0, 100));
});
