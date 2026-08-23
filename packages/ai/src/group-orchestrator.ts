import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { hasOpenAiConfig, openAiConfig, type OpenAiConfig } from "@yuni/config";

export type GroupOrchestrationAvatar = {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  knowledgeDocumentNames?: string[];
};

export type GroupOrchestrationMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  speakerAvatarId?: string | null;
};

export type GroupRoundIntent = "named" | "collective" | "normal" | "debate";
export type SemanticGroupRoundIntent = Extract<GroupRoundIntent, "normal" | "debate">;
export type GroupRoutingStrategy = "deterministic" | "model" | "fallback";

export type GroupTurnInstruction = {
  avatarId: string;
  instruction: string;
};

export type GroupRoutingMetadata = {
  version: 1;
  strategy: GroupRoutingStrategy;
  intent: GroupRoundIntent;
  speakerIds: string[];
  reason: string;
  model: string | null;
  latencyMs: number;
  fallbackReason: string | null;
  contextVersion: number;
};

export type GroupRoundPlan = {
  intent: GroupRoundIntent;
  instructions: GroupTurnInstruction[];
  routing: GroupRoutingMetadata;
};

export type GroupOrchestratorInput = {
  transcript: GroupOrchestrationMessage[];
  rollingSummary: string;
  currentRequest: string;
  currentMessageId?: string;
  roster: GroupOrchestrationAvatar[];
  contextVersion: number;
};

export interface GroupConversationOrchestrator {
  planRound(input: GroupOrchestratorInput): Promise<GroupRoundPlan>;
}

export type RoutedRound =
  | {
      kind: "deterministic";
      intent: Extract<GroupRoundIntent, "named" | "collective">;
      speakerIds: string[];
      reason: string;
    }
  | {
      kind: "model";
      intent: SemanticGroupRoundIntent;
      speakerIds: [];
      reason: string;
    };

export type OpenAiGroupOrchestratorOptions = {
  config?: OpenAiConfig;
  fetchImpl?: typeof fetch;
};

export type DeterministicGroupFallbackOptions = {
  intent?: SemanticGroupRoundIntent;
  fallbackReason?: string;
};

type ValidatedModelPlan = {
  intent: SemanticGroupRoundIntent;
  reason: string;
  instructions: GroupTurnInstruction[];
};

type ModelPlanningResult =
  | { ok: true; plan: ValidatedModelPlan; latencyMs: number }
  | { ok: false; fallbackReason: string; latencyMs: number };

const GraphState = Annotation.Root({
  input: Annotation<GroupOrchestratorInput>(),
  plan: Annotation<GroupRoundPlan>(),
});

const responsesApiUrl = "https://api.openai.com/v1/responses";
const maxCurrentRequestChars = 4_000;
const maxRollingSummaryChars = 4_000;
const maxRecentMessages = 10;
const maxMessageChars = 1_500;
const maxAvatarNameChars = 120;
const maxAvatarDescriptionChars = 800;
const maxAvatarInstructionsChars = 1_500;
const maxDocumentNames = 10;
const maxDocumentNameChars = 180;
const maxModelReasonChars = 600;
const maxModelInstructionChars = 2_000;

export function createOpenAiGroupOrchestrator(
  options: OpenAiGroupOrchestratorOptions = {}
): GroupConversationOrchestrator {
  const config = options.config ?? openAiConfig;
  const fetchImpl = options.fetchImpl ?? fetch;
  const graph = new StateGraph(GraphState)
    .addNode("plan_round", async (state) => ({
      plan: await planGroupRound(state.input, config, fetchImpl),
    }))
    .addEdge(START, "plan_round")
    .addEdge("plan_round", END)
    .compile();

  return {
    async planRound(input) {
      const result = await graph.invoke({ input });
      return result.plan;
    },
  };
}

