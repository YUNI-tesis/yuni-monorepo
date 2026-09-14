import { describe, expect, it, vi } from "vitest";
import {
  createElevenLabsAgentPayload,
  createProviderSyncFingerprint,
  ElevenLabsDefaultVoiceUnavailableError,
  ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL,
  ELEVENLABS_EXPRESSIVE_TTS_MODEL,
  ELEVENLABS_CONVERSATIONAL_TTS_MODEL,
  resolveElevenLabsAgentTtsModel,
  isExpressiveTtsModel,
  ElevenLabsAgentProvider,
  ElevenLabsProviderError,
  ElevenLabsProviderUnavailableError,
  ElevenLabsVoiceVerificationError,
  isTransientElevenLabsError,
  LIVEAVATAR_ELEVENLABS_CLIENT_EVENTS,
  LIVEAVATAR_ELEVENLABS_SYNC_CONFIG,
  type AvatarAgentProviderSyncInput,
} from "./index";

const config = {
  apiKey: "elevenlabs-key",
  baseUrl: "https://api.elevenlabs.test",
  defaultVoiceId: "default-voice",
  agentLlmModel: "gpt-4o-mini",
  agentTtsModel: "eleven_v3",
  requestTimeoutMs: 10000,
};

const avatarInput: AvatarAgentProviderSyncInput = {
  id: "avatar-1",
  name: "Tutor Demo",
  description: "Ayuda a explicar la materia.",
  instructions: "Explica con ejemplos cortos.",
  context: "La materia es Sistemas Distribuidos.",
  voiceConfig: {
    provider: "openai",
    voiceId: "alloy",
    speakingRate: 1,
  },
  providerAgentId: null,
  providerSyncFingerprint: null,
};

const naturalAvatarInput: AvatarAgentProviderSyncInput = {
  ...avatarInput,
  voiceConfig: { ...avatarInput.voiceConfig, conversationProfile: "natural" },
};

