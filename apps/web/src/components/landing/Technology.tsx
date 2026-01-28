"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { LogoLoop, type LogoItem } from "@/components/landing/LogoLoop";

// Logos: Simple Icons CDN (blanco) — stack del monorepo (web + agent)
const TECH_LOGOS: LogoItem[] = [
  { src: "https://cdn.simpleicons.org/nextdotjs/ffffff", alt: "Next.js", title: "Next.js" },
  { src: "https://cdn.simpleicons.org/react/ffffff", alt: "React", title: "React" },
  { src: "https://cdn.simpleicons.org/typescript/ffffff", alt: "TypeScript", title: "TypeScript" },
  { src: "https://cdn.simpleicons.org/langchain/ffffff", alt: "LangGraph", title: "LangGraph" },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/9/97/OpenAI_logo_2025.svg",
    alt: "OpenAI",
    title: "OpenAI",
  },
  { src: "https://cdn.simpleicons.org/prisma/ffffff", alt: "Prisma", title: "Prisma" },
  { src: "https://cdn.simpleicons.org/tailwindcss/ffffff", alt: "Tailwind CSS", title: "Tailwind CSS" },
  { src: "https://cdn.simpleicons.org/threedotjs/ffffff", alt: "Three.js", title: "Three.js" },
  { src: "https://cdn.simpleicons.org/framer/ffffff", alt: "Framer Motion", title: "Framer Motion" },
  { src: "https://cdn.simpleicons.org/webrtc/ffffff", alt: "WebRTC", title: "WebRTC" },
  {
    src: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonaws.svg",
    alt: "AWS",
    title: "AWS",
  },
];

export function Technology() {
  const [hoveredTech, setHoveredTech] = useState<string | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number } | null>(null);

  const renderTechLogo = useCallback((item: LogoItem, _key: React.Key) => {
    const src = "src" in item ? item.src : "";
    const alt = "alt" in item ? (item.alt ?? "") : "";
    const title = "title" in item ? (item.title ?? alt) : alt;
    if (!src) return null;
    return (
      <div
        className="group relative flex flex-col items-center justify-center py-2"
        title={title}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTooltipAnchor({ x: r.left + r.width / 2, y: r.bottom + 6 });
          setHoveredTech(title);
        }}
        onMouseLeave={() => {
          setTooltipAnchor(null);
          setHoveredTech(null);
        }}
      >
        <img
          src={src}
          alt={alt}
          className={`h-[var(--logoloop-logoHeight)] w-auto object-contain transition-transform duration-200 group-hover:scale-110 ${title === "OpenAI" || title === "AWS" ? "invert" : ""}`}
          loading="lazy"
        />
      </div>
    );
  }, []);

  return (
    <section className="relative py-32 px-6 overflow-x-hidden overflow-y-visible">
      <div className="relative mx-auto max-w-7xl overflow-visible">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-16 "
        >
          <motion.h2 
            className="text-5xl md:text-6xl font-bold mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="gradient-text">Tecnología de Vanguardia</span>
          </motion.h2>
          <motion.p 
            className="text-xl text-white/70 max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Construido con las mejores herramientas y frameworks para ofrecer una experiencia 
            de usuario excepcional y rendimiento de clase empresarial.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="w-full overflow-visible pb-4 pt-2 [mask-image:linear-gradient(to_right,transparent_0%,black_28%,black_72%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_28%,black_72%,transparent_100%)] [mask-size:100%_100%]"
        >
          <LogoLoop
            logos={TECH_LOGOS}
            renderItem={renderTechLogo}
            speed={80}
            direction="left"
            logoHeight={56}
            gap={64}
            pauseOnHover
            fadeOut={false}
            scaleOnHover
            ariaLabel="Tecnologías que impulsan Yuni"
            className="py-6 pb-14"
          />
        </motion.div>

        {/* Tooltip en portal, posicionado debajo del icono hover */}
        {typeof document !== "undefined" &&
          hoveredTech &&
          tooltipAnchor &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm"
              style={{
                left: tooltipAnchor.x,
                top: tooltipAnchor.y,
                transform: "translate(-50%, 0)",
              }}
              aria-hidden
            >
              {hoveredTech}
            </div>,
            document.body
          )}
      </div>
    </section>
  );
}
