import { createNewAvatarConversationConfig, parseRawEnv } from "@yuni/config";
import { CreateAvatarAgentInputSchema } from "@yuni/domain";
import { describe, expect, it, vi } from "vitest";
import { createAvatarAgentRepository } from "./repositories/avatar-agent-repository";

const input = CreateAvatarAgentInputSchema.parse({
  name: "Avatar",
  instructions: "Have a conversation.",
  voiceConfig: { provider: "elevenlabs", voiceId: "chosen-voice" },
  liveAvatarConfig: {
    provider: "liveavatar",
    avatarId: "avatar-1",
    mode: "lite",
    sandbox: true,
  },
});

const conversationDefaults = createNewAvatarConversationConfig(
  parseRawEnv({
    AVATAR_DEFAULT_CONVERSATION_MODEL: "environment-model",
    AVATAR_DEFAULT_CONVERSATION_PROFILE: "standard",
  })
);

describe("avatar repository conversation defaults", () => {
  it("persists environment defaults when creation omits the conversation settings", async () => {
    const create = vi.fn(async () => ({ id: "new-avatar" }));
    const repository = createAvatarAgentRepository(
      { avatarAgent: { create } } as never,
      conversationDefaults
    );

    await repository.create("owner-1", input);

    expect(create).toHaveBeenCalledWith({
      data: {
        ...input,
        ownerId: "owner-1",
        voiceConfig: { ...input.voiceConfig, ...conversationDefaults },
      },
    });
    expect(input.voiceConfig).not.toHaveProperty("conversationModel");
    expect(input.voiceConfig).not.toHaveProperty("conversationProfile");
  });

  it("preserves explicit creation choices when they differ from the environment", async () => {
    const create = vi.fn(async () => ({ id: "new-avatar" }));
    const repository = createAvatarAgentRepository(
      { avatarAgent: { create } } as never,
      conversationDefaults
    );
    const voiceConfig = {
      ...input.voiceConfig,
      conversationModel: "chosen-model",
      conversationProfile: "natural" as const,
    };

    await repository.create("owner-1", { ...input, voiceConfig });

    expect(create).toHaveBeenCalledWith({
      data: { ...input, ownerId: "owner-1", voiceConfig },
    });
  });

  it("does not add creation defaults when updating a legacy voice", async () => {
    const update = vi.fn(async () => ({ id: "legacy-avatar" }));
    const repository = createAvatarAgentRepository(
      { avatarAgent: { update, findFirst: vi.fn(async () => ({ id: "legacy-avatar" })) } } as never,
      conversationDefaults
    );
    const voiceConfig = { ...input.voiceConfig, voiceId: "replacement-voice" };

    await repository.updateForOwner("owner-1", "legacy-avatar", { voiceConfig });

    expect(update).toHaveBeenCalledWith({ where: { id: "legacy-avatar" }, data: { voiceConfig } });
  });
});
