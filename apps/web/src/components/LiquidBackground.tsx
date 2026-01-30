"use client";

import LiquidEther from "./LiquidEther";

/**
 * Fondo líquido global optimizado para toda la app.
 * En light theme se aplica un overlay claro para no restar legibilidad (ver globals.css .liquid-bg-overlay).
 */
export function LiquidBackground() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none liquid-bg-container"
      aria-hidden
    >
      <LiquidEther
        colors={["#BE6ADC", "#64C3D7", "#D365FF"]}
        mouseForce={15}
        cursorSize={70}
        resolution={0.35}
        iterationsViscous={16}
        iterationsPoisson={16}
        autoDemo={true}
        autoSpeed={0.5}
        autoIntensity={2.2}
      />
      <div className="liquid-bg-overlay absolute inset-0 pointer-events-none" aria-hidden />
    </div>
  );
}
