"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "../common";

export function CTA() {
  const { data: session, status } = useSession();
  return (
    <section className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.h2 
            className="text-5xl md:text-6xl font-bold mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="gradient-text">¿Listo para comenzar?</span>
          </motion.h2>
          <motion.p 
            className="text-xl text-white/70 mb-12 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Únete a Yuni AI y comienza a crear tus propios agentes de IA personalizados hoy mismo. 
            Es gratis y solo toma unos minutos.
          </motion.p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {status === "loading" ? (
              <div className="h-16 w-56" /> // Placeholder while loading
            ) : session ? (
              <Link href="/agents">
                <Button size="lg" className="text-lg px-10 py-5">
                  Ir a Mis Agentes
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/register">
                  <Button size="lg" className="text-lg px-10 py-5">
                    Crear cuenta gratis
                  </Button>
                </Link>
                <Link href="/auth/login">
                  <Button variant="outline" size="lg" className="text-lg px-10 py-5">
                    Ya tengo cuenta
                  </Button>
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Decorative elements */}
      <motion.div
        className="absolute top-0 left-1/4 w-64 h-64 bg-[#BE6ADC] rounded-full blur-[100px] opacity-20"
        animate={{
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#64C3D7] rounded-full blur-[100px] opacity-20"
        animate={{
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </section>
  );
}
