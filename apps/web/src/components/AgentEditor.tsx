"use client";

import { useState, useEffect } from "react";
import { Agent, CreateAgentSchema } from "@/lib/schemas";
import { useRouter } from "next/navigation";

interface AgentEditorProps {
  agentId?: string;
}

export function AgentEditor({ agentId }: AgentEditorProps) {
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
      const res = await fetch(`/api/agents/${agentId}`);
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
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save agent");
      }

      const agent: Agent = await res.json();
      router.push(`/agents/${agent.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-4">Cargando...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="p-4 bg-red-50 text-red-600 rounded">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-2">Nombre</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Descripción (máx. 500 caracteres)
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          maxLength={500}
          rows={3}
          className="w-full px-3 py-2 border rounded"
        />
        <p className="text-xs text-gray-500 mt-1">
          {formData.description.length}/500
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          System Prompt (Rol estricto)
        </label>
        <textarea
          value={formData.systemPrompt}
          onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
          required
          rows={6}
          className="w-full px-3 py-2 border rounded font-mono text-sm"
          placeholder="Define el rol y comportamiento estricto del agente..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Contexto (Base de conocimiento)
        </label>
        <textarea
          value={formData.context}
          onChange={(e) => setFormData({ ...formData, context: e.target.value })}
          rows={10}
          className="w-full px-3 py-2 border rounded"
          placeholder="Información y conocimiento que el agente debe usar..."
        />
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Guardando..." : agentId ? "Actualizar" : "Crear"}
        </button>
        {agentId && (
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

