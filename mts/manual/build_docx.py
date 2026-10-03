#!/usr/bin/env python3
"""
Builds the Word version of the client user manual from the same source as the PDF:
mts/manual/USER-MANUAL.md + the screenshots in img/ → MTS-Weather-Portal-User-Manual.docx

    python3 mts/manual/build_docx.py

Real Word headings (so the navigation pane and the contents field work), numbered and
bulleted lists, tables, notes, and every screenshot embedded with its caption.
Needs python-docx.
"""
import datetime
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = Path(__file__).resolve().parent
SRC = HERE / 'USER-MANUAL.md'
OUT = HERE / 'MTS-Weather-Portal-User-Manual.docx'

NAVY = RGBColor(0x12, 0x3A, 0x6E)
INK = RGBColor(0x11, 0x18, 0x27)
MUTED = RGBColor(0x5B, 0x64, 0x72)
CONTENT_WIDTH_CM = 17.0  # A4 minus 2 cm margins

# Narrow screenshots (a dialog, the sign-in card, a phone) at their own size.
NARROW = {'m01-': 9.5, 'm02-': 8.5, 'm03-': 9.5, 'm13-': 10.5, 'm23-': 14, 'm25-': 10.5, 'm28-': 7.5, 'm29-': 6.5}


def shade(cell_or_par, hex_fill: str) -> None:
    pr = cell_or_par._tc.get_or_add_tcPr() if hasattr(cell_or_par, '_tc') else cell_or_par._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    pr.append(shd)


def left_border(par, hex_color: str) -> None:
    ppr = par._p.get_or_add_pPr()
    bdr = OxmlElement('w:pBdr')
    left = OxmlElement('w:left')
    for k, v in (('val', 'single'), ('sz', '18'), ('space', '8'), ('color', hex_color)):
        left.set(qn(f'w:{k}'), v)
    bdr.append(left)
    ppr.append(bdr)


def field(par, instr: str) -> None:
    """A Word field (page number, table of contents), updated by Word on open."""
    run = par.add_run()
    for kind, text in (('begin', None), (None, instr), ('separate', None), (None, None), ('end', None)):
        if kind:
            el = OxmlElement('w:fldChar')
            el.set(qn('w:fldCharType'), kind)
            if kind == 'begin':
                el.set(qn('w:dirty'), 'true')
            run._r.append(el)
        elif text:
            it = OxmlElement('w:instrText')
            it.set(qn('xml:space'), 'preserve')
            it.text = text
            run._r.append(it)


def inline(par, text: str, size=None, color=None) -> None:
    """**bold**, *italic*, `code` — the only inline marks the manual uses."""
    for tok in re.split(r'(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)', text):
        if not tok:
            continue
        if tok.startswith('**'):
            r = par.add_run(tok[2:-2]); r.bold = True
        elif tok.startswith('*'):
            r = par.add_run(tok[1:-1]); r.italic = True
        elif tok.startswith('`'):
            r = par.add_run(tok[1:-1]); r.font.name = 'Consolas'
        else:
            r = par.add_run(tok)
        if size:
            r.font.size = size
        if color is not None:
            r.font.color.rgb = color


def setup_styles(doc: Document) -> None:
    st = doc.styles
    normal = st['Normal']
    normal.font.name = 'Calibri'
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15
    for name, size, before, color in (('Heading 1', 18, 0, NAVY), ('Heading 2', 13, 14, INK), ('Heading 3', 11.5, 10, INK)):
        s = st[name]
        s.font.name = 'Calibri'
        s.font.size = Pt(size)
        s.font.bold = True
        s.font.color.rgb = color
        s.paragraph_format.space_before = Pt(before)
        s.paragraph_format.space_after = Pt(6)
        s.paragraph_format.keep_with_next = True
    cap = st['Caption']
    cap.font.size = Pt(8.5)
    cap.font.italic = False
    cap.font.color.rgb = MUTED
    cap.paragraph_format.space_after = Pt(10)


