// Renders each .shot in install-screens.html to docs/site/img/<id>.png.
//   NODE_PATH=web/node_modules node installer/guide-pdf/install-screens.cjs   (from standalone/)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const src = path.join(__dirname, 'install-screens.html');
  const out = path.join(__dirname, '..', '..', 'docs', 'site', 'img');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('file://' + src);
  const ids = await p.$$eval('.shot', (els) => els.map((e) => e.id));
  for (const id of ids) {
    await p.locator('#' + id).screenshot({ path: path.join(out, id + '.png') });
    console.log('written img/' + id + '.png');
  }
  await b.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
