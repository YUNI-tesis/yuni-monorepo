import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoiceSelector } from "./components/voice/VoiceSelector";
import type { VoiceOption } from "./lib/voice-config";

const voiceOptions: VoiceOption[] = [
  {
    id: "voice-1",
    displayName: "Agustin",
    description: "Relaxed, warm and approachable.",
    provider: "elevenlabs",
    toneLabel: "Warm",
    recommendedFor: "Conversaciones naturales.",
    previewUrl: "https://cdn.elevenlabs.test/voice-1.mp3",
  },
];

describe("voice selector", () => {
  it("renders visual voice options and an error state", () => {
    const html = renderToStaticMarkup(
      createElement(VoiceSelector, {
        options: voiceOptions,
        selectedId: "voice-1",
        error: "Selecciona una voz.",
        onSelect: vi.fn(),
      })
    );

    expect(html).toContain("role=\"radiogroup\"");
    expect(html).toContain("Agustin");
    expect(html).toContain("Conversaciones naturales.");
    expect(html).toContain("ElevenLabs");
    expect(html).toContain("Escuchar preview");
    expect(html).toContain("aria-checked=\"true\"");
    expect(html).toContain("Selecciona una voz.");
  });
});
