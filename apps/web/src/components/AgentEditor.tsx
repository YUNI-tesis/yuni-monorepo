"use client";

import { useState, useEffect, useCallback } from "react";
import { Agent } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetch-client";
import { Button } from "@/components/common";
import { AgentAvatarPreview } from "@/components/AgentAvatarPreview";
import { VoiceSelector } from "@/components/VoiceSelector";
import { AgentContextSection } from "@/components/AgentContextSection";
import type { HeyGenAvatarOption } from "@/lib/heygen";

interface AgentEditorProps {
  agentId?: string;
  onEditSuccess?: (agent: Agent) => void;
}

export function AgentEditor({ agentId, onEditSuccess }: AgentEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!agentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarOptions, setAvatarOptions] = useState<HeyGenAvatarOption[]>([]);
  const [loadingAvatarOptions, setLoadingAvatarOptions] = useState(false);
  const [avatarOptionsError, setAvatarOptionsError] = useState<string | null>(null);
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
    avatar: {
      provider: "heygen" as "builtin" | "heygen",
      avatarId: "",
      mode: "live" as const,
      previewImageUrl: "",
      metadata: {} as Record<string, unknown>,
    },
  });

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Unexpected error";

  const fetchAgent = useCallback(async () => {
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
        avatar: agent.avatar ? {
          provider: agent.avatar.provider || "heygen",
          avatarId: agent.avatar.avatarId || "",
          mode: "live",
          previewImageUrl: agent.avatar.previewImageUrl || "",
          metadata: agent.avatar.metadata || {},
        } : {
          provider: "heygen",
          avatarId: "",
          mode: "live",
          previewImageUrl: "",
          metadata: {},
        },
      });
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (agentId) {
      void fetchAgent();
    }
  }, [agentId, fetchAgent]);

  const fetchAvatarOptions = useCallback(async () => {
    try {
      setLoadingAvatarOptions(true);
      setAvatarOptionsError(null);
      const res = await fetchWithAuth("/api/heygen/avatars");

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "No pudimos cargar los avatares");
      }

      const data = (await res.json()) as { avatars?: HeyGenAvatarOption[] };
      setAvatarOptions(data.avatars || []);
    } catch {
      setAvatarOptions([]);
      setAvatarOptionsError("No pudimos cargar los avatares ahora mismo. Probá de nuevo en unos segundos.");
    } finally {
      setLoadingAvatarOptions(false);
    }
  }, []);

  useEffect(() => {
    void fetchAvatarOptions();
  }, [fetchAvatarOptions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (!formData.avatar.avatarId) {
        throw new Error("Elegí un avatar antes de guardar el agente.");
      }

      const payload = {
        ...formData,
        avatar: {
          provider: "heygen" as const,
          avatarId: formData.avatar.avatarId || undefined,
          mode: "live" as const,
          previewImageUrl: formData.avatar.previewImageUrl || undefined,
          metadata:
            Object.keys(formData.avatar.metadata || {}).length > 0
              ? formData.avatar.metadata
              : undefined,
        },
      };
      const url = agentId ? `/api/agents/${agentId}` : "/api/agents";
      const method = agentId ? "PATCH" : "POST";
      const res = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save agent");
      }

      const agent: Agent = await res.json();
      onEditSuccess?.(agent);
      router.push(`/agents/${agent.id}`);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
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
            <AgentAvatarPreview
              name={formData.name || "Nuevo agente"}
              avatar={{
                provider: "heygen",
                avatarId: formData.avatar.avatarId || undefined,
                mode: "live",
                previewImageUrl: formData.avatar.previewImageUrl || undefined,
                metadata: formData.avatar.metadata,
              }}
              className="h-full w-full"
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Elegí la cara con la que tu agente se va a presentar en las llamadas.
          </p>
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
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 2H5a2 2 0 01-2-2V10a2 2 0 012-2h4l5-4v16l-5-4z" />
              </svg>
              <h3 className="text-lg font-semibold text-foreground">Avatar</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Elegí el avatar que querés usar para este agente.
            </p>
            <div className="space-y-4">
              <div className="rounded-2xl border border-theme bg-surface p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Avatares disponibles</p>
                    <p className="text-xs text-muted-foreground">
                      Elegí la apariencia que va a tener tu agente.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchAvatarOptions()}
                    isLoading={loadingAvatarOptions}
                  >
                    Recargar
                  </Button>
                </div>
                {avatarOptionsError && (
                  <p className="mt-3 text-sm text-error-theme">{avatarOptionsError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {avatarOptions.map((option) => {
                  const isSelected = formData.avatar.avatarId === option.avatarId;
                  return (
                    <button
                      key={option.avatarId}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          avatar: {
                            provider: "heygen",
                            avatarId: option.avatarId,
                            mode: "live",
                            previewImageUrl: option.previewImageUrl || "",
                            metadata: {
                              ...(prev.avatar.metadata || {}),
                            },
                          },
                        }));
                      }}
                      className={`overflow-hidden rounded-2xl border text-left transition-all ${
                        isSelected
                          ? "border-cyan-400/70 shadow-lg shadow-cyan-500/10"
                          : "border-theme hover:border-cyan-400/30"
                      }`}
                    >
                      <AgentAvatarPreview
                        name={option.name}
                        avatar={{
                          provider: "heygen",
                          avatarId: option.avatarId,
                          mode: "live",
                          previewImageUrl: option.previewImageUrl,
                        }}
                        className="aspect-[4/5] w-full"
                      />
                      <div className="bg-surface px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{option.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {option.gender ? `${option.gender} · ` : ""}Listo para usar
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {!loadingAvatarOptions && avatarOptions.length === 0 && !avatarOptionsError && (
                <p className="text-sm text-muted-foreground">
                  No encontramos avatares disponibles por ahora.
                </p>
              )}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="text-lg font-semibold text-foreground">Configuración de Voz</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Elegí la voz con la que querés que hable tu agente.
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
