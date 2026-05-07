"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AgentAvatar, DEFAULT_LOCAL_AVATAR } from "@/lib/schemas";
import { fetchWithAuth } from "@/lib/fetch-client";
import { Card } from "./Card";

interface ProviderInfo {
  id: AgentAvatar["provider"];
  label: string;
  isRemote: boolean;
  isConfigured: boolean;
}

export interface AvatarOption {
  id: string;
  provider: AgentAvatar["provider"];
  externalAvatarId?: string;
  displayName: string;
  thumbnailUrl?: string;
  fallbackModelPath?: string;
  quality?: AgentAvatar["quality"];
  isAvailable: boolean;
}

export interface AvatarSelectorProps {
  value?: AgentAvatar;
  onChange?: (avatar: AgentAvatar) => void;
}

const QUALITY_OPTIONS: Array<{ value: NonNullable<AgentAvatar["quality"]>; label: string }> = [
  { value: "medium", label: "480p" },
  { value: "high", label: "720p" },
  { value: "very_high", label: "1080p" },
  { value: "low", label: "360p" },
];

export function AvatarSelector({ value, onChange }: AvatarSelectorProps) {
  const selectedAvatar = value || DEFAULT_LOCAL_AVATAR;
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<AgentAvatar["provider"]>(
    selectedAvatar.provider
  );
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProviderId(selectedAvatar.provider);
  }, [selectedAvatar.provider]);

  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetchWithAuth("/api/avatar-providers");
        if (!res.ok) throw new Error("No se pudieron cargar los proveedores de avatar");
        const data = await res.json();
        setProviders(data.providers || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los proveedores");
      }
    }

    loadProviders();
  }, []);

  useEffect(() => {
    async function loadAvatars() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth(`/api/avatar-providers/${providerId}/avatars`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudieron cargar los avatares");
        setAvatars(data.avatars || []);
      } catch (err: unknown) {
        setAvatars([]);
        setError(err instanceof Error ? err.message : "No se pudieron cargar los avatares");
      } finally {
        setLoading(false);
      }
    }

    loadAvatars();
  }, [providerId]);

  const selectedOptionId = useMemo(() => {
    if (selectedAvatar.provider === "local3d") {
      return avatars.find((avatar) => avatar.fallbackModelPath === selectedAvatar.fallbackModelPath)?.id;
    }
    return avatars.find((avatar) => avatar.externalAvatarId === selectedAvatar.externalAvatarId)?.id;
  }, [avatars, selectedAvatar]);

  const handleProviderChange = (nextProvider: AgentAvatar["provider"]) => {
    setProviderId(nextProvider);
    if (nextProvider === "local3d") {
      onChange?.(DEFAULT_LOCAL_AVATAR);
    } else {
      onChange?.({
        provider: nextProvider,
        quality: selectedAvatar.quality || "high",
        fallbackModelPath: DEFAULT_LOCAL_AVATAR.fallbackModelPath,
      });
    }
  };

  const handleAvatarSelect = (avatar: AvatarOption) => {
    onChange?.({
      provider: avatar.provider,
      externalAvatarId: avatar.externalAvatarId,
      displayName: avatar.displayName,
      thumbnailUrl: avatar.thumbnailUrl,
      quality: avatar.quality || selectedAvatar.quality || "high",
      fallbackModelPath: avatar.fallbackModelPath || DEFAULT_LOCAL_AVATAR.fallbackModelPath,
    });
  };

  const handleQualityChange = (quality: NonNullable<AgentAvatar["quality"]>) => {
    onChange?.({
      ...selectedAvatar,
      quality,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Avatar</h3>
          <p className="text-sm text-white/60">
            Selecciona el cuerpo visual del agente para el modo llamada.
          </p>
        </div>
        <select
          value={providerId}
          onChange={(event) => handleProviderChange(event.target.value as AgentAvatar["provider"])}
          className="px-3 py-2 glass rounded-lg border border-white/10 text-white bg-white/5 focus:outline-none focus:border-purple-500/50"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}{provider.isRemote && !provider.isConfigured ? " (sin configurar)" : ""}
            </option>
          ))}
          {providers.length === 0 && <option value="local3d">Avatar local 3D</option>}
        </select>
      </div>

      {providerId === "liveavatar" && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-white/70">Calidad</label>
          <select
            value={selectedAvatar.quality || "high"}
            onChange={(event) =>
              handleQualityChange(event.target.value as NonNullable<AgentAvatar["quality"]>)
            }
            className="px-3 py-2 glass rounded-lg border border-white/10 text-white bg-white/5 focus:outline-none focus:border-purple-500/50"
          >
            {QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/60">
          Cargando avatares...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {avatars.map((avatar) => {
            const selected = selectedOptionId === avatar.id;
            return (
              <Card
                key={avatar.id}
                variant="bordered"
                padding="md"
                className={`cursor-pointer transition-all duration-200 ${
                  selected
                    ? "border-[#D365FF] ring-2 ring-[#D365FF] ring-opacity-50"
                    : "hover:border-white/30"
                }`}
                onClick={() => handleAvatarSelect(avatar)}
              >
                <div className="aspect-video mb-3 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                  {avatar.thumbnailUrl ? (
                    <img
                      src={avatar.thumbnailUrl}
                      alt={avatar.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full gradient-primary" />
                  )}
                </div>
                <p className="text-sm font-medium text-white text-center">
                  {avatar.displayName}
                </p>
                {selected && (
                  <div className="mt-2 text-center text-[#D365FF] text-xs">
                    Seleccionado
                  </div>
                )}
              </Card>
            );
          })}
          {!loading && avatars.length === 0 && (
            <div className="md:col-span-3 rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/60">
              No hay avatares disponibles para este proveedor.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
