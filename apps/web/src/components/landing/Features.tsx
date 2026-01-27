"use client";

import { motion } from "framer-motion";
import { MouseTrackingCard } from "./MouseTrackingCard";

const features = [
  {
    title: "Multi-Agente",
    description: "Crea y gestiona múltiples agentes de IA, cada uno con su propia personalidad, conocimiento y capacidades únicas.",
    icon: "🤖",
  },
  {
    title: "Chat Inteligente",
    description: "Conversa con tus agentes mediante chat en tiempo real con streaming de respuestas para una experiencia fluida.",
    icon: "💬",
  },
  {
    title: "Voz Natural",
    description: "Interactúa con tus agentes por voz usando tecnología de síntesis de voz avanzada y reconocimiento de voz.",
    icon: "🎤",
  },
  {
    title: "Avatares 3D",
    description: "Visualiza tus agentes con avatares 3D inmersivos que sincronizan labios y gestos con el audio en tiempo real.",
    icon: "👤",
  },
  {
    title: "RAG y Documentos",
    description: "Sube documentos (PDF, TXT, DOCX) y tus agentes usarán ese conocimiento para responder con precisión.",
    icon: "📚",
  },
  {
    title: "Seguridad Avanzada",
    description: "Sistema de guardrails que previene inyección de prompts, filtra información sensible y mantiene el control de alcance.",
    icon: "🔒",
  },
  {
    title: "Seguimiento de Costos",
    description: "Monitorea en tiempo real el uso de tokens y costos estimados por conversación y mensaje.",
    icon: "💰",
  },
  {
    title: "Personalización Total",
    description: "Define system prompts estrictos, contexto personalizado y herramientas específicas para cada agente.",
    icon: "⚙️",
  },
];

export function Features() {
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
            <span className="gradient-text">Características</span>
          </motion.h2>
          <motion.p 
            className="text-xl text-white/70 max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Todo lo que necesitas para crear y gestionar agentes de IA profesionales
          </motion.p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 60, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ 
                delay: index * 0.08, 
                duration: 0.5,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
            >
              <MouseTrackingCard className="card p-6 hover:border-white/30 transition-all duration-300 cursor-pointer h-full">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{feature.description}</p>
              </MouseTrackingCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
