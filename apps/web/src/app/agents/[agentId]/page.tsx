"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Agent } from "@/lib/schemas";
import { AgentEditor } from "@/components/AgentEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { Header } from "@/components/Header";
import { DocumentsSection } from "@/components/DocumentsSection";
import { fetchWithAuth } from "@/lib/fetch-client";

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
      const res = await fetchWithAuth(`/api/agents/${agentId}`);
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
      const res = await fetchWithAuth(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete agent");
      router.push("/agents");
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black p-8">
        <div>Cargando...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-white dark:bg-black p-8">
        <div className="text-red-600">Error: {error || "Agente no encontrado"}</div>
        <Link href="/agents" className="text-blue-600 hover:underline mt-4 inline-block">
          ← Volver a Agentes
        </Link>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col">
        <Header />
        <div className="max-w-4xl mx-auto p-8 flex-1">
          <div className="mb-6">
            <button
              onClick={() => setEditing(false)}
              className="text-blue-600 hover:underline mb-4 inline-block"
            >
              ← Cancelar edición
            </button>
            <h1 className="text-3xl font-bold">Editar Agente</h1>
          </div>
          <AgentEditor agentId={agentId} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r p-6 overflow-y-auto">
        <div className="mb-6">
          <Link href="/agents" className="text-blue-600 hover:underline mb-4 inline-block">
            ← Volver a Agentes
          </Link>
          <h1 className="text-2xl font-bold mb-2">{agent.name}</h1>
          <p className="text-sm text-gray-600 mb-4">{agent.description}</p>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">System Prompt</h3>
            <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded">
              {agent.systemPrompt}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Contexto</h3>
            <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-40 overflow-y-auto">
              {agent.context || "Sin contexto"}
            </p>
          </div>
          <DocumentsSection agentId={agentId} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Editar
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Eliminar
          </button>
        </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel agentId={agentId} />
        </div>
      </div>
    </div>
  );
}

