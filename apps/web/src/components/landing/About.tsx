"use client";

import { motion } from "framer-motion";
import { MouseTrackingCard } from "./MouseTrackingCard";

export function About() {
  const founders = [
    {
      name: "Santiago Peres",
      role: "Co-Founder",
      description: "Especialista en arquitectura de sistemas y desarrollo de plataformas escalables",
    },
    {
      name: "Lucas Lovaglio",
      role: "Co-Founder",
      description: "Experto en IA, machine learning y experiencia de usuario",
    },
  ];

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

        <div className="grid md:grid-cols-2 gap-12 mb-20">
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
            >
              <MouseTrackingCard className="card p-8 hover:border-white/20 transition-all duration-300">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
                    {founder.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold mb-2">{founder.name}</h3>
                    <p className="text-[#64C3D7] mb-4 font-medium">{founder.role}</p>
                    <p className="text-white/70">{founder.description}</p>
                  </div>
                </div>
              </MouseTrackingCard>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ 
            duration: 0.8, 
            delay: 0.3,
            ease: [0.25, 0.46, 0.45, 0.94]
          }}
          className="card p-12 text-center"
        >
          <h3 className="text-3xl font-bold mb-6">Nuestra Visión</h3>
          <p className="text-lg text-white/80 max-w-3xl mx-auto leading-relaxed mb-6">
            Creemos que cada persona debería poder crear su propio asistente de IA personalizado, 
            con conocimiento específico y una personalidad única. Yuni AI democratiza el acceso a 
            la tecnología de agentes conversacionales, permitiendo a cualquier persona crear, 
            personalizar y desplegar agentes de IA sin necesidad de conocimientos técnicos avanzados.
          </p>
          <p className="text-lg text-white/70 max-w-3xl mx-auto leading-relaxed">
            Nuestra plataforma combina lo mejor de la inteligencia artificial conversacional, 
            procesamiento de lenguaje natural, síntesis de voz y renderizado 3D para crear 
            experiencias verdaderamente inmersivas. Cada agente que creas es único, con su propio 
            conocimiento, personalidad y capacidades, listo para ayudarte en cualquier tarea.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
