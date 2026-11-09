"""Figuras 14 a 17 del capítulo 5, apaisadas y con la paleta de las Figuras 6 a 12.

Cada recorrido se dibuja por carriles (filas): quién hace cada paso, de izquierda a derecha.
Reemplazan los diagramas de secuencia verticales, que ocupaban una hoja entera cada uno.

Uso: python3 generar_secuencias.py <carpeta de salida>
"""
from pathlib import Path
import re
import subprocess
import sys

REPO = Path("/Users/lucaslovaglio/projects/university/tesis/yuni-ai")
ARQ = REPO / "docs/thesis/v1-4/arquitectura"
LOGOS = ARQ / "logos"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)

FONT = "Arial, Helvetica, sans-serif"
INK, MUTED, LINE = "#0F172A", "#475569", "#CBD5E1"
CONTROL, MEDIA, DEFERRED = "#334155", "#0D9488", "#7C3AED"
TIER = {  # color del nombre, relleno del carril, borde del carril
    "nav": ("#2563EB", "#F5F9FF", "#BFDBFE"),
    "yuni": ("#7C3AED", "#FAF8FF", "#DDD6FE"),
    "prov": ("#475569", "#FAFAFA", "#E2E8F0"),
}
SIMPLE = {
    "nextdotjs": "#000000", "react": "#149ECA", "hono": "#E36002", "nodedotjs": "#5FA04E",
    "elevenlabs": "#000000", "postgresql": "#4169E1",
}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Fig:
    def __init__(self, w, lanes, ncols, lane_h=80, top=12, label_w=104, bottom=38, phases=None):
        self.w, self.lanes, self.ncols, self.lh = w, lanes, ncols, lane_h
        self.top = top + (30 if phases else 0)
        self.x0, self.x1 = label_w + 14, w - 12
        self.cw = (self.x1 - self.x0) / ncols
        self.h = self.top + len(lanes) * lane_h + bottom
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{self.h}" viewBox="0 0 {w} {self.h}">']
        defs = ["<defs>"]
        for color, mid in ((CONTROL, "c"), (MEDIA, "m"), (DEFERRED, "d")):
            defs.append(
                f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
                f'<path d="M0 0L10 5L0 10z" fill="{color}"/></marker>'
                f'<marker id="{mid}s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
                f'<path d="M10 0L0 5L10 10z" fill="{color}"/></marker>')
        defs.append("</defs>")
        self.svg.append("".join(defs))
        self.rect(0, 0, w, self.h, "#FFFFFF", "none", 0, 0)
        for i, (name, sub, logos, tier) in enumerate(lanes):
            color, fill, stroke = TIER[tier]
            y = self.lane_y(i)
            self.rect(8, y + 3, w - 16, lane_h - 6, fill, stroke, 1.2, 8)
            lx = 18
            for slug in logos:
                self.logo(slug, lx, y + 12, 20)
                lx += 25
            ty = y + lane_h / 2 + (-2 if sub else 6)
            self.text(18, ty + (14 if logos else 0), name, 15, "bold", color)
            if sub:
                self.text(18, ty + (14 if logos else 0) + 17, sub, 12, "normal", MUTED)
        if phases:
            for c0, c1, name in phases:
                xa, xb = self.x0 + c0 * self.cw + 4, self.x0 + (c1 + 1) * self.cw - 4
                self.svg.append(f'<path d="M{xa} {top + 18} L{xb} {top + 18}" stroke="{LINE}" stroke-width="2"/>')
                self.text((xa + xb) / 2, top + 12, name, 14, "bold", MUTED, "middle")
        self.boxes = {}

    # ---------- primitivas
    def rect(self, x, y, w, h, fill, stroke, sw=1.3, rx=8, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.svg.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=14, weight="normal", color=INK, anchor="start", italic=False):
        st = ' font-style="italic"' if italic else ""
        self.svg.append(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                        f'fill="{color}" text-anchor="{anchor}"{st}>{esc(s)}</text>')

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

    def lane_y(self, i):
        return self.top + i * self.lh

    def cx(self, col):
        return self.x0 + (col + 0.5) * self.cw

    # ---------- cajas
    def box(self, key, lane, col, lines, num=None, kind="step", span=1, w=None):
        """kind: step (paso numerado), data (dato guardado), plain."""
        lw = w or (self.cw * span - 8)
        x = self.x0 + col * self.cw + (self.cw * span - lw) / 2
        n = len(lines)
        bh = max(40, 16 * n + 14)
        y = self.lane_y(lane) + (self.lh - bh) / 2
        if kind == "data":
            self.rect(x, y, lw, bh, "#FFFFFF", "#A78BFA", 1.3, 4, "4 3")
        else:
            self.rect(x, y, lw, bh, "#FFFFFF", "#94A3B8" if kind == "step" else LINE, 1.3, 7)
        tx = x + lw / 2
        for i, ln in enumerate(lines):
            self.text(tx, y + bh / 2 - (n - 1) * 8 + 5 + i * 16, ln, 13, "normal", INK if kind != "data" else MUTED, "middle")
        if num is not None:
            self.svg.append(f'<circle cx="{x + 2:.1f}" cy="{y + 2:.1f}" r="10" fill="{INK}"/>')
            self.text(x + 2, y + 6.5, str(num), 12.5, "bold", "#FFFFFF", "middle")
        self.boxes[key] = (x, y, lw, bh)
        return key

    def edge(self, key, side):
        x, y, w, h = self.boxes[key]
        return {"l": (x, y + h / 2), "r": (x + w, y + h / 2), "t": (x + w / 2, y), "b": (x + w / 2, y + h)}[side]

    def arrow(self, pts, color=CONTROL, dash=None, both=False, width=1.8):
        m = {CONTROL: "c", MEDIA: "m", DEFERRED: "d"}[color]
        d = "M " + " L ".join(f"{a:.1f} {b:.1f}" for a, b in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        st = f' marker-start="url(#{m}s)"' if both else ""
        self.svg.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{da} marker-end="url(#{m})"{st}/>')

    def label(self, x, y, s, color=MUTED, anchor="middle"):
        size = 12.5
        w = len(s) * size * 0.5 + 8
        bx = {"middle": x - w / 2, "start": x - 3, "end": x - w + 3}[anchor]
        self.rect(bx, y - size + 1, w, size + 5, "#FFFFFF", "none", 0, 3)
        self.text(x, y + 1, s, size, "normal", color, anchor, italic=True)

    def link(self, a, b, lab=None, color=CONTROL, dash=None, route=None, both=False, lab_at=None, dxa=0, dxb=0):
        """Une dos cajas. route: 'h' horizontal, 'v' vertical, 'L' (sale por el costado y entra por arriba o abajo),
        'N' (sale y entra por arriba). La etiqueta va sobre el tramo vertical, en el borde del carril de destino."""
        ax, ay, aw, ah = self.boxes[a]
        bx, by, bw, bh = self.boxes[b]
        acx, acy, bcx, bcy = ax + aw / 2 + dxa, ay + ah / 2, bx + bw / 2 + dxb, by + bh / 2
        if route is None:
            route = "h" if abs(acy - bcy) < 2 else ("v" if abs(ax + aw / 2 - bx - bw / 2) < 2 else "L")
        right = bcx > acx
        down = bcy > acy
        if route == "h":
            p = [(ax + aw if right else ax, acy), (bx if right else bx + bw, bcy)]
        elif route == "v":
            p = [(acx, ay + ah if down else ay), (bcx, by if down else by + bh)]
        elif route == "L":
            p = [(ax + aw if right else ax, acy), (bcx, acy), (bcx, by if down else by + bh)]
        elif route == "N":
            yt = min(ay, by) - 16
            p = [(acx, ay), (acx, yt), (bcx, yt), (bcx, by)]
        else:
            raise ValueError(route)
        self.arrow(p, color, dash, both)
        if lab:
            if lab_at:
                lx, ly = lab_at
            elif route == "N":
                lx, ly = (p[1][0] + p[2][0]) / 2, p[1][1] + 4
            elif route == "h":
                lx, ly = (p[0][0] + p[1][0]) / 2, p[0][1] - 8
            else:
                lane_b = int((bcy - self.top) // self.lh)
                ly = self.lane_y(lane_b) + (0 if down else self.lh) + 4
                lx = p[-1][0]
            self.label(lx, ly, lab, color if color != CONTROL else MUTED)

    def diamond(self, key, lane, col, lines, w=96, h=74):
        cx, cy = self.cx(col), self.lane_y(lane) + self.lh / 2
        pts = f"{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}"
        self.svg.append(f'<polygon points="{pts}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.3"/>')
        n = len(lines)
        for i, ln in enumerate(lines):
            self.text(cx, cy - (n - 1) * 8 + 5 + i * 16, ln, 13, "bold", INK, "middle")
        self.boxes[key] = (cx - w / 2, cy - h / 2, w, h)

    def legend(self, items):
        y = self.h - 16
        x = 18
        for kind, s in items:
            if kind == "step":
                self.svg.append(f'<circle cx="{x + 8}" cy="{y - 4}" r="8" fill="{INK}"/>')
                self.text(x + 8, y + 0.5, "1", 11, "bold", "#FFFFFF", "middle")
                x += 22
            elif kind == "data":
                self.rect(x, y - 12, 26, 16, "#FFFFFF", "#A78BFA", 1.3, 3, "4 3")
                x += 34
            else:
                color, dash = {"req": (CONTROL, None), "ret": (CONTROL, "6 4"), "media": (MEDIA, None), "job": (DEFERRED, "6 4")}[kind]
                self.arrow([(x, y - 4), (x + 30, y - 4)], color, dash)
                x += 38
            self.text(x, y + 1, s, 13, "normal", MUTED)
            x += len(s) * 6.6 + 22

    def save(self, name, px=2200):
        self.svg.append("</svg>")
        path = OUT / f"{name}.svg"
        path.write_text("\n".join(self.svg), encoding="utf8")
        subprocess.run(["node", str(ARQ / "render.cjs"), str(path), str(path.with_suffix(".png")), str(px)],
                       check=True, cwd=REPO)


# =============== Figura 14: carga y sincronización de un documento
f = Fig(1000, [
    ("Navegador", "María", [], "nav"),
    ("API", "", ["hono"], "yuni"),
    ("Datos", "PostgreSQL y S3", ["postgresql"], "yuni"),
    ("Worker", "", ["nodedotjs"], "yuni"),
    ("ElevenLabs", "", ["elevenlabs"], "prov"),
], ncols=8)
f.box("n1", 0, 0, ["Pide subir", "un archivo"], 1)
f.box("a2", 1, 1, ["Registra el", "documento", "pendiente"], 2)
f.box("n3", 0, 2, ["Sube el", "archivo y pide", "confirmarlo"], 3)
f.box("s3", 2, 2, ["Bucket:", "original"], kind="data")
f.box("a4", 1, 3, ["Verifica,", "confirma y", "encola"], 4)
f.box("d4", 2, 3, ["Documento", "y trabajo"], kind="data")
f.box("w5", 3, 4, ["Toma el", "trabajo y lee", "el original"], 5)
f.box("e6", 4, 5, ["Indexa el", "archivo y lo", "asocia"], 6)
f.box("w7", 3, 6, ["Marca el", "documento", "disponible"], 7)
f.box("d7", 2, 6, ["Documento", "disponible"], kind="data")
f.box("n8", 0, 7, ["Muestra", "“Procesando”", "y luego “Listo”"], 8)
f.link("n1", "a2", "tipo y tamaño", lab_at=(f.cx(1), f.lane_y(0) + f.lh / 2 + 18))
f.link("a2", "n3", "URL prefirmada", dash="6 4", dxb=-30)
f.link("n3", "s3", "archivo", route="v", dxa=30, dxb=30, lab_at=(f.cx(2) + 30, f.lane_y(1) + f.lh / 2 + 5))
f.link("n3", "a4", "confirmar")
f.link("a4", "d4", "una transacción", route="v")
f.link("d4", "w5", "trabajo", DEFERRED, "6 4")
f.link("w5", "e6", "original", DEFERRED)
f.link("e6", "w7", "indexado", dash="6 4")
f.link("w7", "d7", route="v")
f.link("d7", "n8", "estado", dash="6 4")
f.legend([("step", "paso"), ("data", "dato guardado"), ("req", "solicitud"), ("ret", "respuesta"), ("job", "trabajo diferido")])
f.save("figura-14-carga-materiales")

# =============== Figura 15: llamada individual
f = Fig(1100, [
    ("Navegador", "alumno", [], "nav"),
    ("API", "", ["hono"], "yuni"),
    ("PostgreSQL", "", ["postgresql"], "yuni"),
    ("Proveedores", "LiveAvatar y", [], "prov"),
], ncols=10, phases=[(0, 5, "Inicio"), (6, 6, "Conversación"), (7, 9, "Cierre")])
f.text(18, f.lane_y(3) + f.lh / 2 + 31, "ElevenLabs", 12, "normal", MUTED)
f.box("n1", 0, 0, ["Pide iniciar", "la llamada"], 1)
f.box("a2", 1, 1, ["Valida el", "acceso y el", "agente"], 2)
f.box("d2", 2, 1, ["Conversación", "y sesión"], kind="data")
f.box("p3", 3, 2, ["Crea la", "sesión del", "avatar"], 3)
f.box("a4", 1, 3, ["Entrega", "el token"], 4)
f.box("n5", 0, 4, ["Se conecta", "a la sala"], 5)
f.box("a6", 1, 5, ["Registra la", "activación"], 6)
f.box("d6", 2, 5, ["Activación"], kind="data")
f.box("n7", 0, 6, ["Micrófono,", "audio y video"], 7)
f.box("p7", 3, 6, ["El agente", "responde"], kind="plain")
f.box("n8", 0, 7, ["Envía la", "transcripción"], 8)
f.box("a9", 1, 8, ["Cierra y", "guarda en una", "transacción"], 9)
f.box("d9", 2, 8, ["Sesión,", "mensajes y", "conversación"], kind="data")
f.box("p10", 3, 9, ["Libera la", "sesión"], 10)
f.link("n1", "a2")
f.link("a2", "d2", route="v")
f.link("a2", "p3", "avatar y agente", lab_at=(f.cx(2), f.lane_y(2) + f.lh / 2 + 5))
f.link("p3", "a4", "token", dash="6 4")
f.link("a4", "n5", "token", dash="6 4")
f.link("n5", "a6", "conectado")
f.link("a6", "d6", route="v")
f.link("n7", "p7", "WebRTC", MEDIA, route="v", both=True, lab_at=(f.cx(6), f.lane_y(2) + 4))
f.link("n8", "a9", "cierre")
f.link("a9", "d9", route="v")
f.link("a9", "p10", "liberar", lab_at=(f.cx(9), f.lane_y(2) + f.lh / 2 + 5))
f.legend([("step", "paso"), ("data", "dato guardado"), ("req", "solicitud"), ("ret", "respuesta"), ("media", "audio y video")])
f.save("figura-15-llamada-individual")

# =============== Figura 16: una ronda grupal
f = Fig(1000, [
    ("Navegador", "persona", [], "nav"),
    ("API", "director y turnos", ["hono"], "yuni"),
    ("Scribe", "ElevenLabs", ["elevenlabs"], "prov"),
    ("OpenAI", "", ["openai"], "prov"),
    ("Avatares", "una sesión c/u", ["liveavatar"], "prov"),
], ncols=8)
f.box("n1", 0, 0, ["Capta la voz", "de la persona"], 1)
f.box("s1", 2, 0, ["Transcribe", "y confirma"], kind="plain")
f.box("a2", 1, 1, ["El director", "decide quién", "responde"], 2)
f.box("o3", 3, 2, ["Propone", "quién, orden", "e instrucción"], 3)
f.box("a4", 1, 3, ["Guarda la", "ronda y da", "la palabra"], 4)
f.box("n5", 0, 4, ["Envía contexto", "e instrucción"], 5)
f.box("v6", 4, 5, ["El agente", "elegido", "responde"], 6)
f.box("n7", 0, 6, ["Deja oír solo", "a ese avatar"], 7)
f.box("a8", 1, 7, ["Registra el", "turno y sigue"], 8)
f.link("n1", "s1", "voz y texto", MEDIA, route="v", both=True)
f.link("n1", "a2", "intervención")
f.link("a2", "o3", "pedido y roles", lab_at=(f.cx(2), f.lane_y(2) + f.lh / 2 + 5))
f.link("o3", "a4", "plan", dash="6 4")
f.link("a4", "n5", "directiva", dash="6 4")
f.link("n5", "v6", "contexto e instrucción", lab_at=(f.cx(5), f.lane_y(3) + f.lh / 2 + 5))
f.link("v6", "n7", "audio y video", MEDIA)
f.link("n7", "a8", "eventos")
f.legend([("step", "paso"), ("req", "solicitud"), ("ret", "respuesta"), ("media", "voz, audio y video")])
f.save("figura-16-ronda-grupal")

# =============== Figura 17: turnos e interrupción
f = Fig(1000, [
    ("Ronda", "un turno por vez", [], "yuni"),
    ("Interrupción", "durante una", [], "nav"),
], ncols=8, lane_h=124, bottom=14)
f.text(18, f.lane_y(1) + f.lh / 2 + 31, "respuesta", 12, "normal", MUTED)
f.box("r1", 0, 0, ["Intervención", "confirmada"], kind="plain")
f.box("r2", 0, 1, ["El director", "elige quién y", "en qué orden"], kind="plain")
f.box("r3", 0, 2, ["Se guardan", "la ronda y", "los turnos"], kind="plain")
f.box("r4", 0, 3, ["El avatar", "recibe contexto", "e instrucción"], kind="plain")
f.box("r5", 0, 4, ["Responde y", "solo él se oye"], kind="plain")
f.box("r6", 0, 5, ["Termina de", "hablar y se", "registra"], kind="plain")
f.diamond("q1", 0, 6, ["¿Quedan", "turnos?"])
f.box("r7", 0, 7, ["Espera otra", "intervención"], kind="plain")
f.box("i1", 1, 4, ["La persona", "habla"], kind="plain")
f.diamond("q2", 1, 3, ["¿Asenti-", "miento", "o eco?"], w=100, h=84)
f.box("i3", 1, 2, ["Silencia y", "cancela la", "ronda"], kind="plain")
f.box("i4", 1, 1, ["La nueva", "frase va al", "director"], kind="plain")
for a, b in (("r1", "r2"), ("r2", "r3"), ("r3", "r4"), ("r4", "r5"), ("r5", "r6"), ("r6", "q1"), ("i1", "q2"), ("q2", "i3"), ("i3", "i4")):
    f.link(a, b)
f.link("q1", "r7")
f.text(f.boxes["q1"][0] + f.boxes["q1"][2] + 1, f.lane_y(0) + f.lh / 2 - 8, "No", 12.5, "bold", MUTED)
f.link("q1", "r4", "Sí: sigue el próximo turno", route="N")
f.link("r5", "i1", route="v", dash="3 3")
f.text(f.cx(3) - 38, f.lane_y(1) + f.lh / 2 - 14, "No", 12.5, "bold", MUTED, "end")
q2x, q2y, q2w, q2h = f.boxes["q2"]
f.arrow([(q2x + q2w / 2, q2y + q2h), (q2x + q2w / 2, q2y + q2h + 12)], CONTROL)
f.text(q2x + q2w / 2 + 8, q2y + q2h + 12, "Sí: se ignora", 12.5, "normal", MUTED)
f.link("i4", "r2", "nueva ronda", route="v", lab_at=(f.cx(1), f.lane_y(1) + 4))
f.save("figura-17-turnos-interrupcion")
print("ok")
