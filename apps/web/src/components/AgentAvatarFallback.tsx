"use client";

import { getAgentInitials } from "@/lib/avatar-config";

interface AgentAvatarFallbackProps {
  name: string;
  className?: string;
}

export function AgentAvatarFallback({
  name,
  className = "",
}: AgentAvatarFallbackProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.28),_transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] ${className}`.trim()}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.04),transparent)]" />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/8 text-2xl font-semibold tracking-[0.2em] text-white shadow-[0_18px_60px_rgba(14,165,233,0.18)]">
          {getAgentInitials(name)}
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">
            Avatar
          </p>
          <p className="text-sm text-white/70">
            Listo para conectar con HeyGen
          </p>
        </div>
      </div>
    </div>
  );
}
