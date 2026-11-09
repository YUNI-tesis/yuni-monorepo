"""Diagramas de la sección 5.1: una figura simple por etapa de la arquitectura.

Genera etapa-1.svg … etapa-6.svg y sus PNG en etapas/. Usa los logos de logos/
(ver logos/FUENTES.md) y la misma paleta que la Figura 2A.

Contenido contrastado con los commits de cada etapa:
  1  2579471 (7 ene): rutas /api de Next.js; Whisper, gpt-4o-mini y OpenAI TTS.
  2  4ee814e (14 ene): servidor WebSocket propio entre el navegador y OpenAI Realtime;
     síntesis con OpenAI o ElevenLabs.
  3  d9f517e (14 ene): RAG propio. Carga con URL prefirmada, texto dividido en fragmentos
     de 1.200 caracteres en PostgreSQL y búsqueda por palabras clave, sin embeddings.
     La prueba en la llamada por voz (8d407a1, rama fonts-and-rag) no llegó a la línea principal.
  4  91854b5, e4e827a, eaa953f (22-29 ene): avatar 3D en el navegador (Three.js) con
     modelos Ready Player Me y lip-sync a partir del audio.
  5  749009f (6 may): LiveAvatar LITE; Realtime responde en audio, el navegador lo envía
     al avatar con repeatAudio; el servidor WebSocket pide el token de sesión.
  6  826246d (12 jun) y ADR 0004, 0007, 0021: ElevenLabs Agent con el conector de
     LiveAvatar; API y worker. El servidor WebSocket se eliminó en 2207c6c (15 may).
  7  bc35b28 (23 ago) y ADR 0018, 0019, 0026: Scribe, director con LangGraph y OpenAI,
     una sesión de LiveAvatar y un agente por avatar.

Uso: python3 generar_etapas.py
"""
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).parent
LOGOS = HERE / "logos"
OUT = HERE / "etapas"
OUT.mkdir(exist_ok=True)
REPO = HERE.parents[3]

