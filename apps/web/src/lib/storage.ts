import { prisma } from "./prisma";
import { Agent, AgentSchema, ConversationState, ConversationStateSchema } from "./schemas";

// Types for Prisma query results
type PrismaAgent = Awaited<ReturnType<typeof prisma.agent.findFirst>>;
type PrismaMessage = { id: string; role: string; content: string; createdAt: Date };
type PrismaTranscript = { id: string; userAudioRef: string | null; transcript: string; createdAt: Date };
type PrismaConversation = {
  id: string;
  agentId: string;
  mode: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  createdAt: Date;
  updatedAt: Date;
  messages: PrismaMessage[];
  transcripts: PrismaTranscript[];
};

// Agent operations
export async function createAgent(
  userId: string,
  data: Omit<Agent, "id" | "createdAt" | "updatedAt">
): Promise<Agent> {
  const agent = await prisma.agent.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
      systemPrompt: data.systemPrompt,
      context: data.context,
      toolsAllowed: data.toolsAllowed,
      voice: data.voice || undefined,
    },
  });

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    context: agent.context,
    toolsAllowed: agent.toolsAllowed as ("none" | "basic")[],
    voice: agent.voice as Agent["voice"],
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

export async function updateAgent(
  id: string,
  userId: string,
  updates: Partial<Omit<Agent, "id" | "createdAt">>
): Promise<Agent> {
  // First verify the agent belongs to the user
  const existing = await prisma.agent.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new Error(`Agent ${id} not found`);
  }

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.systemPrompt !== undefined && { systemPrompt: updates.systemPrompt }),
      ...(updates.context !== undefined && { context: updates.context }),
      ...(updates.toolsAllowed !== undefined && { toolsAllowed: updates.toolsAllowed }),
      ...(updates.voice !== undefined && { voice: updates.voice || undefined }),
    },
  });

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    context: agent.context,
    toolsAllowed: agent.toolsAllowed as ("none" | "basic")[],
    voice: agent.voice as Agent["voice"],
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

export async function deleteAgent(id: string, userId: string): Promise<void> {
  // Verify the agent belongs to the user
  const existing = await prisma.agent.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new Error(`Agent ${id} not found`);
  }

  await prisma.agent.delete({
    where: { id },
  });
}

export async function getAgent(id: string, userId: string): Promise<Agent> {
  const agent = await prisma.agent.findFirst({
    where: { id, userId },
  });

  if (!agent) {
    throw new Error(`Agent ${id} not found`);
  }

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    context: agent.context,
    toolsAllowed: agent.toolsAllowed as ("none" | "basic")[],
    voice: agent.voice as Agent["voice"],
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

export async function listAgents(userId: string): Promise<Agent[]> {
  const agents = await prisma.agent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return agents.map((agent: NonNullable<PrismaAgent>) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    context: agent.context,
    toolsAllowed: agent.toolsAllowed as ("none" | "basic")[],
    voice: agent.voice as Agent["voice"],
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  }));
}

// Conversation operations
export async function createConversation(
  userId: string,
  agentId: string,
  mode: "text" | "voice" = "text"
): Promise<ConversationState> {
  // Verify the agent belongs to the user
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      agentId,
      mode,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    },
    include: {
      messages: true,
      transcripts: true,
    },
  });

  return {
    id: conversation.id,
    agentId: conversation.agentId,
    mode: conversation.mode as "text" | "voice",
    messages: conversation.messages.map((msg: PrismaMessage) => ({
      id: msg.id,
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    })),
    transcripts: conversation.transcripts.map((t: PrismaTranscript) => ({
      id: t.id,
      userAudioRef: t.userAudioRef || undefined,
      transcript: t.transcript,
      createdAt: t.createdAt.toISOString(),
    })),
    cost: {
      tokensIn: conversation.tokensIn,
      tokensOut: conversation.tokensOut,
      usd: conversation.costUsd,
    },
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function getConversation(id: string, userId: string): Promise<ConversationState> {
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      transcripts: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${id} not found`);
  }

  return {
    id: conversation.id,
    agentId: conversation.agentId,
    mode: conversation.mode as "text" | "voice",
    messages: conversation.messages.map((msg: PrismaMessage) => ({
      id: msg.id,
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    })),
    transcripts: conversation.transcripts.map((t: PrismaTranscript) => ({
      id: t.id,
      userAudioRef: t.userAudioRef || undefined,
      transcript: t.transcript,
      createdAt: t.createdAt.toISOString(),
    })),
    cost: {
      tokensIn: conversation.tokensIn,
      tokensOut: conversation.tokensOut,
      usd: conversation.costUsd,
    },
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function updateConversation(
  id: string,
  userId: string,
  updates: Partial<Omit<ConversationState, "id" | "createdAt">>
): Promise<ConversationState> {
  // Verify the conversation belongs to the user
  const existing = await prisma.conversation.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new Error(`Conversation ${id} not found`);
  }

  // Handle messages separately
  if (updates.messages) {
    // Delete existing messages
    await prisma.message.deleteMany({
      where: { conversationId: id },
    });

    // Create new messages
    await prisma.message.createMany({
      data: updates.messages.map((msg) => ({
        conversationId: id,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.createdAt),
      })),
    });
  }

  // Handle transcripts separately
  if (updates.transcripts) {
    // Delete existing transcripts
    await prisma.transcript.deleteMany({
      where: { conversationId: id },
    });

    // Create new transcripts
    await prisma.transcript.createMany({
      data: updates.transcripts.map((t: { id: string; userAudioRef?: string; transcript: string; createdAt: string }) => ({
        conversationId: id,
        userAudioRef: t.userAudioRef || null,
        transcript: t.transcript,
        createdAt: new Date(t.createdAt),
      })),
    });
  }

  // Update conversation metadata
  const conversation = await prisma.conversation.update({
    where: { id },
    data: {
      ...(updates.mode !== undefined && { mode: updates.mode }),
      ...(updates.cost !== undefined && {
        tokensIn: updates.cost.tokensIn,
        tokensOut: updates.cost.tokensOut,
        costUsd: updates.cost.usd,
      }),
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      transcripts: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return {
    id: conversation.id,
    agentId: conversation.agentId,
    mode: conversation.mode as "text" | "voice",
    messages: conversation.messages.map((msg: PrismaMessage) => ({
      id: msg.id,
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    })),
    transcripts: conversation.transcripts.map((t: PrismaTranscript) => ({
      id: t.id,
      userAudioRef: t.userAudioRef || undefined,
      transcript: t.transcript,
      createdAt: t.createdAt.toISOString(),
    })),
    cost: {
      tokensIn: conversation.tokensIn,
      tokensOut: conversation.tokensOut,
      usd: conversation.costUsd,
    },
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function listConversations(
  userId: string,
  agentId?: string
): Promise<ConversationState[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      userId,
      ...(agentId && { agentId }),
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      transcripts: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return conversations.map((conversation: PrismaConversation) => ({
    id: conversation.id,
    agentId: conversation.agentId,
    mode: conversation.mode as "text" | "voice",
    messages: conversation.messages.map((msg: PrismaMessage) => ({
      id: msg.id,
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    })),
    transcripts: conversation.transcripts.map((t: PrismaTranscript) => ({
      id: t.id,
      userAudioRef: t.userAudioRef || undefined,
      transcript: t.transcript,
      createdAt: t.createdAt.toISOString(),
    })),
    cost: {
      tokensIn: conversation.tokensIn,
      tokensOut: conversation.tokensOut,
      usd: conversation.costUsd,
    },
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }));
}
