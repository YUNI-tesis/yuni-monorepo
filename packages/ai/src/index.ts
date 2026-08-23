import { hasOpenAiConfig, openAiConfig, type OpenAiConfig } from "@yuni/config";

export * from "./group-orchestrator.js";

export type AiProviderName = "openai";

export interface AiProvider {
  readonly name: AiProviderName;
}

export type ConversationTitleMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationTitleInput = {
  avatarName?: string;
  messages: ConversationTitleMessage[];
};

export interface ConversationTitleGenerator {
  generateTitle(input: ConversationTitleInput): Promise<string | null>;
}

export type OpenAiConversationTitleGeneratorOptions = {
  config?: OpenAiConfig;
  fetchImpl?: typeof fetch;
};

const responsesApiUrl = "https://api.openai.com/v1/responses";
const maxTitleWords = 6;
const maxTranscriptMessages = 10;
const maxTranscriptChars = 2_400;

export function createOpenAiConversationTitleGenerator(
  options: OpenAiConversationTitleGeneratorOptions = {}
): ConversationTitleGenerator {
  const config = options.config ?? openAiConfig;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async generateTitle(input) {
      if (!hasOpenAiConfig(config)) {
        return null;
      }

      const transcript = formatTranscriptForTitle(input.messages);

      if (!transcript) {
        return null;
      }

      try {
        const response = await fetchImpl(responsesApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.defaultModel,
            instructions: [
              "Genera un titulo corto para una llamada de YUNI.",
              "Responde solo el titulo, sin comillas, sin punto final y con maximo 6 palabras.",
              "Usa espanol si la conversacion es mayormente en espanol; si no, conserva el idioma dominante.",
            ].join(" "),
            input: [input.avatarName ? `Avatar: ${input.avatarName}` : null, "Transcripcion:", transcript]
              .filter(Boolean)
              .join("\n"),
          }),
        });

        if (!response.ok) {
          return null;
        }

        const body = (await response.json().catch(() => null)) as { output_text?: unknown } | null;

        return sanitizeConversationTitle(typeof body?.output_text === "string" ? body.output_text : "");
      } catch {
        return null;
      }
    },
  };
}

export function fallbackConversationTitle(input: ConversationTitleInput): string {
  const firstUserMessage = input.messages.find(
    (message) => message.role === "user" && hasUsefulContent(message)
  );
  const firstUsefulMessage = firstUserMessage ?? input.messages.find(hasUsefulContent);
  const fallbackFromMessage = firstUsefulMessage ? titleFromContent(firstUsefulMessage.content) : null;

  if (fallbackFromMessage) {
    return fallbackFromMessage;
  }

  if (input.messages.length === 0) {
    return "Llamada sin mensajes";
  }

  return input.avatarName ? `Llamada con ${input.avatarName}` : "Llamada sin mensajes";
}

export function sanitizeConversationTitle(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  const words = normalized.split(" ").slice(0, maxTitleWords).join(" ");
  const withoutTerminalPunctuation = words.replace(/[.!?¿¡。！？]+$/g, "").trim();

  return withoutTerminalPunctuation || null;
}

function formatTranscriptForTitle(messages: ConversationTitleMessage[]) {
  const relevantMessages = selectTitleMessages(messages).filter(hasUsefulContent);

  if (relevantMessages.length === 0) {
    return null;
  }

  return relevantMessages
    .map((message) => `${message.role === "user" ? "Usuario" : "Avatar"}: ${message.content.trim()}`)
    .join("\n")
    .slice(0, maxTranscriptChars);
}

function selectTitleMessages(messages: ConversationTitleMessage[]) {
  if (messages.length <= maxTranscriptMessages) {
    return messages;
  }

  const edgeSize = Math.floor(maxTranscriptMessages / 2);

  return [...messages.slice(0, edgeSize), ...messages.slice(-edgeSize)];
}

function titleFromContent(content: string) {
  const firstPhrase = content.split(/[.!?\n]/)[0] ?? content;

  return sanitizeConversationTitle(firstPhrase);
}

function hasUsefulContent(message: ConversationTitleMessage) {
  return message.content.trim().length > 0;
}
