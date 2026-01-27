"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "../common";
import { ScrollIndicator } from "./ScrollIndicator";
import LiquidEther from "../LiquidEther";
import { AnimatedLogo } from "../AnimatedLogo";

export function Hero() {
  const { data: session, status } = useSession();

  return (
    <section className="relative h-[94vh] w-full overflow-hidden bg-[#0E0418]">
      {/* Liquid Ether Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <LiquidEther
          colors={['#BE6ADC', '#64C3D7', '#D365FF']}
          mouseForce={15}
          cursorSize={70}
          resolution={0.5}
          autoDemo={true}
          autoSpeed={0.5}
          autoIntensity={2.2}
        />
      </div>
      
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03] z-[1] pointer-events-none">
        <div 
          className="w-full h-full"
          style={{
            backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />
      </div>
      
      {/* Content Container */}
      <div className="relative z-20 w-full h-full flex items-center justify-center">
      {/* Animated gradient background */}
      {/* <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(190, 106, 220, 0.6) 0%, rgba(190, 106, 220, 0) 70%)",
          }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 100, 0],
            y: [0, 50, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(100, 195, 215, 0.6) 0%, rgba(100, 195, 215, 0) 70%)",
          }}
          animate={{
            scale: [1, 1.3, 1],
            x: [0, -100, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-[500px] h-[500px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(211, 101, 255, 0.5) 0%, rgba(211, 101, 255, 0) 70%)",
            transform: "translate(-50%, -50%)",
          }}
          animate={{
            scale: [1, 1.15, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div> */}

      {/* Content */}
      <div className="w-full max-w-7xl mx-auto px-6 py-8 md:py-16" >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center"
        >
          {/* Logo animado */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.8 }}
            className="mb-4 md:mb-6"
          >
            <div className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
              <AnimatedLogo className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(190,106,220,0.5)]" />
            </div>
          </motion.div>

          {/* Título */}
          <motion.h1
            className="text-6xl md:text-8xl font-bold mb-3 md:mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <span 
              className="gradient-text"
              style={{
                textShadow: "0 0 40px rgba(190, 106, 220, 0.3)",
              }}
            >
              YUNI
            </span>
          </motion.h1>
          
          <motion.p
            className="text-lg md:text-xl text-white/90 mb-2 md:mb-3 max-w-3xl mx-auto font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            Plataforma multi-agente de IA
          </motion.p>

          <motion.p
            className="text-sm md:text-base text-white/60 mb-6 md:mb-8 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
          >
            Crea, gestiona y conversa con agentes de IA personalizados con voz y avatares 3D
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
          >
            {status === "loading" ? (
              <div className="h-14 w-48" />
            ) : session ? (
              <Link href="/agents">
                <Button size="lg" className="text-lg px-8 py-4">
                  Ir a Mis Agentes
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/register">
                  <Button size="lg" className="text-lg px-8 py-4">
                    Comenzar gratis
                  </Button>
                </Link>
                <Link href="/auth/login">
                  <Button variant="outline" size="lg" className="text-lg px-8 py-4">
                    Iniciar sesión
                  </Button>
                </Link>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
      </div>

      <div className="relative z-20">
        <ScrollIndicator />
      </div>
    </section>
  );
}
