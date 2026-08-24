import { describe, expect, it, vi } from "vitest";
import type { OpenAiConfig } from "@yuni/config";
import {
  createDeterministicGroupRoundFallback,
  createOpenAiGroupOrchestrator,
  routeRound,
  type GroupOrchestrationAvatar,
  type GroupOrchestratorInput,
} from "./group-orchestrator";

const roster: GroupOrchestrationAvatar[] = [
  {
    id: "juana",
    name: "Juana Balance",
    description: "tutora de contabilidad y balances",
    instructions: "Explica registraciones, estados financieros e impuestos.",
    knowledgeDocumentNames: ["Manual contable", "Normas impositivas"],
  },
  {
    id: "juan",
    name: "Juan Gutiérrez",
    description: "especialista en inversiones y portfolios",
    instructions: "Analiza riesgo, retornos y diversificación de inversiones.",
    knowledgeDocumentNames: ["Guía de portfolios", "Bonos y acciones"],
  },
  {
    id: "test",
    name: "Test Eleven Labs",
    description: "especialista en tecnología y voz sintética",
    instructions: "Explica integraciones de software y agentes de voz.",
    knowledgeDocumentNames: ["Arquitectura LiveAvatar", "API de voz"],
  },
];

const config: OpenAiConfig = {
  apiKey: "test-key",
  defaultModel: "gpt-4.1-mini",
  groupRouterModel: "gpt-5.4-nano",
  groupRouterTimeoutMs: 3000,
  embeddingsModel: "text-embedding-3-small",
};

function input(overrides: Partial<GroupOrchestratorInput> = {}): GroupOrchestratorInput {
  return {
    transcript: [],
    rollingSummary: "",
    currentRequest: "¿Cómo diversifico mis inversiones?",
    roster,
    contextVersion: 7,
    ...overrides,
  };
}

