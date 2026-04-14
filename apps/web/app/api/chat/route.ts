import { NextRequest } from "next/server";
import { ChatRequestSchema } from "@/lib/schemas";
import { getAgent, getConversation, createConversation, updateConversation } from "@/lib/storage";
import { streamChatResponse } from "@/lib/streaming";
import { randomUUID } from "crypto";
import { accumulateCost } from "@/lib/cost-utils";
import { getLLMConfig, getModelName } from "@/lib/llm-config";
import { ChatMessage } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";
import { getErrorMessage, jsonErrorResponse } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = ChatRequestSchema.parse(body);
    
    // Get model configuration (will throw if not properly configured)
    let apiKey: string;
    try {
      const config = getLLMConfig();
      apiKey = config.apiKey;
    } catch (error: unknown) {
      return new Response(JSON.stringify({ error: getErrorMessage(error, "LLM configuration error") }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Load agent (verify it belongs to user)
    const agent = await getAgent(data.agentId, user.id);

    // Get or create conversation
    let conversation;
    if (data.conversationId) {
      conversation = await getConversation(data.conversationId, user.id);
    } else {
      conversation = await createConversation(user.id, data.agentId, data.mode);
    }

    // Stream response
    let fullResponse = "";
    const stream = streamChatResponse(agent, conversation, data.message, apiKey);

    // Create a readable stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
          
          // After streaming completes, save the conversation
          const now = new Date().toISOString();
          const userMessage: ChatMessage = {
            id: randomUUID(),
            role: "user",
            content: data.message,
            createdAt: now,
          };
          const assistantMessage: ChatMessage = {
            id: randomUUID(),
            role: "assistant",
            content: fullResponse,
            createdAt: now,
          };

          // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
          const tokensIn = Math.ceil((data.message.length + conversation.messages.reduce((acc, m) => acc + m.content.length, 0)) / 4);
          const tokensOut = Math.ceil(fullResponse.length / 4);

          const modelName = getModelName();
          const newCost = accumulateCost(conversation.cost, { tokensIn, tokensOut }, modelName);

          const updatedState = {
            ...conversation,
            messages: [...conversation.messages, userMessage, assistantMessage],
            cost: newCost,
            updatedAt: now,
          };

          await updateConversation(conversation.id, user.id, updatedState);
          
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error: unknown) {
          controller.error(error instanceof Error ? error : new Error("Streaming failed"));
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    const response = jsonErrorResponse(error);
    return new Response(JSON.stringify(await response.json()), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
