"""Joins the cover and the body, and adds the manual-style footer to every page."""
import os
import sys

import fitz

here, out = sys.argv[1], sys.argv[2]
FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
INK = (0x43 / 255, 0x47 / 255, 0x4F / 255)
LABEL = 'MTS Weather Monitoring Portal — Test Plan'

doc = fitz.open(os.path.join(here, 'cover.tmp.pdf'))
doc.insert_pdf(fitz.open(os.path.join(here, 'body.tmp.pdf')))

font = fitz.Font(fontfile=FONT)
for i, page in enumerate(doc, start=1):
    if i == 1:
        continue  # the cover carries its own footer line
    page.insert_font(fontname='LS', fontfile=FONT)
    page.insert_text((40, 826), LABEL, fontname='LS', fontsize=8, color=INK)
    n = str(i)
    page.insert_text((556 - font.text_length(n, fontsize=8), 826), n, fontname='LS', fontsize=8, color=INK)

doc.set_metadata({'title': LABEL, 'creator': 'Veldora'})
doc.save(out, garbage=3, deflate=True)
for f in ('cover.tmp.pdf', 'body.tmp.pdf'):
    os.remove(os.path.join(here, f))
print(out, len(doc), 'pages')
