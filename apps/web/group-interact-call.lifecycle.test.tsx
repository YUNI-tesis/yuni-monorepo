import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@yuni/ui";
import { GroupInteractCall } from "./components/interact/GroupInteractCall";
import { ApiClientError } from "./lib/api/http-client";

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let within: typeof import("@testing-library/react").within;

const apiMocks = vi.hoisted(() => ({
  confirmGroupParticipantStarted: vi.fn(),
  endGroupVoiceSession: vi.fn(),
  getAvatarGroup: vi.fn(),
  getGroupConversation: vi.fn(),
  getGroupScribeToken: vi.fn(),
  heartbeatGroupVoiceSession: vi.fn(),
  interruptGroupVoiceSession: vi.fn(),
  listGroupConversations: vi.fn(),
  reportGroupParticipantFailure: vi.fn(),
  reportGroupProviderEvent: vi.fn(),
  retryGroupParticipant: vi.fn(),
  startGroupVoiceSession: vi.fn(),
  submitGroupTurn: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getMe: vi.fn(),
}));

const liveAvatarMocks = vi.hoisted(() => ({
  startBehaviors: new Map<string, () => Promise<void>>(),
  instances: [] as Array<{
    token: string;
    attach: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
    keepAlive: ReturnType<typeof vi.fn>;
    publishData: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    emit: (event: string, payload?: Record<string, unknown>) => void;
  }>,
}));

const scribeMocks = vi.hoisted(() => ({
  connection: null as null | {
    close: ReturnType<typeof vi.fn>;
    emit: (event: string, payload: Record<string, unknown>) => void;
  },
}));

const navigationMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

vi.mock("./lib/api/avatar-group-api", () => apiMocks);
vi.mock("./lib/api/auth-api", () => authMocks);

vi.mock("@heygen/liveavatar-web-sdk", () => {
  class MockLiveAvatarSession {
    readonly token: string;
    readonly attach = vi.fn();
    readonly interrupt = vi.fn();
    readonly keepAlive = vi.fn(async () => undefined);
    readonly publishData = vi.fn(async () => undefined);
    readonly stop = vi.fn(async () => undefined);
    readonly room = { localParticipant: { publishData: this.publishData } };
    private readonly handlers = new Map<string, Set<(payload: Record<string, unknown>) => void>>();

    constructor(token: string) {
      this.token = token;
      liveAvatarMocks.instances.push(this);
    }

    on(event: string, handler: (payload: Record<string, unknown>) => void) {
      const handlers = this.handlers.get(event) ?? new Set();
      handlers.add(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    off(event: string, handler: (payload: Record<string, unknown>) => void) {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string, payload: Record<string, unknown> = {}) {
      for (const handler of this.handlers.get(event) ?? []) handler(payload);
    }

    async start() {
      const behavior = liveAvatarMocks.startBehaviors.get(this.token);
      if (behavior) return behavior();
      this.emit("session.stream_ready");
      this.emit("avatar.speak_started", { event_id: `startup-start:${this.token}` });
      this.emit("avatar.speak_ended", { event_id: `startup-end:${this.token}` });
    }
  }

  return {
    AgentEventsEnum: {
      AVATAR_SPEAK_STARTED: "avatar.speak_started",
      AVATAR_SPEAK_ENDED: "avatar.speak_ended",
      AVATAR_TRANSCRIPTION: "avatar.transcription",
      ELEVENLABS_AGENT_EVENT: "elevenlabs_agent_event",
      SESSION_STOPPED: "session.stopped",
    },
    LiveAvatarSession: MockLiveAvatarSession,
    SessionEvent: {
      SESSION_STREAM_READY: "session.stream_ready",
      SESSION_DISCONNECTED: "session.disconnected",
    },
  };
});

vi.mock("@elevenlabs/client", () => ({
  CommitStrategy: { VAD: "vad" },
  RealtimeEvents: {
    PARTIAL_TRANSCRIPT: "partial_transcript",
    COMMITTED_TRANSCRIPT: "committed_transcript",
    ERROR: "error",
  },
  Scribe: {
    connect: vi.fn(() => {
      const handlers = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
      const connection = {
        close: vi.fn(),
        on(event: string, handler: (payload: Record<string, unknown>) => void) {
          const eventHandlers = handlers.get(event) ?? new Set();
          eventHandlers.add(handler);
          handlers.set(event, eventHandlers);
        },
        off(event: string, handler: (payload: Record<string, unknown>) => void) {
          handlers.get(event)?.delete(handler);
        },
        emit(event: string, payload: Record<string, unknown>) {
          for (const handler of handlers.get(event) ?? []) handler(payload);
        },
      };
      scribeMocks.connection = connection;
      return connection;
    }),
  },
}));

const group = {
  id: "group-1",
  name: "Consejo",
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  members: [
    {
      id: "avatar-1",
      name: "Ada",
      description: "Matemática",
      thumbnailUrl: null,
      accessType: "owner" as const,
      position: 0,
      available: true,
    },
    {
      id: "avatar-2",
      name: "Grace",
      description: "Programación",
      thumbnailUrl: null,
      accessType: "owner" as const,
      position: 1,
      available: true,
    },
  ],
};

const participants = group.members.map((avatar, index) => ({
  id: `participant-${index + 1}`,
  participantAttemptId: `attempt-${index + 1}`,
  avatar,
  realtimeSessionId: `realtime-${index + 1}`,
  status: "active" as const,
  sessionToken: `token-${index + 1}`,
  sessionId: `live-${index + 1}`,
  error: null,
}));

function TestGroupInteractCall({ groupId }: { groupId: string }) {
  return (
    <ToastProvider>
      <GroupInteractCall groupId={groupId} />
    </ToastProvider>
  );
}

async function flushAsyncWork() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function renderActiveCall() {
  const view = render(<TestGroupInteractCall groupId="group-1" />);
  await act(flushAsyncWork);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await flushAsyncWork();
  });
  expect(screen.getByText("En vivo")).toBeTruthy();
  return view;
}

