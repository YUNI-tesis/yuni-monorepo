"""Fuente editable de las figuras de planificación de la V1.4.

Lee los CSV de esta carpeta y genera SVG de 450 pt de ancho (márgenes A4), con
la misma paleta que las figuras de la V1.1. Para obtener PNG:
    qlmanage -t -s 2400 -o . <archivo>.svg
Sin dependencias externas: python3 generar_cronograma.py
"""
from pathlib import Path
from datetime import date
import csv, html

HERE = Path(__file__).parent
INK = '#172A3A'; EDGE = '#425466'; FILL = '#F2F5F7'; LIGHT = '#D6DEE4'; WHITE = '#FFFFFF'
OWNER_FILL = {'Lucas': EDGE, 'Santiago': '#8DA2B5', 'Ambos': LIGHT, '—': WHITE}
MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
W = 450
X_ID, X_LABEL, LABEL_W, X0, X1 = 4, 30, 156, 200, 446


def d(s):
    return date.fromisoformat(s)


def text_width(s, size, bold=False):
    # Estimación de Arial: suficiente para decidir cortes de línea.
    narrow = sum(c in 'ijlrtf.,;:()|! ' for c in s)
    wide = sum(c in 'mwMWO' for c in s)
    return size * (0.53 * len(s) - 0.24 * narrow + 0.3 * wide) * (1.06 if bold else 1)


def wrap(s, width, size, bold=False):
    if text_width(s, size, bold) <= width:
        return [s]
    words, lines, line = s.split(), [], ''
    for word in words:
        candidate = (line + ' ' + word).strip()
        if text_width(candidate, size, bold) > width and line:
            lines.append(line); line = word
        else:
            line = candidate
    return lines + [line]


class Svg:
    def __init__(self):
        self.items = []

    def rect(self, x, y, w, h, fill, stroke=EDGE, dash=False, sw=.7, r=1.5):
        da = ' stroke-dasharray="2.5,1.8"' if dash else ''
        self.items.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{max(w, 0):.2f}" height="{h:.2f}" rx="{r}" '
                          f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{da}/>')

    def line(self, x1, y1, x2, y2, color=LIGHT, sw=.5, dash=None):
        da = f' stroke-dasharray="{dash}"' if dash else ''
        self.items.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{color}" stroke-width="{sw}"{da}/>')

    def diamond(self, cx, cy, s, fill, dash=False):
        da = ' stroke-dasharray="1.6,1.2"' if dash else ''
        pts = f'{cx},{cy - s} {cx + s},{cy} {cx},{cy + s} {cx - s},{cy}'
        self.items.append(f'<polygon points="{pts}" fill="{fill}" stroke="{INK}" stroke-width=".8"{da}/>')

    def text(self, x, y, s, size=8, bold=False, anchor='start', color=INK, italic=False):
        st = ' font-style="italic"' if italic else ''
        self.items.append(f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" font-family="Arial, sans-serif" '
                          f'font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}"{st}>{html.escape(s)}</text>')

    def save(self, name, height):
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}pt" height="{height:.0f}pt" '
                f'viewBox="0 0 {W} {height:.0f}"><rect width="{W}" height="{height:.0f}" fill="{WHITE}"/>')
        (HERE / f'{name}.svg').write_text(head + ''.join(self.items) + '</svg>', encoding='utf8')


def month_starts(start, end):
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        yield date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def legend(svg, y):
    x = X_LABEL
    for label, fill, dash in [('Lucas', OWNER_FILL['Lucas'], False), ('Santiago', OWNER_FILL['Santiago'], False),
                              ('Ambos', LIGHT, False), ('A confirmar', WHITE, True)]:
        svg.rect(x, y - 6, 14, 7, fill, dash=dash); svg.text(x + 18, y, label, 7.5); x += 26 + text_width(label, 7.5)
    svg.diamond(x + 4, y - 2.5, 4, INK); svg.text(x + 11, y, 'Hito', 7.5); x += 34
    svg.diamond(x + 4, y - 2.5, 4, WHITE); svg.text(x + 11, y, 'Evento externo', 7.5)


