"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Logo } from "./Logo";

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
        bg-[#0E0418]/95 backdrop-blur-md
        border-b border-[#784EAB]
        transition-all duration-200
        ${className}
      `}
      style={{
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
                      ? "text-white bg-white/10"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                Agentes
              </Link>
            </nav>
          )}

          {session && (
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-white/10">
              <div className="px-4 py-2 glass rounded-lg border border-white/10">
                <span className="text-sm text-white/70">
                  {session.user?.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="px-5 py-2.5 text-sm font-medium glass rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-white/20 focus-gradient"
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

