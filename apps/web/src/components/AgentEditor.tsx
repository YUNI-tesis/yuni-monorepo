"use client";

import { useState, useEffect } from "react";
import { Agent, CreateAgentSchema } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetch-client";
import { Button } from "@/components/common";
import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";
import { VoiceSelector } from "@/components/VoiceSelector";
import { AgentContextSection } from "@/components/AgentContextSection";

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
    voice: {
      provider: "openai" as "openai" | "elevenlabs",
      voiceId: "alloy",
      speakingRate: 1.0,
    },
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
        voice: agent.voice ? {
          provider: agent.voice.provider || "openai",
          voiceId: agent.voice.voiceId || "alloy",
          speakingRate: agent.voice.speakingRate || 1.0,
        } : {
          provider: "openai",
          voiceId: "alloy",
          speakingRate: 1.0,
        },
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
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-8 border border-theme">
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="glass rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-error-theme text-sm" role="alert">{error}</p>
          </div>
        )}

        {/* Avatar Preview Section */}
        <div className="flex flex-col items-center pb-6 border-b border-theme">
          <div className="relative mb-4 w-full max-w-md aspect-square">
            <DynamicAvatarRenderer
              modelPath="https://models.readyplayer.me/697b77b6fd03bbd0ce0d0506.glb"
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
              <label className="block text-sm font-medium text-muted-strong-theme pb-2">
                Nombre del agente
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 glass rounded-xl border border-theme text-theme placeholder:text-muted-theme focus:outline-none focus-visible:border-[var(--color-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] transition-all bg-surface focus-gradient"
                placeholder="Mi Agente"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-strong-theme pb-2">
                Descripción
                <span className="text-muted-theme text-xs font-normal ml-2">(máx. 500 caracteres)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                maxLength={500}
                rows={4}
                className="w-full px-4 py-3 glass rounded-xl border border-theme text-theme placeholder:text-muted-theme focus:outline-none focus-visible:border-[var(--color-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] transition-all bg-surface focus-gradient resize-none"
                placeholder="Describe el propósito y función de tu agente..."
              />
              <p className="pt-2 text-xs text-muted-theme text-right">
                {formData.description.length}/500
              </p>
            </div>
          </div>

          {/* Right Column - Prompts */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <label className="block text-sm font-medium text-muted-strong-theme pb-2 flex items-center gap-2">
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
                className="w-full px-4 py-3 glass rounded-xl border border-theme text-theme placeholder:text-muted-theme focus:outline-none focus-visible:border-[var(--color-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] transition-all bg-surface focus-gradient font-mono text-sm resize-none"
                placeholder="Define el rol y comportamiento estricto del agente..."
              />
            </div>

            <AgentContextSection
              agentId={agentId}
              readOnly={false}
              contextText={formData.context}
              onContextTextChange={(value) => setFormData((prev) => ({ ...prev, context: value }))}
              variant="editor"
            />
          </div>
        </div>

        {/* Voice Configuration Section */}
        <div className="pt-6 border-t border-theme">
          <div className="mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="text-lg font-semibold text-foreground">Configuración de Voz</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Selecciona la voz que usará tu agente para las llamadas en tiempo real.
          </p>
          <VoiceSelector
            value={formData.voice}
            onChange={(voice) => {
              setFormData(prev => ({ ...prev, voice }));
            }}
          />
        </div>

        <div className="flex gap-4 pt-6 border-t border-theme">
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