export function routeRound(request: string, roster: GroupOrchestrationAvatar[]): RoutedRound {
  if (isCollectiveRequest(request)) {
    return {
      kind: "deterministic",
      intent: "collective",
      speakerIds: roster.map((avatar) => avatar.id),
      reason: "Pedido colectivo explícito; se conserva el orden fijo del grupo.",
    };
  }

  const mentions = resolveNameMentions(request, roster);
  if (mentions.ambiguous) {
    return {
      kind: "model",
      intent: isExplicitDebateRequest(request) ? "debate" : "normal",
      speakerIds: [],
      reason: "La mención abreviada coincide con más de un participante.",
    };
  }
  if (mentions.speakerIds.length > 0) {
    return {
      kind: "deterministic",
      intent: "named",
      speakerIds: mentions.speakerIds,
      reason: "Se detectaron nombres completos o nombres cortos inequívocos.",
    };
  }

  const intent = isExplicitDebateRequest(request) ? "debate" : "normal";
  return {
    kind: "model",
    intent,
    speakerIds: [],
    reason:
      intent === "debate"
        ? "El usuario pidió explícitamente un debate o una comparación."
        : "El pedido requiere seleccionar al experto más relevante.",
  };
}

export function createDeterministicGroupRoundFallback(
  input: GroupOrchestratorInput,
  options: DeterministicGroupFallbackOptions = {}
): GroupRoundPlan {
  const route = routeRound(input.currentRequest, input.roster);
  if (route.kind === "deterministic") {
    return createDeterministicPlan(input, route);
  }

  const intent = options.intent ?? route.intent;
  const speakerIds = selectFallbackSpeakers(input, intent);
  const instructions = createFallbackInstructions(input, intent, speakerIds);
  const fallbackReason = options.fallbackReason ?? "deterministic_fallback_requested";

  return {
    intent,
    instructions,
    routing: createRoutingMetadata(input, {
      strategy: "fallback",
      intent,
      instructions,
      reason:
        speakerIds.length > 0
          ? "Selección determinista por relevancia del roster."
          : "No hay participantes activos disponibles.",
      model: null,
      latencyMs: 0,
      fallbackReason,
    }),
  };
}

async function planGroupRound(
  input: GroupOrchestratorInput,
  config: OpenAiConfig,
  fetchImpl: typeof fetch
): Promise<GroupRoundPlan> {
  const route = routeRound(input.currentRequest, input.roster);
  if (route.kind === "deterministic") {
    return createDeterministicPlan(input, route);
  }
  if (input.roster.length === 0) {
    return createFallbackPlan(input, route.intent, config.groupRouterModel, "no_available_participants", 0);
  }
  if (!hasOpenAiConfig(config)) {
    return createFallbackPlan(input, route.intent, config.groupRouterModel, "missing_api_key", 0);
  }

  const result = await requestModelPlan(input, route.intent, config, fetchImpl);
  if (!result.ok) {
    return createFallbackPlan(
      input,
      route.intent,
      config.groupRouterModel,
      result.fallbackReason,
      result.latencyMs
    );
  }

  return {
    intent: result.plan.intent,
    instructions: result.plan.instructions,
    routing: createRoutingMetadata(input, {
      strategy: "model",
      intent: result.plan.intent,
      instructions: result.plan.instructions,
      reason: result.plan.reason,
      model: config.groupRouterModel,
      latencyMs: result.latencyMs,
      fallbackReason: null,
    }),
  };
}

function createDeterministicPlan(
  input: GroupOrchestratorInput,
  route: Extract<RoutedRound, { kind: "deterministic" }>
): GroupRoundPlan {
  const instructions = createFallbackInstructions(input, route.intent, route.speakerIds);
  return {
    intent: route.intent,
    instructions,
    routing: createRoutingMetadata(input, {
      strategy: "deterministic",
      intent: route.intent,
      instructions,
      reason: route.reason,
      model: null,
      latencyMs: 0,
      fallbackReason: null,
    }),
  };
}

function createFallbackPlan(
  input: GroupOrchestratorInput,
  intent: SemanticGroupRoundIntent,
  model: string,
  fallbackReason: string,
  latencyMs: number
): GroupRoundPlan {
  const plan = createDeterministicGroupRoundFallback(input, { intent, fallbackReason });
  return {
    ...plan,
    routing: { ...plan.routing, model, latencyMs },
  };
}

