#!/usr/bin/env python3
"""
Builds the client user manual: mts/manual/USER-MANUAL.md → a PDF.

    python3 mts/manual/build.py

The markdown and the screenshots in img/ are the source; the PDF is generated, so
it never drifts from them. Uses Playwright's Chromium from the standalone portal
(`standalone/web/node_modules`), as the station guide does.
"""
import datetime
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = HERE / 'MTS-Weather-Portal-User-Manual.pdf'
NARROW = {
    'm01-': '58%', 'm02-': '52%', 'm03-': '58%', 'm13-': '62%', 'm23-': '82%',
    'm25-': '62%', 'm28-': '46%', 'm29-': '40%', 'm09-': '100%',
}

sys.path.insert(0, str(HERE))
from md2html import convert  # noqa: E402


def main() -> None:
    body = convert((HERE / 'USER-MANUAL.md').read_text())
    body = re.sub(r'(<h2 id="contents">Contents</h2>\s*<ol>.*?</ol>)',
                  r'<section class="toc">\1</section>', body, count=1, flags=re.S)
    # Narrow screenshots (a dialog, the sign-in card, a phone) at their own
    # proportions, not stretched to the full page width.
    for name, width in NARROW.items():
        body = body.replace(f'src="img/{name}', f'style="width:{width}" src="img/{name}')
    body = body.replace('src="img/', f'src="file://{HERE}/img/')

    html = (HERE / 'template.html').read_text()
    html = html.replace('{{BODY}}', body).replace('{{DATE}}', datetime.date.today().strftime('%d %B %Y'))
    tmp = HERE / '.manual.html'
    tmp.write_text(html)
    subprocess.run(['node', str(HERE / 'print.cjs'), str(tmp), str(OUT)], check=True,
                   env={**os.environ, 'NODE_PATH': str(REPO / 'standalone/web/node_modules')})
    tmp.unlink(missing_ok=True)
    print(f'{OUT}  ({OUT.stat().st_size / 1048576:.1f} MB)')


if __name__ == '__main__':
    main()
