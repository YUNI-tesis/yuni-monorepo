"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Logo } from "./Logo";
import { ThemeSwitch } from "./ThemeSwitch";

export interface TopBarProps {
  showNavigation?: boolean;
  className?: string;
}

/**
 * YUNI TopBar Component
 */
export function TopBar({ showNavigation = true, className = "" }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + "/");
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <header
      className={`
        sticky top-0 z-50
        w-full
        border-b border-theme
        backdrop-blur-md
        transition-all duration-200
        ${className}
      `}
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-background) 95%, transparent)",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="w-full mx-auto px-6 py-4 flex items-center justify-between">
        <Logo size="md" />
        
        <div className="flex items-center gap-4">
          {showNavigation && (
            <nav className="flex items-center gap-1">
              <Link
                href="/agents"
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${
                    isActive("/agents")
                      ? "text-theme bg-surface-hover"
                      : "text-muted-theme hover:text-theme hover:bg-surface"
                  }
                `}
              >
                Agentes
              </Link>
            </nav>
          )}

          <ThemeSwitch />

          {session && (
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-theme">
              <div className="px-4 py-2 glass rounded-lg border border-theme">
                <span className="text-sm text-muted-theme">
                  {session.user?.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="px-5 py-2.5 text-sm font-medium glass rounded-lg text-muted-theme hover:text-theme hover:bg-surface-hover transition-all duration-200 border border-theme hover:border-theme-strong focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

