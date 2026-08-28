import { JSDOM } from "jsdom";
import React from "react";
import { ToastProvider } from "@yuni/ui";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarBuilder } from "./components/avatar-builder/AvatarBuilder";
import { AvatarEdit } from "./components/avatar-edit/AvatarEdit";

const avatarMocks = vi.hoisted(() => ({
  createAvatar: vi.fn(),
  updateAvatar: vi.fn(),
  uploadAvatarDocument: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  validateBuilder: vi.fn(() => true),
  validateEdit: vi.fn(() => true),
}));
const avatarState = vi.hoisted(() => ({
  builderFiles: [] as File[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: avatarMocks.push, refresh: avatarMocks.refresh }),
}));

vi.mock("./lib/api/avatar-api", () => ({
  createAvatar: avatarMocks.createAvatar,
  updateAvatar: avatarMocks.updateAvatar,
  uploadAvatarDocument: avatarMocks.uploadAvatarDocument,
}));

vi.mock("./hooks/useAvatarList", () => ({ invalidateAvatarListCache: vi.fn() }));

vi.mock("./hooks/useLiveAvatarOptions", () => ({
  useLiveAvatarOptions: () => ({ status: "ready", options: [], error: null }),
}));

vi.mock("./hooks/useElevenLabsVoiceOptions", () => ({
  useElevenLabsVoiceOptions: () => ({ status: "ready", options: [], error: null }),
}));

vi.mock("./hooks/useAvatarBuilder", () => ({
  buildCreateAvatarRequest: () => ({}),
  useAvatarBuilder: () => ({
    state: { files: avatarState.builderFiles },
    currentStep: "Review",
    currentStepIndex: 5,
    selectedLiveAvatar: null,
    selectedVoice: null,
    canGoBack: true,
    isLastStep: true,
    goBack: vi.fn(),
    goNext: vi.fn(),
    validateAll: avatarMocks.validateBuilder,
  }),
}));

vi.mock("./hooks/useAvatarEdit", () => ({
  buildUpdateAvatarRequest: () => ({}),
  useAvatarEdit: () => ({
    loadState: {
      status: "ready",
      error: null,
      avatar: { id: "avatar-edit", name: "Ada", description: "Asistente" },
      state: {
        liveAvatarId: "live-1",
        voiceId: "voice-1",
        voiceDisplayName: "Voz",
        voiceDescription: null,
        voiceProvider: "elevenlabs",
      },
    },
    errors: {},
    updateField: vi.fn(),
    validateAll: avatarMocks.validateEdit,
  }),
}));

vi.mock("./components/avatar-builder/BuilderSteps", () => ({ BuilderSteps: () => null }));
vi.mock("./components/avatar-builder/steps/ContextStep", () => ({ ContextStep: () => null }));
vi.mock("./components/avatar-builder/steps/IdentityStep", () => ({ IdentityStep: () => null }));
vi.mock("./components/avatar-builder/steps/LiveAvatarStep", () => ({ LiveAvatarStep: () => null }));
vi.mock("./components/avatar-builder/steps/PersonaStep", () => ({ PersonaStep: () => null }));
vi.mock("./components/avatar-builder/steps/ReviewStep", () => ({ ReviewStep: () => null }));
vi.mock("./components/avatar-builder/steps/VoiceStep", () => ({ VoiceStep: () => null }));

vi.mock("./components/avatar-edit/AvatarEditForm", async () => {
  const { createElement } = await import("react");
  return {
    AvatarEditForm: ({ onSubmit }: { onSubmit: () => void }) =>
      createElement("button", { type: "button", onClick: onSubmit }, "Guardar cambios test"),
  };
});

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

describe("avatar toast feedback", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("File", dom.window.File);
    ({ cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react"));
  });

  beforeEach(() => {
    for (const mock of Object.values(avatarMocks)) mock.mockClear();
    avatarMocks.validateBuilder.mockReturnValue(true);
    avatarMocks.validateEdit.mockReturnValue(true);
    avatarMocks.uploadAvatarDocument.mockResolvedValue({});
    avatarState.builderFiles = [];
  });

  afterEach(() => cleanup());

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("announces avatar creation before navigating to its profile", async () => {
    avatarMocks.createAvatar.mockResolvedValue({ avatar: { id: "avatar-new", name: "Luna" } });
    render(
      <ToastProvider>
        <AvatarBuilder />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar avatar" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Avatar creado"));
    expect(avatarMocks.push).toHaveBeenCalledWith("/avatars/avatar-new");
  });

  it("keeps avatar creation available for retry after a failure", async () => {
    avatarMocks.createAvatar.mockRejectedValue(new Error("El proveedor no respondió."));
    render(
      <ToastProvider>
        <AvatarBuilder />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar avatar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No pudimos crear el avatar")
    );
    expect(screen.getByRole("button", { name: "Guardar avatar" })).toBeTruthy();
    expect(avatarMocks.push).not.toHaveBeenCalled();
  });

  it("reports pending documents without claiming avatar creation failed", async () => {
    avatarState.builderFiles = [new File(["contexto"], "contexto.txt", { type: "text/plain" })];
    avatarMocks.createAvatar.mockResolvedValue({ avatar: { id: "avatar-new", name: "Luna" } });
    avatarMocks.uploadAvatarDocument.mockRejectedValue(new Error("No se pudo subir"));
    render(
      <ToastProvider>
        <AvatarBuilder />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar avatar" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Avatar creado, con documentos pendientes")
    );
    expect(screen.queryByText("No pudimos crear el avatar")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar avatar" })).toBeTruthy();
    expect(avatarMocks.push).not.toHaveBeenCalled();
  });

  it("replaces a pending-document warning after a successful creation retry", async () => {
    avatarState.builderFiles = [new File(["contexto"], "contexto.txt", { type: "text/plain" })];
    avatarMocks.createAvatar.mockResolvedValue({ avatar: { id: "avatar-new", name: "Luna" } });
    avatarMocks.updateAvatar.mockResolvedValue({ avatar: { id: "avatar-new", name: "Luna" } });
    avatarMocks.uploadAvatarDocument
      .mockRejectedValueOnce(new Error("No se pudo subir"))
      .mockResolvedValue({});
    render(
      <ToastProvider>
        <AvatarBuilder />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar avatar" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("documentos pendientes"));

    fireEvent.click(screen.getByRole("button", { name: "Guardar avatar" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Avatar creado"));
    expect(screen.queryByText("Avatar creado, con documentos pendientes")).toBeNull();
    expect(avatarMocks.updateAvatar).toHaveBeenCalledWith("avatar-new", {});
    expect(avatarMocks.push).toHaveBeenCalledWith("/avatars/avatar-new");
  });

  it("announces avatar edits before returning to the profile", async () => {
    avatarMocks.updateAvatar.mockResolvedValue({ avatar: { id: "avatar-edit", name: "Ada" } });
    render(
      <ToastProvider>
        <AvatarEdit avatarId="avatar-edit" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios test" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Cambios guardados"));
    expect(avatarMocks.push).toHaveBeenCalledWith("/avatars/avatar-edit");
  });
});
