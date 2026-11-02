"""Joins the cover and the body, and puts the User Manual's footer on every page."""
import os
import sys

import fitz

here, out = sys.argv[1], sys.argv[2]
FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
INK = (0x43 / 255, 0x47 / 255, 0x4F / 255)

doc = fitz.open(os.path.join(here, 'cover.tmp.pdf'))
doc.insert_pdf(fitz.open(os.path.join(here, 'body.tmp.pdf')))

font = fitz.Font(fontfile=FONT)
for i, page in enumerate(doc, start=1):
    page.insert_font(fontname='LS', fontfile=FONT)
    page.insert_text((45, 826), 'Observator Weather Station — System Guide', fontname='LS', fontsize=8, color=INK)
    n = str(i)
    page.insert_text((550 - font.text_length(n, fontsize=8), 826), n, fontname='LS', fontsize=8, color=INK)

doc.set_metadata({'title': 'Observator Weather Station — System Guide', 'creator': 'Observator'})
doc.save(out, garbage=3, deflate=True)
for f in ('cover.tmp.pdf', 'body.tmp.pdf'):
    os.remove(os.path.join(here, f))
print(out, len(doc), 'pages')
