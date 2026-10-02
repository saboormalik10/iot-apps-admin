"""
Markdown → HTML for the station guide, covering exactly the constructs it uses:
headings, paragraphs, bold/italic/code, links, images, GFM tables, blockquotes,
bullet and numbered lists, and rules. Small on purpose — no dependency to install
on a machine that may be offline.
"""
import html
import re
import sys
from pathlib import Path


def slug(text: str) -> str:
    s = re.sub(r'<[^>]+>', '', text).lower()
    s = re.sub(r'[^\w\s-]', '', s.replace('—', '-').replace('–', '-'))
    return re.sub(r'[\s]+', '-', s.strip())


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1">', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?![\w*])', r'<em>\1</em>', text)
    return text


def convert(md: str) -> str:
    out, lines, i = [], md.split('\n'), 0
    while i < len(lines):
        line = lines[i]

        if not line.strip():
            i += 1
            continue

        if re.match(r'^---+\s*$', line):
            out.append('<hr>')
            i += 1
            continue

        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            level, text = len(m.group(1)), m.group(2).strip()
            out.append(f'<h{level} id="{slug(text)}">{inline(text)}</h{level}>')
            i += 1
            continue

        # GFM table: a header row followed by a separator row
        if line.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            def cells(row):
                return [c.strip() for c in row.strip().strip('|').split('|')]
            head = cells(line)
            aligns = ['center' if c.startswith(':') and c.endswith(':') else 'left' for c in cells(lines[i + 1])]
            body, i = [], i + 2
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                body.append(cells(lines[i]))
                i += 1
            th = ''.join(f'<th style="text-align:{a}">{inline(c)}</th>' for c, a in zip(head, aligns))
            rows = ''.join(
                '<tr>' + ''.join(
                    f'<td style="text-align:{aligns[n] if n < len(aligns) else "left"}">{inline(c)}</td>'
                    for n, c in enumerate(r)
                ) + '</tr>' for r in body
            )
            out.append(f'<table><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table>')
            continue

        if line.lstrip().startswith('>'):
            quote = []
            while i < len(lines) and lines[i].lstrip().startswith('>'):
                quote.append(lines[i].lstrip()[1:].strip())
                i += 1
            out.append('<blockquote>' + inline(' '.join(quote)) + '</blockquote>')
            continue

        m = re.match(r'^(\s*)([-*])\s+(.*)$', line)
        if m:
            items, indent = [], None
            while i < len(lines):
                mm = re.match(r'^(\s*)([-*])\s+(.*)$', lines[i])
                if mm:
                    if indent is None:
                        indent = len(mm.group(1))
                    items.append((len(mm.group(1)), mm.group(3)))
                    i += 1
                elif lines[i].startswith('  ') and items:          # continuation line
                    items[-1] = (items[-1][0], items[-1][1] + ' ' + lines[i].strip())
                    i += 1
                else:
                    break
            out.append(render_list(items, indent or 0, 'ul'))
            continue

        m = re.match(r'^(\s*)\d+\.\s+(.*)$', line)
        if m:
            items, indent = [], None
            while i < len(lines):
                mm = re.match(r'^(\s*)\d+\.\s+(.*)$', lines[i])
                if mm:
                    if indent is None:
                        indent = len(mm.group(1))
                    items.append((len(mm.group(1)), mm.group(2)))
                    i += 1
                elif lines[i].startswith('   ') and items:
                    items[-1] = (items[-1][0], items[-1][1] + ' ' + lines[i].strip())
                    i += 1
                else:
                    break
            out.append(render_list(items, indent or 0, 'ol'))
            continue

        # A picture on its own is a figure, with its alt text as the caption.
        m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$', line.strip())
        if m:
            alt, src = m.group(1), m.group(2)
            cap = f'<figcaption>{inline(alt)}</figcaption>' if alt else ''
            out.append(f'<figure><img src="{src}" alt="{html.escape(alt)}">{cap}</figure>')
            i += 1
            continue

        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,6}\s|>|\s*[-*]\s|\s*\d+\.\s|\|)', lines[i]) \
                and not re.match(r'^---+\s*$', lines[i]):
            para.append(lines[i].strip())
            i += 1
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>')
    return '\n'.join(out)


def render_list(items, base_indent, tag):
    html_out, open_depth = [f'<{tag}>'], 0
    for indent, text in items:
        depth = max(0, (indent - base_indent) // 2)
        while depth > open_depth:
            html_out.append(f'<{tag}>')
            open_depth += 1
        while depth < open_depth:
            html_out.append(f'</{tag}>')
            open_depth -= 1
        html_out.append(f'<li>{inline(text)}</li>')
    html_out.extend([f'</{tag}>'] * (open_depth + 1))
    return ''.join(html_out)


if __name__ == '__main__':
    print(convert(Path(sys.argv[1]).read_text()))
