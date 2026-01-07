/**
 * LLM Factory - Creates model instances based on configuration
 * Provides a unified interface for different LLM providers
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getLLMConfig, type LLMConfig } from "./llmConfig.js";

export interface LLMResponse {
  content: string;
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * Creates a LangChain chat model instance based on configuration.
 */
export function createLangChainModel(config?: LLMConfig): ChatOpenAI | ChatGoogleGenerativeAI {
  const llmConfig = config || getLLMConfig();

  if (llmConfig.provider === "openai") {
    return new ChatOpenAI({
      modelName: llmConfig.model,
      temperature: llmConfig.temperature ?? 0.7,
      openAIApiKey: llmConfig.apiKey,
    });
  } else if (llmConfig.provider === "gemini") {
    return new ChatGoogleGenerativeAI({
      modelName: llmConfig.model,
      temperature: llmConfig.temperature ?? 0.7,
      apiKey: llmConfig.apiKey,
    });
  } else {
    throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
  }
}

/**
 * Simple message format for easier usage
 */
export type SimpleMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Invokes the LLM with messages and returns the response with token usage.
 * LangChain models accept plain message objects with role and content.
 */
export async function invokeLLM(
  messages: SimpleMessage[],
  config?: LLMConfig
): Promise<LLMResponse> {
  const llm = createLangChainModel(config);
  
  // LangChain accepts plain message objects
  const response = await llm.invoke(messages as any);

  const tokensIn = (response.response_metadata?.tokenUsage?.promptTokens as number) || 0;
  const tokensOut = (response.response_metadata?.tokenUsage?.completionTokens as number) || 0;

  return {
    content: response.content as string,
    tokensIn,
    tokensOut,
  };
}