def cover(doc: Document) -> None:
    sec = doc.sections[0]
    for _ in range(5):
        doc.add_paragraph()
    p = doc.add_paragraph(); r = p.add_run('OBSERVATOR'); r.bold = True; r.font.size = Pt(16); r.font.color.rgb = NAVY
    p = doc.add_paragraph(); r = p.add_run('Weather Monitoring Portal — Sydney Metro M1'); r.font.size = Pt(11); r.font.color.rgb = MUTED
    for _ in range(3):
        doc.add_paragraph()
    p = doc.add_paragraph(); r = p.add_run('User Manual'); r.bold = True; r.font.size = Pt(36); r.font.color.rgb = INK
    p = doc.add_paragraph(); r = p.add_run('How to use the portal, screen by screen'); r.font.size = Pt(14); r.font.color.rgb = MUTED
    doc.add_paragraph()
    p = doc.add_paragraph()
    inline(p, 'Signing in, reading the map and alerts, checking stations and pumps, finding and exporting data, '
              'keeping an eye on system health, and administering users, alert rules and sensors.', Pt(11), MUTED)
    for _ in range(8):
        doc.add_paragraph()
    p = doc.add_paragraph(); shade(p, 'EEF3FA'); left_border(p, '1B5FB4')
    inline(p, 'This manual describes the design prototype. All readings shown are demonstration data; no sensors are '
              'connected and no alerts, emails or pump commands are sent.', Pt(9.5))
    p = doc.add_paragraph()
    inline(p, f'Design prototype · for review · {datetime.date.today().strftime("%d %B %Y")}', Pt(9), MUTED)
    p.add_run().add_break(WD_BREAK.PAGE)

    # Contents: the sections, listed. A Word TOC field shows blank until the reader
    # agrees to "update fields" (and never in LibreOffice or a preview), so it is not used.
    doc.add_paragraph('Contents', style='Heading 1')
    sections = re.findall(r'^## (.+)$', SRC.read_text().split('## Before you start', 1)[1], re.M)
    for n, title in enumerate(['Before you start', *sections], 1):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(1.0))
        r = p.add_run(f'{n}\t'); r.font.color.rgb = MUTED
        r = p.add_run(title); r.font.size = Pt(11.5)
    p.add_run().add_break(WD_BREAK.PAGE)
    _ = sec


def footer(doc: Document) -> None:
    for sec in doc.sections:
        sec.different_first_page_header_footer = True  # no footer on the cover
        p = sec.footer.paragraphs[0]
        p.text = ''
        inline(p, 'Weather Monitoring Portal — Sydney Metro M1 · User Manual        Page ', Pt(8), MUTED)
        field(p, 'PAGE')
        for r in p.runs:
            r.font.size = Pt(8); r.font.color.rgb = MUTED


def image(doc: Document, alt: str, src: str) -> None:
    path = HERE / src
    name = path.name
    width = next((w for k, w in NARROW.items() if name.startswith(k)), CONTENT_WIDTH_CM)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_after = Pt(2)
    p.add_run().add_picture(str(path), width=Cm(width))
    cap = doc.add_paragraph(style='Caption')
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    image.n += 1
    r = cap.add_run(f'Figure {image.n} — '); r.bold = True
    cap.add_run(alt)


image.n = 0


def new_numbering(doc: Document) -> str:
    """A fresh numbering instance of the List Number style, starting at 1."""
    numbering = doc.part.numbering_part.numbering_definitions._numbering
    style_num_id = doc.styles['List Number'].element.pPr.numPr.numId.val
    abstract = next(n for n in numbering.findall(qn('w:num')) if n.get(qn('w:numId')) == str(style_num_id)).find(qn('w:abstractNumId')).get(qn('w:val'))
    new_id = str(max(int(n.get(qn('w:numId'))) for n in numbering.findall(qn('w:num'))) + 1)
    num = OxmlElement('w:num'); num.set(qn('w:numId'), new_id)
    a = OxmlElement('w:abstractNumId'); a.set(qn('w:val'), abstract); num.append(a)
    ov = OxmlElement('w:lvlOverride'); ov.set(qn('w:ilvl'), '0')
    st = OxmlElement('w:startOverride'); st.set(qn('w:val'), '1'); ov.append(st); num.append(ov)
    numbering.append(num)
    return new_id


