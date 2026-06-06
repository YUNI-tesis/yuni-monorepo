import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoiceSelector } from "./components/voice/VoiceSelector";
import { voiceOptions } from "./lib/voice-config";

describe("voice selector", () => {
  it("renders visual voice options and an error state", () => {
    const html = renderToStaticMarkup(
      createElement(VoiceSelector, {
        options: voiceOptions,
        selectedId: "verse",
        error: "Selecciona una voz.",
        onSelect: vi.fn(),
      })
    );

    expect(html).toContain("role=\"radiogroup\"");
    expect(html).toContain("Verse");
    expect(html).toContain("Demos, guías narrativas");
    expect(html).toContain("aria-checked=\"true\"");
    expect(html).toContain("Selecciona una voz.");
  });
});