async function requestModelPlan(
  input: GroupOrchestratorInput,
  expectedIntent: SemanticGroupRoundIntent,
  config: OpenAiConfig,
  fetchImpl: typeof fetch
): Promise<ModelPlanningResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.groupRouterTimeoutMs);

  try {
    const response = await fetchImpl(responsesApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.groupRouterModel,
        reasoning: { effort: "none" },
        store: false,
        max_output_tokens: 1_000,
        instructions: modelInstructions(expectedIntent, input.roster.length),
        input: JSON.stringify(createBoundedModelContext(input, expectedIntent)),
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "group_round_plan",
            strict: true,
            schema: createModelPlanSchema(input.roster, expectedIntent),
          },
        },
      }),
    });

    if (!response.ok) return failure(`http_${response.status}`, startedAt);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return failure("invalid_json_response", startedAt);
    }
    if (!isRecord(body) || body.status !== "completed") {
      return failure("incomplete_response", startedAt);
    }
    if (hasResponseRefusal(body)) return failure("model_refusal", startedAt);

    const responseText = readResponseText(body);
    if (!responseText) return failure("missing_model_output", startedAt);

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return failure("invalid_model_json", startedAt);
    }

    const validated = validateModelPlan(parsed, input.roster, expectedIntent);
    if (!validated) return failure("invalid_model_plan", startedAt);
    return { ok: true, plan: validated, latencyMs: Date.now() - startedAt };
  } catch {
    return failure(controller.signal.aborted ? "timeout" : "request_error", startedAt);
  } finally {
    clearTimeout(timeout);
  }
}

function failure(fallbackReason: string, startedAt: number): ModelPlanningResult {
  return { ok: false, fallbackReason, latencyMs: Date.now() - startedAt };
}

function modelInstructions(intentHint: SemanticGroupRoundIntent, rosterSize: number) {
  const cardinality =
    intentHint === "debate"
      ? rosterSize <= 1
        ? "El pedido es un debate explícito: elegí al único avatar disponible."
        : `El pedido es un debate explícito: elegí entre dos y ${Math.min(3, rosterSize)} avatares.`
      : [
          "Clasificá el intercambio como normal o debate.",
          "Para una consulta normal elegí exactamente un avatar.",
          rosterSize <= 1
            ? "Si el usuario realmente pide múltiples perspectivas, el único avatar disponible puede responder."
            : `Usá debate sólo cuando el usuario pida perspectivas, contraste o comparación; en ese caso elegí entre dos y ${Math.min(3, rosterSize)} avatares.`,
        ].join(" ");

  return [
    "Sos el router de una llamada grupal dirigida por el usuario.",
    cardinality,
    "Seleccioná solamente IDs del roster y no repitas participantes.",
    "Ordená los turnos según cómo convenga responder el pedido, sin crear una conversación autónoma.",
    "Para cada turno escribí una instrucción privada, concreta y autosuficiente; no escribas la respuesta pública.",
    "Pedile al avatar que responda sólo desde su especialidad, consulte su propia Knowledge Base si corresponde y reconozca aportes previos relevantes.",
    "Cada avatar debe hacer una única intervención oral de hasta 55 palabras, sin saludo, cierre genérico, repetición ni hablar por otro participante.",
    "El motivo debe explicar brevemente la selección sin revelar razonamiento interno.",
  ].join(" ");
}

function createBoundedModelContext(input: GroupOrchestratorInput, intentHint: SemanticGroupRoundIntent) {
  const previousMessages = selectPreviousMessages(input);
  return {
    request: truncateStart(input.currentRequest, maxCurrentRequestChars),
    intentMode: intentHint === "debate" ? "debate_required" : "classify",
    roster: input.roster.map((avatar, position) => ({
      avatarId: avatar.id,
      position,
      name: truncateStart(avatar.name, maxAvatarNameChars),
      description: truncateStart(avatar.description, maxAvatarDescriptionChars),
      instructions: truncateStart(avatar.instructions ?? "", maxAvatarInstructionsChars),
      knowledgeDocumentNames: uniqueStrings(avatar.knowledgeDocumentNames ?? [])
        .slice(0, maxDocumentNames)
        .map((name) => truncateStart(name, maxDocumentNameChars)),
    })),
    recentTranscript: previousMessages.slice(-maxRecentMessages).map((message) => ({
      role: message.role,
      content: truncateStart(message.content, maxMessageChars),
      speakerAvatarId: message.speakerAvatarId ?? null,
    })),
    rollingSummary: truncateEnd(input.rollingSummary, maxRollingSummaryChars),
    lastSpeakerAvatarId: findLastSpeakerAvatarId(previousMessages, input.roster),
  };
}

