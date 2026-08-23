import { describe, expect, it } from "vitest";
import {
  AppendMessageInputSchema,
  CreateAccessGrantInputSchema,
  CreateAvatarAgentInputSchema,
  EndVoiceSessionInputSchema,
  GroupProviderEventInputSchema,
  GroupVoiceParticipantFailureInputSchema,
  GroupVoiceTurnInputSchema,
  CreateShareLinkInputSchema,
  LiveAvatarConfigSchema,
  LoginInputSchema,
  MessageRoleSchema,
  RegisterInputSchema,
  UpdateAvatarAgentInputSchema,
  UpdateAccessGrantInputSchema,
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

  it("validates ElevenLabs voice config", () => {
    const parsed = VoiceConfigSchema.parse({
      provider: "elevenlabs",
      voiceId: "voice-1",
      speakingRate: 1,
    });

    expect(parsed.provider).toBe("elevenlabs");
    expect(parsed.voiceId).toBe("voice-1");
  });

  it("rejects invalid voice config", () => {
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

  it("normalizes access grant email and validates status updates", () => {
    const created = CreateAccessGrantInputSchema.parse({
      email: "  PARTICIPANT@EXAMPLE.COM ",
    });
    const updated = UpdateAccessGrantInputSchema.parse({ status: "revoked" });

    expect(created.email).toBe("participant@example.com");
    expect(updated.status).toBe("revoked");
  });

  it("rejects invalid access grants and oversized share link names", () => {
    expect(() => CreateAccessGrantInputSchema.parse({ email: "not-an-email" })).toThrow();
    expect(() => UpdateAccessGrantInputSchema.parse({ status: "pending" })).toThrow();
    expect(() =>
      CreateShareLinkInputSchema.parse({
        slug: "demo-link",
        name: "a".repeat(121),
      })
    ).toThrow();
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

  it("validates voice session transcript input", () => {
    const parsed = EndVoiceSessionInputSchema.parse({
      transcript: [{ role: "assistant", content: "Hola" }],
    });

    expect(parsed.transcript).toHaveLength(1);
  });

  it("accepts only final human transcripts and typed provider events for group calls", () => {
    expect(GroupVoiceTurnInputSchema.parse({ sourceEventId: "scribe-1", content: "Hola equipo" })).toEqual({
      sourceEventId: "scribe-1",
      content: "Hola equipo",
    });
    expect(() =>
      GroupVoiceTurnInputSchema.parse({ sourceEventId: "avatar-1", source: "avatar", content: "No" })
    ).toThrow();
    expect(
      GroupProviderEventInputSchema.parse({
        sourceEventId: "event-1",
        turnId: null,
        avatarId: "avatar-1",
        type: "speak_started",
      }).type
    ).toBe("speak_started");
    expect(() =>
      GroupProviderEventInputSchema.parse({
        sourceEventId: "event-2",
        turnId: null,
        avatarId: "avatar-1",
        type: "speak_ended",
      })
    ).toThrow();
    expect(
      GroupVoiceParticipantFailureInputSchema.parse({
        sourceEventId: "participant:error:1",
        participantAttemptId: "realtime-attempt-1",
        reason: "stream_error",
        expectedTurnId: "turn-1",
      })
    ).toEqual({
      sourceEventId: "participant:error:1",
      participantAttemptId: "realtime-attempt-1",
      reason: "stream_error",
      expectedTurnId: "turn-1",
    });
    expect(() =>
      GroupVoiceParticipantFailureInputSchema.parse({
        sourceEventId: "participant:error:2",
        reason: "arbitrary provider message",
      })
    ).toThrow();
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
