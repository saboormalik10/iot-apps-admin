// Builds MTS-Test-Plan.pdf from TEST-PLAN.md (the Claude Doc's text) in the Observator manual layout.
//   NODE_PATH=<a node_modules with playwright> node build.cjs
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const out = path.join(here, '..', 'MTS-Weather-Monitoring-Portal-Test-Plan.pdf');

(async () => {
  execFileSync('python3', [path.join(here, 'convert.py'), here], { stdio: 'inherit' });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [html, pdf] of [['cover.html', 'cover.tmp.pdf'], ['body.html', 'body.tmp.pdf']]) {
    await page.goto('file://' + path.join(here, html));
    await page.waitForLoadState('networkidle');
    await page.pdf({ path: path.join(here, pdf), preferCSSPageSize: true, printBackground: true });
  }
  await browser.close();
  execFileSync('python3', [path.join(here, 'finish.py'), here, out], { stdio: 'inherit' });
  fs.rmSync(path.join(here, 'body.html'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
