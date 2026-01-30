"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Logo } from "../Logo";
import { Button } from "../common";
import { ThemeSwitch } from "../ThemeSwitch";

export function LandingNavbar() {
  const { data: session, status } = useSession();

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-theme backdrop-blur-md"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-background) 80%, transparent)" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Logo size="lg" />
        
        <div className="flex items-center gap-4">
          <ThemeSwitch />
          {status === "loading" ? (
            <div className="w-20 h-8" /> // Placeholder while loading
          ) : session ? (
            <>
              <Link href="/agents">
                <Button variant="ghost" size="md">
                  Mis Agentes
                </Button>
              </Link>
              <Link href="/agents">
                <Button size="md">
                  Ir al Dashboard
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost" size="md">
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button size="md">
                  Comenzar
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
