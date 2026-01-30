"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/lib/theme-provider";
import { ConditionalTopBar } from "./ConditionalTopBar";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ConditionalTopBar />
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
}
