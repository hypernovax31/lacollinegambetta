// Vérification réelle Chromium : tiroirs + visionneuse, portrait et paysage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');
const { default: binary, setupLambdaEnvironment } = require('@sparticuz/chromium');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const sections = ['entrees', 'plats', 'desserts', 'crepes'];
(async () => {
  let browser;
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
    setupLambdaEnvironment(path.join(os.tmpdir(), 'al2023', 'lib'));
    // Même filtrage des arguments Lambda que tools/chromium-args.mjs.
    const excluded = ['single-process','swiftshader','gl=angle','use-angle','in-process-gpu','ignore-gpu-blocklist','enable-unsafe'];
    const args = binary.args.filter(arg => !excluded.some(value => arg.includes(value)));
    browser = await chromium.launch({executablePath: await binary.executablePath(), args: [...args, '--disable-gpu', '--no-sandbox'], headless:true});
    for (const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]) {
      const page = await browser.newPage({viewport});
      page.setDefaultTimeout(12000);
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await page.goto(origin + '/index.html', {waitUntil:'domcontentloaded'});
      await page.waitForSelector('#plats .food-card__toggle', {state:'attached'});
      for (const section of sections) {
        await page.evaluate(id => {
          showView('menu');
          document.querySelectorAll('.menu-section').forEach(el => el.classList.toggle('active', el.id === id));
          document.querySelectorAll('#' + id + ' .food-card').forEach(el => el.classList.add('food-card--open'));
        }, section);
        await page.waitForTimeout(400);
        const figures = await page.locator('#' + section + ' .food-card__photo').evaluateAll(els => els.map(el => {
          const r = el.getBoundingClientRect();
          return {w:r.width,h:r.height, ratio:getComputedStyle(el).aspectRatio,fit:getComputedStyle(el.querySelector('img')).objectFit};
        }));
        assert(figures.length > 0);
        for (const r of figures) {
          assert.equal(r.ratio, '16 / 9');
          assert.equal(r.fit, 'contain');
          if (r.w && r.h) assert(Math.abs(r.w/r.h - 16/9) < .015, `${section} ${JSON.stringify(viewport)} ${JSON.stringify(r)}`);
        }
        // La visionneuse s'ouvre sur les écrans où elle est active.
        await page.locator('#' + section + ' .food-card__toggle').first().evaluate(el => el.click());
        if (await page.locator('.lightbox.is-open').count()) {
          const r = await page.locator('.lightbox__img').evaluate(el => {
            const r=el.getBoundingClientRect();return {w:r.width,h:r.height,fit:getComputedStyle(el).objectFit};
          });
          assert(r.w > 0 && r.h > 0);
          assert(Math.abs(r.w/r.h - 16/9) < .015, `Visionneuse ${section} ${JSON.stringify(r)}`);
          assert.equal(r.fit, 'contain');
          await page.locator('.lightbox__close').click();
        }
      }
      console.log(`${viewport.width}×${viewport.height} : 4 sections en 16:9, images sans déformation OK.`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => {console.error(e);process.exitCode=1;});
