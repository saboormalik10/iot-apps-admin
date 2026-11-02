// Builds Observator-Automatic-Weather-Station-System-Guide.pdf in the User Manual's layout.
//   NODE_PATH=<a node_modules with playwright> node build.cjs
// Chromium renders the cover and the body; Python (PyMuPDF) joins them and adds the footer.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');

const here = __dirname;
const out = path.join(here, '..', 'Observator-Automatic-Weather-Station-System-Guide.pdf');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [html, pdf] of [['cover.html', 'cover.tmp.pdf'], ['system-guide.html', 'body.tmp.pdf']]) {
    await page.goto('file://' + path.join(here, html));
    await page.waitForLoadState('networkidle');
    await page.pdf({ path: path.join(here, pdf), preferCSSPageSize: true, printBackground: true });
  }
  await browser.close();
  execFileSync('python3', [path.join(here, 'finish.py'), here, out], { stdio: 'inherit' });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
