"use client";

import { useState, useEffect } from "react";
import { Agent, CreateAgentSchema } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetch-client";
import { Button } from "@/components/common";
import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";

interface AgentEditorProps {
  agentId?: string;
  onEditSuccess?: () => void;
}

export function AgentEditor({ agentId, onEditSuccess }: AgentEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!agentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    context: "",
    toolsAllowed: ["none"] as ("none" | "basic")[],
  });

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
      const agent: Agent = await res.json();
      setFormData({
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        context: agent.context,
        toolsAllowed: agent.toolsAllowed,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = agentId ? `/api/agents/${agentId}` : "/api/agents";
      const method = agentId ? "PATCH" : "POST";
      const res = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save agent");
      }

      const agent: Agent = await res.json();
      onEditSuccess?.();
      router.push(`/agents/${agent.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-8 border border-white/10">
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="glass rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Avatar Preview Section */}
        <div className="flex flex-col items-center pb-6 border-b border-white/10">
          <div className="relative mb-4 w-full max-w-md aspect-square">
            <DynamicAvatarRenderer
              modelPath="/assets/pennywise-rigged.glb"
              style={{ width: "100%", height: "100%" }}
              className="rounded-xl overflow-hidden"
              cameraControls={true}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Basic Info */}
          <div className="lg:col-span-1 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 pb-2">
                Nombre del agente
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all bg-white/5 focus-gradient"
                placeholder="Mi Agente"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 pb-2">
                Descripción
                <span className="text-gray-500 text-xs font-normal ml-2">(máx. 500 caracteres)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                maxLength={500}
                rows={4}
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all bg-white/5 focus-gradient resize-none"
                placeholder="Describe el propósito y función de tu agente..."
              />
              <p className="pt-2 text-xs text-gray-500 text-right">
                {formData.description.length}/500
              </p>
            </div>
          </div>

          {/* Right Column - Prompts */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 pb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                System Prompt (Rol estricto)
              </label>
              <textarea
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                required
                rows={8}
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all bg-white/5 focus-gradient font-mono text-sm resize-none"
                placeholder="Define el rol y comportamiento estricto del agente..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 pb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Contexto (Base de conocimiento)
              </label>
              <textarea
                value={formData.context}
                onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                rows={10}
                className="w-full px-4 py-3 glass rounded-xl border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all bg-white/5 focus-gradient resize-none"
                placeholder="Información y conocimiento que el agente debe usar..."
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-6 border-t border-white/10">
          <Button
            type="submit"
            isLoading={saving}
            size="lg"
            variant="primary"
            className="shadow-lg hover:shadow-xl"
          >
            {!saving && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {saving ? "Guardando..." : agentId ? "Actualizar Agente" : "Crear Agente"}
          </Button>
          {agentId && (
            <Button
              type="button"
              onClick={() => router.back()}
              variant="outline"
              size="lg"
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

