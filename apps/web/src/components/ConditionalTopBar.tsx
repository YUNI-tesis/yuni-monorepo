"use client";

import { TopBar } from "./TopBar";
import { useSession } from "next-auth/react";

/**
 * Conditionally renders the TopBar based on the current route
 * Hides TopBar on authentication pages (login, register)
 */
export function ConditionalTopBar() {

  const session = useSession();

  if (session.status === "loading") {
    return null;
  }

  if (session.status === "authenticated") {
    return <TopBar showNavigation={true} />;
  }

  return null;
}
