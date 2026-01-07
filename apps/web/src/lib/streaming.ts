import { OpenAI } from "openai";
import { Agent, ConversationState } from "./schemas";
import { buildSystemPrompt, applyGuardrails } from "./agent-utils";

/**
 * Streams a chat response using OpenAI with agent configuration.
 */
export async function* streamChatResponse(
  agent: Agent,
  conversation: ConversationState,
  userMessage: string,
  apiKey: string
): AsyncGenerator<string, void, unknown> {
  // Apply guardrails
  const guardrailResult = applyGuardrails(agent, conversation, userMessage);
  
  if (guardrailResult.blocked) {
    yield guardrailResult.refusal || "I cannot process that request.";
    return;
  }

  const systemPrompt = buildSystemPrompt(agent);
  const openai = new OpenAI({ apiKey });

  // Build messages
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversation.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: guardrailResult.sanitizedUserMessage },
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messages as any,
    temperature: 0.7,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