def gantt(name, rows, start, end, cut=None):
    span = (end - start).days
    px = lambda day: X0 + (X1 - X0) * (day - start).days / span
    svg, y = Svg(), 8
    svg.text(X_ID, y + 10, 'ID', 7.5, True); svg.text(X_LABEL, y + 10, 'Actividad', 7.5, True)
    months = list(month_starts(start, end))
    for i, m in enumerate(months):
        nxt = months[i + 1] if i + 1 < len(months) else end
        svg.text((px(m) + px(min(nxt, end))) / 2, y + 10, MONTHS[m.month - 1], 7.5, True, 'middle')
    y += 16
    top = y
    layout = []
    for r in rows:
        bold = r['tipo'] == 'fase'
        label = r['actividad'] + (' (a confirmar)' if r['certeza'] == 'a_confirmar' and r['tipo'] == 'hito' else '')
        lines = wrap(label, LABEL_W, 7.6 if not bold else 8, bold)
        h = 11 + 8.6 * (len(lines) - 1) + (3 if bold else 0)
        layout.append((r, lines, y, h)); y += h
    for m in months:
        svg.line(px(m), top - 2, px(m), y)
    for r, lines, ry, h in layout:
        bold = r['tipo'] == 'fase'
        if bold:
            svg.line(X_ID, ry, X1, ry, EDGE, .6)
        for k, ln in enumerate(lines):
            svg.text(X_LABEL + (0 if bold else 6), ry + 8.4 + k * 8.6 + (2 if bold else 0), ln, 8 if bold else 7.6, bold)
        if not bold:
            svg.text(X_ID, ry + 8.4, r['id'], 7.2, color=EDGE)
        a, b = d(r['inicio']), d(r['fin'])
        cy = ry + 5.2 + (2 if bold else 0)
        unsure = r['certeza'] == 'a_confirmar'
        if r['tipo'] in ('hito', 'externo'):
            svg.diamond(px(a), cy, 3.8, WHITE if (r['tipo'] == 'externo' or unsure) else INK, dash=unsure)
        elif bold:
            svg.rect(px(a), cy - 1.6, px(b) - px(a) + 1, 3.2, INK if not unsure else WHITE, INK, dash=unsure, r=.5)
        else:
            x = px(a); w = max(px(b) - x + (X1 - X0) / span, 2.6)
            svg.rect(x, cy - 3.3, w, 6.6, WHITE if unsure else OWNER_FILL[r['responsable']], dash=unsure)
    if cut:
        svg.line(px(cut), top - 4, px(cut), y, INK, .8, '3,2')
        svg.text(px(cut) - 2, y + 9, f'Corte {cut.day:02d}/{cut.month:02d}', 7, anchor='end')
    legend(svg, y + 22)
    svg.save(name, y + 32)


def plan_vs_real(name, rows, start, end):
    span = (end - start).days
    px = lambda day: X0 + (X1 - X0) * (day - start).days / span
    svg, y = Svg(), 6
    months = list(month_starts(start, end))
    for yr in (2025, 2026):
        a, b = max(start, date(yr, 1, 1)), min(end, date(yr, 12, 31))
        svg.text((px(a) + px(b)) / 2, y + 8, str(yr), 8, True, 'middle')
        svg.line(px(date(yr, 1, 1)) if yr == 2026 else px(a), y, px(date(yr, 1, 1)) if yr == 2026 else px(a), y + 10, EDGE, .6)
    svg.text(X_LABEL, y + 19, 'Actividad del plan de trabajo', 7.5, True)
    for i, m in enumerate(months):
        nxt = months[i + 1] if i + 1 < len(months) else end
        svg.text((px(m) + px(nxt)) / 2, y + 19, MONTHS[m.month - 1][0].upper(), 6.8, True, 'middle')
    y += 25; top = y
    layout = []
    for r in rows:
        lines = wrap(r['actividad_plan'], LABEL_W + 20, 7.6)
        h = max(20, 9 + 8.6 * len(lines)); layout.append((r, lines, y, h)); y += h
    for m in months:
        svg.line(px(m), top - 2, px(m), y, LIGHT if m.month != 1 else EDGE, .5 if m.month != 1 else .7)
    for r, lines, ry, h in layout:
        svg.line(X_ID, ry, X1, ry, LIGHT, .4)
        for k, ln in enumerate(lines):
            svg.text(X_ID, ry + 9 + k * 8.6, ln, 7.6)
        if r['plan_inicio']:
            a, b = px(d(r['plan_inicio'])), px(d(r['plan_fin']))
            svg.rect(a, ry + 3.5, max(b - a, 2.5), 5.5, WHITE, EDGE)
        for s, e in ((r['real_inicio'], r['real_fin']), (r['real_2_inicio'], r['real_2_fin'])):
            if s:
                a, b = px(d(s)), px(d(e))
                unsure = s.startswith('2025') and r['actividad_plan'] == 'Investigación'
                svg.rect(a, ry + 10.5, max(b - a, 2.5), 5.5, WHITE if unsure else EDGE, EDGE, dash=unsure)
    yy = y + 14; x = X_ID
    for label, fill, dash in [('Planificado (plan de trabajo 2025)', WHITE, False), ('Ejecutado', EDGE, False),
                              ('Ejecutado, a confirmar', WHITE, True)]:
        svg.rect(x, yy - 6, 14, 6, fill, dash=dash); svg.text(x + 18, yy, label, 7.5); x += 30 + text_width(label, 7.5)
    svg.save(name, yy + 8)


if __name__ == '__main__':
    rows = list(csv.DictReader(open(HERE / 'cronograma-ejecutado.csv', encoding='utf8')))
    gantt('figura-cronograma-ene-jul-2026', [r for r in rows if r['fase'] in '123'], date(2026, 1, 1), date(2026, 7, 31))
    gantt('figura-cronograma-ago-dic-2026', [r for r in rows if r['fase'] in '456'], date(2026, 8, 1), date(2026, 12, 31),
          cut=date(2026, 10, 29))
    plan = list(csv.DictReader(open(HERE / 'cronograma-planificado-vs-ejecutado.csv', encoding='utf8')))
    plan_vs_real('figura-plan-vs-ejecutado', plan, date(2025, 4, 1), date(2026, 12, 31))
