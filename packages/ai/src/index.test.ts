import { describe, expect, it, vi } from "vitest";
import {
  createOpenAiConversationTitleGenerator,
  fallbackConversationTitle,
  sanitizeConversationTitle,
} from "./index";

describe("@yuni/ai conversation titles", () => {
  it("returns null without an OpenAI API key", async () => {
    const fetchImpl = vi.fn();
    const generator = createOpenAiConversationTitleGenerator({
      config: {
        apiKey: "",
        defaultModel: "gpt-4.1-mini",
        groupRouterModel: "gpt-5.4-nano",
        groupRouterTimeoutMs: 3000,
        defaultRealtimeModel: "gpt-4o-realtime-preview",
        embeddingsModel: "text-embedding-3-small",
      },
      fetchImpl,
    });

    await expect(
      generator.generateTitle({
        avatarName: "Tutor Demo",
        messages: [{ role: "user", content: "Hola" }],
      })
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls the Responses API and extracts output_text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: '"Practica de derivadas."' }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const generator = createOpenAiConversationTitleGenerator({
      config: {
        apiKey: "sk-test",
        defaultModel: "gpt-4.1-mini",
        groupRouterModel: "gpt-5.4-nano",
        groupRouterTimeoutMs: 3000,
        defaultRealtimeModel: "gpt-4o-realtime-preview",
        embeddingsModel: "text-embedding-3-small",
      },
      fetchImpl,
    });

    await expect(
      generator.generateTitle({
        avatarName: "Tutor Demo",
        messages: [
          { role: "user", content: "Necesito practicar derivadas." },
          { role: "assistant", content: "Empecemos con regla de potencia." },
        ],
      })
    ).resolves.toBe("Practica de derivadas");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      })
    );
  });

  it("sanitizes generated titles", () => {
    expect(sanitizeConversationTitle("  “Este titulo tiene demasiadas palabras para guardar bien.” ")).toBe(
      "Este titulo tiene demasiadas palabras para"
    );
    expect(sanitizeConversationTitle("...")).toBeNull();
  });

  it("builds deterministic fallback titles", () => {
    expect(
      fallbackConversationTitle({
        avatarName: "Tutor Demo",
        messages: [{ role: "user", content: "Necesito practicar derivadas para el parcial." }],
      })
    ).toBe("Necesito practicar derivadas para el parcial");
    expect(fallbackConversationTitle({ avatarName: "Tutor Demo", messages: [] })).toBe(
      "Llamada sin mensajes"
    );
  });
});
