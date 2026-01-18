"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Agent } from "@/lib/schemas";
import { AgentEditor } from "@/components/AgentEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { Button } from "@/components/common";

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
      <div className="min-h-screen bg-[#0E0418] p-8">
        <div className="text-white">Cargando...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-[#0E0418] p-8">
        <div className="text-red-400">Error: {error || "Agente no encontrado"}</div>
        <Link href="/agents" className="text-[#D365FF] hover:underline mt-4 inline-block">
          ← Volver a Agentes
        </Link>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="min-h-screen bg-[#0E0418]">
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
    <div className="min-h-screen bg-[#0E0418] flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-white/10 p-6 overflow-y-auto bg-[#0E0418]">
        <div className="mb-6">
          <Link href="/agents" className="text-[#D365FF] hover:underline mb-4 inline-block text-sm">
            ← Volver a Agentes
          </Link>
          <h1 className="text-2xl font-bold mb-2 text-white">{agent.name}</h1>
          <p className="text-sm text-white/70 mb-4">{agent.description}</p>
        </div>

        <div className="space-y-4 mb-6">
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
        <div className="flex-1 flex flex-col h-[calc(100vh-5rem)]">
          <ChatPanel agentId={agentId} />
        </div>
      </div>
  );
}

