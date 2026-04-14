"use client";

import { useEffect, useState } from "react";
import { AgentAvatarFallback } from "@/components/AgentAvatarFallback";
import type { AgentAvatar } from "@/lib/schemas";
import type { HeyGenAvatarOption } from "@/lib/heygen";

interface AgentAvatarPreviewProps {
  avatar?: AgentAvatar;
  name: string;
  className?: string;
}

export function AgentAvatarPreview({
  avatar,
  name,
  className = "",
}: AgentAvatarPreviewProps) {
  const [fetchedPreviewUrl, setFetchedPreviewUrl] = useState<string | undefined>(undefined);
  const resolvedPreviewUrl =
    avatar?.provider === "heygen" ? avatar.previewImageUrl || fetchedPreviewUrl : undefined;

  useEffect(() => {
    if (avatar?.provider !== "heygen" || avatar.previewImageUrl || !avatar.avatarId) {
      return;
    }

    let cancelled = false;
    const avatarId = avatar.avatarId;

    async function resolvePreview() {
      try {
        const response = await fetch("/api/heygen/avatars", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { avatars?: HeyGenAvatarOption[] };
        const matchedAvatar = data.avatars?.find((item) => item.avatarId === avatarId);

        if (!cancelled) {
          setFetchedPreviewUrl(matchedAvatar?.previewImageUrl);
        }
      } catch {
        if (!cancelled) {
          setFetchedPreviewUrl(undefined);
        }
      }
    }

    void resolvePreview();

    return () => {
      cancelled = true;
    };
  }, [avatar]);

  if (avatar?.provider === "heygen" && resolvedPreviewUrl) {
    return (
      <div
        aria-label={`${name} avatar preview`}
        role="img"
        className={`relative overflow-hidden rounded-xl bg-slate-950 ${className}`.trim()}
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.14), rgba(15,23,42,0.5)), url(${resolvedPreviewUrl})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-4">
          <div className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-100">
            HeyGen LiveAvatar
          </div>
        </div>
      </div>
    );
  }

  return <AgentAvatarFallback name={name} className={className} />;
}
