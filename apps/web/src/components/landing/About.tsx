"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { People, Monitor, Setting2 } from "iconsax-react";
import ScrollStack, { ScrollStackItem } from "@/components/common/ScrollStack/ScrollStack";

const VISION_CARDS = [
  {
    title: "Interacción más humana",
    description: "IA que se comunica con voz, gestos y presencia, no solo texto.",
    mainColor: "#E6398D",
    offsetColor: "#4b30e0",
    number: "01",
    Icon: People,
  },
  {
    title: "Experiencias inmersivas",
    description: "Diálogos en tiempo real con avatares 3D que se sienten naturales.",
    mainColor: "#4b30e0",
    offsetColor: "#8a2be2",
    number: "02",
    Icon: Monitor,
  },
  {
    title: "Personalización con propósito",
    description: "Cada agente se adapta en apariencia, voz y contexto a tu medida.",
    mainColor: "#be6adc",
    offsetColor: "#4b30e0",
    number: "03",
    Icon: Setting2,
  },
];

export function About() {
  // Fotos: guardar en apps/web/public/assets/founders/ (ej: santiago.jpg, lucas.jpg)
  // Luego usar: image: "/assets/founders/santiago.jpg"
  const founders = [
    {
      name: "Santiago Peres",
      handle: "santiagoperes",
      role: "Co-Founder",
      title: "Full Stack Developer",
      image: "/assets/founders/santiago.jpeg",
    },
    {
      name: "Lucas Lovaglio",
      handle: "lucaslovaglio",
      role: "Co-Founder",
      title: "Full Stack Developer",
      image: "/assets/founders/lucas.jpeg",
    },
  ];

  return (
    <section className="relative py-32 px-6 pb-0">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-20"
        >
          <motion.h2 
            className="text-5xl md:text-6xl font-bold mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="gradient-text">Quiénes Somos</span>
          </motion.h2>
          <motion.p 
            className="text-xl text-white/70 max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Somos dos apasionados desarrolladores que creemos en el poder de la IA conversacional 
            para transformar la forma en que interactuamos con la tecnología.
          </motion.p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 mb-20 max-w-2xl mx-auto items-stretch">
          {founders.map((founder, index) => (
            <motion.div
              key={founder.name}
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ 
                delay: index * 0.15, 
                duration: 0.7,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
              className="group h-full flex"
            >
              <div 
                className="relative overflow-hidden rounded-2xl bg-[#0E0418]/90 border border-white/[0.06] backdrop-blur-md transition-all duration-300 flex flex-col w-full shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(190,106,220,0.08),0_20px_40px_-12px_rgba(0,0,0,0.4)] group-hover:border-[#8A2BE2]/50 group-hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(190,106,220,0.18),0_24px_48px_-12px_rgba(0,0,0,0.5),0_0_40px_-10px_rgba(138,43,226,0.2)]"
              >
                {/* Imagen o avatar con gradiente */}
                <div className="relative aspect-[3/4] rounded-t-xl overflow-hidden bg-gradient-to-br from-[#2D2A4A] via-[#1E1B31] to-[#1A1A2E]">
                  {founder.image ? (
                    <Image
                      src={founder.image}
                      alt={founder.name}
                      fill
                      className="object-cover object-top"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#3D3A5C]/80 via-[#2D2A4A] to-[#1E1B31]">
                      <span className="text-4xl md:text-5xl font-bold text-white/90 tracking-tighter">
                        {founder.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                    </div>
                  )}
                  {/* Overlay sutil para transición al texto */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A2E]/40 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Texto: nombre, handle, rol */}
                <div className="p-4 flex-shrink-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {founder.name}
                    </h3>
                    <span className="text-xs text-white/50 flex-shrink-0">
                      @{founder.handle}
                    </span>
                  </div>
                  <p className="text-[#64C3D7] font-medium text-sm">
                    {founder.title}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Nuestra visión: ScrollStack con 3 pilares */}
        <div className="max-w-4xl mx-auto mt-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <h3 className="text-2xl md:text-3xl font-bold mb-2">
              <span className="gradient-text">Nuestra Visión</span>
            </h3>
            <div className="h-px w-24 rounded-full bg-gradient-to-r from-[#BE6ADC] via-[#8A2BE2] to-[#64C3D7] mx-auto" />
          </motion.div>

          <ScrollStack
            useWindowScroll
            itemDistance={80}
            itemScale={0.04}
            itemStackDistance={20}
            stackPosition="15%"
            scaleEndPosition="12%"
            baseScale={0.88}
            className="!overflow-visible !h-auto w-full"
          >
            {VISION_CARDS.map((card) => {
              const VisionIcon = card.Icon;
              return (
              <ScrollStackItem
                key={card.title}
                itemClassName="!h-auto !min-h-0 !p-0 !shadow-none overflow-visible"
              >
                {/* Wrapper: gradiente como borde con border-radius completo */}
                <div
                  className="group/vision relative z-10  rounded-[28px] p-[1px] min-h-[380px] shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${card.mainColor} 0%, ${card.offsetColor} 50%, ${card.mainColor} 100%)`,
                    boxShadow: "0 24px 48px -12px rgba(0,0,0,0.5)",
                  }}
                >
                  {/* Contenido opaco: mismo radio menos 1px para que el borde se vea parejo en las esquinas */}
                  <div
                    className="relative flex items-center justify-between gap-8 rounded-[40px] px-8 py-10 md:px-12 md:py-14 min-h-[calc(380px-2px)] overflow-hidden transition-all duration-300"
                    style={{
                      background: `linear-gradient(135deg, #0E0418 0%, #14102a 50%, #0E0418 100%)`,
                    }}
                  >
                    {/* Inner glow (dentro del área opaca) */}
                    <div
                      className="absolute -top-1/2 -right-1/4 w-[80%] h-[120%] rounded-full opacity-20 blur-[80px] pointer-events-none"
                      style={{
                        background: `radial-gradient(circle, ${card.mainColor}90 0%, ${card.offsetColor}40 40%, transparent 70%)`,
                      }}
                    />
                    {/* Grid sutil */}
                    <div
                      className="absolute inset-0 opacity-[0.04] pointer-events-none"
                      style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)`,
                        backgroundSize: "32px 32px",
                      }}
                    />

                    <div className="relative z-10 flex flex-1 items-center justify-between gap-8 min-w-0">
                    <div className="flex-1 min-w-0 pr-4">
                      <span
                        className="inline-block text-xs font-semibold tracking-[0.2em] uppercase mb-4 opacity-90"
                        style={{
                          background: `linear-gradient(90deg, ${card.mainColor}, ${card.offsetColor})`,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        {card.number}
                      </span>
                      <h4 className="text-2xl md:text-3xl lg:text-[2rem] font-bold text-white tracking-tight leading-tight">
                        {card.title}
                      </h4>
                      <p className="mt-4 text-[15px] md:text-base text-white/75 leading-relaxed max-w-xl">
                        {card.description}
                      </p>
                    </div>

                    {/* Icono temático por card — más grande */}
                    <div className="flex-shrink-0 relative">
                      <div
                        className="flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-2xl transition-all duration-300 group-hover/vision:scale-105"
                        style={{
                          background: `linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)`,
                          boxShadow: `
                            inset 0 1px 0 0 rgba(255,255,255,0.2),
                            0 0 0 1px rgba(255,255,255,0.1),
                            0 0 24px -4px ${card.mainColor}80
                          `,
                        }}
                      >
                        <VisionIcon size={44} color="#ffffff" variant="Bulk" />
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </ScrollStackItem>
              );
            })}
            <ScrollStackItem>
              <></>
            </ScrollStackItem>
          </ScrollStack>
        </div>
      </div>
    </section>
  );
}
