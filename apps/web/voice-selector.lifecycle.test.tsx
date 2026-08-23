import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceSelector } from "./components/voice/VoiceSelector";
import type { VoiceOption } from "./lib/voice-config";

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;

class MockAudio {
  static instances: MockAudio[] = [];

  readonly listeners = new Map<string, () => void>();
  readonly pause = vi.fn(() => undefined);
  readonly play = vi.fn(async () => undefined);
  currentTime = 0;

  constructor(readonly src: string) {
    MockAudio.instances.push(this);
  }

  addEventListener(event: string, listener: () => void) {
    this.listeners.set(event, listener);
  }
}

const options: VoiceOption[] = [
  {
    id: "agustin",
    displayName: "Agustin - Relaxed and warm",
    description: "Relaxed and warm voice.",
    provider: "elevenlabs",
    toneLabel: "conversational",
    recommendedFor: "male · argentinian",
    previewUrl: "https://cdn.test/agustin.mp3",
    labels: { accent: "argentinian", gender: "male", use_case: "conversational" },
  },
  {
    id: "sofia",
    displayName: "Sofia - Clear and expressive",
    description: "Clear and expressive voice.",
    provider: "elevenlabs",
    toneLabel: "assistant",
    recommendedFor: "female · young",
    previewUrl: "https://cdn.test/sofia.mp3",
    labels: { age: "young", gender: "female", use_case: "assistant" },
  },
];

describe("voice selector preview lifecycle", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("Audio", MockAudio);
    ({ cleanup, fireEvent, render, screen } = await import("@testing-library/react"));
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    MockAudio.instances = [];
  });

  afterEach(() => cleanup());

  it("plays one preview at a time and toggles the active sample", () => {
    render(<VoiceSelector options={options} selectedId="agustin" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reproducir muestra de Agustin" }));
    const agustinAudio = MockAudio.instances[0]!;
    expect(agustinAudio.play).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Pausar muestra de Agustin" }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Reproducir muestra de Sofia" }));
    const sofiaAudio = MockAudio.instances[1]!;
    expect(agustinAudio.pause).toHaveBeenCalledOnce();
    expect(agustinAudio.currentTime).toBe(0);
    expect(sofiaAudio.play).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Pausar muestra de Sofia" }));
    expect(sofiaAudio.pause).toHaveBeenCalledOnce();
    expect(sofiaAudio.currentTime).toBe(0);
    expect(
      screen.getByRole("button", { name: "Reproducir muestra de Sofia" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("stops the active preview when the selector unmounts", () => {
    const view = render(<VoiceSelector options={options} selectedId="agustin" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reproducir muestra de Agustin" }));
    const audio = MockAudio.instances[0]!;

    view.unmount();

    expect(audio.pause).toHaveBeenCalledOnce();
  });
});
