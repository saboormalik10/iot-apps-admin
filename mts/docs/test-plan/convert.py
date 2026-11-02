"""TEST-PLAN.md -> body.html, in the layout of the Observator manuals.

Handles what the plan uses: ## and ### headings, paragraphs, - bullets,
pipe tables, **bold** and *italic*.
"""
import html
import re
import sys

here = sys.argv[1]
src = open(f'{here}/TEST-PLAN.md', encoding='utf-8').read()


def inline(t: str) -> str:
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', t)
    return t


def cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip('|').split('|')]


out, sections, i = [], [], 0
lines = src.splitlines()
while i < len(lines):
    line = lines[i]
    if line.startswith('## '):
        title = line[3:].strip()
        sections.append(title)
        # Test-case sections run on from each other; the rest start a page.
        cls = ' class="flow"' if title.startswith('Test cases') and not sections[:-1][-1:] == ['Feature list'] else ''
        out.append(f'<h2{cls}>{len(sections)}. {inline(title)}</h2>')
    elif line.startswith('### '):
        out.append(f'<h3>{inline(line[4:].strip())}</h3>')
    elif line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            rows.append(lines[i])
            i += 1
        head = cells(rows[0])
        cls = ' class="cases"' if head[:2] == ['ID', 'Test'] else ''
        cls = ' class="sign"' if head[0] == 'Role' else cls
        cls = ' class="features"' if head[0] == '#' else cls
        t = [f'<table{cls}><thead><tr>' + ''.join(f'<th>{inline(h)}</th>' for h in head) + '</tr></thead><tbody>']
        for r in rows[2:]:
            t.append('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in cells(r)) + '</tr>')
        out.append('\n'.join(t) + '</tbody></table>')
        continue
    elif line.startswith('- '):
        items = []
        while i < len(lines) and lines[i].startswith('- '):
            items.append(f'<li>{inline(lines[i][2:])}</li>')
            i += 1
        out.append('<ul>' + ''.join(items) + '</ul>')
        continue
    elif line.strip():
        out.append(f'<p>{inline(line.strip())}</p>')
    i += 1

contents = ''.join(f'<li><span class="n">{n}</span>{inline(t)}</li>' for n, t in enumerate(sections, 1))
template = open(f'{here}/body.template.html', encoding='utf-8').read()
open(f'{here}/body.html', 'w', encoding='utf-8').write(
    template.replace('<!--CONTENTS-->', contents).replace('<!--BODY-->', '\n'.join(out))
)
print(len(sections), 'sections')
