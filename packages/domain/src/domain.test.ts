import { describe, expect, it } from "vitest";
import {
  AppendMessageInputSchema,
  CreateAvatarAgentInputSchema,
  CreateShareLinkInputSchema,
  LiveAvatarConfigSchema,
  LoginInputSchema,
  MessageRoleSchema,
  RegisterInputSchema,
  UpdateAvatarAgentInputSchema,
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
    displayName: "Alloy",
    description: "Voz equilibrada y natural para conversaciones generales.",
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

  it("does not default avatar status on update input", () => {
    const parsed = UpdateAvatarAgentInputSchema.parse({ name: "YUNI actualizado" });

    expect(parsed).toEqual({ name: "YUNI actualizado" });
    expect("status" in parsed).toBe(false);
  });

  it("validates Live Avatar provider config", () => {
    const parsed = LiveAvatarConfigSchema.parse({
      ...validAvatarInput.liveAvatarConfig,
      mode: "provider-specific-mode",
      sandbox: false,
    });

    expect(parsed.mode).toBe("provider-specific-mode");
    expect(parsed.sandbox).toBe(false);
  });

  it("validates voice config", () => {
    const parsed = VoiceConfigSchema.parse(validAvatarInput.voiceConfig);

    expect(parsed.provider).toBe("openai");
    expect(parsed.voiceId).toBe("alloy");
    expect(parsed.displayName).toBe("Alloy");
    expect(parsed.description).toBe("Voz equilibrada y natural para conversaciones generales.");
  });

  it("defaults voice speaking rate", () => {
    const parsed = VoiceConfigSchema.parse({
      provider: "openai",
      voiceId: "alloy",
    });

    expect(parsed.speakingRate).toBe(1);
  });

  it("rejects unsupported voice config", () => {
    expect(() =>
      VoiceConfigSchema.parse({
        provider: "elevenlabs",
        voiceId: "voice-1",
        speakingRate: 1,
      })
    ).toThrow();
    expect(() =>
      VoiceConfigSchema.parse({
        provider: "openai",
        voiceId: "",
        speakingRate: 1,
      })
    ).toThrow();
    expect(() =>
      VoiceConfigSchema.parse({
        provider: "openai",
        voiceId: "alloy",
        speakingRate: 1,
        extra: "not-allowed",
      })
    ).toThrow();
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
