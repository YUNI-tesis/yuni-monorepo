"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getPrivatePageMaxWidth, isPrivatePathname } from "./navigation";
import { PrivateAreaLayout } from "./PrivateAreaLayout";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (!isPrivatePathname(pathname)) {
    return <>{children}</>;
  }

  return <PrivateAreaLayout maxWidth={getPrivatePageMaxWidth(pathname)}>{children}</PrivateAreaLayout>;
}
