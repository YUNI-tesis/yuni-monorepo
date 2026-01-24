"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Agent } from "@/lib/schemas";
import { fetchWithAuth } from "@/lib/fetch-client";
import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";

export function AgentsList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      setAgents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando agentes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 glass rounded-xl border border-red-500/30 bg-red-500/10">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="pb-8">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-cyan-500/20 flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-cyan-500/30 rounded-full blur-xl"></div>
            <svg className="w-16 h-16 text-purple-400 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h3 className="text-3xl font-bold gradient-text mb-3">No hay agentes creados aún</h3>
          <p className="text-gray-400 text-lg">Comienza creando tu primer agente de IA</p>
        </div>
        <Link
          href="/agents/new"
          className="inline-flex items-center gap-2 px-8 py-4 btn-gradient rounded-xl text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Crear primer agente
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-4xl font-bold gradient-text mb-2 tracking-tight">Tus Agentes</h2>
          <p className="text-gray-400">Gestiona tus asistentes de IA personalizados</p>
        </div>
        <Link
          href="/agents/new"
          className="inline-flex items-center gap-2 px-6 py-3 btn-gradient rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Nuevo Agente
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {agents.map((agent, index) => (
          <Link
            key={agent.id}
            href={`/agents/${agent.id}`}
            className="group relative block"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="glass-strong rounded-2xl p-6 h-full flex flex-col transition-all duration-300 hover-lift border border-white/10 hover:border-purple-500/50 relative overflow-hidden">
              {/* Gradient border on hover */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
              
              {/* Avatar 3D Model */}
              <div className="relative mb-4 aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10">
                <DynamicAvatarRenderer
                  modelPath="/assets/pennywise.glb"
                  style={{ width: "100%", height: "100%", minHeight: "150px" }}
                  className="rounded-xl"
                />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-cyan-400 transition-all duration-300">
                {agent.name}
              </h3>
              
              <p className="text-sm text-gray-400 line-clamp-2 mb-4 flex-grow">
                {agent.description || "Sin descripción"}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Activo
                </span>
                <div className="text-xs text-gray-500">
                  {new Date(agent.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