function decodedCommands(instanceIndex: number) {
  return liveAvatarMocks.instances[instanceIndex]!.publishData.mock.calls.map(([payload]) =>
    JSON.parse(new TextDecoder().decode(payload as Uint8Array))
  );
}

describe("GroupInteractCall lifecycle", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/groups/group-1" });
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
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.removeAttribute("open");
        this.dispatchEvent(new dom.window.Event("close"));
      },
    });
    ({ act, cleanup, fireEvent, render, screen, within } = await import("@testing-library/react"));
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));
    liveAvatarMocks.instances.length = 0;
    liveAvatarMocks.startBehaviors.clear();
    scribeMocks.connection = null;
    window.localStorage.clear();
    for (const mock of Object.values(apiMocks)) mock.mockReset();
    apiMocks.getAvatarGroup.mockResolvedValue({ group });
    authMocks.getMe.mockReset();
    authMocks.getMe.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        imageUrl: null,
        createdAt: "2026-08-21T12:00:00.000Z",
        updatedAt: "2026-08-21T12:00:00.000Z",
      },
    });
    apiMocks.startGroupVoiceSession.mockResolvedValue({
      voiceSession: {
        id: "group-session-1",
        groupId: group.id,
        conversationId: "conversation-1",
        status: "active",
        expiresAt: "2026-08-21T12:10:00.000Z",
        participants,
      },
    });
    apiMocks.confirmGroupParticipantStarted.mockResolvedValue({ ok: true });
    apiMocks.getGroupScribeToken.mockResolvedValue({
      scribe: { token: "scribe-token", expiresInSeconds: 600 },
    });
    apiMocks.heartbeatGroupVoiceSession.mockResolvedValue({
      ok: true,
      expiresAt: "2026-08-21T12:10:00.000Z",
    });
    apiMocks.endGroupVoiceSession.mockResolvedValue({ id: "group-session-1", status: "ended" });
    apiMocks.listGroupConversations.mockResolvedValue({ conversations: [] });
    apiMocks.reportGroupParticipantFailure.mockResolvedValue({
      phase: "listening",
      directive: null,
      floor: null,
      participant: { avatarId: "avatar-1", status: "errored", error: "La conexión se cerró." },
    });
    apiMocks.interruptGroupVoiceSession.mockResolvedValue({
      phase: "listening",
      directive: { action: "listen", reason: "interrupted" },
      floor: null,
    });
    apiMocks.submitGroupTurn.mockResolvedValue({
      round: { id: "round-1", intent: "normal", status: "queued", contextVersion: 1 },
      phase: "queued",
      floor: {
        turnId: "turn-1",
        avatarId: "avatar-1",
        leaseExpiresAt: "2026-08-21T12:01:15.000Z",
      },
      directive: {
        action: "speak",
        turnId: "turn-1",
        avatarId: "avatar-1",
        avatarName: "Ada",
        context: "Historial compartido",
        instruction: "Respondé sobre el tema.",
        leaseExpiresAt: "2026-08-21T12:01:15.000Z",
      },
    });
    apiMocks.reportGroupProviderEvent.mockImplementation(async (_sessionId, input) => {
      if (input.type === "speak_started" && input.turnId === null) {
        return {
          phase: "queued",
          directive: { action: "suppress", avatarId: input.avatarId, reason: "unauthorized_audio" },
          floor: null,
        };
      }
      if (input.type === "speak_ended") {
        return {
          phase: "listening",
          directive: { action: "listen", reason: "round_complete" },
          floor: null,
        };
      }
      return {
        phase: input.type === "speak_started" ? "speaking" : "queued",
        directive: null,
        floor:
          input.type === "speak_started" && input.turnId
            ? {
                turnId: input.turnId,
                avatarId: input.avatarId,
                leaseExpiresAt: "2026-08-21T12:01:15.000Z",
              }
            : null,
      };
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("runs the three independent liveness loops and removes them on unmount", async () => {
    const { container, unmount } = await renderActiveCall();
    const videos = [...container.querySelectorAll("video")];
    expect(videos).toHaveLength(2);
    expect(videos.every((video) => video.muted)).toBe(true);
    expect(apiMocks.confirmGroupParticipantStarted.mock.calls).toEqual([
      ["group-session-1", "avatar-1", "attempt-1"],
      ["group-session-1", "avatar-2", "attempt-2"],
    ]);

    for (const instance of liveAvatarMocks.instances) {
      instance.publishData.mockClear();
      instance.keepAlive.mockClear();
    }
    apiMocks.heartbeatGroupVoiceSession.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(apiMocks.heartbeatGroupVoiceSession).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 2; index += 1) {
      expect(decodedCommands(index)).toContainEqual({
        event_type: "elevenlabs_agent_command",
        elevenlabs_event_type: "user_activity",
        data: {},
      });
    }

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(liveAvatarMocks.instances[0]!.keepAlive).toHaveBeenCalledTimes(1);
    expect(liveAvatarMocks.instances[1]!.keepAlive).toHaveBeenCalledTimes(1);

    const heartbeatCount = apiMocks.heartbeatGroupVoiceSession.mock.calls.length;
    const keepAliveCounts = liveAvatarMocks.instances.map((instance) => instance.keepAlive.mock.calls.length);
    await act(async () => {
      unmount();
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(apiMocks.heartbeatGroupVoiceSession).toHaveBeenCalledTimes(heartbeatCount);
    expect(liveAvatarMocks.instances.map((instance) => instance.keepAlive.mock.calls.length)).toEqual(
      keepAliveCounts
    );
    expect(scribeMocks.connection?.close).toHaveBeenCalledTimes(1);
    expect(liveAvatarMocks.instances.every((instance) => instance.stop.mock.calls.length === 1)).toBe(true);
  });

  it("does not expose raw provider errors in global notifications", async () => {
    const { unmount } = await renderActiveCall();
    const providerError = "ElevenLabs websocket 1006: upstream connection failed";

    await act(async () => {
      scribeMocks.connection?.emit("error", { error: providerError });
      await flushAsyncWork();
    });

    expect(screen.queryByText(providerError)).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "La llamada tuvo un problema de conexión. Intentá nuevamente."
    );
    unmount();
  });

  it("keeps the valid owner audible when a different avatar starts without authorization", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "¿Quién debería responder?" });
      await flushAsyncWork();
    });

    const videos = [...container.querySelectorAll("video")];
    expect(videos[0]!.muted).toBe(false);
    expect(videos[1]!.muted).toBe(true);
    expect(decodedCommands(0).map((command) => command.elevenlabs_event_type)).toEqual([
      "contextual_update",
      "user_message",
    ]);
    expect(decodedCommands(1).at(-1)).toEqual({
      event_type: "elevenlabs_agent_command",
      elevenlabs_event_type: "user_activity",
      data: {},
    });

    const providerEventCount = apiMocks.reportGroupProviderEvent.mock.calls.length;
    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "premature-interruption-1",
        elevenlabs_event_type: "interruption",
        data: {},
      });
      await flushAsyncWork();
    });
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledTimes(providerEventCount);
    expect(videos[0]!.muted).toBe(false);

    liveAvatarMocks.instances[1]!.interrupt.mockImplementation(() => {
      throw new Error("provider interrupt failed");
    });
    await act(async () => {
      liveAvatarMocks.instances[1]!.emit("avatar.speak_started", { event_id: "rogue-start-1" });
      await flushAsyncWork();
    });
    expect(liveAvatarMocks.instances[1]!.interrupt).toHaveBeenCalled();
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledWith(
      "group-session-1",
      expect.objectContaining({ type: "speak_started", turnId: null, avatarId: "avatar-2" })
    );
    expect(videos[0]!.muted).toBe(false);
    expect(videos[1]!.muted).toBe(true);
    expect(videos[0]!.closest("article")?.getAttribute("data-turn-owner")).toBe("true");
    expect(videos[1]!.closest("article")?.getAttribute("data-speaking")).toBe("false");

    let mutedAfterStreamReadyDuringCommit = false;
    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "owner-start-1" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", { event_id: "owner-end-1" });
      liveAvatarMocks.instances[0]!.emit("session.stream_ready");
      mutedAfterStreamReadyDuringCommit = videos[0]!.muted;
    });
    expect(mutedAfterStreamReadyDuringCommit).toBe(true);
    expect(videos.every((video) => video.muted)).toBe(true);
    unmount();
  });

  it("expires a pending directive even while contextual_update is still publishing", async () => {
    const { container, unmount } = await renderActiveCall();
    let resolveContext: () => void = () => undefined;
    const contextPending = new Promise<void>((resolve) => {
      resolveContext = resolve;
    });
    liveAvatarMocks.instances[0]!.publishData.mockImplementation(async (payload: Uint8Array) => {
      const command = JSON.parse(new TextDecoder().decode(payload));
      if (command.elevenlabs_event_type === "contextual_update") await contextPending;
    });

    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Una pregunta lenta" });
      await flushAsyncWork();
    });
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_251);
      await flushAsyncWork();
    });
    expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "timeout", {
      avatarId: "avatar-1",
      turnId: "turn-1",
    });

    await act(async () => {
      resolveContext();
      await flushAsyncWork();
    });
    expect(decodedCommands(0).some((command) => command.elevenlabs_event_type === "user_message")).toBe(
      false
    );
    unmount();
  });

  it("allows the same provider event to be redelivered after both bounded POST attempts fail", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
    });
    apiMocks.reportGroupProviderEvent
      .mockRejectedValueOnce(new Error("network-1"))
      .mockRejectedValueOnce(new Error("network-2"));

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "retryable-start-1" });
      await flushAsyncWork();
    });
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("video")[0]!.muted).toBe(false);

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "retryable-start-1" });
      await flushAsyncWork();
    });
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledTimes(3);
    expect(apiMocks.reportGroupProviderEvent.mock.calls[2]?.[1]).toMatchObject({
      sourceEventId: "speak_started:avatar-1:turn:turn-1",
      turnId: "turn-1",
    });
    expect(liveAvatarMocks.instances[0]!.interrupt).not.toHaveBeenCalled();
    expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
    unmount();
  });

  it("deduplicates authorized speech by logical turn when provider event ids change", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "start-delivery-a" });
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "start-delivery-b" });
      await flushAsyncWork();
    });

    const startCalls = apiMocks.reportGroupProviderEvent.mock.calls.filter(
      ([, input]) => input.type === "speak_started"
    );
    expect(startCalls).toHaveLength(1);
    expect(startCalls[0]?.[1]).toMatchObject({
      sourceEventId: "speak_started:avatar-1:turn:turn-1",
      turnId: "turn-1",
    });
    expect(liveAvatarMocks.instances[0]!.interrupt).not.toHaveBeenCalled();
    expect(container.querySelectorAll("video")[0]!.muted).toBe(false);

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", { event_id: "end-delivery-a" });
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", { event_id: "end-delivery-b" });
      await flushAsyncWork();
    });
    const endCalls = apiMocks.reportGroupProviderEvent.mock.calls.filter(
      ([, input]) => input.type === "speak_ended"
    );
    expect(endCalls).toHaveLength(1);
    expect(endCalls[0]?.[1]).toMatchObject({
      sourceEventId: "speak_ended:avatar-1:turn:turn-1",
      turnId: "turn-1",
    });
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    unmount();
  });

  it("ignores a stale suppress acknowledgement after that avatar receives a new turn", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Empezá Ada" });
      await flushAsyncWork();
    });

    let resolveRogueReport: (value: unknown) => void = () => undefined;
    apiMocks.reportGroupProviderEvent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRogueReport = resolve;
        })
    );
    await act(async () => {
      liveAvatarMocks.instances[1]!.emit("avatar.speak_started", { event_id: "rogue-grace-old" });
      await flushAsyncWork();
    });
    expect(liveAvatarMocks.instances[1]!.interrupt).toHaveBeenCalledTimes(1);

    apiMocks.interruptGroupVoiceSession.mockResolvedValueOnce({
      phase: "queued",
      floor: {
        turnId: "turn-2",
        avatarId: "avatar-2",
        leaseExpiresAt: "2026-08-21T12:03:00.000Z",
      },
      directive: {
        action: "speak",
        turnId: "turn-2",
        avatarId: "avatar-2",
        avatarName: "Grace",
        context: "Ada no respondió. Grace continúa.",
        instruction: "Respondé la consulta.",
        leaseExpiresAt: "2026-08-21T12:03:00.000Z",
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_251);
      await flushAsyncWork();
    });
    const videos = [...container.querySelectorAll("video")];
    expect(videos[0]!.muted).toBe(true);
    expect(videos[1]!.muted).toBe(false);

    await act(async () => {
      resolveRogueReport({
        phase: "queued",
        floor: {
          turnId: "turn-2",
          avatarId: "avatar-2",
          leaseExpiresAt: "2026-08-21T12:03:00.000Z",
        },
        directive: { action: "suppress", avatarId: "avatar-2", reason: "unauthorized_audio" },
      });
      await flushAsyncWork();
    });
    expect(videos[1]!.muted).toBe(false);
    expect(videos[1]!.closest("article")?.getAttribute("data-turn-owner")).toBe("true");
    expect(liveAvatarMocks.instances[1]!.interrupt).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("mutes and releases a locally authorized owner when the server suppresses its lease", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
    });
    apiMocks.reportGroupProviderEvent.mockResolvedValueOnce({
      phase: "queued",
      directive: { action: "suppress", avatarId: "avatar-1", reason: "invalid_lease" },
    });

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "invalid-owner-start-1" });
      await flushAsyncWork();
    });
    const videos = [...container.querySelectorAll("video")];
    expect(videos.every((video) => video.muted)).toBe(true);
    expect(videos[0]!.closest("article")?.getAttribute("data-turn-owner")).toBe("false");
    expect(liveAvatarMocks.instances[0]!.interrupt).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("releases committing floor when an interruption retry ACK returns listening without a directive", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "owner-start-retry-1" });
      await flushAsyncWork();
    });
    apiMocks.reportGroupProviderEvent
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ phase: "listening", directive: null });

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "interruption-retry-1",
        elevenlabs_event_type: "interruption",
        data: {},
      });
      await flushAsyncWork();
    });

    const interruptionCalls = apiMocks.reportGroupProviderEvent.mock.calls.filter(
      ([, input]) => input.type === "interruption"
    );
    expect(interruptionCalls).toHaveLength(2);
    expect(interruptionCalls[0]?.[1].sourceEventId).toBe(interruptionCalls[1]?.[1].sourceEventId);
    const videos = [...container.querySelectorAll("video")];
    expect(videos.every((video) => video.muted)).toBe(true);
    expect(videos[0]!.closest("article")?.getAttribute("data-turn-owner")).toBe("false");
    expect(screen.getAllByText("Tu turno").length).toBeGreaterThan(0);
    unmount();
  });

  it("keeps deliberating and dispatches nobody when the busy router returns no directive", async () => {
    const { container, unmount } = await renderActiveCall();
    for (const instance of liveAvatarMocks.instances) instance.publishData.mockClear();
    apiMocks.submitGroupTurn.mockResolvedValueOnce({
      round: null,
      phase: "deliberating",
      directive: null,
    });

    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Esperá al router" });
      await flushAsyncWork();
      scribeMocks.connection?.emit("committed_transcript", { text: "No abras otro turno" });
      await flushAsyncWork();
    });

    expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
    expect(liveAvatarMocks.instances.every((instance) => instance.publishData.mock.calls.length === 0)).toBe(
      true
    );
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(screen.getAllByText("Analizando").length).toBeGreaterThan(0);
    unmount();
  });

  it("rejects a routed speak directive when its response floor belongs to another avatar", async () => {
    apiMocks.submitGroupTurn.mockResolvedValueOnce({
      round: { id: "round-mismatch", intent: "normal", status: "queued", contextVersion: 1 },
      phase: "queued",
      floor: {
        turnId: "turn-other-owner",
        avatarId: "avatar-2",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
      directive: {
        action: "speak",
        turnId: "turn-1",
        avatarId: "avatar-1",
        avatarName: "Ada",
        context: "No debe enviarse",
        instruction: "No debe hablar.",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
    });
    const { container, unmount } = await renderActiveCall();
    for (const instance of liveAvatarMocks.instances) instance.publishData.mockClear();

    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Consulta con floor cruzado" });
      await flushAsyncWork();
    });

    expect(liveAvatarMocks.instances.every((instance) => instance.publishData.mock.calls.length === 0)).toBe(
      true
    );
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(
      [...container.querySelectorAll("article")].every(
        (participant) => participant.getAttribute("data-turn-owner") === "false"
      )
    ).toBe(true);
    unmount();
  });

  it("rejects a provider speak directive when the same response has no floor", async () => {
    const { container, unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
    });
    const commandsBeforeAck = liveAvatarMocks.instances[0]!.publishData.mock.calls.length;
    apiMocks.reportGroupProviderEvent.mockResolvedValueOnce({
      phase: "queued",
      floor: null,
      directive: {
        action: "speak",
        turnId: "turn-1",
        avatarId: "avatar-1",
        avatarName: "Ada",
        context: "No debe reenviarse",
        instruction: "No debe reenviarse.",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
    });

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "start-with-null-floor" });
      await flushAsyncWork();
    });

    expect(liveAvatarMocks.instances[0]!.publishData).toHaveBeenCalledTimes(commandsBeforeAck);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(container.querySelectorAll("article")[0]!.getAttribute("data-turn-owner")).toBe("false");
    unmount();
  });

  it("rejects a participant-failure speak directive without its matching floor", async () => {
    apiMocks.reportGroupParticipantFailure.mockResolvedValueOnce({
      phase: "queued",
      floor: null,
      directive: {
        action: "speak",
        turnId: "turn-after-failure",
        avatarId: "avatar-2",
        avatarName: "Grace",
        context: "No debe enviarse",
        instruction: "No debe hablar.",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
      participant: { avatarId: "avatar-1", status: "errored", error: "Sin conexión" },
    });
    const { container, unmount } = await renderActiveCall();
    for (const instance of liveAvatarMocks.instances) instance.publishData.mockClear();
    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });

    expect(liveAvatarMocks.instances[1]!.publishData).not.toHaveBeenCalled();
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(container.querySelectorAll("article")[1]!.getAttribute("data-turn-owner")).toBe("false");
    unmount();
  });

  it("discloses only available shared avatars and prompts again when a new shared member is added", async () => {
    const mixedGroup = {
      ...group,
      members: [
        group.members[0]!,
        { ...group.members[1]!, accessType: "shared" as const },
        {
          id: "avatar-3",
          name: "Lin",
          description: "Sistemas",
          thumbnailUrl: null,
          accessType: "shared" as const,
          position: 2,
          available: true,
        },
      ],
    };
    apiMocks.getAvatarGroup.mockResolvedValueOnce({ group: mixedGroup });
    window.localStorage.setItem("yuni:shared-call-consent:v1:user-1:avatar-2", "true");

    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);

    const dialog = screen.getByRole("dialog", { name: "Antes de iniciar la llamada" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("Los creadores de Grace y Lin podrán consultar");
    expect(dialog.textContent).not.toContain("creador de Ada");
    expect(apiMocks.startGroupVoiceSession).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    expect(apiMocks.startGroupVoiceSession).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("yuni:shared-call-consent:v1:user-1:avatar-2")).toBe("true");
    expect(window.localStorage.getItem("yuni:shared-call-consent:v1:user-1:avatar-3")).toBe("true");
    view.unmount();
  });

  it("does not start a call when shared-consent identity resolves after unmount", async () => {
    apiMocks.getAvatarGroup.mockResolvedValueOnce({
      group: {
        ...group,
        members: [group.members[0]!, { ...group.members[1]!, accessType: "shared" as const }],
      },
    });
    let resolveUser: (value: unknown) => void = () => undefined;
    authMocks.getMe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve;
        })
    );

    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    view.unmount();
    await act(async () => {
      resolveUser({
        user: {
          id: "user-late",
          email: "late@example.com",
          name: "Late",
          imageUrl: null,
          createdAt: "2026-08-21T12:00:00.000Z",
          updatedAt: "2026-08-21T12:00:00.000Z",
        },
      });
      await flushAsyncWork();
    });

    expect(apiMocks.startGroupVoiceSession).not.toHaveBeenCalled();
    expect(liveAvatarMocks.instances).toHaveLength(0);
    expect(scribeMocks.connection).toBeNull();
  });

  it("does not start a group call when fewer than two members remain available", async () => {
    apiMocks.getAvatarGroup.mockResolvedValueOnce({
      group: {
        ...group,
        members: [group.members[0]!, { ...group.members[1]!, available: false }],
      },
    });
    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    const startButton = screen.getByRole("button", { name: "Iniciar llamada" });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Este avatar ya no está disponible.")).toBeTruthy();
    expect(apiMocks.startGroupVoiceSession).not.toHaveBeenCalled();
    view.unmount();
  });

  it("does not install a LiveAvatar session when an errored participant has no attempt id", async () => {
    apiMocks.startGroupVoiceSession.mockResolvedValueOnce({
      voiceSession: {
        id: "group-session-1",
        groupId: group.id,
        conversationId: "conversation-1",
        status: "degraded",
        expiresAt: "2026-08-21T12:10:00.000Z",
        participants: [
          participants[0]!,
          {
            ...participants[1]!,
            participantAttemptId: null,
            status: "errored",
            sessionToken: null,
            sessionId: null,
            error: "No se pudo crear el intento.",
          },
        ],
      },
    });
    apiMocks.retryGroupParticipant.mockResolvedValueOnce({
      participant: {
        ...participants[1]!,
        participantAttemptId: null,
        sessionToken: "token-without-attempt",
      },
    });
    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    expect(screen.getByText("En vivo · parcial")).toBeTruthy();
    expect(liveAvatarMocks.instances).toHaveLength(1);
    expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(flushAsyncWork);
    expect(liveAvatarMocks.instances).toHaveLength(1);
    expect(
      screen.getAllByText("El participante sigue sin conexión. Podés volver a intentarlo desde su tarjeta.")
    ).toHaveLength(2);
    expect(screen.queryByText("El servidor no confirmó un nuevo intento para este participante.")).toBeNull();
    view.unmount();
  });

  it("deduplicates SESSION_DISCONNECTED and SESSION_STOPPED for the same participant attempt", async () => {
    const { unmount } = await renderActiveCall();
    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });
      liveAvatarMocks.instances[0]!.emit("session.stopped", { event_id: "stopped-after-disconnect" });
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });

    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledTimes(1);
    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledWith(
      "group-session-1",
      "avatar-1",
      expect.objectContaining({
        participantAttemptId: "attempt-1",
        sourceEventId: "participant-failure:group-session-1:avatar-1:attempt-1",
        reason: "stream_error",
      }),
      expect.objectContaining({ signal: expect.anything() })
    );
    unmount();
  });

  it("retries participant failure delivery durably with the same source and attempt", async () => {
    apiMocks.reportGroupParticipantFailure
      .mockRejectedValueOnce(new Error("network-1"))
      .mockRejectedValueOnce(new Error("network-2"))
      .mockResolvedValueOnce({
        phase: "listening",
        directive: null,
        floor: null,
        participant: { avatarId: "avatar-1", status: "errored", error: "Sin conexión" },
      });
    const { unmount } = await renderActiveCall();
    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1_500);
      await flushAsyncWork();
    });

    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledTimes(3);
    const deliveries = apiMocks.reportGroupParticipantFailure.mock.calls.map(([, , input]) => input);
    expect(new Set(deliveries.map((input) => input.sourceEventId))).toEqual(
      new Set(["participant-failure:group-session-1:avatar-1:attempt-1"])
    );
    expect(new Set(deliveries.map((input) => input.participantAttemptId))).toEqual(new Set(["attempt-1"]));
    unmount();
  });

  it("times out a pending failure delivery and retries with the same source id", async () => {
    let firstSignal: AbortSignal | undefined;
    apiMocks.reportGroupParticipantFailure
      .mockImplementationOnce((_sessionId, _avatarId, _input, options) => {
        firstSignal = options.signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce({
        phase: "listening",
        directive: null,
        floor: null,
        participant: { avatarId: "avatar-1", status: "errored", error: "Sin conexión" },
      });
    const { unmount } = await renderActiveCall();
    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });
    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(500);
      await flushAsyncWork();
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledTimes(2);
    const deliveries = apiMocks.reportGroupParticipantFailure.mock.calls.map(([, , input]) => input);
    expect(deliveries[0]?.sourceEventId).toBe(deliveries[1]?.sourceEventId);
    expect(deliveries[0]?.participantAttemptId).toBe(deliveries[1]?.participantAttemptId);
    unmount();
  });

  it("blocks new Scribe turns until a participant retry is fully ready", async () => {
    const { unmount } = await renderActiveCall();
    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });

    let resolveRetry: (value: unknown) => void = () => undefined;
    apiMocks.retryGroupParticipant.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(flushAsyncWork);
    const microphone = screen.getByRole("button", { name: "Silenciar micrófono" });
    expect((microphone as HTMLButtonElement).disabled).toBe(true);

    scribeMocks.connection?.emit("committed_transcript", { text: "No abras este turno" });
    await act(flushAsyncWork);
    expect(apiMocks.submitGroupTurn).not.toHaveBeenCalled();

    await act(async () => {
      resolveRetry({
        participant: {
          ...participants[0]!,
          participantAttemptId: "attempt-retry-ready",
          sessionToken: "token-retry-ready",
        },
      });
      await flushAsyncWork();
    });
    expect((microphone as HTMLButtonElement).disabled).toBe(false);
    scribeMocks.connection?.emit("committed_transcript", { text: "Ahora sí respondan" });
    await act(flushAsyncWork);
    expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("bounds participant startup at 20 seconds and continues in degraded mode", async () => {
    liveAvatarMocks.startBehaviors.set("token-2", () => new Promise<void>(() => undefined));
    apiMocks.reportGroupParticipantFailure.mockResolvedValueOnce({
      phase: "listening",
      directive: null,
      floor: null,
      participant: { avatarId: "avatar-2", status: "errored", error: "Timeout" },
    });
    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(1);
      await flushAsyncWork();
    });

    expect(screen.getByText("En vivo · parcial")).toBeTruthy();
    expect(liveAvatarMocks.instances[1]!.stop).toHaveBeenCalled();
    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledWith(
      "group-session-1",
      "avatar-2",
      expect.objectContaining({ participantAttemptId: "attempt-2", reason: "stream_error" }),
      expect.objectContaining({ signal: expect.anything() })
    );
    view.unmount();
  });

  it("lets the user cancel while a participant start is pending without reporting a stale failure", async () => {
    liveAvatarMocks.startBehaviors.set("token-2", () => new Promise<void>(() => undefined));
    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar llamada" }));
    await act(async () => {
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "user");
    expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
    expect(liveAvatarMocks.instances.every((instance) => instance.stop.mock.calls.length >= 1)).toBe(true);
    view.unmount();
  });

  it("does not let an old startup timeout mutate a newer call epoch", async () => {
    liveAvatarMocks.startBehaviors.set("token-2", () => new Promise<void>(() => undefined));
    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar llamada" }));
    await act(flushAsyncWork);

    const nextParticipants = participants.map((participant, index) => ({
      ...participant,
      participantAttemptId: `attempt-next-startup-${index + 1}`,
      sessionToken: `token-next-startup-${index + 1}`,
    }));
    apiMocks.startGroupVoiceSession.mockResolvedValueOnce({
      voiceSession: {
        id: "group-session-next-startup",
        groupId: group.id,
        conversationId: "conversation-next-startup",
        status: "active",
        expiresAt: "2026-08-21T12:10:00.000Z",
        participants: nextParticipants,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    expect(screen.getByText("En vivo")).toBeTruthy();
    apiMocks.reportGroupParticipantFailure.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await flushAsyncWork();
    });
    expect(screen.getByText("En vivo")).toBeTruthy();
    expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
    expect(
      liveAvatarMocks.instances.slice(-2).every((instance) => instance.stop.mock.calls.length === 0)
    ).toBe(true);
    view.unmount();
  });

  it("bounds a hanging LiveAvatar stop so ending can complete", async () => {
    const { container, unmount } = await renderActiveCall();
    liveAvatarMocks.instances[0]!.stop.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Finalizar llamada" }));
    await act(flushAsyncWork);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(screen.getByRole("button", { name: "Finalizando llamada" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
      await flushAsyncWork();
    });
    expect(screen.getByRole("button", { name: "Iniciar llamada" })).toBeTruthy();
    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "user");
    unmount();
  });

  it("renews the local lease from the accepted speak_started floor snapshot", async () => {
    const { unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
    });
    apiMocks.reportGroupProviderEvent.mockResolvedValueOnce({
      phase: "speaking",
      directive: null,
      floor: {
        turnId: "turn-1",
        avatarId: "avatar-1",
        leaseExpiresAt: "2026-08-21T12:02:30.000Z",
      },
    });
    liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "owner-start-renew" });
    await act(flushAsyncWork);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_251);
    });
    expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(74_999);
      await flushAsyncWork();
    });
    expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "timeout", {
      avatarId: "avatar-1",
      turnId: "turn-1",
    });
    unmount();
  });

  it("maps a late correction to its response id instead of the avatar's current turn", async () => {
    const { unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Primera pregunta" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "start-turn-1" });
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "response-event-1",
        elevenlabs_event_type: "agent_response",
        data: { agent_response: "Respuesta original", response_id: "response-1" },
      });
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", { event_id: "end-turn-1" });
      await flushAsyncWork();
    });
    apiMocks.submitGroupTurn.mockResolvedValueOnce({
      round: { id: "round-2", intent: "normal", status: "queued", contextVersion: 2 },
      phase: "queued",
      floor: {
        turnId: "turn-2",
        avatarId: "avatar-1",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
      directive: {
        action: "speak",
        turnId: "turn-2",
        avatarId: "avatar-1",
        avatarName: "Ada",
        context: "Contexto actualizado",
        instruction: "Respondé la segunda pregunta.",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
    });
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Segunda pregunta" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "correction-event-1",
        elevenlabs_event_type: "agent_response_correction",
        data: {
          original_agent_response: "Respuesta original",
          corrected_agent_response: "Respuesta corregida",
          response_id: "response-1",
        },
      });
      await flushAsyncWork();
    });

    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledWith(
      "group-session-1",
      expect.objectContaining({
        type: "agent_response_correction",
        turnId: "turn-1",
        content: "Respuesta corregida",
      })
    );
    unmount();
  });

  it("ignores an unmatched correction instead of assigning it to the avatar's current turn", async () => {
    const { unmount } = await renderActiveCall();
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Primera pregunta" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "start-unmatched-1" });
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "response-unmatched-1",
        elevenlabs_event_type: "agent_response",
        data: { agent_response: "Respuesta conocida" },
      });
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", { event_id: "end-unmatched-1" });
      await flushAsyncWork();
    });
    apiMocks.submitGroupTurn.mockResolvedValueOnce({
      round: { id: "round-2", intent: "normal", status: "queued", contextVersion: 2 },
      phase: "queued",
      floor: {
        turnId: "turn-2",
        avatarId: "avatar-1",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
      directive: {
        action: "speak",
        turnId: "turn-2",
        avatarId: "avatar-1",
        avatarName: "Ada",
        context: "Contexto",
        instruction: "Segunda respuesta.",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
    });
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Segunda pregunta" });
      await flushAsyncWork();
    });
    const correctionCount = apiMocks.reportGroupProviderEvent.mock.calls.filter(
      ([, input]) => input.type === "agent_response_correction"
    ).length;
    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "correction-unmatched",
        elevenlabs_event_type: "agent_response_correction",
        data: {
          original_agent_response: "No corresponde a ningún turno",
          corrected_agent_response: "No debe atribuirse",
        },
      });
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(
        ([, input]) => input.type === "agent_response_correction"
      )
    ).toHaveLength(correctionCount);

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "correction-without-identity",
        elevenlabs_event_type: "agent_response_correction",
        data: { corrected_agent_response: "Tampoco debe atribuirse" },
      });
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(
        ([, input]) => input.type === "agent_response_correction"
      )
    ).toHaveLength(correctionCount);
    unmount();
  });

  it("ignores a correction whose original text matches two historical turns", async () => {
    const { unmount } = await renderActiveCall();
    const completeTurn = async (turnNumber: number) => {
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: `Pregunta ${turnNumber}` });
        await flushAsyncWork();
        liveAvatarMocks.instances[0]!.emit("avatar.speak_started", {
          event_id: `start-ambiguous-${turnNumber}`,
        });
        liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
          event_id: `response-ambiguous-${turnNumber}`,
          elevenlabs_event_type: "agent_response",
          data: { agent_response: "Respuesta repetida" },
        });
        liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", {
          event_id: `end-ambiguous-${turnNumber}`,
        });
        await flushAsyncWork();
      });
    };

    await completeTurn(1);
    for (const turnNumber of [2, 3]) {
      apiMocks.submitGroupTurn.mockResolvedValueOnce({
        round: {
          id: `round-${turnNumber}`,
          intent: "normal",
          status: "queued",
          contextVersion: turnNumber,
        },
        phase: "queued",
        floor: {
          turnId: `turn-${turnNumber}`,
          avatarId: "avatar-1",
          leaseExpiresAt: "2026-08-21T12:03:00.000Z",
        },
        directive: {
          action: "speak",
          turnId: `turn-${turnNumber}`,
          avatarId: "avatar-1",
          avatarName: "Ada",
          context: "Contexto",
          instruction: `Respuesta ${turnNumber}.`,
          leaseExpiresAt: "2026-08-21T12:03:00.000Z",
        },
      });
      if (turnNumber === 2) await completeTurn(2);
      else {
        await act(async () => {
          scribeMocks.connection?.emit("committed_transcript", { text: "Pregunta 3" });
          await flushAsyncWork();
        });
      }
    }

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("elevenlabs_agent_event", {
        event_id: "correction-ambiguous",
        elevenlabs_event_type: "agent_response_correction",
        data: {
          original_agent_response: "Respuesta repetida",
          corrected_agent_response: "No debe atribuirse",
        },
      });
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(
        ([, input]) => input.type === "agent_response_correction"
      )
    ).toHaveLength(0);
    unmount();
  });

  it("does not install a retry response after the call epoch has changed", async () => {
    const { unmount } = await renderActiveCall();
    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flushAsyncWork();
    });

    let resolveRetry: (value: unknown) => void = () => undefined;
    apiMocks.retryGroupParticipant.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar llamada" }));
    await act(flushAsyncWork);

    const nextParticipants = participants.map((participant, index) => ({
      ...participant,
      participantAttemptId: `attempt-next-${index + 1}`,
      sessionToken: `token-next-${index + 1}`,
    }));
    apiMocks.startGroupVoiceSession.mockResolvedValueOnce({
      voiceSession: {
        id: "group-session-2",
        groupId: group.id,
        conversationId: "conversation-2",
        status: "active",
        expiresAt: "2026-08-21T12:10:00.000Z",
        participants: nextParticipants,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    expect(liveAvatarMocks.instances).toHaveLength(4);

    liveAvatarMocks.instances[2]!.emit("session.disconnected", { reason: "new-network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });
    let resolveCurrentRetry: (value: unknown) => void = () => undefined;
    apiMocks.retryGroupParticipant.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCurrentRetry = resolve;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(flushAsyncWork);
    expect(apiMocks.retryGroupParticipant).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRetry({
        participant: {
          ...participants[0]!,
          participantAttemptId: "attempt-stale-retry",
          sessionToken: "token-stale-retry",
        },
      });
      await flushAsyncWork();
    });
    expect(liveAvatarMocks.instances).toHaveLength(4);
    expect(liveAvatarMocks.instances.some((instance) => instance.token === "token-stale-retry")).toBe(false);
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect((screen.getByRole("button", { name: "Silenciar micrófono" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(apiMocks.retryGroupParticipant).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveCurrentRetry({
        participant: {
          ...nextParticipants[0]!,
          participantAttemptId: "attempt-current-retry",
          sessionToken: "token-current-retry",
        },
      });
      await flushAsyncWork();
    });
    expect((screen.getByRole("button", { name: "Silenciar micrófono" }) as HTMLButtonElement).disabled).toBe(
      false
    );
    unmount();
  });

  it("terminates locally when the heartbeat says the server session is gone", async () => {
    const { container, unmount } = await renderActiveCall();
    apiMocks.heartbeatGroupVoiceSession.mockRejectedValueOnce(
      new ApiClientError("La sesión terminó.", 410, "GROUP_VOICE_SESSION_ENDED")
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await flushAsyncWork();
    });
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "unload");
    expect(liveAvatarMocks.instances.every((instance) => instance.stop.mock.calls.length >= 1)).toBe(true);
    unmount();
  });
});
