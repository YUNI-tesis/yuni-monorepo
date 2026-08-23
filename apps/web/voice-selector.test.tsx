import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getVoicePresentation, VoiceSelector } from "./components/voice/VoiceSelector";
import type { VoiceOption } from "./lib/voice-config";

const voiceOptions: VoiceOption[] = [
  {
    id: "voice-1",
    displayName: "Agustin - Relaxed, Warm and Approachable",
    description: "Argentinian male voice with a natural conversational tone, perfect for casual dialogue.",
    provider: "elevenlabs",
    toneLabel: "social_media",
    recommendedFor: "male · middle_aged · argentinian · conversational",
    previewUrl: "https://cdn.elevenlabs.test/voice-1.mp3",
    labels: {
      accent: "argentinian",
      age: "middle_aged",
      gender: "male",
      use_case: "social_media",
    },
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
    expect(html).toContain("Tono cálido, relajado y cercano.");
    expect(html).toContain("Argentina");
    expect(html).toContain("Masculina");
    expect(html).toContain("Adulta");
    expect(html).toContain("Reproducir muestra de Agustin");
    expect(html).toContain("type=\"radio\"");
    expect(html).toContain("checked=\"\"");
    expect(html).not.toContain("ElevenLabs");
    expect(html).not.toContain("middle_aged");
    expect(html).not.toContain("Redes sociales");
    expect(html).not.toContain("Seleccionada");
    expect(html).not.toContain("Argentinian male voice");
    expect(html).toContain("Selecciona una voz.");
  });

  it("keeps a concise Spanish description when provider copy has no recognized qualities", () => {
    const presentation = getVoicePresentation({
      ...voiceOptions[0]!,
      displayName: "Ignacio",
      description: "Argentinian male speaker.",
      toneLabel: "social_media",
      labels: { accent: "argentinian", age: "young", gender: "male", use_case: "social_media" },
    });

    expect(presentation.summary).toBe("Voz argentina, masculina y joven.");
  });
});