function selectPreviousMessages(input: GroupOrchestratorInput) {
  if (input.currentMessageId) {
    return input.transcript.filter((message) => message.id !== input.currentMessageId);
  }

  const lastIndex = input.transcript.length - 1;
  const lastMessage = input.transcript[lastIndex];
  if (lastMessage?.role === "user" && normalize(lastMessage.content) === normalize(input.currentRequest)) {
    return input.transcript.slice(0, lastIndex);
  }
  return input.transcript;
}

function createModelPlanSchema(roster: GroupOrchestrationAvatar[], intentHint: SemanticGroupRoundIntent) {
  const minimumTurns = intentHint === "debate" ? Math.min(2, roster.length) : 1;
  const maximumTurns = Math.min(3, roster.length);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: {
        type: "string",
        enum: intentHint === "debate" ? ["debate"] : ["normal", "debate"],
      },
      reason: { type: "string", minLength: 1, maxLength: maxModelReasonChars },
      turns: {
        type: "array",
        minItems: minimumTurns,
        maxItems: maximumTurns,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            avatarId: { type: "string", enum: roster.map((avatar) => avatar.id) },
            instruction: { type: "string", minLength: 1, maxLength: maxModelInstructionChars },
          },
          required: ["avatarId", "instruction"],
        },
      },
    },
    required: ["intent", "reason", "turns"],
  } as const;
}

function validateModelPlan(
  value: unknown,
  roster: GroupOrchestrationAvatar[],
  intentHint: SemanticGroupRoundIntent
): ValidatedModelPlan | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["intent", "reason", "turns"])) return null;
  if (value.intent !== "normal" && value.intent !== "debate") return null;
  if (intentHint === "debate" && value.intent !== "debate") return null;
  if (typeof value.reason !== "string") return null;
  const modelIntent = value.intent;
  const reason = value.reason.trim();
  if (!reason || reason.length > maxModelReasonChars || !Array.isArray(value.turns)) return null;

  const minimumTurns = modelIntent === "normal" ? 1 : Math.min(2, roster.length);
  const maximumTurns = modelIntent === "normal" ? 1 : Math.min(3, roster.length);
  if (value.turns.length < minimumTurns || value.turns.length > maximumTurns) return null;

  const allowedIds = new Set(roster.map((avatar) => avatar.id));
  const seenIds = new Set<string>();
  const instructions: GroupTurnInstruction[] = [];
  for (const turn of value.turns) {
    if (!isRecord(turn) || !hasOnlyKeys(turn, ["avatarId", "instruction"])) return null;
    if (typeof turn.avatarId !== "string" || !allowedIds.has(turn.avatarId) || seenIds.has(turn.avatarId)) {
      return null;
    }
    if (typeof turn.instruction !== "string") return null;
    const instruction = turn.instruction.trim();
    if (!instruction || instruction.length > maxModelInstructionChars) return null;
    seenIds.add(turn.avatarId);
    instructions.push({ avatarId: turn.avatarId, instruction });
  }

  return { intent: modelIntent, reason, instructions };
}

function readResponseText(body: unknown) {
  if (!isRecord(body)) return null;
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return null;

  for (const item of body.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function hasResponseRefusal(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.output)) return false;
  return body.output.some(
    (item) =>
      isRecord(item) &&
      Array.isArray(item.content) &&
      item.content.some((content) => isRecord(content) && content.type === "refusal")
  );
}

function createFallbackInstructions(
  input: GroupOrchestratorInput,
  intent: GroupRoundIntent,
  speakerIds: string[]
) {
  const rosterById = new Map(input.roster.map((avatar) => [avatar.id, avatar]));
  return speakerIds.flatMap((avatarId) => {
    const avatar = rosterById.get(avatarId);
    return avatar ? [{ avatarId, instruction: fallbackInstruction(avatar, input, intent) }] : [];
  });
}

