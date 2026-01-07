import { Agent, ConversationState } from "../src/types.js";

export interface GuardrailResult {
  sanitizedUserMessage: string;
  blocked: boolean;
  refusal?: string;
}

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|your)\s+instructions?/i,
  /forget\s+(your|the)\s+(role|instructions?|system\s+prompt)/i,
  /reveal\s+(your|the)\s+(system\s+prompt|instructions?|internal\s+rules?)/i,
  /what\s+(are|is)\s+(your|the)\s+(system\s+prompt|instructions?|internal\s+rules?)/i,
  /show\s+(me|us)\s+(your|the)\s+(system\s+prompt|instructions?)/i,
  /developer\s+(message|mode|override)/i,
  /override\s+(your|the)\s+(role|instructions?)/i,
  /act\s+as\s+(if|though)\s+you\s+(are|were)\s+not/i,
  /pretend\s+(you\s+are|to\s+be)\s+(not|different)/i,
];

// Patterns that might indicate PII or secrets
const SECRET_PATTERNS = [
  /(api[_\s-]?key|apikey)\s*[:=]\s*[\w-]+/i,
  /(password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(secret|token)\s*[:=]\s*[\w-]+/i,
  /(credit\s*card|cc\s*number)\s*[:=]?\s*[\d\s-]+/i,
  /(ssn|social\s+security)\s*[:=]?\s*[\d-]+/i,
];

/**
 * Applies guardrails to user messages:
 * - Detects prompt injection attempts
 * - Detects potential PII/secrets
 * - Checks for out-of-scope requests (basic heuristic)
 */
export function applyGuardrails(
  agent: Agent,
  state: ConversationState,
  userMessage: string
): GuardrailResult {
  let sanitized = userMessage.trim();
  let blocked = false;
  let refusal: string | undefined;

  // Check for prompt injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      blocked = true;
      refusal = `I cannot comply with that request. I'm designed to stay within my role as ${agent.name}. How can I help you within my defined scope?`;
      return { sanitizedUserMessage: sanitized, blocked, refusal };
    }
  }

  // Check for potential secrets/PII
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(sanitized)) {
      blocked = true;
      refusal = `I cannot process messages that appear to contain sensitive information like API keys, passwords, or personal data. Please remove any sensitive information and try again.`;
      return { sanitizedUserMessage: sanitized, blocked, refusal };
    }
  }

  // Basic out-of-scope check (can be enhanced with LLM-based classification)
  // For now, we'll let the agent handle scope through its system prompt
  // This is a placeholder for future enhancement

  return { sanitizedUserMessage: sanitized, blocked: false };
}

