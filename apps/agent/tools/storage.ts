import { promises as fs } from "fs";
import path from "path";
import type { Agent, ConversationState } from "../src/types.js";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const AGENTS_DIR = path.join(DATA_DIR, "agents");
const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

// Agent operations
export async function getAgent(id: string): Promise<Agent> {
  await ensureDirectories();
  const filePath = path.join(AGENTS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as Agent;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`Agent ${id} not found`);
    }
    throw error;
  }
}

// Conversation operations
export async function getConversation(id: string): Promise<ConversationState> {
  await ensureDirectories();
  const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as ConversationState;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`Conversation ${id} not found`);
    }
    throw error;
  }
}

export async function saveConversation(conversation: ConversationState): Promise<void> {
  await ensureDirectories();
  const filePath = path.join(CONVERSATIONS_DIR, `${conversation.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), "utf-8");
}

export async function createConversation(
  agentId: string,
  mode: "text" | "voice" = "text"
): Promise<ConversationState> {
  await ensureDirectories();
  const id = randomUUID();
  const now = new Date().toISOString();
  const conversation: ConversationState = {
    id,
    agentId,
    mode,
    messages: [],
    cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conversation);
  return conversation;
}

