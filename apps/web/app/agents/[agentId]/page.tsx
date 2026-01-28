"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Agent } from "@/lib/schemas";
import { AgentEditor } from "@/components/AgentEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { Button } from "@/components/common";
import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";

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
      <div className="h-[calc(100vh-5rem)] bg-[#0E0418] p-8 overflow-y-auto">
        <div className="text-white">Cargando...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="h-[calc(100vh-5rem)] bg-[#0E0418] p-8 overflow-y-auto">
        <div className="text-red-400">Error: {error || "Agente no encontrado"}</div>
        <Link href="/agents" className="text-[#D365FF] hover:underline mt-4 inline-block">
          ← Volver a Agentes
        </Link>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="h-[calc(100vh-5rem)] bg-[#0E0418] overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          <div className="mb-6">
          <button
              onClick={() => setEditing(false)}
              className="text-[#D365FF] hover:underline mb-4 inline-block text-sm cursor-pointer"
            >
              ← Cancelar edición
            </button>
            <h1 className="text-3xl font-bold text-white">Editar Agente</h1>
          </div>
          <AgentEditor agentId={agentId} onEditSuccess={() => setEditing(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-5rem)] bg-[#0E0418] flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-white/10 p-6 overflow-y-auto bg-[#0E0418] flex-shrink-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2 text-white">{agent.name}</h1>
          <p className="text-sm text-white/70 mb-4">{agent.description}</p>
        </div>

        {/* Avatar Preview */}
        <div className="mb-6">
          <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10">
            <DynamicAvatarRenderer
              modelPath="/assets/pennywise-rigged.glb"
              style={{ width: "100%", height: "100%", minHeight: "250px" }}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold mb-2 text-white">Voz</h3>
            <div className="bg-white/5 p-3 rounded-lg border border-white/10">
              {agent.voice ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-purple-300">
                      {agent.voice.provider === "openai" ? "OpenAI Realtime" : "ElevenLabs"}
                    </span>
                    {agent.voice.provider === "openai" && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">
                        Baja latencia
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/60">
                    Voz: <span className="text-white/80">{agent.voice.voiceId}</span>
                  </p>
                  {agent.voice.speakingRate && agent.voice.speakingRate !== 1.0 && (
                    <p className="text-xs text-white/60">
                      Velocidad: <span className="text-white/80">{agent.voice.speakingRate}x</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-white/40">Voz predeterminada (OpenAI Alloy)</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 text-white">System Prompt</h3>
            <p className="text-xs text-white/60 whitespace-pre-wrap bg-white/5 p-3 rounded-lg border border-white/10">
              {agent.systemPrompt}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 text-white">Contexto</h3>
            <p className="text-xs text-white/60 whitespace-pre-wrap bg-white/5 p-3 rounded-lg border border-white/10 max-h-40 overflow-y-auto">
              {agent.context || "Sin contexto"}
            </p>
          </div>
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

