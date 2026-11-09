#!/usr/bin/env python3
"""Genera la Figura 20 (recorrido de María y de su alumno) como HTML con SVG.

Tres franjas horizontales: María prepara, el alumno conversa, María revisa.
Las etiquetas entre comillas son textos reales de la aplicación web:
«Listo», «Procesando», «No se pudo procesar» (AvatarContextTab.tsx),
aviso «Antes de iniciar la llamada» (SharedCallPrivacyDialog.tsx) y
«Reintentar guardado» (InteractCall.tsx).
"""
import os, sys

W, H = 1500, 750
FONT = 24
LH = 28
INK = '#1e293b'
LINE = '#334155'
COLS = [280, 540, 800, 1060, 1320]
BW, BH = 220, 92

out = []
def add(s): out.append(s)

def text(cx, cy, lines, bold=False, size=FONT, color=INK, italic=False):
    n = len(lines)
    y0 = cy - (n - 1) * LH / 2
    w = 'font-weight:700;' if bold else ''
    it = 'font-style:italic;' if italic else ''
    t = ''.join(f'<tspan x="{cx}" y="{y0 + i * LH:.1f}">{l}</tspan>' for i, l in enumerate(lines))
    add(f'<text text-anchor="middle" dominant-baseline="central" style="font-size:{size}px;{w}{it}fill:{color}">{t}</text>')

def box(cx, cy, lines, kind='act', w=BW, h=BH):
    x, y = cx - w / 2, cy - h / 2
    if kind == 'act':
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#eef2f7" stroke="{LINE}" stroke-width="2"/>')
        text(cx, cy, lines)
    elif kind == 'dec':
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#ffffff" stroke="{LINE}" stroke-width="3"/>')
        text(cx, cy, lines, bold=True)
    elif kind == 'alt':
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#ffffff" stroke="#64748b" stroke-width="2"/>')
        text(cx, cy, lines, color='#334155')
    elif kind == 'human':
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#ffffff" stroke="{LINE}" stroke-width="2" stroke-dasharray="9 7"/>')
        text(cx, cy, lines)

