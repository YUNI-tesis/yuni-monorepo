import { describe, expect, it } from "vitest";
import {
  AppendMessageInputSchema,
  CreateAvatarAgentInputSchema,
  CreateShareLinkInputSchema,
  LiveAvatarConfigSchema,
  LoginInputSchema,
  MessageRoleSchema,
  RegisterInputSchema,
  VoiceConfigSchema,
} from "./index";

const validAvatarInput = {
  name: "YUNI Demo",
  description: "Avatar de prueba",
  instructions: "Responde de forma clara.",
  context: "Contexto inicial.",
  voiceConfig: {
    provider: "openai",
    voiceId: "alloy",
    speakingRate: 1,
  },
  liveAvatarConfig: {
    provider: "liveavatar",
    avatarId: "demo",
    mode: "lite",
    sandbox: true,
  },
};

describe("@yuni/domain", () => {
  it("validates create avatar input", () => {
    const parsed = CreateAvatarAgentInputSchema.parse(validAvatarInput);

    expect(parsed.name).toBe("YUNI Demo");
    expect(parsed.status).toBe("draft");
  });

  it("rejects an avatar without a name", () => {
    expect(() => CreateAvatarAgentInputSchema.parse({ ...validAvatarInput, name: "" })).toThrow();
  });

  it("validates Live Avatar lite sandbox config", () => {
    const parsed = LiveAvatarConfigSchema.parse(validAvatarInput.liveAvatarConfig);

    expect(parsed.mode).toBe("lite");
    expect(parsed.sandbox).toBe(true);
  });

  it("validates voice config", () => {
    const parsed = VoiceConfigSchema.parse(validAvatarInput.voiceConfig);

    expect(parsed.provider).toBe("openai");
    expect(parsed.voiceId).toBe("alloy");
  });

  it("validates public slug format", () => {
    const parsed = CreateShareLinkInputSchema.parse({
      slug: "demo-link",
      name: "Demo link",
    });

    expect(parsed.slug).toBe("demo-link");
    expect(parsed.isEnabled).toBe(true);
  });

  it("rejects invalid message roles", () => {
    expect(() => MessageRoleSchema.parse("owner")).toThrow();
  });

  it("rejects client input that attempts to send ownerId", () => {
    expect(() =>
      CreateAvatarAgentInputSchema.parse({
        ...validAvatarInput,
        ownerId: "user-1",
      })
    ).toThrow();
  });

  it("validates append message input", () => {
    const parsed = AppendMessageInputSchema.parse({
      role: "user",
      content: "Hola",
    });

    expect(parsed.role).toBe("user");
  });

  it("validates register input and normalizes email", () => {
    const parsed = RegisterInputSchema.parse({
      email: "DEMO@YUNI.LOCAL ",
      password: "demo-password",
      name: "Demo",
    });

    expect(parsed.email).toBe("demo@yuni.local");
  });

  it("validates login input", () => {
    const parsed = LoginInputSchema.parse({
      email: "demo@yuni.local",
      password: "demo-password",
    });

    expect(parsed.email).toBe("demo@yuni.local");
  });

  it("rejects invalid auth input", () => {
    expect(() => RegisterInputSchema.parse({ email: "invalid", password: "demo-password" })).toThrow();
    expect(() => LoginInputSchema.parse({ email: "demo@yuni.local", password: "short" })).toThrow();
  });

  it("rejects auth input that attempts to send ownerId or userId", () => {
    expect(() =>
      RegisterInputSchema.parse({
        email: "demo@yuni.local",
        password: "demo-password",
        ownerId: "owner-1",
      })
    ).toThrow();
    expect(() =>
      LoginInputSchema.parse({
        email: "demo@yuni.local",
        password: "demo-password",
        userId: "user-1",
      })
    ).toThrow();
  });
});
