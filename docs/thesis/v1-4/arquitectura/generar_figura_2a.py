"""Figura 2A (V1.4): arquitectura de YUNI desplegada.

Genera figura-2a-arquitectura.svg y, si hay Node con sharp en el monorepo,
figura-2a-arquitectura.png. Los logos están en logos/ (ver logos/FUENTES.md).

Contenido verificado contra el commit 3d8cfd2 (corte del informe) y los ADR
0019, 0021, 0022 y 0023. Ver validacion-figura-2a.md.

Uso: python3 generar_figura_2a.py
"""
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).parent
LOGOS = HERE / "logos"
OUT = HERE / "figura-2a-arquitectura"
REPO = HERE.parents[3]

W, H = 1600, 1075
FONT = "Arial, Helvetica, sans-serif"

INK = "#0F172A"
MUTED = "#475569"
SOFT = "#64748B"
LINE = "#CBD5E1"
CONTROL = "#334155"
MEDIA = "#0D9488"
DEFERRED = "#7C3AED"
DEPLOY = "#94A3B8"
RAILWAY = "#7C3AED"
BROWSER = "#2563EB"
VENDOR = "#94A3B8"

svg: list[str] = []


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rect(x, y, w, h, fill="#FFFFFF", stroke=LINE, sw=1.4, rx=8, dash=None, opacity=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    o = f' fill-opacity="{opacity}"' if opacity is not None else ""
    svg.append(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{o} '
        f'stroke="{stroke}" stroke-width="{sw}"{d}/>'
    )


def text(x, y, s, size=17, weight="normal", color=INK, anchor="start", italic=False):
    st = ' font-style="italic"' if italic else ""
    svg.append(
        f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
        f'fill="{color}" text-anchor="{anchor}"{st}>{esc(s)}</text>'
    )


# ---------------------------------------------------------------- logos

SIMPLE = {
    "nextdotjs": "#000000",
    "react": "#149ECA",
    "hono": "#E36002",
    "postgresql": "#4169E1",
    "prisma": "#2D3748",
    "railway": "#0B0D0E",
    "elevenlabs": "#000000",
    "github": "#181717",
    "githubactions": "#2088FF",
    "nodedotjs": "#5FA04E",
    "livekit": "#000000",
}


def simple_path(slug: str) -> str:
    raw = (LOGOS / f"{slug}.svg").read_text()
    return re.search(r'<path d="([^"]+)"', raw).group(1)


def logo(slug, x, y, size):
    """Coloca un logo cuadrado de lado `size` con esquina superior izquierda en (x, y)."""
    if slug in SIMPLE:
        s = size / 24
        svg.append(
            f'<g transform="translate({x} {y}) scale({s:.4f})"><path d="{simple_path(slug)}" '
            f'fill="{SIMPLE[slug]}"/></g>'
        )
    elif slug == "openai":
        raw = (LOGOS / "openai.svg").read_text()
        d = re.search(r'<path d="(M872[^"]+)"', raw).group(1)
        svg.append(
            f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="757 222 282 282">'
            f'<path d="{d}" fill="#000000"/></svg>'
        )
    elif slug == "liveavatar":
        raw = (LOGOS / "liveavatar.svg").read_text()
        inner = re.sub(r"^<svg[^>]*>|</svg>\s*$", "", raw.strip())
        svg.append(
            f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="240 3.5 17.5 17.5">{inner}</svg>'
        )
    else:
        raise KeyError(slug)


# ---------------------------------------------------------------- iconos propios

def icon_users(x, y, s=44):
    c = CONTROL
    svg.append(
        f'<g transform="translate({x} {y}) scale({s/44:.3f})" fill="none" stroke="{c}" stroke-width="2.4">'
        '<circle cx="16" cy="13" r="7"/><path d="M3 38c0-8 6-13 13-13s13 5 13 13"/>'
        '<circle cx="31" cy="15" r="6"/><path d="M27 26c8-1 14 4 14 12"/></g>'
    )


def icon_browser(x, y, s=28):
    svg.append(
        f'<g transform="translate({x} {y}) scale({s/28:.3f})" fill="none" stroke="{BROWSER}" stroke-width="2.2">'
        '<rect x="2" y="4" width="24" height="20" rx="3"/><path d="M2 10h24"/>'
        f'<circle cx="6" cy="7" r=".8" fill="{BROWSER}"/><circle cx="9" cy="7" r=".8" fill="{BROWSER}"/></g>'
    )


def icon_lock(x, y, s=20, color=RAILWAY):
    svg.append(
        f'<g transform="translate({x} {y}) scale({s/20:.3f})" fill="none" stroke="{color}" stroke-width="2">'
        '<rect x="3" y="9" width="14" height="10" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0v3"/></g>'
    )


def icon_globe(x, y, s=18, color=CONTROL):
    svg.append(
        f'<g transform="translate({x} {y}) scale({s/18:.3f})" fill="none" stroke="{color}" stroke-width="1.6">'
        '<circle cx="9" cy="9" r="7.5"/><path d="M1.5 9h15M9 1.5c2.5 2.5 2.5 12.5 0 15M9 1.5c-2.5 2.5-2.5 12.5 0 15"/></g>'
    )


def icon_bucket(x, y, s=40):
    svg.append(
        f'<g transform="translate({x} {y}) scale({s/40:.3f})" fill="#EDE9FE" stroke="{RAILWAY}" stroke-width="2.2">'
        '<path d="M5 9l4 26c.3 2 5 3.5 11 3.5S30.7 37 31 35l4-26"/>'
        '<ellipse cx="20" cy="9" rx="15" ry="5" fill="#FFFFFF"/></g>'
    )


# ---------------------------------------------------------------- piezas

def group(x, y, w, h, color, title, sub=None, logo_slug=None, dash=None, fill="#FFFFFF", icon=None):
    rect(x, y, w, h, fill=fill, stroke=color, sw=1.8, rx=10, dash=dash)
    tx = x + 18
    if logo_slug:
        logo(logo_slug, x + 16, y + 14, 26)
        tx = x + 52
    if icon:
        icon(x + 16, y + 13)
        tx = x + 52
    text(tx, y + 34, title, 19, "bold", INK)
    if sub:
        text(tx + len(title) * 10.9 + 10, y + 34, sub, 16, "normal", MUTED)


def tile(x, y, w, h, logos, title, lines, title_size=18, fill="#FFFFFF", stroke=LINE, badge=None):
    rect(x, y, w, h, fill=fill, stroke=stroke, sw=1.3, rx=7)
    lx = x + 14
    for slug in logos:
        logo(slug, lx, y + 14, 30)
        lx += 38
    tx = lx + 4
    text(tx, y + 35, title, title_size, "bold", INK)
    for i, ln in enumerate(lines):
        text(x + 14, y + 66 + i * 22, ln, 15.5, "normal", MUTED)
    if badge:
        bw = len(badge) * 8.2 + 34
        bx, by = x + 14, y + h - 38
        rect(bx, by, bw, 24, fill="#F1F5F9", stroke=LINE, sw=1, rx=12)
        icon_globe(bx + 8, by + 3, 17)
        text(bx + 31, by + 17, badge, 13.5, "bold", CONTROL)


MARKERS = {CONTROL: "mc", MEDIA: "mm", DEFERRED: "md", DEPLOY: "mp"}


def path(points, color, dash=None, both=False, width=2.2):
    d = "M " + " L ".join(f"{px} {py}" for px, py in points)
    da = f' stroke-dasharray="{dash}"' if dash else ""
    m = MARKERS[color]
    start = f' marker-start="url(#{m}s)"' if both else ""
    svg.append(
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{da}'
        f' marker-end="url(#{m})"{start}/>'
    )


def label(x, y, s, color=MUTED, anchor="middle", size=14.5):
    w = len(s) * size * 0.5 + 10
    bx = {"middle": x - w / 2, "start": x - 5, "end": x - w + 5}[anchor]
    rect(bx, y - size + 1, w, size + 6, fill="#FFFFFF", stroke="none", sw=0, rx=3)
    text(x, y + 1, s, size, "normal", color, anchor, italic=True)


def num(n, x, y, color=INK):
    svg.append(f'<circle cx="{x}" cy="{y}" r="13" fill="{color}"/>')
    text(x, y + 5.5, str(n), 15, "bold", "#FFFFFF", "middle")


# ---------------------------------------------------------------- lienzo

svg.append(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
)
defs = ["<defs>"]
for color, mid in MARKERS.items():
    defs.append(
        f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
        f'orient="auto"><path d="M0 0L10 5L0 10z" fill="{color}"/></marker>'
        f'<marker id="{mid}s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" '
        f'orient="auto"><path d="M10 0L0 5L10 10z" fill="{color}"/></marker>'
    )
defs.append("</defs>")
svg.append("".join(defs))
rect(0, 0, W, H, fill="#FFFFFF", stroke="none", sw=0, rx=0)

# ---- fila superior: usuarios, repositorio y leyenda
icon_users(36, 96, 44)
text(92, 113, "Usuarios", 19, "bold")
text(92, 136, "Creadores y participantes", 15.5, "normal", MUTED)

rect(470, 96, 610, 92, fill="#F8FAFC", stroke=LINE, sw=1.3, rx=8)
logo("github", 486, 112, 28)
text(524, 132, "GitHub", 18, "bold")
text(486, 170, "YUNI-tesis/yuni-monorepo", 15, "normal", MUTED)
logo("githubactions", 770, 112, 28)
text(808, 132, "GitHub Actions", 18, "bold")
text(770, 170, "CI: política, calidad, pruebas, build", 15, "normal", MUTED)
path([(724, 126), (762, 126)], DEPLOY, dash="3 4")

# leyenda
lx, ly = 1182, 96
rect(lx, ly, 250, 112, fill="#FFFFFF", stroke=LINE, sw=1, rx=6)
items = [
    (CONTROL, None, "Control y datos (HTTPS)"),
    (MEDIA, None, "Medios en tiempo real"),
    (DEFERRED, "7 5", "Trabajo diferido"),
    (DEPLOY, "3 4", "Despliegue"),
]
for i, (c, da, t) in enumerate(items):
    yy = ly + 18 + i * 18
    dd = f' stroke-dasharray="{da}"' if da else ""
    svg.append(f'<path d="M{lx+14} {yy} H{lx+54}" stroke="{c}" stroke-width="2.4"{dd}/>')
    text(lx + 64, yy + 5, t, 14, "normal", INK)
num(1, lx + 34, ly + 94, INK)
text(lx + 64, ly + 99, "Paso del flujo (ver nota)", 14, "normal", INK)

# ---- navegador
group(30, 215, 330, 690, BROWSER, "Navegador", icon=icon_browser, fill="#F8FBFF")
tile(48, 265, 294, 120, ["liveavatar"], "SDK de LiveAvatar",
     ["Video y audio del avatar, micrófono", "Grupos: comandos al agente y", "compuerta de audio por avatar"])
tile(48, 405, 294, 205, ["nextdotjs", "react"], "Aplicación YUNI",
     ["Agentes, materiales y accesos", "Actividad y dashboard", "Carga directa de archivos",
      "Grupos: envía cada turno y", "aplica el turno de palabra"])
tile(48, 770, 294, 110, ["elevenlabs"], "Cliente de Scribe",
     ["Transcribe la voz humana", "en llamadas grupales"])

# ---- railway
group(430, 215, 680, 690, RAILWAY, "Railway", "proyecto yuni, entorno production",
      logo_slug="railway", fill="#FCFBFF")
tile(452, 400, 190, 150, ["nextdotjs"], "web", ["Páginas y proxy /api", "Healthcheck /health"],
     badge="dominio público")
# red privada
rect(670, 285, 420, 455, fill="#F6F3FF", stroke=RAILWAY, sw=1.4, rx=8, dash="6 5")
icon_lock(686, 297, 20)
text(714, 313, "Red privada railway.internal (eu-west)", 15.5, "bold", RAILWAY)
tile(692, 380, 180, 150, ["hono"], "api", ["Reglas de negocio", "Director de grupos", "(LangGraph)", "Limpieza de sesiones"])
tile(902, 380, 172, 150, ["postgresql"], "PostgreSQL", ["Prisma ORM", "Estado, permisos,", "historial y cola Job"],
     title_size=17)
tile(902, 585, 172, 140, ["nodedotjs"], "worker", ["Sincroniza agentes", "y documentos", "con reintentos"])
# bucket
rect(692, 770, 382, 100, fill="#FFFFFF", stroke=LINE, sw=1.3, rx=7)
icon_bucket(706, 790, 40)
text(760, 806, "Bucket yuni-documents", 18, "bold")
text(760, 830, "Compatible con S3, región iad", 15.5, "normal", MUTED)
text(760, 852, "Originales de los materiales", 15.5, "normal", MUTED)

# ---- proveedores
group(1180, 215, 390, 690, VENDOR, "Proveedores externos", dash="7 5", fill="#FAFAFA")
tile(1200, 270, 300, 150, ["liveavatar"], "LiveAvatar",
     ["Sesiones LITE (API REST)", "", "Conector con ElevenLabs Agents"])
logo("livekit", 1214, 344, 20)
text(1242, 359, "Sala WebRTC (LiveKit)", 15.5, "normal", MUTED)
tile(1200, 475, 300, 100, ["openai"], "OpenAI", ["Responses API: plan de ronda", "y títulos de conversación"])
tile(1200, 615, 300, 185, ["elevenlabs"], "ElevenLabs",
     ["Agents: uno por avatar", "Base de conocimiento", "Scribe Realtime", "Catálogo de voces"])

# ---------------------------------------------------------------- flujos
# Convención: la flecha apunta desde quien inicia la comunicación.
# 1 usuarios -> navegador
path([(60, 150), (60, 213)], CONTROL)
num(1, 84, 186)
# 2 app -> web (HTTPS)
path([(342, 450), (450, 450)], CONTROL)
label(396, 440, "HTTPS")
num(2, 396, 470)
# 3 web -> api (red privada)
path([(644, 450), (690, 450)], CONTROL)
num(3, 667, 474)
# 4 api -> postgres
path([(874, 455), (900, 455)], CONTROL)
num(4, 887, 431)
# 5 carga directa al bucket + confirmación de la api
path([(342, 590), (400, 590), (400, 820), (690, 820)], CONTROL)
label(545, 810, "PUT con URL prefirmada")
num(5, 400, 700)
path([(740, 532), (740, 768)], CONTROL)
label(740, 650, "HeadObject")
# 6 worker: cola, bucket y elevenlabs
path([(988, 583), (988, 534)], DEFERRED, dash="7 5")
label(1036, 563, "reclama Job", DEFERRED, "middle", 13.5)
path([(988, 727), (988, 768)], DEFERRED, dash="7 5")
label(1036, 752, "original", DEFERRED, "middle", 13.5)
path([(1076, 700), (1198, 700)], DEFERRED, dash="7 5")
label(1137, 690, "agente y KB", DEFERRED)
num(6, 1137, 720, DEFERRED)
# 7 api -> proveedores (tronco por encima de PostgreSQL)
path([(840, 378), (840, 350), (1198, 350)], CONTROL)
label(1030, 340, "token de sesión LITE")
num(7, 930, 350)
path([(1152, 350), (1152, 525), (1198, 525)], CONTROL)
label(1152, 470, "plan", MUTED, "middle")
path([(1135, 350), (1135, 650), (1198, 650)], CONTROL)
svg.append('<g transform="translate(1124 590) rotate(-90)">')
label(0, 0, "token Scribe y sync", MUTED, "start", 13.5)
svg.append('</g>')
# 8 navegador <-> liveavatar (medios)
path([(342, 300), (385, 300), (385, 66), (1462, 66), (1462, 268)], MEDIA, both=True, width=2.6)
label(900, 56, "WebRTC (LiveKit) y API de sesión: audio, video y comandos", MEDIA)
num(8, 430, 66, MEDIA)
# 9 conector liveavatar <-> elevenlabs
path([(1502, 395), (1542, 395), (1542, 720), (1502, 720)], MEDIA, both=True, width=2.6)
num(9, 1542, 558, MEDIA)
# 10 scribe (grupos)
path([(195, 882), (195, 940), (1300, 940), (1300, 802)], MEDIA, both=True, width=2.6)
label(760, 930, "WebSocket de Scribe (solo grupos)", MEDIA)
num(10, 600, 940, MEDIA)
# 11 despliegue
path([(860, 190), (860, 213)], DEPLOY, dash="3 4")
num(11, 836, 201, DEPLOY)
label(872, 205, "autodeploy de main tras CI", SOFT, "start", 13.5)

# ---- referencia de logos
rect(30, 985, 1540, 66, fill="#F8FAFC", stroke=LINE, sw=1, rx=8)
text(48, 1024, "Logos", 15.5, "bold", INK)
refs = [
    ("nextdotjs", "Next.js"), ("react", "React"), ("hono", "Hono"), ("nodedotjs", "Node.js"),
    ("postgresql", "PostgreSQL"), ("railway", "Railway"), ("github", "GitHub"),
    ("githubactions", "GitHub Actions"), ("liveavatar", "LiveAvatar"), ("livekit", "LiveKit"),
    ("elevenlabs", "ElevenLabs"), ("openai", "OpenAI"),
]
widths = [31 + len(name) * 7.6 for _, name in refs]
gap = (1550 - 112 - sum(widths)) / (len(refs) - 1)
rx = 112
for (slug, name), width in zip(refs, widths):
    logo(slug, rx, 1006, 24)
    text(rx + 31, 1024, name, 14.5, "normal", INK)
    rx += width + gap

svg.append("</svg>")

OUT.with_suffix(".svg").write_text("\n".join(svg), encoding="utf8")
print("SVG:", OUT.with_suffix(".svg"))

render = HERE / "render.cjs"
try:
    subprocess.run(
        ["node", str(render), str(OUT.with_suffix(".svg")), str(OUT.with_suffix(".png")), "3200"],
        check=True, cwd=REPO,
    )
except (FileNotFoundError, subprocess.CalledProcessError) as e:
    print("PNG no generado:", e)
