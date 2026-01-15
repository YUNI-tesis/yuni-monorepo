"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Agent } from "@/lib/schemas";
import { AgentEditor } from "@/components/AgentEditor";
import { ChatPanel } from "@/components/ChatPanel";
import { Header } from "@/components/Header";

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
      <div className="min-h-screen relative bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen relative bg-[#0a0a0f]">
        <Header />
        <div className="max-w-[1920px] px-6 lg:px-8 py-12">
          <div className="glass rounded-xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="text-red-400 mb-4">Error: {error || "Agente no encontrado"}</p>
            <Link 
              href="/agents" 
              className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Agentes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="min-h-screen relative bg-[#0a0a0f]">
        <Header />
        <div className="max-w-[1920px] px-6 lg:px-8 py-12">
          <div className="pb-8">
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Cancelar edición
            </button>
            <h1 className="text-4xl font-bold gradient-text mb-2 tracking-tight">Editar Agente</h1>
            <p className="text-gray-400 text-lg">Modifica la configuración de tu agente</p>
          </div>
          <AgentEditor agentId={agentId} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-[#0a0a0f]">
      <Header />
      <div className="flex">
        {/* Sidebar */}
        <div className="w-96 glass-strong border-r border-white/10 p-6 overflow-y-auto h-[calc(100vh-5rem)]">
        <div className="pb-8">
          <Link 
            href="/agents" 
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a Agentes
          </Link>
          
          {/* Avatar */}
          <div className="relative mb-6">
            <div className="aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500/30 via-blue-500/30 to-cyan-500/30 flex items-center justify-center mb-4">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-400 via-blue-400 to-cyan-400 flex items-center justify-center text-5xl shadow-2xl">
                🤖
              </div>
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-2">{agent.name}</h1>
          <p className="text-sm text-gray-400 mb-6">{agent.description || "Sin descripción"}</p>
        </div>

        <div className="space-y-6 pb-8">
          <div className="glass rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              System Prompt
            </h3>
            <p className="text-xs text-gray-400 whitespace-pre-wrap glass rounded-lg p-3 border border-white/5 max-h-40 overflow-y-auto">
              {agent.systemPrompt}
            </p>
          </div>
          <div className="glass rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Contexto
            </h3>
            <p className="text-xs text-gray-400 whitespace-pre-wrap glass rounded-lg p-3 border border-white/5 max-h-40 overflow-y-auto">
              {agent.context || "Sin contexto"}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 px-4 py-3 btn-gradient rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Editar
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-3 bg-gradient-to-r from-red-600 to-pink-600 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 flex flex-col h-[calc(100vh-5rem)]">
          <ChatPanel agentId={agentId} />
        </div>
      </div>
    </div>
  );
}

