#!/usr/bin/env python3
"""Genera la Figura 21 (mapa de las pantallas de YUNI) como HTML con SVG.

Mismo estilo que las Figuras 18 y 20: Arial, cajas gris pizarra con borde
oscuro y esquinas redondeadas, título en negrita y bajada en gris. Pensada
para pegarse al ancho completo del texto (602 px en mobilebasic, unos 16 cm):
el título queda en unos 8 pt y la bajada en unos 7 pt.

Las etiquetas salen de la aplicación web:
- barra principal «Dashboard», «Mis avatares», «Grupos»
  (components/app-layout/navigation.ts); el login lleva a /dashboard;
- pestañas del perfil «Información», «Contexto», «Compartir», «Actividad»
  (components/avatar-profile/formatters.ts);
- botón «Interactuar» en cada tarjeta y en el perfil (AvatarCard.tsx,
  AvatarProfile.tsx), que abre la llamada con su «Historial» (InteractCall.tsx);
- actividad por participante y transcripción de cada conversación
  (app/avatars/[avatarId]/activity/[accessGrantId]);
- cada grupo se edita, se comparte y abre la llamada grupal (GroupCard.tsx).

Uso: generar_figura_21.py salida.html [--check]
Con --check agrega un script que marca los textos que se salen de su caja
(leer con Chrome --dump-dom).
"""
import sys

W, H = 1500, 512
INK = '#1e293b'
SUB = '#475569'
LINE = '#334155'
FILL = '#eef2f7'
T, S = 27, 23          # tamaño del título y de la bajada
LH = 28                # interlineado de la bajada
M = 16                 # margen exterior

out = []
def add(s): out.append(s)

def box(x, y, w, h, title, sub=()):
    """Caja con título en negrita y bajada de una o dos líneas, centradas."""
    add(f'<g class="b"><rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="10" '
        f'fill="{FILL}" stroke="{LINE}" stroke-width="2"/>')
    n = len(sub)
    block = T + n * LH + (5 if n else 0)
    top = y + (h - block) / 2
    cx = x + w / 2
    add(f'<text x="{cx:.1f}" y="{top + T * 0.8:.1f}" text-anchor="middle" '
        f'style="font-size:{T}px;font-weight:700;fill:{INK}">{title}</text>')
    for i, line in enumerate(sub):
        yy = top + T + 5 + i * LH + S * 0.88
        add(f'<text x="{cx:.1f}" y="{yy:.1f}" text-anchor="middle" style="font-size:{S}px;fill:{SUB}">{line}</text>')
    add('</g>')

