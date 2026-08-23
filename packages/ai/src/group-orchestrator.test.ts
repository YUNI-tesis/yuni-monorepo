import { describe, expect, it, vi } from "vitest";
import { createOpenAiGroupOrchestrator, routeRound } from "./group-orchestrator";

const roster = [
  { id: "juana", name: "Juana Balance", description: "tutora de contabilidad y balances" },
  { id: "juan", name: "Juan Gutiérrez", description: "especialista en inversiones y portfolios" },
  { id: "test", name: "Test Eleven Labs", description: "especialista en tecnología" },
];

const noOpenAi = {
  apiKey: "",
  defaultModel: "gpt-4.1-mini",
  groupRouterModel: "gpt-5.4-nano",
  groupRouterTimeoutMs: 3000,
  defaultRealtimeModel: "gpt-4o-realtime-preview",
  embeddingsModel: "text-embedding-3-small",
};

describe("LangGraph group director", () => {
  it("routes an introduction in fixed order without generating public answers", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await createOpenAiGroupOrchestrator({ config: noOpenAi, fetchImpl }).planRound({
      transcript: [{ role: "user", content: "¿Podrían introducirse una vez cada uno?" }],
      rollingSummary: "",
      currentRequest: "¿Podrían introducirse una vez cada uno?",
      roster,
      contextVersion: 1,
    });
    expect(result.intent).toBe("collective");
    expect(result.routing.strategy).toBe("deterministic");
    expect(result.instructions.map((turn) => turn.avatarId)).toEqual(["juana", "juan", "test"]);
    expect(result.instructions.every((turn) => turn.instruction.includes("Knowledge Base"))).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("honors names, ranks normal requests and caps debates", () => {
    expect(routeRound("Juan Gutiérrez, tu turno", roster)).toMatchObject({
      kind: "deterministic",
      intent: "named",
      speakerIds: ["juan"],
    });
    expect(routeRound("¿Cómo diversifico mi portfolio de inversiones?", roster)).toMatchObject({
      kind: "model",
      intent: "normal",
      speakerIds: [],
    });
    expect(routeRound("Debatan y comparen sus enfoques", roster)).toMatchObject({
      kind: "model",
      intent: "debate",
      speakerIds: [],
    });
  });

  it("uses one model call to select speakers and prepare their private instructions", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          output_text: JSON.stringify({
            intent: "debate",
            reason: "Ambos aportan perspectivas complementarias.",
            turns: [
              { avatarId: "juan", instruction: "Instrucción para Juan" },
              { avatarId: "juana", instruction: "Instrucción para Juana" },
            ],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const result = await createOpenAiGroupOrchestrator({
      config: { ...noOpenAi, apiKey: "test-key" },
      fetchImpl,
    }).planRound({
      transcript: [],
      rollingSummary: "",
      currentRequest: "Debatan este tema",
      roster: roster.slice(0, 2),
      contextVersion: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.instructions).toEqual([
      { avatarId: "juan", instruction: "Instrucción para Juan" },
      { avatarId: "juana", instruction: "Instrucción para Juana" },
    ]);
    expect(result.routing).toMatchObject({
      strategy: "model",
      intent: "debate",
      speakerIds: ["juan", "juana"],
      model: "gpt-5.4-nano",
      fallbackReason: null,
    });
  });
});
