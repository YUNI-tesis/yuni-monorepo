"use client";

/**
 * VoiceSelector Component
 * Allows selecting voice provider (OpenAI or ElevenLabs) and voice ID
 */

import { useState, useEffect } from "react";

interface VoiceConfig {
  provider: "openai" | "elevenlabs";
  voiceId: string;
  speakingRate: number;
}

interface VoiceSelectorProps {
  value?: VoiceConfig | null;
  onChange: (config: VoiceConfig) => void;
}

// OpenAI Realtime voices with descriptions
const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy", description: "Neutral, balanced tone" },
  { id: "echo", name: "Echo", description: "Male, warm and friendly" },
  { id: "shimmer", name: "Shimmer", description: "Female, soft and gentle" },
  { id: "ash", name: "Ash", description: "Male, calm and professional" },
  { id: "ballad", name: "Ballad", description: "Female, expressive storyteller" },
  { id: "coral", name: "Coral", description: "Female, bright and energetic" },
  { id: "sage", name: "Sage", description: "Male, wise and mature" },
  { id: "verse", name: "Verse", description: "Male, poetic and articulate" },
  { id: "marin", name: "Marin", description: "Female, clear and direct" },
  { id: "cedar", name: "Cedar", description: "Male, deep and resonant" },
];

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const [provider, setProvider] = useState<"openai" | "elevenlabs">(
    value?.provider || "openai"
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    value?.voiceId || "alloy"
  );
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch ElevenLabs voices when provider changes
  useEffect(() => {
    if (provider === "elevenlabs") {
      fetchElevenLabsVoices();
    }
  }, [provider]);

  // Update parent when selection changes
  useEffect(() => {
    onChange({
      provider,
      voiceId: selectedVoiceId,
      speakingRate: 1.0,
    });
  }, [provider, selectedVoiceId, onChange]);

  const fetchElevenLabsVoices = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/voices/elevenlabs");
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch ElevenLabs voices");
      }

      const data = await response.json();
      setElevenLabsVoices(data.voices || []);
      
      // Set first voice as default if not already selected
      if (data.voices.length > 0 && !selectedVoiceId) {
        setSelectedVoiceId(data.voices[0].voice_id);
      }
    } catch (err: any) {
      console.error("[VoiceSelector] Error fetching ElevenLabs voices:", err);
      setError(err.message);
      // Fallback to OpenAI if ElevenLabs fails
      setProvider("openai");
      setSelectedVoiceId("alloy");
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (newProvider: "openai" | "elevenlabs") => {
    setProvider(newProvider);
    // Reset voice selection
    if (newProvider === "openai") {
      setSelectedVoiceId("alloy");
    } else {
      setSelectedVoiceId("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-white/90 mb-2">
          Proveedor de Voz
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleProviderChange("openai")}
            className={`p-4 rounded-lg border-2 transition-all ${
              provider === "openai"
                ? "border-purple-500 bg-purple-500/20"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="text-left">
              <div className="font-semibold text-white mb-1">OpenAI Realtime</div>
              <div className="text-xs text-white/70">
                ⚡ Latencia ultra-baja (~500ms)
              </div>
              <div className="text-xs text-white/60 mt-1">
                Voces predeterminadas optimizadas
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleProviderChange("elevenlabs")}
            className={`p-4 rounded-lg border-2 transition-all ${
              provider === "elevenlabs"
                ? "border-purple-500 bg-purple-500/20"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <div className="text-left">
              <div className="font-semibold text-white mb-1">ElevenLabs</div>
              <div className="text-xs text-white/70">
                🎨 Voces personalizadas
              </div>
              <div className="text-xs text-white/60 mt-1">
                Mayor latencia (~2-3s)
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Voice Selection */}
      <div>
        <label className="block text-sm font-medium text-white/90 mb-2">
          Seleccionar Voz
        </label>

        {provider === "openai" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPENAI_VOICES.map((voice) => (
              <button
                key={voice.id}
                type="button"
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedVoiceId === voice.id
                    ? "border-purple-500 bg-purple-500/20"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="font-medium text-white text-sm">{voice.name}</div>
                <div className="text-xs text-white/60 mt-1">{voice.description}</div>
              </button>
            ))}
          </div>
        )}

        {provider === "elevenlabs" && (
          <>
            {loading && (
              <div className="flex items-center justify-center p-8 glass rounded-lg border border-white/10">
                <div className="flex items-center space-x-2 text-white/70">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Cargando voces...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 glass rounded-lg border border-red-500/30 bg-red-500/10">
                <p className="text-sm text-red-400">{error}</p>
                <p className="text-xs text-red-400/70 mt-1">
                  Verifica que ELEVENLABS_API_KEY esté configurada
                </p>
              </div>
            )}

            {!loading && !error && elevenLabsVoices.length > 0 && (
              <div className="space-y-2">
                {elevenLabsVoices.map((voice) => (
                  <button
                    key={voice.voice_id}
                    type="button"
                    onClick={() => setSelectedVoiceId(voice.voice_id)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      selectedVoiceId === voice.voice_id
                        ? "border-purple-500 bg-purple-500/20"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white text-sm">{voice.name}</div>
                        {voice.labels && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(voice.labels).map(([key, value]) => (
                              <span
                                key={key}
                                className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/70"
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {voice.preview_url && (
                        <audio
                          src={voice.preview_url}
                          controls
                          className="h-8"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!loading && !error && elevenLabsVoices.length === 0 && (
              <div className="p-4 glass rounded-lg border border-white/10 text-center">
                <p className="text-sm text-white/70">
                  No se encontraron voces de ElevenLabs
                </p>
                <p className="text-xs text-white/60 mt-1">
                  Verifica tu configuración o crea voces en ElevenLabs
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Banner */}
      <div className="p-3 glass-strong rounded-lg border border-blue-500/30 bg-blue-500/10">
        <div className="flex items-start space-x-2">
          <svg
            className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-xs text-blue-300">
            {provider === "openai" ? (
              <>
                <strong>Modo de baja latencia:</strong> Las respuestas de voz serán prácticamente
                instantáneas (~500ms). Ideal para conversaciones naturales en tiempo real.
              </>
            ) : (
              <>
                <strong>Modo personalizado:</strong> Las voces custom ofrecen mayor calidad y
                personalización, pero con mayor latencia (~2-3s). Mejor para contenido grabado.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