def use_numbering(par, num_id: str) -> None:
    ppr = par._p.get_or_add_pPr()
    numpr = OxmlElement('w:numPr')
    il = OxmlElement('w:ilvl'); il.set(qn('w:val'), '0'); numpr.append(il)
    ni = OxmlElement('w:numId'); ni.set(qn('w:val'), num_id); numpr.append(ni)
    ppr.append(numpr)


def table(doc: Document, rows: list[list[str]]) -> None:
    t = doc.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(rows):
        for j, text in enumerate(row):
            cell = t.cell(i, j)
            cell.text = ''
            par = cell.paragraphs[0]
            par.paragraph_format.space_after = Pt(2)
            inline(par, text, Pt(9.5), RGBColor(0xFF, 0xFF, 0xFF) if i == 0 else None)
            if i == 0:
                for r in par.runs:
                    r.bold = True
                shade(cell, '123A6E')
    doc.add_paragraph()


def build() -> None:
    md = SRC.read_text()
    # The markdown's own title and contents list are replaced by the cover and a Word TOC.
    md = md.split('## Before you start', 1)[1]
    md = '## Before you start' + md
    build.num_id = None

    doc = Document()
    for s in doc.sections:
        s.page_height, s.page_width = Cm(29.7), Cm(21.0)
        s.left_margin = s.right_margin = Cm(2.0)
        s.top_margin, s.bottom_margin = Cm(2.0), Cm(2.0)
    setup_styles(doc)
    cover(doc)

    lines = md.split('\n')
    i = 0
    first_h2 = True
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith('## '):
            if not first_h2:
                doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
            first_h2 = False
            doc.add_paragraph(s[3:], style='Heading 1')
            i += 1
            continue
        if s.startswith('### '):
            doc.add_paragraph(s[4:], style='Heading 2')
            i += 1
            continue
        m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)$', s)
        if m:
            image(doc, m.group(1), m.group(2))
            i += 1
            continue
        if s.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{3,}:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            table(doc, rows)
            continue
        if s.startswith('>'):
            quote = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quote.append(lines[i].strip()[1:].strip())
                i += 1
            p = doc.add_paragraph(); shade(p, 'FFFBEB'); left_border(p, 'D9A441')
            inline(p, ' '.join(quote), Pt(10))
            continue
        if re.match(r'^(\d+\.|-) ', s):
            ordered = s[0].isdigit()
            # A list starting at 1 gets its own numbering; one starting later
            # (the password steps after their screenshot) carries on the last.
            if ordered and s.startswith('1.'):
                build.num_id = new_numbering(doc)
            while i < len(lines) and re.match(r'^(\d+\.|-) ', lines[i].strip()):
                item = re.sub(r'^(\d+\.|-) ', '', lines[i].strip())
                i += 1
                # continuation lines (indented)
                while i < len(lines) and lines[i].startswith('  ') and lines[i].strip() and not re.match(r'^(\d+\.|-) ', lines[i].strip()):
                    item += ' ' + lines[i].strip()
                    i += 1
                p = doc.add_paragraph(style='List Number' if ordered else 'List Bullet')
                if ordered:
                    use_numbering(p, build.num_id)
                p.paragraph_format.space_after = Pt(3)
                inline(p, item)
            continue
        # a paragraph: gather until a blank line or another block
        para = [s]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#|!\[|\||>|\d+\. |- )', lines[i].strip()):
            para.append(lines[i].strip())
            i += 1
        p = doc.add_paragraph()
        inline(p, ' '.join(para))

    footer(doc)
    # Numbered lists restart in each section in Word only with separate numbering
    # instances; the manual's lists are short and read correctly either way.
    doc.core_properties.title = 'Weather Monitoring Portal — Sydney Metro M1 — User Manual'
    doc.core_properties.subject = 'User manual (design prototype)'
    doc.save(OUT)
    print(f'{OUT}  ({OUT.stat().st_size / 1048576:.1f} MB, {image.n} figures)')


if __name__ == '__main__':
    build()
