"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetch-client";
import type { Agent } from "@/lib/schemas";
import type {
  AvatarRuntime,
  HeyGenRuntimeState,
  LiveCallRuntime,
} from "./types";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function useLiveCallRuntime(agentId: string): LiveCallRuntime {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [avatarRuntime, setAvatarRuntime] = useState<AvatarRuntime>("builtin");
  const [heyGenState, setHeyGenState] = useState<HeyGenRuntimeState>("idle");
  const [heyGenSessionToken, setHeyGenSessionToken] = useState<string | null>(null);
  const [avatarWarning, setAvatarWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setRuntimeReady(false);
        setRuntimeError(null);
        setAvatarWarning(null);
        setHeyGenSessionToken(null);
        setHeyGenState("idle");
        setAvatarRuntime("builtin");

        const agentResponse = await fetchWithAuth(`/api/agents/${agentId}`);
        if (!agentResponse.ok) {
          throw new Error("No pudimos cargar la configuración del agente.");
        }

        const nextAgent = (await agentResponse.json()) as Agent;
        if (cancelled) {
          return;
        }

        setAgent(nextAgent);

        const wantsHeyGen =
          nextAgent.avatar?.provider === "heygen" &&
          Boolean(nextAgent.avatar.avatarId);

        setAvatarRuntime(wantsHeyGen ? "heygen" : "builtin");
        setRuntimeReady(true);

        if (!wantsHeyGen || !nextAgent.avatar?.avatarId) {
          return;
        }

        setHeyGenState("loading");

        const sessionTokenResponse = await fetchWithAuth("/api/heygen/session-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatarId: nextAgent.avatar.avatarId,
            metadata: nextAgent.avatar.metadata,
          }),
        });

        if (!sessionTokenResponse.ok) {
          const payload = (await sessionTokenResponse.json().catch(() => null)) as
            | { error?: string }
            | null;

          if (!cancelled) {
            setHeyGenState("failed");
            setAvatarWarning(
              payload?.error ||
                "No pudimos conectar el avatar en esta llamada. La conversación sigue con la voz del agente."
            );
          }
          return;
        }

        const tokenPayload = (await sessionTokenResponse.json()) as {
          sessionToken?: string;
        };

        if (!tokenPayload.sessionToken) {
          if (!cancelled) {
            setHeyGenState("failed");
            setAvatarWarning(
              "No recibimos un token válido para el avatar. La conversación sigue con la voz del agente."
            );
          }
          return;
        }

        if (!cancelled) {
          setHeyGenSessionToken(tokenPayload.sessionToken);
          setHeyGenState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setRuntimeError(
            getErrorMessage(error, "No pudimos preparar la llamada para este agente.")
          );
          setRuntimeReady(true);
          setAvatarRuntime("builtin");
          setHeyGenState("failed");
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return {
    agent,
    runtimeReady,
    runtimeError,
    avatarRuntime,
    heyGenState,
    heyGenSessionToken,
    avatarWarning,
    setAvatarWarning,
    canUseHeyGen: heyGenState === "ready" && Boolean(heyGenSessionToken),
  };
}
