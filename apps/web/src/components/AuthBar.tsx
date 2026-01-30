"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeSwitch } from "./ThemeSwitch";

/**
 * Barra mínima para páginas de auth (login/register): logo + switch de tema.
 */
export function AuthBar() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b border-theme backdrop-blur-md"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-background) 95%, transparent)" }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Ir al inicio">
          <Logo size="md" />
        </Link>
        <ThemeSwitch />
      </div>
    </header>
  );
}