function agentVoiceResponse(
  modelId = ELEVENLABS_CONVERSATIONAL_TTS_MODEL,
  expressiveMode: boolean | null = true
) {
  return jsonResponse({
    conversation_config: {
      tts: { model_id: modelId, expressive_mode: expressiveMode },
    },
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function expectedSyncFingerprint(input: AvatarAgentProviderSyncInput, ttsModelId = config.agentTtsModel) {
  return createProviderSyncFingerprint(input, {
    agentLlmModel: config.agentLlmModel,
    ttsModelId,
    effectiveVoiceId:
      input.voiceConfig.provider === "elevenlabs" ? input.voiceConfig.voiceId : config.defaultVoiceId,
    ragMaxDocumentsLength: 10_000,
  });
}

describe("@yuni/voice ElevenLabsAgentProvider", () => {
  it("creates and updates text knowledge base documents", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: "doc-text-1", name: "Context" }))
      .mockResolvedValueOnce(jsonResponse({ id: "doc-text-1", name: "Context v2" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await expect(provider.createTextDocument("Context", "Unique fact")).resolves.toEqual({
      id: "doc-text-1",
      name: "Context",
    });
    await provider.updateTextDocument("doc-text-1", "Context v2", "Updated fact");

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      new URL("https://api.elevenlabs.test/v1/convai/knowledge-base/text"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Context", text: "Unique fact" }),
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL("https://api.elevenlabs.test/v1/convai/knowledge-base/doc-text-1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("uploads file documents as multipart without overriding its boundary", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: "doc-file-1", name: "Guide" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await provider.createFileDocument({
      name: "Guide",
      fileName: "guide.md",
      mimeType: "text/markdown",
      bytes: new TextEncoder().encode("# Guide"),
    });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(FormData);
    expect(init?.headers).not.toHaveProperty("Content-Type");
    expect(init?.headers).toMatchObject({ "xi-api-key": "elevenlabs-key" });
  });

  it("builds a hybrid Knowledge Base payload and removes duplicated inline context", () => {
    const input = {
      ...avatarInput,
      includeInlineContext: false,
      knowledgeBase: [
        { type: "text", name: "Context", id: "text-1", usage_mode: "prompt" },
        { type: "file", name: "Guide", id: "file-1", usage_mode: "auto" },
      ],
    } satisfies AvatarAgentProviderSyncInput;
    const payload = createElevenLabsAgentPayload(input, { ...config, ragMaxDocumentsLength: 9_000 });

    expect(payload.conversation_config.agent.prompt.knowledge_base).toEqual(input.knowledgeBase);
    expect(payload.conversation_config.agent.prompt.rag).toEqual({
      enabled: true,
      embedding_model: "multilingual_e5_large_instruct",
      max_documents_length: 9_000,
    });
    expect(payload.conversation_config.agent.prompt.prompt).not.toContain(avatarInput.context);
    expect(createProviderSyncFingerprint(input)).not.toBe(createProviderSyncFingerprint(avatarInput));
  });

  it("keeps the fingerprint stable when excluded context or ignored speaking rate changes", () => {
    const withoutInlineContext = {
      ...avatarInput,
      includeInlineContext: false,
      context: "Context version A",
    } satisfies AvatarAgentProviderSyncInput;
    const differentExcludedContext = {
      ...withoutInlineContext,
      context: "Context version B",
    } satisfies AvatarAgentProviderSyncInput;
    const differentIgnoredSpeakingRate = {
      ...avatarInput,
      voiceConfig: { ...avatarInput.voiceConfig, speakingRate: 1.75 },
    } satisfies AvatarAgentProviderSyncInput;

    expect(createProviderSyncFingerprint(withoutInlineContext)).toBe(
      createProviderSyncFingerprint(differentExcludedContext)
    );
    expect(createProviderSyncFingerprint(avatarInput)).toBe(
      createProviderSyncFingerprint(differentIgnoredSpeakingRate)
    );
  });

  it("builds an atomic native group agent with its own Knowledge Base", () => {
    const groupInput = {
      ...avatarInput,
      sessionMode: "group" as const,
      knowledgeBase: [{ type: "file", name: "Guide", id: "file-1", usage_mode: "auto" as const }],
    } satisfies AvatarAgentProviderSyncInput;
    const payload = createElevenLabsAgentPayload(groupInput, config);

    expect(payload.conversation_config.agent.first_message).toBe("Conectado.");
    expect(payload.conversation_config.agent.prompt.prompt).toContain("instrucción privada del director");
    expect(payload.conversation_config.agent.prompt.prompt).toContain(
      "tu propia Knowledge Base de ElevenLabs"
    );
    expect(payload.conversation_config.agent.prompt.prompt).toContain(
      "No escribas tags expresivos, sonidos no verbales ni onomatopeyas"
    );
    expect(payload.conversation_config.agent.prompt.prompt).not.toContain("[laughs]");
    expect(payload.conversation_config.agent.prompt.llm).toBe("gpt-4o-mini");
    expect(payload.conversation_config.agent.prompt.knowledge_base).toEqual(groupInput.knowledgeBase);
    expect(payload.conversation_config.agent.prompt.tool_ids).toEqual([]);
    expect(payload.conversation_config.turn.turn_timeout).toBe(30);
    expect(payload.conversation_config.turn.soft_timeout_config).toEqual({
      timeout_seconds: -1,
      message: "Procesando la siguiente intervención.",
      use_llm_generated_message: false,
    });
    expect(createProviderSyncFingerprint(groupInput)).not.toBe(createProviderSyncFingerprint(avatarInput));
  });

  it("creates a single-use Scribe token without exposing the API key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ token: "sutkn-test" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await expect(provider.createScribeRealtimeToken()).resolves.toEqual({
      token: "sutkn-test",
      expiresInSeconds: 900,
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.elevenlabs.test/v1/single-use-token/realtime_scribe"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "xi-api-key": "elevenlabs-key" }),
      })
    );
  });

  it("normalizes RAG indexing responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: "processing" }))
      .mockResolvedValueOnce(jsonResponse({ indexes: [{ status: "completed" }] }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });
    await expect(provider.computeRagIndex("file-1")).resolves.toBe("processing");
    await expect(provider.getRagIndex("file-1")).resolves.toBe("ready");
  });

  it("creates an ElevenLabs agent from an avatar", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent(avatarInput);

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.elevenlabs.test/v1/convai/agents/create"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "xi-api-key": "elevenlabs-key",
          "Content-Type": "application/json",
        }),
        body: expect.any(String),
      })
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      name: "YUNI - Tutor Demo",
      tags: ["yuni", "avatar"],
      conversation_config: {
        asr: {
          provider: "scribe_realtime",
          user_input_audio_format: "pcm_24000",
        },
        agent: {
          prompt: {
            llm: "gpt-4o-mini",
            max_tokens: 220,
          },
        },
        tts: {
          model_id: "eleven_v3",
          voice_id: "default-voice",
          agent_output_audio_format: "pcm_24000",
        },
        turn: {
          turn_timeout: 10,
          turn_eagerness: "patient",
          interruption_ignore_terms: expect.arrayContaining(["sí", "ajá", "ok", "mmm"]),
          soft_timeout_config: {
            timeout_seconds: 3,
            message: "Mmm... lo estoy pensando.",
            use_llm_generated_message: true,
          },
        },
        conversation: {
          text_only: false,
          client_events: expect.arrayContaining([
            "audio",
            "user_transcript",
            "agent_response",
            "agent_response_correction",
            "interruption",
            "vad_score",
          ]),
        },
      },
    });
    expect(result.providerAgentId).toBe("agent-1");
    expect(result.synced).toBe(true);
  });

  it("lists saved ElevenLabs voices with pagination", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [
            {
              voice_id: "voice-1",
              name: "Agustin",
              description: "Relaxed and warm.",
              preview_url: "https://cdn.elevenlabs.test/voice-1.mp3",
              category: "cloned",
              labels: {
                gender: "male",
                accent: "argentinian",
              },
            },
          ],
          has_more: true,
          next_page_token: "next-page",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [
            {
              voice_id: "voice-2",
              name: "Sofia",
              labels: {
                use_case: "assistant",
                invalid: 1,
              },
            },
            {
              name: "Missing id",
            },
          ],
          has_more: false,
        })
      );
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await expect(provider.listVoices()).resolves.toEqual([
      {
        id: "voice-1",
        displayName: "Agustin",
        description: "Relaxed and warm.",
        provider: "elevenlabs",
        previewUrl: "https://cdn.elevenlabs.test/voice-1.mp3",
        category: "cloned",
        labels: {
          gender: "male",
          accent: "argentinian",
        },
        recommendedFor: "male · argentinian",
      },
      {
        id: "voice-2",
        displayName: "Sofia",
        description: "",
        provider: "elevenlabs",
        previewUrl: null,
        category: null,
        labels: {
          use_case: "assistant",
        },
        recommendedFor: "assistant",
      },
    ]);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://api.elevenlabs.test/v2/voices?voice_type=saved&page_size=100&sort=name&sort_direction=asc"
      ),
      expect.objectContaining({ method: "GET" })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://api.elevenlabs.test/v2/voices?voice_type=saved&page_size=100&sort=name&sort_direction=asc&next_page_token=next-page"
      ),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("lists saved ElevenLabs voices without requiring a default fallback voice", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        voices: [{ voice_id: "voice-1", name: "Agustin" }],
        has_more: false,
      })
    );
    const provider = new ElevenLabsAgentProvider({
      config: { ...config, defaultVoiceId: "" },
      fetch: fetcher,
    });

    await expect(provider.listVoices()).resolves.toEqual([
      expect.objectContaining({ id: "voice-1", displayName: "Agustin" }),
    ]);
  });

  it("surfaces provider errors while listing voices without leaking request secrets", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            status: "invalid_api_key",
            message: "Invalid API key",
          },
        },
        { status: 401 }
      )
    );
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    let caught: unknown;
    try {
      await provider.listVoices();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ElevenLabsProviderError);
    expect(String(caught)).toContain("ElevenLabs returned 401: invalid_api_key: Invalid API key");
    expect(String(caught)).not.toContain("elevenlabs-key");
  });

  it("updates an existing ElevenLabs agent when the fingerprint changed", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await provider.syncAvatarAgent({
      ...avatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: "old",
    });

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.elevenlabs.test/v1/convai/agents/agent-1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("recreates an existing agent only when its PATCH target no longer exists", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ detail: { status: "not_found", message: "Agent not found" } }, { status: 404 })
      )
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-recreated" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent({
      ...avatarInput,
      providerAgentId: "agent-missing",
      providerSyncFingerprint: "old",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      new URL("https://api.elevenlabs.test/v1/convai/agents/agent-missing"),
      expect.objectContaining({ method: "PATCH" })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL("https://api.elevenlabs.test/v1/convai/agents/create"),
      expect.objectContaining({ method: "POST" })
    );
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(fetcher.mock.calls[0]?.[1]?.body);
    expect(result.providerAgentId).toBe("agent-recreated");
    expect(result.synced).toBe(true);
  });

  it("does not recreate an existing agent after a non-404 PATCH failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "temporarily unavailable" }, { status: 503 }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await expect(
      provider.syncAvatarAgent({
        ...avatarInput,
        providerAgentId: "agent-1",
        providerSyncFingerprint: "old",
      })
    ).rejects.toThrow("ElevenLabs returned 503: temporarily unavailable");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: "PATCH" }));
  });

  it("skips provider calls when fingerprint is already synced", async () => {
    const fingerprint = expectedSyncFingerprint(avatarInput);
    const fetcher = vi.fn<typeof fetch>();
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent({
      ...avatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: fingerprint,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({
      providerAgentId: "agent-1",
      providerSyncFingerprint: fingerprint,
      synced: false,
    });
  });

  it.each([
    {
      field: "LLM model",
      staleFingerprint: createProviderSyncFingerprint(avatarInput, {
        agentLlmModel: "old-model",
        ttsModelId: config.agentTtsModel,
        effectiveVoiceId: config.defaultVoiceId,
      }),
    },
    {
      field: "effective fallback voice",
      staleFingerprint: createProviderSyncFingerprint(avatarInput, {
        agentLlmModel: config.agentLlmModel,
        ttsModelId: config.agentTtsModel,
        effectiveVoiceId: "old-default-voice",
      }),
    },
  ])("resyncs when the $field changes", async ({ staleFingerprint }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent({
      ...avatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: staleFingerprint,
    });

    expect(staleFingerprint).not.toBe(expectedSyncFingerprint(avatarInput));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: "PATCH" }));
    expect(result.providerSyncFingerprint).toBe(expectedSyncFingerprint(avatarInput));
  });

  it("falls back to Flash TTS when Expressive TTS is not allowed", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail: {
              status: "expressive_tts_not_allowed",
              message: "Expressive TTS is not allowed",
            },
          },
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent(avatarInput);
    const firstPayload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const secondPayload = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(firstPayload.conversation_config.tts.model_id).toBe("eleven_v3");
    expect(secondPayload.conversation_config.tts.model_id).toBe(ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL);
    expect(secondPayload.conversation_config.tts.agent_output_audio_format).toBe("pcm_24000");
    expect(secondPayload.conversation_config.tts.stability).toBe(0.45);
    expect(secondPayload.conversation_config.tts.similarity_boost).toBe(0.78);
    expect(secondPayload.conversation_config.tts.speed).toBe(0.98);
    expect(secondPayload.conversation_config.agent.prompt.prompt).toContain("sin escribir tags expresivos");
    expect(result).toEqual({
      providerAgentId: "agent-1",
      providerSyncFingerprint: expectedSyncFingerprint(avatarInput, ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL),
      synced: true,
    });
  });

  it("skips provider calls when fallback TTS fingerprint is already synced", async () => {
    const fingerprint = expectedSyncFingerprint(avatarInput, ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL);
    const fetcher = vi.fn<typeof fetch>();
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent({
      ...avatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: fingerprint,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({
      providerAgentId: "agent-1",
      providerSyncFingerprint: fingerprint,
      synced: false,
    });
  });

  it("resolves the documented Agents V3 model only for the natural profile", () => {
    expect(resolveElevenLabsAgentTtsModel("eleven_v3", "natural")).toBe("eleven_v3_conversational");
    expect(resolveElevenLabsAgentTtsModel("eleven_v3", "standard")).toBe("eleven_v3");
    expect(resolveElevenLabsAgentTtsModel("eleven_flash_v2_5", "natural")).toBe("eleven_flash_v2_5");
    expect(resolveElevenLabsAgentTtsModel("eleven_v3_conversational", "natural")).toBe(
      "eleven_v3_conversational"
    );
    expect(isExpressiveTtsModel("eleven_v3")).toBe(true);
    expect(isExpressiveTtsModel("eleven_v3_conversational")).toBe(true);
    expect(isExpressiveTtsModel("eleven_flash_v2_5")).toBe(false);
  });

  it("fingerprints the effective conversational model identically whether configured by current ID or legacy default", () => {
    expect(expectedSyncFingerprint(naturalAvatarInput, "eleven_v3")).toBe(
      expectedSyncFingerprint(naturalAvatarInput, "eleven_v3_conversational")
    );
    expect(createElevenLabsAgentPayload(naturalAvatarInput, config)).toEqual(
      createElevenLabsAgentPayload(naturalAvatarInput, {
        ...config,
        agentTtsModel: "eleven_v3_conversational",
      })
    );
  });

  it("makes natural one-to-one conversations more flexible while retaining the voice, LLM and connector", () => {
    const standard = createElevenLabsAgentPayload(avatarInput, config);
    const natural = createElevenLabsAgentPayload(naturalAvatarInput, config);
    const prompt = natural.conversation_config.agent.prompt;

    expect(natural.conversation_config.agent.first_message).toBe("Hola, soy Tutor Demo.");
    expect(natural.conversation_config.turn.turn_eagerness).toBe("normal");
    expect(prompt).toMatchObject({ llm: "gpt-4o-mini", temperature: 0.4, max_tokens: 512 });
    expect(prompt.prompt).toContain("Ajusta la longitud al momento");
    expect(prompt.prompt).toContain(avatarInput.instructions);
    expect(prompt.prompt).toContain("[laughs]");
    expect(prompt.prompt).not.toContain("prioriza el nuevo pedido");
    expect(natural.conversation_config.tts).toEqual({
      ...standard.conversation_config.tts,
      model_id: ELEVENLABS_CONVERSATIONAL_TTS_MODEL,
      expressive_mode: true,
    });
    expect(natural.conversation_config.asr).toEqual(standard.conversation_config.asr);
    expect(natural.conversation_config.conversation).toEqual(standard.conversation_config.conversation);
    expect(natural.conversation_config.agent.disable_first_message_interruptions).toBe(false);
  });

  it("does not apply the natural profile to group agents or change explicit standard configuration", () => {
    const groupInput = { ...avatarInput, sessionMode: "group" as const };
    const naturalGroup = { ...naturalAvatarInput, sessionMode: "group" as const };
    const explicitStandard = {
      ...avatarInput,
      voiceConfig: { ...avatarInput.voiceConfig, conversationProfile: "standard" as const },
    };
    expect(createElevenLabsAgentPayload(naturalGroup, config)).toEqual(
      createElevenLabsAgentPayload(groupInput, config)
    );
    expect(expectedSyncFingerprint(naturalGroup)).toBe(expectedSyncFingerprint(groupInput));
    expect(createElevenLabsAgentPayload(explicitStandard, config)).toEqual(
      createElevenLabsAgentPayload(avatarInput, config)
    );
    expect(expectedSyncFingerprint(explicitStandard)).toBe(expectedSyncFingerprint(avatarInput));
    expect(expectedSyncFingerprint(naturalAvatarInput)).not.toBe(expectedSyncFingerprint(avatarInput));
  });

  it("uses the avatar's GPT-5.4 model with no reasoning for natural direct conversations", () => {
    const input = {
      ...naturalAvatarInput,
      voiceConfig: { ...naturalAvatarInput.voiceConfig, conversationModel: "gpt-5.4" },
    } satisfies AvatarAgentProviderSyncInput;
    const payload = createElevenLabsAgentPayload(input, config);

    expect(payload.conversation_config.agent.prompt).toMatchObject({
      llm: "gpt-5.4",
      reasoning_effort: "none",
      temperature: 0.4,
      max_tokens: 512,
    });
    expect(payload.conversation_config.tts).toMatchObject({
      model_id: "eleven_v3_conversational",
      expressive_mode: true,
    });
    const legacy = createElevenLabsAgentPayload(avatarInput, config);
    expect(legacy.conversation_config.agent.prompt.llm).toBe("gpt-4o-mini");
    expect(legacy.conversation_config.agent.prompt).not.toHaveProperty("reasoning_effort");
    expect(
      createElevenLabsAgentPayload(naturalAvatarInput, config).conversation_config.agent.prompt.llm
    ).toBe("gpt-4o-mini");
  });

  it("ignores the avatar conversation model and profile in group payloads and fingerprints", () => {
    const groupInput = { ...avatarInput, sessionMode: "group" as const };
    const newAvatarGroup = {
      ...groupInput,
      voiceConfig: {
        ...groupInput.voiceConfig,
        conversationProfile: "natural" as const,
        conversationModel: "gpt-5.4",
      },
    } satisfies AvatarAgentProviderSyncInput;

    expect(createElevenLabsAgentPayload(newAvatarGroup, config)).toEqual(
      createElevenLabsAgentPayload(groupInput, config)
    );
    expect(expectedSyncFingerprint(newAvatarGroup)).toBe(expectedSyncFingerprint(groupInput));
    const globallyConfiguredGroup = createElevenLabsAgentPayload(newAvatarGroup, {
      ...config,
      agentLlmModel: "gpt-5.4",
    });
    expect(globallyConfiguredGroup.conversation_config.agent.prompt.llm).toBe("gpt-5.4");
    expect(globallyConfiguredGroup.conversation_config.agent.prompt).not.toHaveProperty("reasoning_effort");
  });

  it("fingerprints the effective per-avatar LLM independently of an unused global model", () => {
    const input = {
      ...naturalAvatarInput,
      voiceConfig: { ...naturalAvatarInput.voiceConfig, conversationModel: "gpt-5.4" },
    } satisfies AvatarAgentProviderSyncInput;
    expect(createProviderSyncFingerprint(input, { agentLlmModel: "gpt-4o-mini" })).toBe(
      createProviderSyncFingerprint(input, { agentLlmModel: "another-global-model" })
    );
    expect(createProviderSyncFingerprint(input)).not.toBe(createProviderSyncFingerprint(naturalAvatarInput));
    expect(createProviderSyncFingerprint(input)).not.toBe(
      createProviderSyncFingerprint({
        ...input,
        voiceConfig: { ...input.voiceConfig, conversationModel: "gpt-5.4-mini" },
      })
    );
  });

  it("updates an existing natural agent when its conversation model changes and caches the effective model", async () => {
    const input = {
      ...naturalAvatarInput,
      voiceConfig: { ...naturalAvatarInput.voiceConfig, conversationModel: "gpt-5.4" },
      providerAgentId: "agent-1",
      providerSyncFingerprint: expectedSyncFingerprint(naturalAvatarInput),
    } satisfies AvatarAgentProviderSyncInput;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }))
      .mockResolvedValueOnce(agentVoiceResponse())
      .mockResolvedValueOnce(agentVoiceResponse());
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent(input);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["PATCH", "GET"]);
    expect(
      JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).conversation_config.agent.prompt
    ).toMatchObject({
      llm: "gpt-5.4",
      reasoning_effort: "none",
    });
    expect(result.providerSyncFingerprint).toBe(expectedSyncFingerprint(input));
    expect(result.providerSyncFingerprint).not.toBe(input.providerSyncFingerprint);

    const cached = await provider.syncAvatarAgent({
      ...input,
      providerSyncFingerprint: result.providerSyncFingerprint,
    });
    expect(cached.synced).toBe(false);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["PATCH", "GET", "GET"]);
  });

  it("excludes retry and verification controls from the effective payload fingerprint", () => {
    expect(expectedSyncFingerprint({ ...naturalAvatarInput, retryExpressive: true, verifyVoice: true })).toBe(
      expectedSyncFingerprint(naturalAvatarInput)
    );
  });

  it("verifies actual voice settings after syncing a natural agent", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }))
      .mockResolvedValueOnce(agentVoiceResponse());
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent(naturalAvatarInput);

    expect(result).toEqual({
      providerAgentId: "agent-1",
      providerSyncFingerprint: expectedSyncFingerprint(naturalAvatarInput),
      synced: true,
      voiceState: {
        requestedModel: "eleven_v3_conversational",
        effectiveModel: "eleven_v3_conversational",
        expressiveMode: true,
        fallbackReason: null,
        verifiedAt: expect.any(String),
        profile: "natural",
      },
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL("https://api.elevenlabs.test/v1/convai/agents/agent-1"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("verifies cached natural agents instead of trusting a fingerprint as proof of provider state", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(agentVoiceResponse());
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent({
      ...naturalAvatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: expectedSyncFingerprint(naturalAvatarInput),
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(result.synced).toBe(false);
    expect(result.voiceState?.expressiveMode).toBe(true);
  });

  it("allows an explicit readback for standard agents without changing their payload", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(agentVoiceResponse(ELEVENLABS_EXPRESSIVE_TTS_MODEL));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });
    const result = await provider.syncAvatarAgent({
      ...avatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: expectedSyncFingerprint(avatarInput),
      verifyVoice: true,
    });
    expect(result.voiceState).toMatchObject({ profile: "standard", effectiveModel: "eleven_v3" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("keeps a known natural fallback cached until an expressive retry is requested", async () => {
    const fingerprint = expectedSyncFingerprint(naturalAvatarInput, ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(agentVoiceResponse(ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL, false))
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }))
      .mockResolvedValueOnce(agentVoiceResponse());
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });
    const input = { ...naturalAvatarInput, providerAgentId: "agent-1", providerSyncFingerprint: fingerprint };

    const cached = await provider.syncAvatarAgent(input);
    expect(cached).toMatchObject({
      synced: false,
      providerSyncFingerprint: fingerprint,
      voiceState: {
        effectiveModel: "eleven_flash_v2_5",
        expressiveMode: false,
        fallbackReason: "cached_fallback",
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");

    const retried = await provider.syncAvatarAgent({ ...input, retryExpressive: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).conversation_config.tts).toMatchObject({
      model_id: "eleven_v3_conversational",
      expressive_mode: true,
    });
    expect(retried.providerSyncFingerprint).toBe(expectedSyncFingerprint(naturalAvatarInput));
    expect(retried.voiceState).toMatchObject({
      effectiveModel: "eleven_v3_conversational",
      expressiveMode: true,
      fallbackReason: null,
    });
  });

  it("records verified Flash fallback without claiming that Expressive Mode is active", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ detail: { status: "expressive_tts_not_allowed" } }, { status: 400 })
      )
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }))
      .mockResolvedValueOnce(agentVoiceResponse(ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL, false));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent(naturalAvatarInput);

    expect(result.voiceState).toMatchObject({
      requestedModel: "eleven_v3_conversational",
      effectiveModel: "eleven_flash_v2_5",
      expressiveMode: false,
      fallbackReason: "expressive_tts_not_allowed",
      profile: "natural",
    });
    expect(result.providerSyncFingerprint).toBe(
      expectedSyncFingerprint(naturalAvatarInput, "eleven_flash_v2_5")
    );
    const fallbackPayload = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(fallbackPayload.conversation_config.tts.expressive_mode).toBe(false);
    expect(fallbackPayload.conversation_config.agent.prompt.prompt).toContain("sin escribir tags expresivos");
  });

  it.each([
    { actualModel: "eleven_flash_v2_5", expressiveMode: false, reason: "provider_model_differs" },
    { actualModel: "eleven_v3_conversational", expressiveMode: false, reason: "expressive_mode_disabled" },
    { actualModel: "eleven_v3_conversational", expressiveMode: null, reason: "expressive_mode_unverified" },
  ])(
    "does not return a successful desired fingerprint when readback reports $reason",
    async ({ actualModel, expressiveMode, reason }) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }))
        .mockResolvedValueOnce(agentVoiceResponse(actualModel, expressiveMode));
      const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

      const error = await provider.syncAvatarAgent(naturalAvatarInput).catch((error: unknown) => error);

      expect(error).toBeInstanceOf(ElevenLabsVoiceVerificationError);
      expect(error).toMatchObject({
        providerAgentId: "agent-1",
        voiceState: {
          requestedModel: "eleven_v3_conversational",
          effectiveModel: actualModel,
          expressiveMode,
          fallbackReason: reason,
        },
      });
    }
  );

  it("retains a newly created agent after failed verification so retry updates it instead of creating a duplicate", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-created" }))
      .mockResolvedValueOnce(jsonResponse({ message: "temporarily unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-created" }))
      .mockResolvedValueOnce(agentVoiceResponse());
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const error = await provider.syncAvatarAgent(naturalAvatarInput).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ElevenLabsVoiceVerificationError);
    if (!(error instanceof ElevenLabsVoiceVerificationError))
      throw new Error("Expected verification failure");
    expect(error).toMatchObject({
      providerAgentId: "agent-created",
      statusCode: 503,
      cause: { statusCode: 503 },
      voiceState: {
        requestedModel: "eleven_v3_conversational",
        effectiveModel: "unknown",
        expressiveMode: null,
        verifiedAt: null,
        fallbackReason: "voice_verification_failed",
        profile: "natural",
      },
    });
    expect(isTransientElevenLabsError(error)).toBe(true);

    const retried = await provider.syncAvatarAgent({
      ...naturalAvatarInput,
      providerAgentId: error.providerAgentId ?? null,
    });

    expect(retried.providerAgentId).toBe("agent-created");
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "PATCH", "GET"]);
    expect(fetcher.mock.calls[2]?.[0]).toEqual(
      new URL("https://api.elevenlabs.test/v1/convai/agents/agent-created")
    );
  });

  it("retains the cached agent identity and timeout retry classification when readback times out", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new DOMException("Timed out", "AbortError"));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const error = await provider
      .syncAvatarAgent({
        ...naturalAvatarInput,
        providerAgentId: "agent-cached",
        providerSyncFingerprint: expectedSyncFingerprint(naturalAvatarInput),
      })
      .catch((error: unknown) => error);

    expect(error).toMatchObject({
      providerAgentId: "agent-cached",
      voiceState: {
        effectiveModel: "unknown",
        verifiedAt: null,
        fallbackReason: "voice_verification_failed",
      },
    });
    expect(isTransientElevenLabsError(error)).toBe(true);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
  });

  it.each([
    { response: () => new Response("invalid JSON", { status: 200 }), effectiveModel: "unknown" },
    {
      response: () =>
        jsonResponse({
          conversation_config: { tts: { model_id: "eleven_v3_conversational", expressive_mode: "invalid" } },
        }),
      effectiveModel: "eleven_v3_conversational",
    },
  ])(
    "retains the created id and known model when voice response parsing fails ($effectiveModel)",
    async ({ response, effectiveModel }) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-created" }))
        .mockResolvedValueOnce(response());
      const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

      await expect(provider.syncAvatarAgent(naturalAvatarInput)).rejects.toMatchObject({
        providerAgentId: "agent-created",
        voiceState: {
          requestedModel: "eleven_v3_conversational",
          effectiveModel,
          expressiveMode: null,
          verifiedAt: null,
          fallbackReason: "voice_verification_failed",
          profile: "natural",
        },
      });
    }
  );

  it("detects provider drift on a cached fingerprint without silently accepting a fallback", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(agentVoiceResponse(ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL, false));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await expect(
      provider.syncAvatarAgent({
        ...naturalAvatarInput,
        providerAgentId: "agent-1",
        providerSyncFingerprint: expectedSyncFingerprint(naturalAvatarInput),
      })
    ).rejects.toMatchObject({ voiceState: { fallbackReason: "provider_model_differs" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("repairs provider drift when an explicit retry bypasses the desired fingerprint cache", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }))
      .mockResolvedValueOnce(agentVoiceResponse());
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.syncAvatarAgent({
      ...naturalAvatarInput,
      providerAgentId: "agent-1",
      providerSyncFingerprint: expectedSyncFingerprint(naturalAvatarInput),
      retryExpressive: true,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(result.synced).toBe(true);
    expect(result.voiceState).toMatchObject({
      effectiveModel: "eleven_v3_conversational",
      expressiveMode: true,
    });
  });

  it("rejects a fallback whose provider settings still have Expressive Mode enabled", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(agentVoiceResponse(ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL, true));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    await expect(
      provider.syncAvatarAgent({
        ...naturalAvatarInput,
        providerAgentId: "agent-1",
        providerSyncFingerprint: expectedSyncFingerprint(
          naturalAvatarInput,
          ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL
        ),
      })
    ).rejects.toMatchObject({
      voiceState: {
        effectiveModel: "eleven_flash_v2_5",
        expressiveMode: true,
        fallbackReason: "expressive_mode_unexpected",
      },
    });
  });

  it("returns only inspected voice diagnostics, preserving false and unknown expressive states", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          agent_id: "agent/private",
          platform_settings: { auth: { shareable_token: "private-token" } },
          conversation_config: {
            agent: { prompt: { prompt: "private prompt" } },
            tts: { model_id: "eleven_v3", expressive_mode: false },
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ conversation_config: { tts: { model_id: "eleven_v3" } } }));
    const provider = new ElevenLabsAgentProvider({ config, fetch: fetcher });

    const result = await provider.inspectAgentVoice("agent/private", "eleven_v3", "natural");
    expect(result).toEqual({
      requestedModel: "eleven_v3",
      effectiveModel: "eleven_v3",
      expressiveMode: false,
      fallbackReason: null,
      verifiedAt: expect.any(String),
      profile: "natural",
    });
    expect(fetcher.mock.calls[0]?.[0]).toEqual(
      new URL("https://api.elevenlabs.test/v1/convai/agents/agent%2Fprivate")
    );
    await expect(provider.inspectAgentVoice("agent-1", "eleven_v3")).resolves.toMatchObject({
      expressiveMode: null,
    });
  });

  it.each([
    {},
    { conversation_config: { tts: { model_id: "" } } },
    { conversation_config: { tts: { model_id: 123 } } },
    { conversation_config: { tts: { model_id: "eleven_v3", expressive_mode: "true" } } },
  ])("rejects malformed voice inspection responses", async (body) => {
    const provider = new ElevenLabsAgentProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(body)),
    });
    await expect(provider.inspectAgentVoice("agent-1", "eleven_v3")).rejects.toThrow(
      "ElevenLabs voice verification failed"
    );
  });

  it("keeps LiveAvatar connector-safe audio formats and client events", () => {
    const payload = createElevenLabsAgentPayload(avatarInput, config);

    expect(payload.conversation_config.asr.user_input_audio_format).toBe("pcm_24000");
    expect(payload.conversation_config.tts.agent_output_audio_format).toBe("pcm_24000");
    expect(payload.conversation_config.tts.model_id).toBe("eleven_v3");
    expect(payload.conversation_config.tts).not.toHaveProperty("stability");
    expect(payload.conversation_config.tts).not.toHaveProperty("similarity_boost");
    expect(payload.conversation_config.tts).not.toHaveProperty("speed");
    expect(payload.conversation_config.tts).not.toHaveProperty("pronunciation_dictionary_locators");
    expect(payload.conversation_config.conversation.text_only).toBe(false);
    expect(payload.conversation_config.conversation.client_events).toEqual([
      ...LIVEAVATAR_ELEVENLABS_CLIENT_EVENTS,
    ]);
  });

  it("keeps voice settings on the Flash fallback model", () => {
    const payload = createElevenLabsAgentPayload(avatarInput, {
      ...config,
      agentTtsModel: ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL,
    });

    expect(payload.conversation_config.tts).toMatchObject({
      model_id: ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL,
      stability: 0.45,
      similarity_boost: 0.78,
      speed: 0.98,
      pronunciation_dictionary_locators: [],
    });
  });

  it("keeps patient turn-taking and human soft timeout settings", () => {
    const payload = createElevenLabsAgentPayload(avatarInput, config);

    expect(payload.conversation_config.turn).toMatchObject({
      turn_timeout: 10,
      turn_eagerness: "patient",
      interruption_ignore_terms: ["si", "sí", "aja", "ajá", "ok", "okay", "dale", "claro", "mmm", "eh"],
      soft_timeout_config: {
        timeout_seconds: 3,
        message: "Mmm... lo estoy pensando.",
        use_llm_generated_message: true,
      },
    });
  });

  it("adds expressive human delivery rules to the prompt", () => {
    const payload = createElevenLabsAgentPayload(avatarInput, config);
    const prompt = payload.conversation_config.agent.prompt.prompt;

    expect(prompt).toContain("1 a 3 frases");
    expect(prompt).toContain("muletillas cortas");
    expect(prompt).toContain("[laughs]");
    expect(prompt).toContain("[sighs]");
    expect(prompt).toContain("[slow]");
    expect(prompt).toContain("[excited]");
    expect(prompt).toContain("Si el usuario interrumpe");
  });

  it("changes the fingerprint when the connector event config changes", () => {
    const currentFingerprint = createProviderSyncFingerprint(avatarInput, {
      ttsModelId: config.agentTtsModel,
    });
    const previousFingerprint = createProviderSyncFingerprint(avatarInput, {
      syncConfig: {
        ...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG,
        version: 1,
        clientEvents: ["conversation_initiation_metadata", "interruption"],
      },
      ttsModelId: config.agentTtsModel,
    });

    expect(currentFingerprint).not.toBe(previousFingerprint);
  });

  it("changes the fingerprint when an effective turn timeout changes", () => {
    const currentFingerprint = createProviderSyncFingerprint(avatarInput, {
      ttsModelId: config.agentTtsModel,
    });
    const previousFingerprint = createProviderSyncFingerprint(avatarInput, {
      syncConfig: {
        ...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG,
        turn: {
          ...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn,
          turnTimeout: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.turn.turnTimeout + 1,
        },
      },
      ttsModelId: config.agentTtsModel,
    });

    expect(currentFingerprint).not.toBe(previousFingerprint);
  });

  it("ignores connector fields that do not affect the selected TTS payload", () => {
    const currentFingerprint = createProviderSyncFingerprint(avatarInput, {
      ttsModelId: ELEVENLABS_EXPRESSIVE_TTS_MODEL,
    });
    const ignoredPresetFingerprint = createProviderSyncFingerprint(avatarInput, {
      syncConfig: {
        ...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG,
        version: LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.version - 1,
        voiceSettings: {
          ...LIVEAVATAR_ELEVENLABS_SYNC_CONFIG.voiceSettings,
          speed: 1,
        },
      },
      ttsModelId: ELEVENLABS_EXPRESSIVE_TTS_MODEL,
    });

    expect(currentFingerprint).toBe(ignoredPresetFingerprint);
  });

  it("changes the fingerprint when effective prompt, LLM, voice, or Knowledge Base changes", () => {
    const nativeVoiceInput = {
      ...avatarInput,
      voiceConfig: { provider: "elevenlabs" as const, voiceId: "voice-a", speakingRate: 1 },
    } satisfies AvatarAgentProviderSyncInput;
    const knowledgeBaseInput = {
      ...avatarInput,
      knowledgeBase: [{ type: "file" as const, name: "Guide", id: "file-1", usage_mode: "auto" as const }],
    } satisfies AvatarAgentProviderSyncInput;

    expect(createProviderSyncFingerprint(avatarInput)).not.toBe(
      createProviderSyncFingerprint({ ...avatarInput, instructions: "Use a different effective prompt." })
    );
    expect(createProviderSyncFingerprint(avatarInput, { agentLlmModel: "model-a" })).not.toBe(
      createProviderSyncFingerprint(avatarInput, { agentLlmModel: "model-b" })
    );
    expect(createProviderSyncFingerprint(nativeVoiceInput)).not.toBe(
      createProviderSyncFingerprint({
        ...nativeVoiceInput,
        voiceConfig: { ...nativeVoiceInput.voiceConfig, voiceId: "voice-b" },
      })
    );
    expect(createProviderSyncFingerprint(avatarInput)).not.toBe(
      createProviderSyncFingerprint(knowledgeBaseInput)
    );
  });

  it("canonicalizes Knowledge Base order in the effective fingerprint", () => {
    const documents = [
      { type: "file" as const, name: "B", id: "file-b", usage_mode: "auto" as const },
      { type: "text" as const, name: "A", id: "text-a", usage_mode: "prompt" as const },
    ];

    expect(createProviderSyncFingerprint({ ...avatarInput, knowledgeBase: documents })).toBe(
      createProviderSyncFingerprint({ ...avatarInput, knowledgeBase: [...documents].reverse() })
    );
  });

  it("changes the fingerprint when the TTS model changes", () => {
    expect(createProviderSyncFingerprint(avatarInput, { ttsModelId: "eleven_v3" })).not.toBe(
      createProviderSyncFingerprint(avatarInput, { ttsModelId: ELEVENLABS_EXPRESSIVE_TTS_FALLBACK_MODEL })
    );
  });

  it("changes the fingerprint when the RAG configuration changes", () => {
    const inputWithKnowledgeBase = {
      ...avatarInput,
      knowledgeBase: [{ type: "file" as const, name: "Guide", id: "file-1", usage_mode: "auto" as const }],
    };

    expect(createProviderSyncFingerprint(inputWithKnowledgeBase, { ragMaxDocumentsLength: 10_000 })).not.toBe(
      createProviderSyncFingerprint(inputWithKnowledgeBase, { ragMaxDocumentsLength: 20_000 })
    );
  });

  it("uses ElevenLabs voice id when the avatar voice config already targets ElevenLabs", () => {
    const payload = createElevenLabsAgentPayload(
      {
        ...avatarInput,
        voiceConfig: {
          provider: "elevenlabs",
          voiceId: "voice-123",
          speakingRate: 1.1,
        },
      },
      config
    );

    expect(payload.conversation_config.tts.voice_id).toBe("voice-123");
    expect(payload.conversation_config.tts).not.toHaveProperty("speed");
  });

  it("syncs an ElevenLabs voice avatar without requiring a default fallback voice", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ agent_id: "agent-1" }));
    const provider = new ElevenLabsAgentProvider({
      config: { ...config, defaultVoiceId: "" },
      fetch: fetcher,
    });

    await provider.syncAvatarAgent({
      ...avatarInput,
      voiceConfig: {
        provider: "elevenlabs",
        voiceId: "voice-123",
        speakingRate: 1,
      },
    });

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).conversation_config.tts.voice_id).toBe(
      "voice-123"
    );
  });

  it("requires a default fallback voice for legacy non-ElevenLabs avatar voices", async () => {
    const provider = new ElevenLabsAgentProvider({
      config: { ...config, defaultVoiceId: "" },
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(provider.syncAvatarAgent(avatarInput)).rejects.toBeInstanceOf(
      ElevenLabsDefaultVoiceUnavailableError
    );
  });

  it("throws unavailable when ElevenLabs config is incomplete", async () => {
    const provider = new ElevenLabsAgentProvider({
      config: { ...config, apiKey: "" },
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(provider.syncAvatarAgent(avatarInput)).rejects.toBeInstanceOf(
      ElevenLabsProviderUnavailableError
    );
  });

  it("summarizes provider failures without leaking request secrets", async () => {
    const provider = new ElevenLabsAgentProvider({
      config,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ message: "invalid agent config" }, { status: 422 })),
    });

    await expect(provider.syncAvatarAgent(avatarInput)).rejects.toThrow(
      new ElevenLabsProviderError("ElevenLabs returned 422: invalid agent config")
    );
  });

  it("surfaces nested ElevenLabs provider detail messages", async () => {
    const provider = new ElevenLabsAgentProvider({
      config,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse(
            { detail: { status: "voice_not_found", message: "Voice does not exist or is not available." } },
            { status: 400 }
          )
        ),
    });

    await expect(provider.syncAvatarAgent(avatarInput)).rejects.toThrow(
      new ElevenLabsProviderError(
        "ElevenLabs returned 400: voice_not_found: Voice does not exist or is not available."
      )
    );
  });
});
