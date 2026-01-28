"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { useSession } from "next-auth/react";

/**
 * Conditionally renders the TopBar based on the current route
 * Hides TopBar on: landing (/), auth pages (login, register)
 */
export function ConditionalTopBar() {
  const pathname = usePathname();
  const session = useSession();

  if (session.status === "loading") {
    return null;
  }

  // No mostrar TopBar en landing ni en páginas de auth
  const isLanding = pathname === "/";
  const isAuthPage = pathname?.startsWith("/auth");
  if (isLanding || isAuthPage) {
    return null;
  }

  if (session.status === "authenticated") {
    return <TopBar showNavigation={true} />;
  }

  return null;
}