def path(d, arrow=True):
    m = ' marker-end="url(#a)"' if arrow else ''
    add(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2.4" stroke-linejoin="round"{m}/>')

# --- Geometría -------------------------------------------------------------
GAP_COL = 46            # espacio entre columnas (lugar para las flechas)
GAP_ROW = 30            # espacio entre filas
TIP = 4                 # separación entre la punta de la flecha y la caja
BH = 112                # alto de las cajas con bajada en dos líneas
C0X, C0W = M, 196                       # Dashboard
C1X, C1W = C0X + C0W + GAP_COL, 214     # Mis avatares / Grupos
PX = C1X + C1W + GAP_COL                # contenedor del perfil
PW = W - PX - M

# Contenedor «Perfil del avatar» con las cuatro pestañas
PY = M
TAB_PAD, TAB_GAP = 18, 16
TAB_Y = PY + 56
TAB_H = BH
PH = TAB_Y + TAB_H + TAB_PAD - PY
TAB_W = (PW - 2 * TAB_PAD - 3 * TAB_GAP) / 4
tabs = [
    ('Información', ['nombre, voz e', 'instrucciones']),
    ('Contexto', ['documentos', 'de la unidad']),
    ('Compartir', ['accesos, enlaces', 'y límites']),
    ('Actividad', ['conversaciones', 'por participante']),
]
add(f'<rect x="{PX}" y="{PY}" width="{PW}" height="{PH}" rx="12" fill="#f8fafc" '
    f'stroke="#94a3b8" stroke-width="2" stroke-dasharray="9 7"/>')
add(f'<text x="{PX + TAB_PAD + 4}" y="{PY + 38}"><tspan style="font-size:{T}px;font-weight:700;fill:{INK}">Perfil del avatar</tspan>'
    f'<tspan dx="12" style="font-size:{S}px;fill:{SUB}">cuatro pestañas</tspan></text>')
tab_x = [PX + TAB_PAD + i * (TAB_W + TAB_GAP) for i in range(4)]
for x, (title, sub) in zip(tab_x, tabs):
    box(x, TAB_Y, TAB_W, TAB_H, title, sub)

# Fila del medio: Interactuar y la transcripción, alineadas con las pestañas
R2 = PY + PH + GAP_ROW + BH / 2
box(tab_x[0], R2 - BH / 2, TAB_W, BH, 'Interactuar', ['llamada e', 'historial'])
box(tab_x[3], R2 - BH / 2, TAB_W, BH, 'Transcripción', ['de cada', 'conversación'])

# Fila de abajo: cada grupo, del ancho de dos pestañas
R3 = R2 + BH / 2 + GAP_ROW + BH / 2
box(tab_x[0], R3 - 44, 2 * TAB_W + TAB_GAP, 88, 'Cada grupo', ['composición, acceso y llamada grupal'])

# Columna 1
R_PERFIL = TAB_Y + TAB_H / 2
R1 = (R_PERFIL + R2) / 2
box(C1X, R1 - BH / 2, C1W, BH, 'Mis avatares', ['propios y', 'compartidos'])
box(C1X, R3 - BH / 2, C1W, BH, 'Grupos', ['varios tutores', 'a la vez'])

# Columna 0
R0 = (R1 + R3) / 2
box(C0X, R0 - BH / 2, C0W, BH, 'Dashboard', ['resumen de', 'actividad'])

# --- Conexiones ------------------------------------------------------------
xb0 = C0X + C0W + GAP_COL / 2
path(f'M{C0X + C0W} {R0} H{xb0}', arrow=False)
path(f'M{xb0} {R0} V{R1} H{C1X - TIP}')
path(f'M{xb0} {R0} V{R3} H{C1X - TIP}')

xb1 = C1X + C1W + GAP_COL / 2
path(f'M{C1X + C1W} {R1} H{xb1}', arrow=False)
path(f'M{xb1} {R1} V{R_PERFIL} H{PX - TIP}')
path(f'M{xb1} {R1} V{R2} H{tab_x[0] - TIP}')
path(f'M{C1X + C1W} {R3} H{tab_x[0] - TIP}')

# Actividad → transcripción (baja desde la pestaña)
cx3 = tab_x[3] + TAB_W / 2
path(f'M{cx3} {TAB_Y + TAB_H} V{R2 - BH / 2 - TIP}')

bottom = R3 + BH / 2
assert bottom + M <= H, f'no entra: hace falta H >= {bottom + M}'

check = ''
if '--check' in sys.argv:
    check = ('<script>const r=[];document.querySelectorAll("g.b").forEach(g=>{const b=g.querySelector("rect").getBBox();'
             'g.querySelectorAll("text").forEach(t=>{const e=t.getBBox();const l=e.x-b.x,rr=b.x+b.width-(e.x+e.width);'
             'r.push(t.textContent+": "+Math.round(Math.min(l,rr)))})});'
             'document.body.setAttribute("data-check",r.join(" | "))</script>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       '<defs><marker id="a" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
       f'<path d="M0 0L10 5L0 10z" fill="{LINE}"/></marker></defs>'
       + ''.join(out) + '</svg>')
html = ('<!doctype html><html><head><meta charset="utf-8"><style>'
        f'html,body{{margin:0;padding:0;background:#fff}}body{{width:{W}px;height:{H}px;overflow:hidden}}'
        'svg{display:block;font-family:Arial,Helvetica,sans-serif}'
        '</style></head><body>' + svg + check + '</body></html>')
dst = next((a for a in sys.argv[1:] if not a.startswith('--')), 'figura-21.html')
open(dst, 'w', encoding='utf-8').write(html)
print(dst, W, H, 'TAB_W', round(TAB_W), 'bottom', round(bottom))
