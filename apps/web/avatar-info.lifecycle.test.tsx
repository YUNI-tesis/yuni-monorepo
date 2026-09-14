import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AvatarInfoTab } from "./components/avatar-profile/AvatarInfoTab";
import type { ApiAvatar } from "./lib/api/avatar-api";

const instructions =
  "Explicá con claridad.\n\n" +
  "Consultá antes de asumir datos del proyecto. ".repeat(25) +
  "Regla final: no inventes información.";
const avatar: ApiAvatar = {
  id: "test",
  name: "Vera",
  instructions,
  description: "",
  context: "",
  voiceConfig: { voiceId: "test", displayName: "Malena" },
  liveAvatarConfig: {},
  providerStatus: "ready",
  hasPreviousUsableVersion: false,
  status: "active",
  createdAt: "",
  updatedAt: "",
};
let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;

beforeAll(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("React", React);
  ({ cleanup, fireEvent, render, screen } = await import("@testing-library/react"));
});
afterEach(() => cleanup());
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe("Information reading", () => {
  it("keeps voice visible and lets readers expand the unmodified personality", () => {
    render(<AvatarInfoTab avatar={avatar} />);
    expect(screen.getByRole("region", { name: "Voz" })).toBeTruthy();
    expect(screen.getByText("Malena")).toBeTruthy();
    expect(screen.queryByText(/Regla final/)).toBeNull();
    const button = screen.getByRole("button", { name: "Ver personalidad completa" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(button.getAttribute("aria-controls")!)?.textContent).toBe(instructions);
    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(screen.queryByText(/Regla final/)).toBeNull();
  });
  it("does not offer an unnecessary disclosure for a short personality", () => {
    render(<AvatarInfoTab avatar={{ ...avatar, instructions: "Respondé claro y breve." }} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Respondé claro y breve.")).toBeTruthy();
  });
});
