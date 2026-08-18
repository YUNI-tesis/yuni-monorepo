import { createHash } from "node:crypto";
import {
  type ElevenLabsConfig,
  elevenLabsConfig,
  requireElevenLabsDefaultVoice,
  requireElevenLabsConfig,
} from "@yuni/config";
import type { VoiceConfig } from "@yuni/domain";

export type VoiceProviderName = "openai" | "elevenlabs";
export type AgentProviderName = "elevenlabs_agents";

export interface VoiceProvider {
  readonly name: VoiceProviderName;
}

export type ElevenLabsVoiceOption = {
  id: string;
  displayName: string;
  description: string;
  provider: "elevenlabs";
  previewUrl: string | null;
  category: string | null;
  labels: Record<string, string>;
  recommendedFor: string;
};

export const ELEVENLABS_EXPRESSIVE_TTS_MODEL = "eleven_v3";
export const ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL = "eleven_flash_v2_5";

export const LIVEAVATAR_ELEVENLABS_CLIENT_EVENTS = [
  "conversation_initiation_metadata",
  "audio",
  "user_transcript",
  "agent_response",
  "agent_response_correction",
  "interruption",
  "vad_score",
] as const;

export type ElevenLabsClientEvent = (typeof LIVEAVATAR_ELEVENLABS_CLIENT_EVENTS)[number];

export type ElevenLabsConnectorSyncConfig = {
  version: number;
  userInputAudioFormat: "pcm_24000";
  agentOutputAudioFormat: "pcm_24000";
  textOnly: false;
  clientEvents: readonly ElevenLabsClientEvent[];
  voiceSettings: {
    stability: number;
    similarityBoost: number;
    speed: number;
  };
  turn: {
    turnTimeout: number;
    turnEagerness: "patient";
    softTimeoutSeconds: number;
    softTimeoutMessage: string;
    useLlmGeneratedSoftTimeout: true;
    interruptionIgnoreTerms: readonly string[];
  };
};

export type ProviderSyncFingerprintOptions = {
  syncConfig?: ElevenLabsConnectorSyncConfig;
  ttsModelId?: string;
  ragEmbeddingModel?: "multilingual_e5_large_instruct";
  ragMaxDocumentsLength?: number;
};

export const LIVEAVATAR_ELEVENLABS_SYNC_CONFIG = {
  version: 3,
  userInputAudioFormat: "pcm_24000",
  agentOutputAudioFormat: "pcm_24000",
  textOnly: false,
  clientEvents: LIVEAVATAR_ELEVENLABS_CLIENT_EVENTS,
  voiceSettings: {
    stability: 0.45,
    similarityBoost: 0.78,
    speed: 0.98,
  },
  turn: {
    turnTimeout: 10,
    turnEagerness: "patient",
    softTimeoutSeconds: 3,
    softTimeoutMessage: "Mmm... lo estoy pensando.",
    useLlmGeneratedSoftTimeout: true,
    interruptionIgnoreTerms: ["si", "sí", "aja", "ajá", "ok", "okay", "dale", "claro", "mmm", "eh"],
  },
} satisfies ElevenLabsConnectorSyncConfig;

export type AvatarAgentProviderSyncInput = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: VoiceConfig;
  providerAgentId: string | null;
  providerSyncFingerprint: string | null;
  knowledgeBase?: ElevenLabsKnowledgeBaseReference[];
  includeInlineContext?: boolean;
};

export type ElevenLabsKnowledgeBaseReference = {
  type: "text" | "file";
  name: string;
  id: string;
  usage_mode: "prompt" | "auto";
};

export type ElevenLabsRagIndexStatus = "not_started" | "processing" | "ready" | "failed";

export type ElevenLabsKnowledgeBaseDocument = {
  id: string;
  name: string;
};

export type AvatarAgentProviderSyncResult = {
  providerAgentId: string;
  providerSyncFingerprint: string;
  synced: boolean;
};

export class ElevenLabsProviderError extends Error {
  readonly statusCode?: number;

  constructor(
    message: string,
    readonly cause?: unknown,
    statusCode?: number
  ) {
    super(message);
    this.name = "ElevenLabsProviderError";
    Object.defineProperty(this, "statusCode", {
      value: statusCode,
      enumerable: false,
      configurable: true,
    });
  }
}

