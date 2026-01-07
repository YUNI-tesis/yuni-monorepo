import { promises as fs } from "fs";
import path from "path";
import { Agent, AgentSchema, ConversationState, ConversationStateSchema } from "./schemas";
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
export async function createAgent(data: Omit<Agent, "id" | "createdAt" | "updatedAt">): Promise<Agent> {
  await ensureDirectories();
  const id = randomUUID();
  const now = new Date().toISOString();
  const agent: Agent = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };
  const filePath = path.join(AGENTS_DIR, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(agent, null, 2), "utf-8");
  return agent;
}

export async function updateAgent(id: string, updates: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent> {
  await ensureDirectories();
  const filePath = path.join(AGENTS_DIR, `${id}.json`);
  const existing = await getAgent(id);
  const updated: Agent = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function deleteAgent(id: string): Promise<void> {
  await ensureDirectories();
  const filePath = path.join(AGENTS_DIR, `${id}.json`);
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function getAgent(id: string): Promise<Agent> {
  await ensureDirectories();
  const filePath = path.join(AGENTS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return AgentSchema.parse(JSON.parse(content));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`Agent ${id} not found`);
    }
    throw error;
  }
}

export async function listAgents(): Promise<Agent[]> {
  await ensureDirectories();
  try {
    const files = await fs.readdir(AGENTS_DIR);
    const agents = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (file) => {
          const content = await fs.readFile(path.join(AGENTS_DIR, file), "utf-8");
          return AgentSchema.parse(JSON.parse(content));
        })
    );
    return agents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

// Conversation operations
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
  const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), "utf-8");
  return conversation;
}

export async function getConversation(id: string): Promise<ConversationState> {
  await ensureDirectories();
  const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return ConversationStateSchema.parse(JSON.parse(content));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`Conversation ${id} not found`);
    }
    throw error;
  }
}

export async function updateConversation(
  id: string,
  updates: Partial<Omit<ConversationState, "id" | "createdAt">>
): Promise<ConversationState> {
  await ensureDirectories();
  const filePath = path.join(CONVERSATIONS_DIR, `${id}.json`);
  const existing = await getConversation(id);
  const updated: ConversationState = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function listConversations(agentId?: string): Promise<ConversationState[]> {
  await ensureDirectories();
  try {
    const files = await fs.readdir(CONVERSATIONS_DIR);
    const conversations = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (file) => {
          const content = await fs.readFile(path.join(CONVERSATIONS_DIR, file), "utf-8");
          return ConversationStateSchema.parse(JSON.parse(content));
        })
    );
    let filtered = conversations;
    if (agentId) {
      filtered = conversations.filter((c) => c.agentId === agentId);
    }
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

