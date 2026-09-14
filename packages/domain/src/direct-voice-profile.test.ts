import { describe, expect, it } from "vitest";
import {
  applyNewAvatarConversationDefaults,
  getVerifiedConversationProfile,
  VoiceConfigSchema,
} from "./index";

describe("direct voice profile", () => {
  it("keeps existing voices on the standard profile and accepts an explicit pilot", () => {
    const voice = { provider: "elevenlabs", voiceId: "voice-1" };
    expect(VoiceConfigSchema.parse(voice)).not.toHaveProperty("conversationProfile");
    expect(VoiceConfigSchema.parse(voice)).not.toHaveProperty("conversationModel");
    expect(VoiceConfigSchema.parse({ ...voice, conversationProfile: "natural" }).conversationProfile).toBe(
      "natural"
    );
  });

  it("applies the supplied defaults without overwriting the voice or explicit choices", () => {
    const defaults = { conversationProfile: "standard" as const, conversationModel: "another-model" };
    const voice = VoiceConfigSchema.parse({
      provider: "elevenlabs",
      voiceId: "chosen-voice",
      speakingRate: 1.1,
    });
    expect(applyNewAvatarConversationDefaults(voice, defaults)).toEqual({
      ...voice,
      ...defaults,
    });
    const explicit = { ...voice, conversationProfile: "natural" as const, conversationModel: "gpt-5.4" };
    expect(applyNewAvatarConversationDefaults(explicit, defaults)).toEqual(explicit);
    expect(
      applyNewAvatarConversationDefaults({ ...voice, conversationModel: "chosen-model" }, defaults)
    ).toEqual({
      ...voice,
      conversationProfile: "standard",
      conversationModel: "chosen-model",
    });
    expect(voice).not.toHaveProperty("conversationProfile");
    expect(voice).not.toHaveProperty("conversationModel");
  });

  it("only enables runtime behavior from a provider-verified profile", () => {
    const state = {
      requestedModel: "eleven_v3",
      effectiveModel: "eleven_flash_v2_5",
      expressiveMode: false,
      fallbackReason: "expressive_tts_not_allowed",
      verifiedAt: "2026-09-13T14:00:00.000Z",
      profile: "natural",
    };
    expect(getVerifiedConversationProfile(state)).toBe("natural");
    expect(getVerifiedConversationProfile({ ...state, verifiedAt: null })).toBe("standard");
    expect(getVerifiedConversationProfile({ profile: "natural" })).toBe("standard");
    expect(getVerifiedConversationProfile(null)).toBe("standard");
  });
});
