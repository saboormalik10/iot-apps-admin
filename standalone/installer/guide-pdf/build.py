#!/usr/bin/env python3
"""
Builds the printable user guide: docs/site/USER-GUIDE.md → a PDF.

    python3 installer/guide-pdf/build.py

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
OUT = ROOT / 'installer/dist/Observator-Weather-Station-User-Guide.pdf'

sys.path.insert(0, str(HERE))
from md2html import convert                    # noqa: E402

def main() -> None:
    body = convert((SITE / 'USER-GUIDE.md').read_text())
    # The contents list becomes the styled index.
    body = re.sub(r'(<h2 id="contents">Contents</h2>\s*<ol>.*?</ol>)',
                  r'<section class="toc">\1</section>', body, count=1, flags=re.S)
    # Images are resolved against the guide's own folder.
    body = body.replace('src="img/', f'src="file://{SITE}/img/')

    html = (HERE / 'template.html').read_text()
    html = html.replace('{{BODY}}', body)
    html = html.replace('{{DATE}}', datetime.date.today().strftime('%d %B %Y'))
    tmp = HERE / '.guide.html'
    tmp.write_text(html)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    node_path = ROOT / 'web/node_modules'
    subprocess.run(['node', str(HERE / 'print.cjs'), str(tmp), str(OUT)],
                   check=True, env={**__import__('os').environ, 'NODE_PATH': str(node_path)})
    tmp.unlink(missing_ok=True)
    print(f'{OUT}  ({OUT.stat().st_size / 1048576:.1f} MB)')

if __name__ == '__main__':
    main()
