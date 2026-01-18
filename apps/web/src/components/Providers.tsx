"use client";

import { SessionProvider } from "next-auth/react";
import { ConditionalTopBar } from "./ConditionalTopBar";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ConditionalTopBar />{children}</SessionProvider>;
}