export class ElevenLabsProviderUnavailableError extends ElevenLabsProviderError {
  constructor(message = "ElevenLabs is not configured", cause?: unknown) {
    super(message, cause);
    this.name = "ElevenLabsProviderUnavailableError";
  }
}

export class ElevenLabsDefaultVoiceUnavailableError extends ElevenLabsProviderUnavailableError {
  constructor(message = "ElevenLabs default voice is not configured", cause?: unknown) {
    super(message, cause);
    this.name = "ElevenLabsDefaultVoiceUnavailableError";
  }
}

export class ElevenLabsProviderTimeoutError extends ElevenLabsProviderError {
  constructor(message = "ElevenLabs request timed out", cause?: unknown) {
    super(message, cause);
    this.name = "ElevenLabsProviderTimeoutError";
  }
}

export type ElevenLabsAgentProviderOptions = {
  config?: ElevenLabsConfig;
  fetch?: typeof fetch;
};

export class ElevenLabsAgentProvider {
  readonly name = "elevenlabs_agents" satisfies AgentProviderName;

  private readonly config: ElevenLabsConfig;
  private readonly fetcher: typeof fetch;

  constructor(options: ElevenLabsAgentProviderOptions = {}) {
    this.config = options.config ?? elevenLabsConfig;
    this.fetcher = options.fetch ?? fetch;
  }

  async syncAvatarAgent(input: AvatarAgentProviderSyncInput): Promise<AvatarAgentProviderSyncResult> {
    const config = this.requireConfig();
    this.requireVoiceConfig(input, config);
    const requestedFingerprint = createProviderSyncFingerprint(input, {
      ttsModelId: config.agentTtsModel,
      ragMaxDocumentsLength: config.ragMaxDocumentsLength ?? 10_000,
    });
    const fallbackTtsModel = getExpressiveTtsFallbackModel(config.agentTtsModel);
    const fallbackFingerprint = fallbackTtsModel
      ? createProviderSyncFingerprint(input, {
          ttsModelId: fallbackTtsModel,
          ragMaxDocumentsLength: config.ragMaxDocumentsLength ?? 10_000,
        })
      : null;

    if (
      input.providerAgentId &&
      (input.providerSyncFingerprint === requestedFingerprint ||
        (fallbackFingerprint !== null && input.providerSyncFingerprint === fallbackFingerprint))
    ) {
      return {
        providerAgentId: input.providerAgentId,
        providerSyncFingerprint: input.providerSyncFingerprint,
        synced: false,
      };
    }

    const payload = createElevenLabsAgentPayload(input, config);
    let providerAgentId: string;
    let providerSyncFingerprint = requestedFingerprint;

    try {
      providerAgentId = await this.syncProviderAgent(input.providerAgentId, payload);
    } catch (error) {
      if (!fallbackTtsModel || !isExpressiveTtsNotAllowedError(error)) {
        throw error;
      }

      const fallbackPayload = createElevenLabsAgentPayload(input, {
        ...config,
        agentTtsModel: fallbackTtsModel,
      });
      providerAgentId = await this.syncProviderAgent(input.providerAgentId, fallbackPayload);
      providerSyncFingerprint = fallbackFingerprint ?? requestedFingerprint;
    }

    return {
      providerAgentId,
      providerSyncFingerprint,
      synced: true,
    };
  }

  async listVoices(): Promise<ElevenLabsVoiceOption[]> {
    this.requireConfig();

    const voices: ElevenLabsVoiceOption[] = [];
    let nextPageToken: string | null = null;

    do {
      const path = new URL("/v2/voices", "https://api.elevenlabs.local");
      path.searchParams.set("voice_type", "saved");
      path.searchParams.set("page_size", "100");
      path.searchParams.set("sort", "name");
      path.searchParams.set("sort_direction", "asc");

      if (nextPageToken) {
        path.searchParams.set("next_page_token", nextPageToken);
      }

      const body = await this.request(`${path.pathname}${path.search}`, { method: "GET" });
      const page = normalizeVoicesPage(body);

      voices.push(...page.voices);
      nextPageToken = page.hasMore ? page.nextPageToken : null;
    } while (nextPageToken);

    return voices;
  }

