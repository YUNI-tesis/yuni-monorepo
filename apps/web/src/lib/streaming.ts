import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Agent, ConversationState } from "./schemas";
import { buildSystemPrompt, applyGuardrails } from "./agent-utils";
import { getLLMConfig } from "./llm-config";

/**
 * Streams a chat response using the configured LLM provider with agent configuration.
 */
export async function* streamChatResponse(
  agent: Agent,
  conversation: ConversationState,
  userMessage: string,
  apiKey?: string // Optional, falls back to environment variables
): AsyncGenerator<string, void, unknown> {
  // Apply guardrails
  const guardrailResult = applyGuardrails(agent, conversation, userMessage);
  
  if (guardrailResult.blocked) {
    yield guardrailResult.refusal || "I cannot process that request.";
    return;
  }

  const systemPrompt = buildSystemPrompt(agent);
  const config = getLLMConfig();
  const finalApiKey = apiKey || config.apiKey;

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

  if (config.provider === "openai") {
    const openai = new OpenAI({ apiKey: finalApiKey });

    const stream = await openai.chat.completions.create({
      model: config.model,
      messages: messages as any,
      temperature: config.temperature ?? 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } else if (config.provider === "gemini") {
    const genAI = new GoogleGenerativeAI(finalApiKey);
    const model = genAI.getGenerativeModel({ 
      model: config.model,
      generationConfig: {
        temperature: config.temperature ?? 0.7,
      },
      systemInstruction: systemPrompt,
    });

    // Gemini uses a different message format - combine system and messages
    const geminiMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({
      history: geminiMessages.slice(0, -1).map((msg) => ({
        role: msg.role,
        parts: msg.parts,
      })),
    });

    const lastMessage = geminiMessages[geminiMessages.length - 1];
    const result = await chat.sendMessageStream(lastMessage.parts[0].text);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        yield chunkText;
      }
    }
  } else {
    throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

