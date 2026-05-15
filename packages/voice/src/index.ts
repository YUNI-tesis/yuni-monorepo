export type VoiceProviderName = "openai" | "elevenlabs";

export interface VoiceProvider {
  readonly name: VoiceProviderName;
}