  async createAgent(payload: ElevenLabsAgentPayload): Promise<string> {
    const body = await this.request("/v1/convai/agents/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const agentId = extractAgentId(body);

    if (!agentId) {
      throw new ElevenLabsProviderError("ElevenLabs did not return an agent id");
    }

    return agentId;
  }

  async updateAgent(agentId: string, payload: ElevenLabsAgentPayload): Promise<string> {
    const body = await this.request(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    return extractAgentId(body) ?? agentId;
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.request(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
  }

  async createTextDocument(name: string, text: string): Promise<ElevenLabsKnowledgeBaseDocument> {
    const body = await this.request("/v1/convai/knowledge-base/text", {
      method: "POST",
      body: JSON.stringify({ name, text }),
    });
    return extractKnowledgeBaseDocument(body, name);
  }

  async updateTextDocument(
    documentId: string,
    name: string,
    text: string
  ): Promise<ElevenLabsKnowledgeBaseDocument> {
    const body = await this.request(`/v1/convai/knowledge-base/${encodeURIComponent(documentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name, content: text }),
    });
    return extractKnowledgeBaseDocument(body, name, documentId);
  }

  async createFileDocument(input: {
    name: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<ElevenLabsKnowledgeBaseDocument> {
    const form = new FormData();
    form.append("name", input.name);
    form.append("file", new Blob([input.bytes], { type: input.mimeType }), input.fileName);
    const body = await this.request("/v1/convai/knowledge-base/file", {
      method: "POST",
      body: form,
    });
    return extractKnowledgeBaseDocument(body, input.name);
  }

  async deleteKnowledgeBaseDocument(documentId: string, force = false): Promise<void> {
    const suffix = force ? "?force=true" : "";
    await this.request(`/v1/convai/knowledge-base/${encodeURIComponent(documentId)}${suffix}`, {
      method: "DELETE",
    });
  }

  async computeRagIndex(
    documentId: string,
    model = "multilingual_e5_large_instruct"
  ): Promise<ElevenLabsRagIndexStatus> {
    const body = await this.request(`/v1/convai/knowledge-base/${encodeURIComponent(documentId)}/rag-index`, {
      method: "POST",
      body: JSON.stringify({ model }),
    });
    return normalizeRagStatus(body);
  }

  async getRagIndex(documentId: string): Promise<ElevenLabsRagIndexStatus> {
    const body = await this.request(`/v1/convai/knowledge-base/${encodeURIComponent(documentId)}/rag-index`, {
      method: "GET",
    });
    return normalizeRagStatus(body);
  }

  private async syncProviderAgent(agentId: string | null, payload: ElevenLabsAgentPayload): Promise<string> {
    return agentId ? await this.updateAgent(agentId, payload) : await this.createAgent(payload);
  }

  private requireConfig(): ElevenLabsConfig {
    try {
      return requireElevenLabsConfig(this.config);
    } catch (error) {
      throw new ElevenLabsProviderUnavailableError("ElevenLabs is not configured", error);
    }
  }

  private requireVoiceConfig(input: AvatarAgentProviderSyncInput, config: ElevenLabsConfig): void {
    if (input.voiceConfig.provider === "elevenlabs") {
      return;
    }

    try {
      requireElevenLabsDefaultVoice(config);
    } catch (error) {
      throw new ElevenLabsDefaultVoiceUnavailableError(
        "ElevenLabs default voice is required for legacy avatar voices",
        error
      );
    }
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const config = this.requireConfig();
    const url = new URL(path, withTrailingSlash(config.baseUrl));
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.requestTimeoutMs);

    try {
      let response: Response;
      try {
        const isMultipart = init.body instanceof FormData;
        response = await this.fetcher(url, {
          ...init,
          headers: {
            "xi-api-key": config.apiKey,
            Accept: "application/json",
            ...(!isMultipart ? { "Content-Type": "application/json" } : {}),
          },
          signal: abortController.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new ElevenLabsProviderTimeoutError("ElevenLabs request timed out", error);
        }

        throw new ElevenLabsProviderError("ElevenLabs request failed", error);
      }

      if (!response.ok) {
        throw new ElevenLabsProviderError(await readProviderError(response), undefined, response.status);
      }

      if (response.status === 204) return null;
      return await response.json().catch((error: unknown) => {
        if (isAbortError(error)) {
          throw new ElevenLabsProviderTimeoutError("ElevenLabs request timed out", error);
        }

        throw new ElevenLabsProviderError("ElevenLabs returned invalid JSON", error);
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type ElevenLabsAgentPayload = {
  name: string;
  tags: string[];
  conversation_config: {
    asr: {
      quality: "high";
      provider: "scribe_realtime";
      user_input_audio_format: "pcm_24000";
      keywords: string[];
    };
    agent: {
      first_message: string;
      language: "es";
      disable_first_message_interruptions: false;
      prompt: {
        prompt: string;
        llm: string;
        temperature: number;
        max_tokens: number;
        tool_ids: string[];
        mcp_server_ids: string[];
        native_mcp_server_ids: string[];
        knowledge_base: ElevenLabsKnowledgeBaseReference[];
        rag?: {
          enabled: true;
          embedding_model: "multilingual_e5_large_instruct";
          max_documents_length: number;
        };
        ignore_default_personality: boolean;
      };
    };
    tts: {
      model_id: string;
      voice_id: string;
      agent_output_audio_format: "pcm_24000";
      optimize_streaming_latency: 3;
      speed?: number;
      stability?: number;
      similarity_boost?: number;
      pronunciation_dictionary_locators?: [];
    };
    turn: {
      turn_timeout: number;
      silence_end_call_timeout: -1;
      turn_eagerness: "patient";
      interruption_ignore_terms: string[];
      soft_timeout_config: {
        timeout_seconds: number;
        message: string;
        use_llm_generated_message: true;
      };
      mode: "turn";
    };
    conversation: {
      text_only: false;
      max_duration_seconds: number;
      client_events: ElevenLabsClientEvent[];
    };
    language_presets: Record<string, never>;
    vad: Record<string, never>;
  };
};

export function createProviderSyncFingerprint(
  input: AvatarAgentProviderSyncInput,
  options: ProviderSyncFingerprintOptions = {}
): string {
  const syncConfig = options.syncConfig ?? LIVEAVATAR_ELEVENLABS_SYNC_CONFIG;

  return createHash("sha256")
    .update(
      JSON.stringify({
        provider: "elevenlabs_agents",
        syncConfig,
        ttsModelId: options.ttsModelId ?? "default",
        rag: {
          embeddingModel: options.ragEmbeddingModel ?? "multilingual_e5_large_instruct",
          maxDocumentsLength: options.ragMaxDocumentsLength ?? 10_000,
        },
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        context: input.context,
        voiceConfig: input.voiceConfig,
        includeInlineContext: input.includeInlineContext ?? true,
        knowledgeBase: [...(input.knowledgeBase ?? [])].sort((left, right) =>
          left.id.localeCompare(right.id)
        ),
      })
    )
    .digest("hex");
}

export function createElevenLabsAgentPayload(
  input: AvatarAgentProviderSyncInput,
  config: Pick<
    ElevenLabsConfig,
    "defaultVoiceId" | "agentLlmModel" | "agentTtsModel" | "ragMaxDocumentsLength"
  >
): ElevenLabsAgentPayload {
  const voiceId = resolveElevenLabsVoiceId(input, config);
  const ttsConfig = createElevenLabsTtsConfig(config.agentTtsModel, voiceId);

  return {
    name: `YUNI - ${input.name}`,
    tags: ["yuni", "avatar"],
    conversation_config: {
      asr: {
        quality: "high",
        provider: "scribe_realtime",
        user_input_audio_format: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.userInputAudioFormat,
        keywords: [],
      },
      agent: {
        first_message: `Hola, soy ${input.name}. En que puedo ayudarte?`,
        language: "es",
        disable_first_message_interruptions: false,
        prompt: {
          prompt: buildPrompt(input, {
            expressiveTagsEnabled: config.agentTtsModel === ELEVENLABS_EXPRESSIVE_TTS_MODEL,
          }),
          llm: config.agentLlmModel,
          temperature: 0.4,
          max_tokens: 220,
          tool_ids: [],
          mcp_server_ids: [],
          native_mcp_server_ids: [],
          knowledge_base: input.knowledgeBase ?? [],
          ...((input.knowledgeBase?.length ?? 0) > 0
            ? {
                rag: {
                  enabled: true as const,
                  embedding_model: "multilingual_e5_large_instruct" as const,
                  max_documents_length: config.ragMaxDocumentsLength ?? 10_000,
                },
              }
            : {}),
          ignore_default_personality: true,
        },
      },
      tts: ttsConfig,
      turn: {
        turn_timeout: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.turnTimeout,
        silence_end_call_timeout: -1,
        turn_eagerness: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.turnEagerness,
        interruption_ignore_terms: [...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.interruptionIgnoreTerms],
        soft_timeout_config: {
          timeout_seconds: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.softTimeoutSeconds,
          message: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.softTimeoutMessage,
          use_llm_generated_message: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.useLlmGeneratedSoftTimeout,
        },
        mode: "turn",
      },
      conversation: {
        text_only: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.textOnly,
        max_duration_seconds: 600,
        client_events: [...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.clientEvents],
      },
      language_presets: {},
      vad: {},
    },
  };
}

function resolveElevenLabsVoiceId(
  input: AvatarAgentProviderSyncInput,
  config: Pick<ElevenLabsConfig, "defaultVoiceId">
): string {
  if (input.voiceConfig.provider === "elevenlabs") {
    return input.voiceConfig.voiceId;
  }

  if (config.defaultVoiceId.length === 0) {
    throw new ElevenLabsDefaultVoiceUnavailableError(
      "ElevenLabs default voice is required for legacy avatar voices"
    );
  }

  return config.defaultVoiceId;
}

function createElevenLabsTtsConfig(
  modelId: string,
  voiceId: string
): ElevenLabsAgentPayload["conversation_config"]["tts"] {
  const baseConfig = {
    model_id: modelId,
    voice_id: voiceId,
    agent_output_audio_format: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.agentOutputAudioFormat,
    optimize_streaming_latency: 3,
  } satisfies ElevenLabsAgentPayload["conversation_config"]["tts"];

  if (modelId === ELEVENLABS_EXPRESSIVE_TTS_MODEL) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    speed: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.voiceSettings.speed,
    stability: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.voiceSettings.stability,
    similarity_boost: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.voiceSettings.similarityBoost,
    pronunciation_dictionary_locators: [],
  };
}

export function summarizeProviderError(error: unknown): string {
  if (error instanceof ElevenLabsProviderError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Provider sync failed";
}

function buildPrompt(
  input: AvatarAgentProviderSyncInput,
  options: { expressiveTagsEnabled: boolean }
): string {
  const description = input.description.trim() || "Sin descripcion adicional.";
  const context = input.context.trim() || "No hay contexto personalizado adicional cargado en YUNI.";
  const expressiveDeliveryRule = options.expressiveTagsEnabled
    ? "- Puedes usar tags expresivos de ElevenLabs con moderacion: [laughs] para humor, [sighs] para alivio o preocupacion, [slow] para remarcar algo importante y [excited] para entusiasmo breve."
    : "- Modula el tono con lenguaje natural y puntuacion, sin escribir tags expresivos como [laughs], [sighs], [slow] o [excited].";

  const identityAndInstructions = [
    `Sos ${input.name}, un avatar conversacional creado en YUNI.`,
    `Descripcion del avatar: ${description}`,
    "Instrucciones del creador:",
    input.instructions,
  ];
  if (input.includeInlineContext !== false) {
    identityAndInstructions.push("Contexto personalizado del creador:", context);
  }

  return [
    ...identityAndInstructions,
    "Reglas de conversacion:",
    "- Responde de forma breve, natural y conversacional: 1 a 3 frases por defecto.",
    "- Usa el idioma del usuario.",
    "- Si el contexto no alcanza, dilo con claridad y no inventes datos.",
    "- Haz como maximo una pregunta de seguimiento cuando ayude a avanzar.",
    "- Usa muletillas cortas solo cuando aporten naturalidad, por ejemplo: 'mmm', 'claro', 'entiendo' o 'a ver'. No las uses en todas las respuestas.",
    "- Adapta el tono emocional al usuario: si esta frustrado, responde calmo y empatico; si comparte algo bueno, responde con calidez; si pide pasos tecnicos, habla claro y medido.",
    expressiveDeliveryRule,
    "- Si el usuario interrumpe, prioriza el nuevo pedido, retoma sin pedir disculpas largas y no repitas toda la respuesta anterior.",
    "- No menciones detalles internos de YUNI, ElevenLabs o LiveAvatar salvo que el usuario pregunte.",
  ].join("\n");
}

export function isTransientElevenLabsError(error: unknown): boolean {
  if (error instanceof ElevenLabsProviderTimeoutError) return true;
  if (!(error instanceof ElevenLabsProviderError)) return false;
  return (
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    Boolean(error.statusCode && error.statusCode >= 500)
  );
}

function getExpressiveTtsFallbackModel(ttsModelId: string): string | null {
  return ttsModelId === ELEVENLABS_EXPRESSIVE_TTS_MODEL ? ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL : null;
}

function isExpressiveTtsNotAllowedError(error: unknown): boolean {
  return error instanceof ElevenLabsProviderError && error.message.includes("expressive_tts_not_allowed");
}

async function readProviderError(response: Response): Promise<string> {
  const rawBody = await response.text().catch(() => "");
  const body = parseJson(rawBody);

  if (isRecord(body)) {
    const message =
      readString(body.message) ??
      readProviderDetail(body.detail) ??
      (isRecord(body.error) ? readString(body.error.message) : null) ??
      readString(body.error);

    if (message) {
      return `ElevenLabs returned ${response.status}: ${message}`;
    }
  }

  const text = rawBody.trim();
  if (text) {
    return `ElevenLabs returned ${response.status}: ${truncateProviderError(text)}`;
  }

  return `ElevenLabs returned ${response.status}`;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readProviderDetail(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  const status = readString(value.status);
  const message = readString(value.message);

  if (status && message) {
    return `${status}: ${message}`;
  }

  return message ?? status;
}

function normalizeVoicesPage(body: unknown): {
  voices: ElevenLabsVoiceOption[];
  hasMore: boolean;
  nextPageToken: string | null;
} {
  if (!isRecord(body)) {
    return { voices: [], hasMore: false, nextPageToken: null };
  }

  const rawVoices = Array.isArray(body.voices) ? body.voices : [];

  return {
    voices: rawVoices.flatMap((voice) => {
      const normalized = normalizeVoiceOption(voice);

      return normalized ? [normalized] : [];
    }),
    hasMore: body.has_more === true,
    nextPageToken: readString(body.next_page_token),
  };
}

function normalizeVoiceOption(value: unknown): ElevenLabsVoiceOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.voice_id) ?? readString(value.voiceId);
  const displayName = readString(value.name);

  if (!id || !displayName) {
    return null;
  }

  const description = readString(value.description) ?? "";
  const category = readString(value.category);
  const labels = readLabels(value.labels);

  return {
    id,
    displayName,
    description,
    provider: "elevenlabs",
    previewUrl: readString(value.preview_url) ?? readString(value.previewUrl),
    category,
    labels,
    recommendedFor: createVoiceRecommendation({ description, category, labels }),
  };
}

function readLabels(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, labelValue]) =>
      typeof labelValue === "string" && labelValue.length > 0 ? [[key, labelValue]] : []
    )
  );
}

function createVoiceRecommendation(input: {
  description: string;
  category: string | null;
  labels: Record<string, string>;
}): string {
  const labelSummary = [input.labels.gender, input.labels.age, input.labels.accent, input.labels.use_case]
    .filter(Boolean)
    .join(" · ");

  if (labelSummary) {
    return labelSummary;
  }

  if (input.description) {
    return input.description;
  }

  return input.category ? `Voz ${input.category} de ElevenLabs.` : "Voz guardada en ElevenLabs.";
}

function truncateProviderError(value: string): string {
  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}

function extractAgentId(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  return readString(body.agent_id) ?? readString(body.agentId);
}

function extractKnowledgeBaseDocument(
  body: unknown,
  fallbackName: string,
  fallbackId?: string
): ElevenLabsKnowledgeBaseDocument {
  if (!isRecord(body)) {
    if (fallbackId) return { id: fallbackId, name: fallbackName };
    throw new ElevenLabsProviderError("ElevenLabs did not return a knowledge base document id");
  }
  const id = readString(body.id) ?? readString(body.document_id) ?? fallbackId;
  if (!id) {
    throw new ElevenLabsProviderError("ElevenLabs did not return a knowledge base document id");
  }
  return { id, name: readString(body.name) ?? fallbackName };
}

function normalizeRagStatus(body: unknown): ElevenLabsRagIndexStatus {
  const values: unknown[] = [];
  if (isRecord(body)) {
    values.push(body.status, body.rag_status);
    if (Array.isArray(body.indexes)) {
      for (const index of body.indexes) {
        if (isRecord(index)) values.push(index.status);
      }
    }
  }
  const normalized = values
    .find((value) => typeof value === "string")
    ?.toString()
    .toLowerCase();
  if (!normalized) return "processing";
  if (["ready", "completed", "succeeded", "success"].includes(normalized)) return "ready";
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["not_started", "not-started", "pending"].includes(normalized)) return "not_started";
  return "processing";
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
