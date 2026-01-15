"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/auth/login");
    router.refresh();
  };

  if (!session) {
    return null;
  }

  return (
    <header className="glass-strong border-b border-white/10 sticky top-0 z-50">
      <div className="max-w-[1920px] px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-12">
            <Link href="/agents" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm"></div>
                </div>
              </div>
              <span className="text-2xl font-bold gradient-text tracking-tight">YUNI</span>
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link
                href="/agents"
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors relative py-2 group"
              >
                Agentes
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 group-hover:w-full transition-all duration-300"></span>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 glass rounded-lg border border-white/10">
              <span className="text-sm text-gray-300">
                {session.user.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="px-5 py-2.5 text-sm font-medium glass rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-white/20 focus-gradient"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