function fallbackInstruction(
  avatar: GroupOrchestrationAvatar,
  input: GroupOrchestratorInput,
  intent: GroupRoundIntent
) {
  const sharedRules = [
    `Respondé como ${avatar.name}, desde tu especialidad: ${avatar.description}.`,
    `El pedido vigente del usuario es: “${truncateStart(input.currentRequest, maxCurrentRequestChars)}”.`,
    "Consultá tu propia Knowledge Base antes de responder si aporta información relevante.",
    "Dá una única intervención oral de hasta 55 palabras, sin saludo, repetición ni pregunta genérica de cierre.",
    "No respondas por los demás participantes ni expliques la coordinación interna.",
  ];
  if (intent === "collective" && isIntroductionRequest(input.currentRequest)) {
    sharedRules.push(
      "Presentate solamente vos, una sola vez, y reconocé brevemente que formás parte del grupo."
    );
  } else if (intent === "debate") {
    sharedRules.push(
      "Aportá una postura propia y relacionála naturalmente con las intervenciones previas del contexto compartido."
    );
  } else {
    sharedRules.push("Respondé únicamente la parte del pedido que corresponda a tu especialidad.");
  }
  return sharedRules.join(" ");
}

function selectFallbackSpeakers(input: GroupOrchestratorInput, intent: SemanticGroupRoundIntent) {
  if (input.roster.length === 0) return [];
  const ranked = rankRoster(input.currentRequest, input.roster);
  if (intent === "debate") {
    return ranked.slice(0, Math.min(2, input.roster.length)).map((candidate) => candidate.id);
  }

  if ((ranked[0]?.score ?? 0) === 0) {
    const lastSpeakerId = findLastSpeakerAvatarId(selectPreviousMessages(input), input.roster);
    return [lastSpeakerId ?? input.roster[0]!.id];
  }
  return ranked.length > 0 ? [ranked[0]!.id] : [];
}