function responsePlan(
  turns: Array<{ avatarId: string; instruction: string }>,
  intent: "normal" | "debate" = "normal"
) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ intent, reason: "Selección por especialidad.", turns }),
            },
          ],
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function requestBody(fetchImpl: ReturnType<typeof vi.fn>) {
  const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("semantic group router", () => {
  it.each(["Preséntense", "Hagamos una ronda", "Respondan por turnos"])(
    "routes the explicit collective request %s without a model call",
    async (currentRequest) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
        input({ currentRequest })
      );

      expect(plan.intent).toBe("collective");
      expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juana", "juan", "test"]);
      expect(plan.routing.strategy).toBe("deterministic");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("keeps a named singular introduction as an individual turn", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({ currentRequest: "Juana, presentate" })
    );

    expect(plan.intent).toBe("named");
    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juana"]);
    expect(plan.routing.strategy).toBe("deterministic");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not turn a named infinitive introduction into a collective round", () => {
    expect(routeRound("¿Puede Juana Balance presentarse?", roster)).toMatchObject({
      kind: "deterministic",
      intent: "named",
      speakerIds: ["juana"],
    });
  });

  it("resolves a unique first name deterministically in fixed roster order", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({ currentRequest: "Juana y Test, expliquen el problema" })
    );

    expect(plan.intent).toBe("named");
    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juana", "test"]);
    expect(plan.routing.strategy).toBe("deterministic");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends an ambiguous first name to the model", async () => {
    const duplicateNames = [
      { id: "juan-p", name: "Juan Pérez", description: "contador" },
      { id: "juan-g", name: "Juan Gómez", description: "inversor" },
    ];
    expect(routeRound("Juan, respondé", duplicateNames)).toMatchObject({ kind: "model" });
    expect(routeRound("Juan Pérez, respondé", duplicateNames)).toMatchObject({
      kind: "deterministic",
      speakerIds: ["juan-p"],
    });

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePlan([{ avatarId: "juan-g", instruction: "Respondé desde inversiones." }]));
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({ currentRequest: "Juan, respondé", roster: duplicateNames })
    );

    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juan-g"]);
    expect(plan.routing.strategy).toBe("model");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a token inside a compound full name as another avatar's first name", () => {
    const compoundNames = [
      { id: "juan-carlos", name: "Juan Carlos", description: "contador" },
      { id: "carlos-perez", name: "Carlos Pérez", description: "inversor" },
    ];

    expect(routeRound("Juan Carlos, tu turno", compoundNames)).toMatchObject({
      kind: "deterministic",
      intent: "named",
      speakerIds: ["juan-carlos"],
    });
    expect(routeRound("Juan Carlos y Carlos, respondan", compoundNames)).toMatchObject({
      kind: "deterministic",
      intent: "named",
      speakerIds: ["juan-carlos", "carlos-perez"],
    });
  });

  it("keeps collective keywords token-bound and leaves transitive presentations to the model", () => {
    expect(routeRound("¿Qué métodos de participación recomiendas?", roster)).toMatchObject({
      kind: "model",
      intent: "normal",
    });
    expect(routeRound("Quiero evitar que se presenten errores", roster)).toMatchObject({
      kind: "model",
      intent: "normal",
    });
    expect(routeRound("Presenten su análisis", roster)).toMatchObject({
      kind: "model",
      intent: "normal",
    });
  });

  it("does not rewrite a collective transitive presentation as self-introductions", async () => {
    const plan = await createOpenAiGroupOrchestrator({ config }).planRound(
      input({ currentRequest: "Todos presenten su análisis" })
    );

    expect(plan.intent).toBe("collective");
    expect(plan.instructions).toHaveLength(3);
    expect(plan.instructions.every((turn) => !turn.instruction.includes("Presentate solamente vos"))).toBe(
      true
    );
  });

  it("lets longest-first name resolution handle one-word and duplicate full names", () => {
    const overlappingNames = [
      { id: "juan-carlos", name: "Juan Carlos", description: "contador" },
      { id: "carlos", name: "Carlos", description: "inversor" },
    ];
    const duplicateFullNames = [
      { id: "alex-1", name: "Alex", description: "contador" },
      { id: "alex-2", name: "Alex", description: "inversor" },
    ];

    expect(routeRound("Juan Carlos, respondé", overlappingNames)).toMatchObject({
      kind: "deterministic",
      intent: "named",
      speakerIds: ["juan-carlos"],
    });
    expect(routeRound("Alex, respondé", duplicateFullNames)).toMatchObject({
      kind: "model",
      intent: "normal",
    });
  });

  it.each(["¿Qué establece el acuerdo comercial?", "¿Cómo diseño un juego por turnos?"])(
    "keeps the domain request %s in semantic classification",
    async (currentRequest) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          responsePlan([{ avatarId: "juana", instruction: "Respondé desde tu especialidad." }])
        );
      const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
        input({ currentRequest })
      );

      expect(plan.intent).toBe("normal");
      expect(plan.instructions).toHaveLength(1);
      expect(plan.routing.strategy).toBe("model");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it("uses the dedicated Responses model with strict output and no reasoning", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePlan([{ avatarId: "juan", instruction: "Explicá diversificación." }]));
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(input());
    const body = requestBody(fetchImpl);

    expect(plan.instructions).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      model: "gpt-5.4-nano",
      reasoning: { effort: "none" },
      store: false,
      max_output_tokens: 1000,
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: "group_round_plan", strict: true },
      },
    });
    expect(body).not.toHaveProperty("tools");
  });

  it("lets the semantic call classify a non-keyword request as debate", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responsePlan(
        [
          { avatarId: "juana", instruction: "Aportá el impacto contable." },
          { avatarId: "juan", instruction: "Aportá el impacto financiero." },
        ],
        "debate"
      )
    );
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({ currentRequest: "Analicen juntos este escenario" })
    );

    expect(plan.intent).toBe("debate");
    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juana", "juan"]);
    expect(plan.routing.strategy).toBe("model");
  });

  it("bounds context and sends KB filenames without document IDs or bodies", async () => {
    const messages = Array.from({ length: 13 }, (_, index) => ({
      id: `message-${index}`,
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message-${index}-${"x".repeat(1_700)}`,
      speakerAvatarId: index % 2 === 0 ? null : "juana",
    }));
    messages.push({
      id: "current-message",
      role: "user",
      content: "¿Cómo diversifico mis inversiones?",
      speakerAvatarId: null,
    });
    const unsafeAvatar = {
      ...roster[0]!,
      instructions: "i".repeat(2_000),
      knowledgeDocumentNames: Array.from({ length: 12 }, (_, index) => `Documento ${index}`),
      providerDocumentId: "provider-doc-id",
      knowledgeDocumentBodies: ["SECRET_CHUNK_BODY"],
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePlan([{ avatarId: "juana", instruction: "Respondé en forma breve." }]));

    await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({
        transcript: messages,
        currentMessageId: "current-message",
        rollingSummary: `old-${"s".repeat(4_500)}-recent`,
        roster: [unsafeAvatar, ...roster.slice(1)],
      })
    );

    const body = requestBody(fetchImpl);
    const modelInput = JSON.parse(String(body.input)) as {
      roster: Array<{ instructions: string; knowledgeDocumentNames: string[] }>;
      recentTranscript: Array<{ content: string }>;
      rollingSummary: string;
    };
    expect(modelInput.recentTranscript).toHaveLength(10);
    expect(modelInput.recentTranscript.some((message) => message.content.includes("current-message"))).toBe(
      false
    );
    expect(modelInput.recentTranscript.every((message) => message.content.length <= 1500)).toBe(true);
    expect(modelInput.rollingSummary).toHaveLength(4000);
    expect(modelInput.rollingSummary.endsWith("recent")).toBe(true);
    expect(modelInput.roster[0]?.instructions).toHaveLength(1500);
    expect(modelInput.roster[0]?.knowledgeDocumentNames).toHaveLength(10);
    expect(String(body)).not.toContain("provider-doc-id");
    expect(String(body)).not.toContain("SECRET_CHUNK_BODY");
  });

  it("falls back to exactly one weighted expert when OpenAI is unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const plan = await createOpenAiGroupOrchestrator({
      config: { ...config, apiKey: "" },
      fetchImpl,
    }).planRound(input({ currentRequest: "¿Qué dice la guía de portfolios sobre riesgo?" }));

    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juan"]);
    expect(plan.routing).toMatchObject({
      strategy: "fallback",
      fallbackReason: "missing_api_key",
      speakerIds: ["juan"],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prefers the last active speaker when fallback terms do not overlap", () => {
    const plan = createDeterministicGroupRoundFallback(
      input({
        currentRequest: "¿Y ahora qué hacemos?",
        transcript: [
          { role: "assistant", content: "Aporte previo", speakerAvatarId: "test" },
          { role: "user", content: "¿Y ahora qué hacemos?" },
        ],
      }),
      { fallbackReason: "router_exception" }
    );

    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["test"]);
    expect(plan.routing.fallbackReason).toBe("router_exception");
  });

  it("uses the two best deterministic experts after a debate model failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 }));
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({ currentRequest: "Debatan y comparen riesgo de inversiones con registro contable" })
    );

    expect(plan.intent).toBe("debate");
    expect(plan.instructions.map((turn) => turn.avatarId)).toEqual(["juan", "juana"]);
    expect(plan.routing).toMatchObject({ strategy: "fallback", fallbackReason: "http_503" });
  });

  it("keeps the no-model fallback conservative unless the user uses a clear plural imperative", async () => {
    const unavailableConfig = { ...config, apiKey: "" };
    const normalPlan = await createOpenAiGroupOrchestrator({ config: unavailableConfig }).planRound(
      input({ currentRequest: "Quiero saber si están de acuerdo con la propuesta" })
    );
    const debatePlans = await Promise.all(
      ["Comparen esta inversión con el registro contable", "Discutan esta propuesta"].map((currentRequest) =>
        createOpenAiGroupOrchestrator({ config: unavailableConfig }).planRound(input({ currentRequest }))
      )
    );

    expect(normalPlan.intent).toBe("normal");
    expect(normalPlan.instructions).toHaveLength(1);
    expect(debatePlans.every((plan) => plan.intent === "debate")).toBe(true);
    expect(debatePlans.every((plan) => plan.instructions.length === 2)).toBe(true);
  });

  it.each([
    {
      name: "unknown avatar",
      value: { intent: "normal", reason: "x", turns: [{ avatarId: "foreign", instruction: "x" }] },
    },
    {
      name: "duplicate avatar",
      value: {
        intent: "debate",
        reason: "x",
        turns: [
          { avatarId: "juan", instruction: "x" },
          { avatarId: "juan", instruction: "y" },
        ],
      },
      request: "Debatan este tema",
    },
    {
      name: "normal cardinality",
      value: {
        intent: "normal",
        reason: "x",
        turns: [
          { avatarId: "juan", instruction: "x" },
          { avatarId: "juana", instruction: "y" },
        ],
      },
    },
    {
      name: "empty instruction",
      value: { intent: "normal", reason: "x", turns: [{ avatarId: "juan", instruction: "  " }] },
    },
    {
      name: "extra property",
      value: {
        intent: "normal",
        reason: "x",
        turns: [{ avatarId: "juan", instruction: "x", publicAnswer: "leak" }],
      },
    },
  ])("rejects an invalid model plan: $name", async ({ value, request }) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify(value) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(
      input({ currentRequest: request ?? "¿Cómo diversifico inversiones?" })
    );

    expect(plan.routing).toMatchObject({ strategy: "fallback", fallbackReason: "invalid_model_plan" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(plan.instructions).toHaveLength(plan.intent === "normal" ? 1 : 2);
  });

  it("falls back on a model refusal", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal", refusal: "No puedo." }] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(input());

    expect(plan.routing).toMatchObject({ strategy: "fallback", fallbackReason: "model_refusal" });
  });

  it("rejects an incomplete Responses result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "incomplete", output: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const plan = await createOpenAiGroupOrchestrator({ config, fetchImpl }).planRound(input());

    expect(plan.routing).toMatchObject({ strategy: "fallback", fallbackReason: "incomplete_response" });
  });

  it("aborts a slow router request at the configured timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const plan = await createOpenAiGroupOrchestrator({
      config: { ...config, groupRouterTimeoutMs: 5 },
      fetchImpl,
    }).planRound(input());

    expect(plan.routing).toMatchObject({ strategy: "fallback", fallbackReason: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