def path(d, arrow=True):
    m = ' marker-end="url(#a)"' if arrow else ''
    add(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2.4" stroke-linejoin="round"{m}/>')

def label(x, y, s, anchor='middle'):
    add(f'<text x="{x}" y="{y}" text-anchor="{anchor}" dominant-baseline="central" style="font-size:22px;font-weight:700;fill:{LINE}">{s}</text>')

def lane(y, h, fill, who, verb):
    add(f'<rect x="0" y="{y}" width="{W}" height="{h}" fill="{fill}"/>')
    text(75, y + h / 2 - 16, [who], bold=True, size=25)
    text(75, y + h / 2 + 16, [verb], size=23, color='#475569')

R1, R2, R3 = 75, 380, 675          # centro vertical de cada fila principal
ALT1, ALT2 = R1 + 145, R2 + 145    # centro de las cajas de excepción
G1, G2 = 300, 600                  # líneas de retorno entre franjas
half = BH / 2

# Franjas
lane(0, G1 - 6, '#f6f8fb', 'María', 'prepara')
lane(G1 + 6, G2 - G1 - 12, '#fbf9f5', 'El alumno', 'conversa')
lane(G2 + 6, H - G2 - 6, '#f6f8fb', 'María', 'revisa')
add(f'<line x1="150" y1="0" x2="150" y2="{H}" stroke="#d6dce4" stroke-width="2"/>')

# Fila 1: María prepara el tutor
box(COLS[0], R1, ['Crea el tutor y', 'escribe las', 'instrucciones'])
box(COLS[1], R1, ['Sube la ficha', 'de la Unidad 3'])
box(COLS[2], R1, ['¿Documento', '«Listo»?'], 'dec')
box(COLS[3], R1, ['Comparte el tutor', 'y fija límites'])
box(COLS[2], ALT1, ['«Procesando»: espera', '«No se pudo procesar»:', 'lo vuelve a subir'], 'alt', w=300, h=110)
for a, b in ((0, 1), (1, 2), (2, 3)):
    path(f'M{COLS[a] + BW / 2} {R1} H{COLS[b] - BW / 2 - 4}')
label((COLS[2] + COLS[3]) / 2, R1 - 20, 'Sí')
path(f'M{COLS[2]} {R1 + half} V{ALT1 - 55 - 4}')
label(COLS[2] + 26, R1 + half + 24, 'No', 'start')
path(f'M{COLS[2] - 150} {ALT1} H{COLS[1]} V{R1 + half + 4}')
# Retorno a la fila 2
path(f'M{COLS[3]} {R1 + half} V{G1} H{COLS[0]} V{R2 - half - 4}')

# Fila 2: el alumno conversa
box(COLS[0], R2, ['Entra con su', 'cuenta o por', 'el enlace'])
box(COLS[1], R2, ['Acepta el aviso:', 'la conversación', 'se guarda'])
box(COLS[2], R2, ['¿Acceso y', 'límites', 'vigentes?'], 'dec')
box(COLS[3], R2, ['Conversa por voz', 'con el tutor'])
box(COLS[4], R2, ['¿Se guardó', 'al cortar?'], 'dec')
box(COLS[2], ALT2, ['Ve un aviso y la', 'llamada no empieza'], 'alt', w=250, h=92)
box(COLS[4], ALT2, ['Toca «Reintentar', 'guardado»'], 'alt', w=230, h=92)
for a, b in ((0, 1), (1, 2), (2, 3), (3, 4)):
    path(f'M{COLS[a] + BW / 2} {R2} H{COLS[b] - BW / 2 - 4}')
label((COLS[2] + COLS[3]) / 2, R2 - 20, 'Sí')
path(f'M{COLS[2]} {R2 + half} V{ALT2 - 46 - 4}')
label(COLS[2] + 26, R2 + half + 24, 'No', 'start')
path(f'M{COLS[4] - 40} {R2 + half} V{ALT2 - 46 - 4}')
label(COLS[4] - 66, R2 + half + 24, 'No', 'end')
path(f'M{COLS[4] + 40} {ALT2 - 46} V{R2 + half + 4}')
# Sí del guardado: sale por la derecha y vuelve a la fila 3
path(f'M{COLS[4] + BW / 2} {R2} H{W - 28} V{G2} H{COLS[0]} V{R3 - half - 4}')
label(W - 50, R2 - 20, 'Sí')

# Fila 3: María revisa
box(COLS[0], R3, ['Abre Actividad y', 'elige al alumno'])
box(COLS[1], R3, ['Lee la', 'transcripción'])
box(COLS[2], R3, ['Decide cómo', 'intervenir', 'en clase'], 'human')
for a, b in ((0, 1), (1, 2)):
    path(f'M{COLS[a] + BW / 2} {R3} H{COLS[b] - BW / 2 - 4}')
text(COLS[2] + BW / 2 + 22, R3, ['Fuera de YUNI'], size=21, color='#64748b', italic=True)
out[-1] = out[-1].replace('text-anchor="middle"', 'text-anchor="start"').replace(f'x="{COLS[2] + BW / 2 + 22}"', f'x="{COLS[2] + BW / 2 + 22}"')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       '<defs><marker id="a" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
       f'<path d="M0 0L10 5L0 10z" fill="{LINE}"/></marker></defs>'
       + ''.join(out) + '</svg>')
html = ('<!doctype html><html><head><meta charset="utf-8"><style>'
        'html,body{margin:0;padding:0;background:#fff}'
        'svg{display:block;font-family:Arial,Helvetica,sans-serif}'
        '</style></head><body>' + svg + '</body></html>')
dst = sys.argv[1] if len(sys.argv) > 1 else 'figura-20.html'
open(dst, 'w', encoding='utf-8').write(html)
print(dst, W, H)