function rankRoster(request: string, roster: GroupOrchestrationAvatar[]) {
  const requestTerms = searchableTerms(request);
  return roster
    .map((avatar, index) => ({
      id: avatar.id,
      index,
      score:
        overlapScore(requestTerms, avatar.name, 8) +
        overlapScore(requestTerms, avatar.description, 4) +
        overlapScore(requestTerms, avatar.instructions ?? "", 2) +
        overlapScore(requestTerms, (avatar.knowledgeDocumentNames ?? []).join(" "), 3),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function overlapScore(requestTerms: Set<string>, value: string, weight: number) {
  let score = 0;
  for (const term of searchableTerms(value)) {
    if (requestTerms.has(term)) score += weight;
  }
  return score;
}

function createRoutingMetadata(
  input: GroupOrchestratorInput,
  value: {
    strategy: GroupRoutingStrategy;
    intent: GroupRoundIntent;
    instructions: GroupTurnInstruction[];
    reason: string;
    model: string | null;
    latencyMs: number;
    fallbackReason: string | null;
  }
): GroupRoutingMetadata {
  return {
    version: 1,
    strategy: value.strategy,
    intent: value.intent,
    speakerIds: value.instructions.map((instruction) => instruction.avatarId),
    reason: value.reason,
    model: value.model,
    latencyMs: value.latencyMs,
    fallbackReason: value.fallbackReason,
    contextVersion: input.contextVersion,
  };
}

function resolveNameMentions(content: string, roster: GroupOrchestrationAvatar[]) {
  let remainder = ` ${normalize(content)} `;
  let ambiguous = false;
  const selectedIds = new Set<string>();
  const fullNameGroups = new Map<string, GroupOrchestrationAvatar[]>();
  for (const avatar of roster) {
    const fullName = normalize(avatar.name);
    if (!fullName) continue;
    fullNameGroups.set(fullName, [...(fullNameGroups.get(fullName) ?? []), avatar]);
  }

  const orderedFullNames = [...fullNameGroups.entries()].sort(
    ([left], [right]) => right.length - left.length
  );
  for (const [fullName, candidates] of orderedFullNames) {
    if (!containsTerm(remainder, fullName)) continue;
    if (candidates.length === 1) {
      selectedIds.add(candidates[0]!.id);
    } else {
      ambiguous = true;
    }
    remainder = remainder.replaceAll(` ${fullName} `, " ");
  }

  const firstNameGroups = new Map<string, GroupOrchestrationAvatar[]>();
  for (const avatar of roster) {
    const firstName = normalize(avatar.name).split(" ")[0];
    if (!firstName) continue;
    firstNameGroups.set(firstName, [...(firstNameGroups.get(firstName) ?? []), avatar]);
  }

  for (const [firstName, candidates] of firstNameGroups) {
    if (!containsTerm(remainder, firstName)) continue;
    if (candidates.length === 1) {
      selectedIds.add(candidates[0]!.id);
      continue;
    }
    ambiguous = true;
  }

  return {
    ambiguous,
    speakerIds: roster.filter((avatar) => selectedIds.has(avatar.id)).map((avatar) => avatar.id),
  };
}

function containsTerm(normalizedContent: string, term: string) {
  return ` ${normalizedContent.trim()} `.includes(` ${term} `);
}

function isCollectiveRequest(content: string) {
  const normalized = normalize(content);
  const pluralIntroduction = [
    "presentense",
    "introduzcanse",
    "pueden presentarse",
    "podrian presentarse",
    "pueden introducirse",
    "podrian introducirse",
  ].some((term) => containsTerm(normalized, term));
  const explicitRound = [
    "hagamos una ronda",
    "hagan una ronda",
    "vamos con una ronda",
    "ronda de opiniones",
    "ronda de presentaciones",
    "ronda de introducciones",
    "ronda de respuestas",
    "ronda entre ustedes",
  ].some((term) => containsTerm(normalized, term));
  const turnTakingCommand =
    containsTerm(normalized, "por turnos") &&
    [
      "respondan",
      "hablen",
      "opinen",
      "participen",
      "presentense",
      "introduzcanse",
      "digan",
      "cuenten",
      "contesten",
      "pueden responder",
      "podrian responder",
    ].some((term) => containsTerm(normalized, term));
  const collective = [
    "todos",
    "todas",
    "cada uno",
    "cada una",
    "los tres",
    "las tres",
    "each of you",
    "all of you",
  ].some((term) => containsTerm(normalized, term));
  const action = [
    "presenten",
    "presentense",
    "presentarse",
    "introduzcan",
    "introduzcanse",
    "introducirse",
    "opinen",
    "piensan",
    "digan",
    "cuenten",
    "respondan",
    "responder",
    "participen",
    "hablen",
    "contesten",
    "debatan",
    "discutan",
    "comparen",
    "contrasten",
  ].some((term) => containsTerm(normalized, term));
  return pluralIntroduction || explicitRound || turnTakingCommand || (action && collective);
}

function isIntroductionRequest(content: string) {
  const normalized = normalize(content);
  return [
    "presentense",
    "introduzcanse",
    "presentarse",
    "introducirse",
    "ronda de presentaciones",
    "ronda de introducciones",
  ].some((term) => containsTerm(normalized, term));
}

function isExplicitDebateRequest(content: string) {
  const normalized = normalize(content);
  return ["debatan", "discutan", "comparen", "contrasten"].some((term) => containsTerm(normalized, term));
}

function findLastSpeakerAvatarId(
  transcript: GroupOrchestrationMessage[],
  roster: GroupOrchestrationAvatar[]
) {
  const activeIds = new Set(roster.map((avatar) => avatar.id));
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index];
    if (message?.role === "assistant" && message.speakerAvatarId && activeIds.has(message.speakerAvatarId)) {
      return message.speakerAvatarId;
    }
  }
  return null;
}

function searchableTerms(value: string) {
  const result = new Set<string>();
  for (const token of normalize(value).split(" ")) {
    if (token.length <= 3 || stopWords.has(token)) continue;
    result.add(token);
    if (token.length > 4 && token.endsWith("s")) result.add(token.slice(0, -1));
    if (token.length > 5 && token.endsWith("es")) result.add(token.slice(0, -2));
  }
  return result;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function truncateStart(value: string, maxChars: number) {
  return value.trim().slice(0, maxChars);
}

function truncateEnd(value: string, maxChars: number) {
  return value.trim().slice(-maxChars);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

const stopWords = new Set([
  "para",
  "como",
  "cual",
  "cuando",
  "donde",
  "desde",
  "esta",
  "este",
  "estos",
  "estas",
  "sobre",
  "quiero",
  "puede",
  "podrian",
  "deberia",
  "hacer",
  "tengo",
  "with",
  "what",
  "when",
  "where",
  "from",
  "this",
  "that",
]);
