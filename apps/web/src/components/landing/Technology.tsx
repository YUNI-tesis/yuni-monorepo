"use client";

import { motion } from "framer-motion";
import { MouseTrackingCard } from "./MouseTrackingCard";

const technologies = [
  {
    name: "Next.js",
    description: "Framework React de última generación para aplicaciones web rápidas y escalables",
    color: "from-white to-gray-400",
  },
  {
    name: "LangGraph",
    description: "Sistema de agentes basado en grafos para orquestación compleja de IA",
    color: "from-[#BE6ADC] to-[#784EAB]",
  },
  {
    name: "OpenAI",
    description: "Modelos de lenguaje avanzados para conversaciones naturales y contextuales",
    color: "from-[#64C3D7] to-[#4A9FB8]",
  },
  {
    name: "Three.js",
    description: "Renderizado 3D en tiempo real para avatares inmersivos con sincronización de labios",
    color: "from-[#D365FF] to-[#BE6ADC]",
  },
  {
    name: "WebRTC",
    description: "Comunicación en tiempo real de baja latencia para llamadas de voz fluidas",
    color: "from-[#64C3D7] to-[#4A9FB8]",
  },
  {
    name: "Azure Blob",
    description: "Almacenamiento escalable y seguro para documentos y archivos multimedia",
    color: "from-[#BE6ADC] to-[#64C3D7]",
  },
];

export function Technology() {
  return (
    <section className="relative py-32 px-6">
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

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {technologies.map((tech, index) => (
            <motion.div
              key={tech.name}
              initial={{ opacity: 0, y: 60, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ 
                delay: index * 0.1, 
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
            >
              <MouseTrackingCard className="card p-6 hover:border-white/30 transition-all duration-300">
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${tech.color} mb-4 flex items-center justify-center text-white font-bold text-lg`}>
                  {tech.name[0]}
                </div>
                <h3 className="text-xl font-bold mb-2">{tech.name}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{tech.description}</p>
              </MouseTrackingCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
