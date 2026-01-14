import { StateGraph, END, START } from "@langchain/langgraph";
import type { ChatMessage, Agent, ConversationState } from "./types.js";
import { getAgent, getConversation, saveConversation, createConversation } from "../tools/storage.js";
import { buildSystemPrompt } from "../tools/buildSystemPrompt.js";
import { applyGuardrails } from "../tools/guardrails.js";
import { accumulateCost } from "../tools/costTracker.js";
import { invokeLLM } from "../tools/llmFactory.js";
import { getModelName } from "../tools/llmConfig.js";
import { retrieveRelevantChunks, formatRetrievalContext } from "../tools/retrieval.js";
import { randomUUID } from "crypto";

interface GraphState {
  agentId: string;
  conversationId?: string;
  userMessage: string;
  mode: "text" | "voice";
  agent?: Agent;
  state?: ConversationState;
  sanitizedUserMessage?: string;
  blocked?: boolean;
  refusal?: string;
  retrievalContext?: string;
  assistantMessage?: string;
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * LangGraph state machine for chat turn processing.
 * @deprecated apiKey parameter is no longer needed, configuration is read from environment variables
 */
export function createChatGraph(apiKey?: string) {
  const graph = new StateGraph<GraphState>({
    channels: {
      agentId: { reducer: (x, y) => y ?? x },
      conversationId: { reducer: (x, y) => y ?? x },
      userMessage: { reducer: (x, y) => y ?? x },
      mode: { reducer: (x, y) => y ?? x },
      agent: { reducer: (x, y) => y ?? x },
      state: { reducer: (x, y) => y ?? x },
      sanitizedUserMessage: { reducer: (x, y) => y ?? x },
      blocked: { reducer: (x, y) => y ?? x },
      refusal: { reducer: (x, y) => y ?? x },
      retrievalContext: { reducer: (x, y) => y ?? x },
      assistantMessage: { reducer: (x, y) => y ?? x },
      tokensIn: { reducer: (x, y) => y ?? x },
      tokensOut: { reducer: (x, y) => y ?? x },
    },
  });

  // Node 1: LoadAgent
  async function loadAgentNode(state: GraphState): Promise<Partial<GraphState>> {
    const agent = await getAgent(state.agentId);
    return { agent };
  }

  // Node 2: LoadConversation
  async function loadConversationNode(state: GraphState): Promise<Partial<GraphState>> {
    if (!state.conversationId) {
      // Create new conversation if none exists
      const newConversation = await createConversation(state.agentId, state.mode);
      return { conversationId: newConversation.id, state: newConversation };
    }
    const conversation = await getConversation(state.conversationId);
    return { state: conversation };
  }

  // Node 3: Guardrails
  function guardrailsNode(state: GraphState): Partial<GraphState> {
    if (!state.agent || !state.state) {
      throw new Error("Agent and state must be loaded before guardrails");
    }
    const result = applyGuardrails(state.agent, state.state, state.userMessage);
    return {
      sanitizedUserMessage: result.sanitizedUserMessage,
      blocked: result.blocked,
      ...(result.refusal !== undefined && { refusal: result.refusal }),
    };
  }

  // Node 3.5: Retrieve relevant chunks from documents
  async function retrieveChunksNode(state: GraphState): Promise<Partial<GraphState>> {
    if (!state.agent || state.blocked) {
      // Skip retrieval if blocked or agent not loaded
      return { retrievalContext: "" };
    }

    const query = state.sanitizedUserMessage || state.userMessage;
    const chunks = await retrieveRelevantChunks(state.agentId, query, 6);
    const retrievalContext = formatRetrievalContext(chunks);

    return { retrievalContext };
  }

  // Node 4: GenerateResponse
  async function generateResponseNode(state: GraphState): Promise<Partial<GraphState>> {
    if (!state.agent || !state.state) {
      throw new Error("Agent and state must be loaded before generating response");
    }
    
    if (state.blocked) {
      // If blocked, return refusal as assistant message
      return {
        assistantMessage: state.refusal || "I cannot process that request.",
        tokensIn: 0,
        tokensOut: 0,
      };
    }

    let systemPrompt = buildSystemPrompt(state.agent);

    // Add retrieval context to system prompt if available
    const retrievalContext = state.retrievalContext || "";
    if (retrievalContext) {
      systemPrompt += retrievalContext;
      systemPrompt +=
        "\n\nNote: If the user asks about information from uploaded documents and you cannot find it in the context above, respond: 'I couldn't find that in the uploaded documents.'";
    } else {
      systemPrompt +=
        "\n\nNote: Do not claim information comes from uploaded documents unless retrieval context is provided above.";
    }

    // Build message history
    const messages = state.state.messages.map((msg) => {
      if (msg.role === "system") {
        return { role: "system" as const, content: msg.content };
      } else if (msg.role === "user") {
        return { role: "user" as const, content: msg.content };
      } else {
        return { role: "assistant" as const, content: msg.content };
      }
    });

    // Add system prompt and current user message
    const fullMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.filter((m) => m.role !== "system"), // Remove any existing system messages
      { role: "user" as const, content: state.sanitizedUserMessage || state.userMessage },
    ];

    const response = await invokeLLM(fullMessages);

    return {
      assistantMessage: response.content,
      tokensIn: response.tokensIn || 0,
      tokensOut: response.tokensOut || 0,
    };
  }

  // Node 5: PersistConversation
  async function persistConversationNode(state: GraphState): Promise<Partial<GraphState>> {
    if (!state.state || !state.assistantMessage) {
      throw new Error("State and assistant message required for persistence");
    }

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: state.sanitizedUserMessage || state.userMessage,
      createdAt: now,
    };

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: state.assistantMessage,
      createdAt: now,
    };

    // Update cost
    const modelName = getModelName();
    const newCost = accumulateCost(
      state.state.cost,
      {
        tokensIn: state.tokensIn || 0,
        tokensOut: state.tokensOut || 0,
      },
      modelName
    );

    const updatedState: ConversationState = {
      ...state.state,
      messages: [...state.state.messages, userMessage, assistantMessage],
      cost: newCost,
      updatedAt: now,
    };

    await saveConversation(updatedState);

    return { state: updatedState };
  }

  // Add nodes
  graph.addNode("loadAgent", loadAgentNode);
  graph.addNode("loadConversation", loadConversationNode);
  graph.addNode("guardrails", guardrailsNode);
  graph.addNode("retrieveChunks", retrieveChunksNode);
  graph.addNode("generateResponse", generateResponseNode);
  graph.addNode("persistConversation", persistConversationNode);

  // Define edges
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge(START, "loadAgent");
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge("loadAgent", "loadConversation");
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge("loadConversation", "guardrails");
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge("guardrails", "retrieveChunks");
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge("retrieveChunks", "generateResponse");
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge("generateResponse", "persistConversation");
  // @ts-expect-error - LangGraph type inference issue with addEdge overloads
  graph.addEdge("persistConversation", END);

  return graph.compile();
}

/**
 * Runs a single chat turn.
 */
export async function runChatTurn(params: {
  agentId: string;
  conversationId?: string;
  userMessage: string;
  mode?: "text" | "voice";
  apiKey?: string; // Optional, falls back to environment variables
}): Promise<ConversationState> {
  const graph = createChatGraph(params.apiKey);
  
  const result = await graph.invoke({
    agentId: params.agentId,
    conversationId: params.conversationId,
    userMessage: params.userMessage,
    mode: params.mode || "text",
  });

  if (!result.state) {
    throw new Error("Failed to get conversation state");
  }

  return result.state;
}

