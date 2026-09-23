import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function convertDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  let origSum = 0;
  let webpSum = 0;
  for (const f of files) {
    const fullPath = path.join(dir, f);
    const origSize = fs.statSync(fullPath).size;
    origSum += origSize;
    const baseName = f.replace(/\.(jpg|png)$/, '');
    const outWebp = path.join(dir, `${baseName}.webp`);
    
    if (f.endsWith('.png')) {
      await sharp(fullPath).webp({ quality: 85, effort: 6 }).toFile(outWebp);
    } else {
      await sharp(fullPath).webp({ quality: 80, effort: 6 }).toFile(outWebp);
    }
    const webpSize = fs.statSync(outWebp).size;
    webpSum += webpSize;
  }
  console.log(`${dir}: ${files.length} files | Original: ${Math.round(origSum/1024)} KB -> WebP: ${Math.round(webpSum/1024)} KB (Savings: ${Math.round((origSum-webpSum)/1024)} KB / ${Math.round((1-webpSum/origSum)*100)}%)`);
}

async function main() {
  await sharp('Logo_LaColline_Gambetta.png').webp({ quality: 85, effort: 6 }).toFile('Logo_LaColline_Gambetta.webp');
  await sharp('medallion-facade.png').webp({ quality: 85, effort: 6 }).toFile('medallion-facade.webp');
  await convertDir('assets/plats');
  await convertDir('assets/boissons');
  await convertDir('assets/menus');
}

main();