W = 1000
FONT = "Arial, Helvetica, sans-serif"
INK, MUTED, LINE = "#0F172A", "#475569", "#CBD5E1"
CONTROL, MEDIA, DEFERRED = "#334155", "#0D9488", "#7C3AED"
NEW_STROKE, NEW_FILL, NEW_TEXT = "#D97706", "#FEF3C7", "#B45309"
GHOST = "#94A3B8"
LANES = [
    (20, 300, "Navegador", "#2563EB", "#F5F9FF", "#BFDBFE"),
    (360, 640, "Servidores de YUNI", "#7C3AED", "#FAF8FF", "#DDD6FE"),
    (700, 980, "Proveedores externos", "#475569", "#FAFAFA", "#E2E8F0"),
]
SIMPLE = {
    "nextdotjs": "#000000", "react": "#149ECA", "hono": "#E36002", "nodedotjs": "#5FA04E",
    "elevenlabs": "#000000", "threedotjs": "#000000", "postgresql": "#4169E1",
}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Panel:
    def __init__(self, height):
        self.h = height
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{height}" viewBox="0 0 {W} {height}">']
        defs = ["<defs>"]
        for color, mid in ((CONTROL, "c"), (MEDIA, "m"), (DEFERRED, "d")):
            defs.append(
                f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
                f'<path d="M0 0L10 5L0 10z" fill="{color}"/></marker>'
                f'<marker id="{mid}s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
                f'<path d="M10 0L0 5L10 10z" fill="{color}"/></marker>'
            )
        defs.append("</defs>")
        self.svg.append("".join(defs))
        self.rect(0, 0, W, height, "#FFFFFF", "none", 0, 0)
        for x0, x1, name, color, fill, stroke in LANES:
            self.rect(x0, 50, x1 - x0, height - 100, fill, stroke, 1.4, 10)
            self.text((x0 + x1) / 2, 36, name, 17, "bold", color, "middle")
        # leyenda
        y = height - 32
        self.badge(20, y - 16)
        self.text(92, y + 1, "se suma en esta etapa", 15, "normal", MUTED)

    def rect(self, x, y, w, h, fill, stroke, sw=1.3, rx=8, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=16, weight="normal", color=INK, anchor="start", italic=False, rotate=None):
        st = ' font-style="italic"' if italic else ""
        tr = f' transform="rotate({rotate} {x} {y})"' if rotate else ""
        self.svg.append(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}"{st}{tr}>{esc(s)}</text>'
        )

    def logo(self, slug, x, y, size):
        if slug in SIMPLE:
            d = re.search(r'<path d="([^"]+)"', (LOGOS / f"{slug}.svg").read_text()).group(1)
            self.svg.append(f'<g transform="translate({x} {y}) scale({size / 24:.4f})"><path d="{d}" fill="{SIMPLE[slug]}"/></g>')
        elif slug == "openai":
            d = re.search(r'<path d="(M872[^"]+)"', (LOGOS / "openai.svg").read_text()).group(1)
            self.svg.append(f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="757 222 282 282"><path d="{d}" fill="#000000"/></svg>')
        elif slug == "liveavatar":
            inner = re.sub(r"^<svg[^>]*>|</svg>\s*$", "", (LOGOS / "liveavatar.svg").read_text().strip())
            self.svg.append(f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="240 3.5 17.5 17.5">{inner}</svg>')
        else:
            raise KeyError(slug)

    def badge(self, x, y):
        self.rect(x, y, 62, 22, NEW_FILL, NEW_STROKE, 1.2, 11)
        self.text(x + 31, y + 16, "nuevo", 13.5, "bold", NEW_TEXT, "middle")

    def tile(self, x, y, h, logos, title, lines, new=False, ghost=False, w=250):
        if ghost:
            self.rect(x, y, w, h, "none", GHOST, 1.5, 8, "6 5")
        else:
            self.rect(x, y, w, h, "#FFFFFF", NEW_STROKE if new else LINE, 2 if new else 1.3, 8)
        lx = x + 14
        for slug in logos:
            self.logo(slug, lx, y + 13, 28)
            lx += 36
        color = GHOST if ghost else INK
        self.text(lx + 4 if logos else x + 14, y + 34, title, 18.5, "bold", color)
        for i, ln in enumerate(lines):
            self.text(x + 14, y + 61 + i * 21, ln, 15.5, "normal", GHOST if ghost else MUTED)
        if new:
            self.badge(x + w - 70, y - 11)

    def arrow(self, pts, color, both=False, dash=None, width=2.2):
        m = {CONTROL: "c", MEDIA: "m", DEFERRED: "d"}[color]
        d = "M " + " L ".join(f"{a} {b}" for a, b in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        start = f' marker-start="url(#{m}s)"' if both else ""
        self.svg.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{da} marker-end="url(#{m})"{start}/>')

    def label(self, x, y, s, color=MUTED, anchor="middle", rotate=None):
        size = 14
        w = len(s) * size * 0.5 + 8
        if rotate is None:
            bx = {"middle": x - w / 2, "start": x - 4, "end": x - w + 4}[anchor]
            self.rect(bx, y - size + 1, w, size + 6, "#FFFFFF", "none", 0, 3)
        self.text(x, y + 1, s, size, "normal", color, anchor, italic=True, rotate=rotate)

    def num(self, n, x, y):
        self.svg.append(f'<circle cx="{x}" cy="{y}" r="11" fill="{INK}"/>')
        self.text(x, y + 5, str(n), 13.5, "bold", "#FFFFFF", "middle")

    def save(self, name):
        self.svg.append("</svg>")
        path = OUT / f"{name}.svg"
        path.write_text("\n".join(self.svg), encoding="utf8")
        subprocess.run(["node", str(HERE / "render.cjs"), str(path), str(path.with_suffix(".png")), "2000"],
                       check=True, cwd=REPO)


# ---- Etapa 1: primer circuito de voz
p = Panel(380)
p.tile(35, 95, 110, ["nextdotjs"], "Aplicación web", ["Graba la pregunta y", "reproduce la respuesta"])
p.tile(375, 95, 110, ["nextdotjs"], "Rutas /api", ["Coordinan cada paso y", "guardan en archivos JSON"])
p.tile(715, 70, 70, ["openai"], "Whisper", ["voz a texto"])
p.tile(715, 158, 70, ["openai"], "GPT-4o mini", ["genera la respuesta"])
p.tile(715, 246, 70, ["openai"], "OpenAI TTS", ["texto a voz"])
p.arrow([(287, 150), (373, 150)], CONTROL, both=True)
p.label(330, 140, "HTTP")
for n, y in ((1, 105), (2, 193), (3, 281)):
    p.arrow([(627, 150), (668, 150), (668, y), (713, y)], CONTROL)
    p.num(n, 691, y)
p.save("etapa-1")

# ---- Etapa 2: conversación en tiempo real
p = Panel(380)
p.tile(35, 95, 110, ["nextdotjs"], "Aplicación web", ["Micrófono y audio", "en forma continua"])
p.tile(375, 95, 110, ["nodedotjs"], "Servidor WebSocket", ["Retransmite el audio y", "guarda la conversación"], new=True)
p.tile(715, 70, 110, ["openai"], "OpenAI Realtime", ["Escucha, turnos y", "respuesta en texto"], new=True)
p.tile(715, 210, 100, ["openai", "elevenlabs"], "Síntesis", ["de voz: OpenAI o ElevenLabs"])
p.arrow([(287, 150), (373, 150)], MEDIA, both=True, width=2.6)
p.label(330, 140, "WebSocket", MEDIA)
p.arrow([(627, 125), (713, 125)], MEDIA, both=True, width=2.6)
p.label(670, 115, "audio", MEDIA)
p.arrow([(627, 180), (668, 180), (668, 260), (713, 260)], CONTROL, both=True)
p.label(668, 225, "texto a voz")
p.save("etapa-2")

# ---- Etapa 4: primer rostro
p = Panel(440)
p.tile(35, 85, 100, ["nextdotjs"], "Aplicación web", ["Micrófono y audio continuos"])
p.tile(35, 245, 125, ["threedotjs"], "Avatar 3D", ["Modelos de Ready Player Me", "y labios sincronizados", "con el audio"], new=True)
p.tile(375, 85, 100, ["nodedotjs"], "Servidor WebSocket", ["Retransmite el audio"])
p.tile(715, 70, 100, ["openai"], "OpenAI Realtime", ["Escucha, turnos y texto"])
p.tile(715, 200, 100, ["openai", "elevenlabs"], "Síntesis", ["de voz: OpenAI o ElevenLabs"])
p.arrow([(160, 187), (160, 243)], MEDIA, width=2.6)
p.label(168, 220, "audio", MEDIA, "start")
p.arrow([(287, 135), (373, 135)], MEDIA, both=True, width=2.6)
p.label(330, 125, "WebSocket", MEDIA)
p.arrow([(627, 115), (713, 115)], MEDIA, both=True, width=2.6)
p.label(670, 105, "audio", MEDIA)
p.arrow([(627, 160), (668, 160), (668, 250), (713, 250)], CONTROL, both=True)
p.label(668, 210, "texto a voz")
p.save("etapa-4")

# ---- Etapa 3: primer conocimiento propio
p = Panel(480)
p.tile(35, 140, 110, ["nextdotjs"], "Aplicación web", ["Sube documentos y", "conversa por texto"])
p.tile(375, 140, 115, ["nextdotjs"], "Búsqueda propia", ["En las rutas /api: extrae,", "divide y busca el texto"], new=True)
p.tile(375, 300, 100, ["postgresql"], "PostgreSQL", ["Fragmentos de 1.200", "caracteres"], new=True)
p.tile(715, 75, 90, [], "Almacenamiento", ["de objetos (originales)"], new=True)
p.tile(715, 215, 110, ["openai"], "GPT-4o mini", ["Responde con los", "fragmentos hallados"])
p.arrow([(200, 138), (200, 108), (713, 108)], CONTROL)
p.label(500, 98, "URL prefirmada")
p.arrow([(287, 195), (373, 195)], CONTROL, both=True)
p.label(330, 185, "HTTP")
p.arrow([(500, 257), (500, 298)], CONTROL, both=True)
p.label(492, 282, "fragmentos", MUTED, "end")
p.arrow([(627, 230), (668, 230), (668, 268), (713, 268)], CONTROL)
p.label(668, 252, "contexto")
p.save("etapa-3")

# ---- Etapa 5: avatar en vivo
p = Panel(440)
p.tile(35, 85, 100, ["nextdotjs"], "Aplicación web", ["Micrófono y audio continuos"])
p.tile(35, 245, 110, ["liveavatar"], "SDK de LiveAvatar", ["Envía el audio al avatar", "y muestra el video"], new=True)
p.tile(375, 85, 110, ["nodedotjs"], "Servidor WebSocket", ["Retransmite el audio y", "pide la sesión del avatar"])
p.tile(715, 70, 100, ["openai"], "OpenAI Realtime", ["Ahora también responde", "en audio"])
p.tile(715, 245, 110, ["liveavatar"], "LiveAvatar", ["Video del avatar en", "tiempo real (modo LITE)"], new=True)
p.arrow([(160, 187), (160, 243)], MEDIA, width=2.6)
p.label(168, 220, "audio", MEDIA, "start")
p.arrow([(287, 135), (373, 135)], MEDIA, both=True, width=2.6)
p.label(330, 125, "WebSocket", MEDIA)
p.arrow([(627, 115), (713, 115)], MEDIA, both=True, width=2.6)
p.label(670, 105, "audio", MEDIA)
p.arrow([(627, 175), (668, 175), (668, 268), (713, 268)], CONTROL)
p.label(668, 225, "token")
p.arrow([(287, 318), (713, 318)], MEDIA, both=True, width=2.6)
p.label(500, 308, "audio y video", MEDIA)
p.save("etapa-5")

# ---- Etapa 6: conversación delegada y conocimiento en el proveedor
p = Panel(640)
p.tile(35, 85, 100, ["liveavatar"], "SDK de LiveAvatar", ["Micrófono, video y audio"])
p.tile(35, 215, 110, ["nextdotjs", "react"], "Aplicación", ["Configura agentes", "y materiales"])
p.tile(375, 215, 110, ["hono"], "API", ["Autoriza la llamada y", "guarda el historial"], new=True)
p.tile(375, 355, 110, ["nodedotjs"], "Worker", ["Sincroniza agentes", "y materiales"], new=True)
p.tile(375, 475, 105, [], "Ya no se usan", ["Servidor WebSocket", "Búsqueda propia (RAG)"], ghost=True)
p.tile(715, 70, 115, ["liveavatar"], "LiveAvatar", ["Sesión LITE con", "conector a ElevenLabs"])
p.tile(715, 245, 165, ["elevenlabs"], "ElevenLabs Agent", ["Voz, turnos,", "interrupciones y", "base de conocimiento"], new=True)
p.arrow([(287, 125), (713, 125)], MEDIA, both=True, width=2.6)
p.label(500, 115, "audio y video", MEDIA)
p.arrow([(287, 265), (373, 265)], CONTROL)
p.label(330, 255, "HTTPS")
p.arrow([(627, 245), (668, 245), (668, 168), (713, 168)], CONTROL)
p.label(668, 210, "token")
p.arrow([(627, 405), (713, 405)], DEFERRED, dash="7 5")
p.label(670, 395, "agente y KB", DEFERRED)
p.arrow([(840, 187), (840, 243)], MEDIA, both=True, width=2.6)
p.label(850, 220, "conector", MEDIA, "start")
p.save("etapa-6")

# ---- Etapa 7: conversación grupal
p = Panel(580)
p.tile(35, 85, 100, ["elevenlabs"], "Cliente de Scribe", ["Pasa la voz humana", "a texto"], new=True)
p.tile(35, 225, 110, ["nextdotjs", "react"], "Aplicación", ["Envía el turno y aplica", "la compuerta de audio"])
p.tile(35, 375, 110, ["liveavatar"], "SDK de LiveAvatar", ["Una sesión por avatar", "(A, B y C)"], new=True)
p.tile(375, 215, 130, ["hono"], "API", ["Director (LangGraph)", "y control de turnos"], new=True)
p.tile(715, 70, 120, ["elevenlabs"], "ElevenLabs", ["Scribe y un agente", "por avatar (A, B y C)"])
p.tile(715, 245, 90, ["openai"], "OpenAI", ["Plan de cada ronda"], new=True)
p.tile(715, 375, 110, ["liveavatar"], "LiveAvatar", ["Una sesión por avatar", "(A, B y C)"])
p.arrow([(160, 187), (160, 223)], MEDIA, width=2.6)
p.label(168, 210, "texto", MEDIA, "start")
p.arrow([(160, 337), (160, 373)], CONTROL)
p.label(168, 360, "instrucción", MUTED, "start")
p.arrow([(287, 125), (713, 125)], MEDIA, both=True, width=2.6)
p.label(500, 115, "WebSocket de Scribe", MEDIA)
p.arrow([(287, 280), (373, 280)], CONTROL, both=True)
p.label(330, 270, "turno")
p.arrow([(627, 290), (713, 290)], CONTROL)
p.label(670, 280, "plan")
p.arrow([(287, 430), (713, 430)], MEDIA, both=True, width=2.6)
p.label(500, 420, "contexto, audio y video", MEDIA)
p.arrow([(967, 430), (986, 430), (986, 130), (967, 130)], MEDIA, both=True, width=2.6)
p.text(996, 280, "conector", 14, "normal", MEDIA, "middle", italic=True, rotate=-90)
p.save("etapa-7")
print("ok:", sorted(x.name for x in OUT.glob("*.png")))
