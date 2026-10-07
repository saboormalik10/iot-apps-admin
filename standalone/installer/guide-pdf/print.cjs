const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [src, out, footer = 'User Guide'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(src), { waitUntil: 'networkidle' });
  await p.emulateMedia({ media: 'print' });
  await p.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#8a94a3;padding:0 16mm;' +
      'font-family:Helvetica,Arial,sans-serif;display:flex;justify-content:space-between;">' +
      '<span>Observator Weather Station — ' + footer + '</span>' +
      '<span class="pageNumber"></span></div>',
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  });
  await b.close();
  console.log('written ' + out);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
