#!/usr/bin/env python3
"""
Builds the printable guides from docs/site/*.md → PDFs in installer/dist/.

    python3 installer/guide-pdf/build.py [user] [install]      (both by default)

Nothing is stored in git but the markdown, the screenshots and these three small
files — the PDF is generated, so it can never drift from the guide it came from.
Needs Playwright's Chromium, which the portal already depends on
(`standalone/web/node_modules`).
"""
import datetime
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent                      # standalone/
SITE = ROOT / 'docs/site'
DIST = ROOT / 'installer/dist'

GUIDES = {
    'user': dict(
        src='USER-GUIDE.md', out='Observator-Weather-Station-User-Guide.pdf',
        title='Weather Station Portal', sub='User Guide', footer='User Guide',
        lede='The software running on the station PC at your site — what each screen '
             'shows, how to get the readings out, and who can do what. Everything happens in a web '
             'browser on the site network; nothing is installed on your own machine.'),
    'install': dict(
        src='INSTALLATION-GUIDE.md', out='Observator-Weather-Station-Installation-Guide.pdf',
        title='Installing the Weather Station', sub='Installation Guide', footer='Installation Guide',
        lede='Setting up the station PC with the setup program, screen by screen — then '
             'opening the portal, pointing the sensor at the PC, and what to do if setup stops.'),
}

sys.path.insert(0, str(HERE))
from md2html import convert                    # noqa: E402

def build(g: dict) -> None:
    body = convert((SITE / g['src']).read_text())
    # The contents list becomes the styled index.
    body = re.sub(r'(<h2 id="contents">Contents</h2>\s*<ol>.*?</ol>)',
                  r'<section class="toc">\1</section>', body, count=1, flags=re.S)
    # Images are resolved against the guide's own folder.
    body = body.replace('src="img/', f'src="file://{SITE}/img/')

    html = (HERE / 'template.html').read_text()
    for k in ('title', 'sub', 'lede'):
        html = html.replace('{{' + k.upper() + '}}', g[k])
    html = html.replace('{{BODY}}', body)
    html = html.replace('{{DATE}}', datetime.date.today().strftime('%d %B %Y'))
    tmp = HERE / '.guide.html'
    tmp.write_text(html)

    out = DIST / g['out']
    out.parent.mkdir(parents=True, exist_ok=True)
    node_path = ROOT / 'web/node_modules'
    subprocess.run(['node', str(HERE / 'print.cjs'), str(tmp), str(out), g['footer']],
                   check=True, env={**__import__('os').environ, 'NODE_PATH': str(node_path)})
    tmp.unlink(missing_ok=True)
    print(f'{out}  ({out.stat().st_size / 1048576:.1f} MB)')

def main() -> None:
    names = sys.argv[1:] or list(GUIDES)
    for n in names:
        build(GUIDES[n])

if __name__ == '__main__':
    main()
