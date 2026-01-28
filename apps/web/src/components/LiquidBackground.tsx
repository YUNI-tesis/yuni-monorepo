"use client";

import LiquidEther from "./LiquidEther";

/**
 * Fondo líquido global optimizado para toda la app.
 * Usa parámetros más livianos (menor resolución e iteraciones) para fluir mejor.
 */
export function LiquidBackground() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
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
    </div>
  );
}
