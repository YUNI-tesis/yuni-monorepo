"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Agent } from "@/lib/schemas";
import { AgentEditor } from "@/components/AgentEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { AgentContextSection } from "@/components/AgentContextSection";
import { Button } from "@/components/common";
import { getReadyPlayerMeThumbnailUrl } from "@/lib/avatar-utils";

const DEFAULT_AVATAR_GLB = "https://models.readyplayer.me/697b77b6fd03bbd0ce0d0506.glb";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agentId) {
      fetchAgent();
    }
  }, [agentId]);

  async function fetchAgent() {
    try {
      setLoading(true);
      const res = await fetch(`/api/agents/${agentId}`);
      if (!res.ok) throw new Error("Failed to fetch agent");
      const data: Agent = await res.json();
      setAgent(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("¿Estás seguro de que quieres eliminar este agente?")) return;

    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete agent");
      router.push("/agents");
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-5rem)] bg-background p-8 overflow-y-auto">
        <div className="text-foreground">Cargando...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="h-[calc(100vh-5rem)] bg-background p-8 overflow-y-auto">
        <div className="text-error-theme" role="alert">Error: {error || "Agente no encontrado"}</div>
        <Link href="/agents" className="text-accent-theme hover:underline mt-4 inline-block">
          ← Volver a Agentes
        </Link>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto p-8">
          <div className="mb-6">
          <button
              onClick={() => setEditing(false)}
              className="text-accent-theme hover:underline mb-4 inline-block text-sm cursor-pointer"
            >
              ← Cancelar edición
            </button>
            <h1 className="text-3xl font-bold text-foreground">Editar Agente</h1>
          </div>
          <AgentEditor agentId={agentId} onEditSuccess={() => setEditing(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-5rem)] bg-background flex overflow-hidden">
      {/* Sidebar - Always visible */}
      <div className="w-80 border-r border-theme p-6 overflow-y-auto bg-background flex-shrink-0 z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2 text-foreground">{agent.name}</h1>
          <p className="text-sm text-muted-foreground mb-4">{agent.description}</p>
        </div>

        {/* Avatar 2D render (RPM thumbnail) */}
        <div className="mb-6 w-full">
          <div className="relative w-full aspect-square min-h-[200px] rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10">
            <img
              src={getReadyPlayerMeThumbnailUrl(DEFAULT_AVATAR_GLB, { size: 512 })}
              alt=""
              className="w-full h-full object-cover object-center rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold mb-2 text-foreground">Voz</h3>
            <div className="bg-surface p-3 rounded-lg border border-theme">
              {agent.voice ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-purple-300">
                      {agent.voice.provider === "openai" ? "OpenAI Realtime" : "ElevenLabs"}
                    </span>
                    {agent.voice.provider === "openai" && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-success-theme rounded">
                        Baja latencia
                      </span>
                    )}
                  </div>
                    <p className="text-xs text-muted-foreground">
                    Voz: <span className="text-muted-strong-theme">{agent.voice.voiceId}</span>
                  </p>
                  {agent.voice.speakingRate && agent.voice.speakingRate !== 1.0 && (
                    <p className="text-xs text-muted-foreground">
                      Velocidad: <span className="text-muted-strong-theme">{agent.voice.speakingRate}x</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-theme">Voz predeterminada (OpenAI Alloy)</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 text-foreground">System Prompt</h3>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-surface p-3 rounded-lg border border-theme">
              {agent.systemPrompt}
            </p>
          </div>
          <AgentContextSection
            agentId={agentId}
            readOnly={true}
            contextText={agent.context ?? ""}
            variant="sidebar"
          />
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => setEditing(true)}
            variant="primary"
            size="md"
            className="flex-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </Button>
          <Button
            onClick={handleDelete}
            variant="destructive"
            size="md"
            className="flex-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </Button>
        </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatPanel agentId={agentId} />
        </div>
      </div>
  );
}

