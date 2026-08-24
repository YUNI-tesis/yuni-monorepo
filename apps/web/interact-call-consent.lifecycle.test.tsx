import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@yuni/ui";
import { InteractCall } from "./components/interact/InteractCall";

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;

const avatarApiMocks = vi.hoisted(() => ({
  getAvatarInteractionContext: vi.fn(),
  getConversation: vi.fn(),
  listAvatarConversations: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({ getMe: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ push: vi.fn() }));
const liveCallMocks = vi.hoisted(() => ({
  start: vi.fn(),
  end: vi.fn(),
  toggleMute: vi.fn(),
  interrupt: vi.fn(),
  sendTextProbe: vi.fn(),
  attachMediaElement: vi.fn(),
  dismissError: vi.fn(),
}));
const liveCallState = vi.hoisted(() => ({
  status: "idle",
  error: null as string | null,
  hasPendingEnd: false,
  endedByLimit: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));
vi.mock("./lib/api/avatar-api", () => avatarApiMocks);
vi.mock("./lib/api/auth-api", () => authMocks);
vi.mock("./hooks/useLiveAvatarSession", () => ({
  useLiveAvatarSession: () => ({
    status: liveCallState.status,
    error: liveCallState.error,
    hasPendingEnd: liveCallState.hasPendingEnd,
    endedByLimit: liveCallState.endedByLimit,
    remainingSeconds: null,
    isMuted: false,
    isUserSpeaking: false,
    isAvatarSpeaking: false,
    conversationState: "idle",
    voiceSession: null,
    transcript: [],
    diagnostics: {
      voiceChatState: "INACTIVE",
      microphoneLevel: null,
      eventCount: 0,
      lastEventType: null,
      lastElevenLabsEventType: null,
      elevenLabsConversationId: null,
      textProbeStatus: "idle",
      textProbeError: null,
    },
    ...liveCallMocks,
  }),
}));

async function flushAsyncWork() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("InteractCall shared consent lifecycle", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/interact/avatar-1",
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("HTMLMediaElement", dom.window.HTMLMediaElement);
    vi.stubGlobal("HTMLVideoElement", dom.window.HTMLVideoElement);
    vi.stubGlobal("HTMLDialogElement", dom.window.HTMLDialogElement);
    vi.stubGlobal("Event", dom.window.Event);
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    });
    ({ act, cleanup, fireEvent, render, screen } = await import("@testing-library/react"));
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    window.localStorage.clear();
    for (const mock of Object.values(avatarApiMocks)) mock.mockReset();
    for (const mock of Object.values(liveCallMocks)) mock.mockReset();
    authMocks.getMe.mockReset();
    navigationMocks.push.mockReset();
    liveCallState.status = "idle";
    liveCallState.error = null;
    liveCallState.hasPendingEnd = false;
    liveCallState.endedByLimit = false;
    avatarApiMocks.getAvatarInteractionContext.mockResolvedValue({
      interactionContext: {
        avatar: {
          id: "avatar-1",
          name: "Ada",
          description: "Matemática",
          status: "active",
        },
        access: { type: "shared", canInteract: true },
        contextStatus: "ready",
        voiceAvailability: "ready",
      },
    });
  });

  afterEach(() => cleanup());

  it("does not start the individual runtime when getMe resolves after unmount", async () => {
    let resolveUser: (value: unknown) => void = () => undefined;
    authMocks.getMe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve;
        })
    );
    const view = render(
      <ToastProvider>
        <InteractCall avatarId="avatar-1" />
      </ToastProvider>
    );
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    view.unmount();

    await act(async () => {
      resolveUser({
        user: {
          id: "late-user",
          email: "late@example.com",
          name: "Late",
          imageUrl: null,
          createdAt: "2026-08-21T12:00:00.000Z",
          updatedAt: "2026-08-21T12:00:00.000Z",
        },
      });
      await flushAsyncWork();
    });

    expect(liveCallMocks.start).not.toHaveBeenCalled();
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  it("keeps a pending save available after its toast is closed", async () => {
    liveCallState.error = "No pudimos guardar la conversación.";
    liveCallState.hasPendingEnd = true;
    render(
      <ToastProvider>
        <InteractCall avatarId="avatar-1" />
      </ToastProvider>
    );
    await act(flushAsyncWork);

    expect(screen.getByRole("button", { name: "Reintentar guardado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar notificación" }));

    expect(liveCallMocks.dismissError).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Reintentar guardado" })).toBeTruthy();
  });

  it("announces a duration limit only after the call was saved", async () => {
    liveCallState.status = "ending";
    liveCallState.endedByLimit = true;
    const view = render(
      <ToastProvider>
        <InteractCall avatarId="avatar-1" />
      </ToastProvider>
    );
    await act(flushAsyncWork);

    expect(screen.queryByText("Se alcanzó el límite de duración")).toBeNull();

    liveCallState.status = "ended";
    view.rerender(
      <ToastProvider>
        <InteractCall avatarId="avatar-1" />
      </ToastProvider>
    );
    await act(flushAsyncWork);

    expect(screen.getByText("Se alcanzó el límite de duración")).toBeTruthy();
  });
});
