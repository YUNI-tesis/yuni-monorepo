"use client";

import { usePathname } from "next/navigation";
import { LiquidBackground } from "@/components/LiquidBackground";

/** Renders LiquidBackground only on the landing page (/) to avoid heavy canvas on app pages. */
export function LiquidBackgroundLandingOnly() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <LiquidBackground />;
}
