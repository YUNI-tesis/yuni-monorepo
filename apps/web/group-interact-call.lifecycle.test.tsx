import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@yuni/ui";
import { GroupInteractCall } from "./components/interact/GroupInteractCall";
import { GROUP_SPEECH_END_SETTLE_MS } from "./components/interact/group-speech-completion";
import { ApiClientError } from "./lib/api/http-client";

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let within: typeof import("@testing-library/react").within;
const diagnosticLogs = vi.fn();
let restoreConsoleInfo = () => {};

const apiMocks = vi.hoisted(() => ({
  confirmGroupParticipantStarted: vi.fn(),
  confirmGroupParticipantInterruptionReady: vi.fn(),
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
  autoInterruptTerminal: false,
  startBehaviors: new Map<string, () => Promise<void>>(),
  instances: [] as Array<{
    token: string;
    attach: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
    keepAlive: ReturnType<typeof vi.fn>;
    commands: ReturnType<typeof vi.fn>;
    sendContextualUpdate: ReturnType<typeof vi.fn>;
    sendUserActivity: ReturnType<typeof vi.fn>;
    sendUserMessage: ReturnType<typeof vi.fn>;
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
  class MockElevenLabsAgentSession {
    readonly token: string;
    readonly attach = vi.fn();
    readonly interrupt = vi.fn(() => {
      if (liveAvatarMocks.autoInterruptTerminal)
        this.emit("avatar.speak_ended", {
          event_id: `interrupted-end:${this.token}:${this.sendUserMessage.mock.calls.length}`,
          source_event_id: `speech:${this.token}:${this.sendUserMessage.mock.calls.length}`,
        });
    });
    readonly keepAlive = vi.fn(async () => undefined);
    readonly commands = vi.fn();
    readonly sendContextualUpdate = vi.fn((text: string) => {
      this.commands({ elevenlabs_event_type: "contextual_update", data: { text } });
      return "8d1808bc-9ed6-4e79-8e83-6b07242068ce";
    });
    readonly sendUserActivity = vi.fn(() => {
      this.commands({ elevenlabs_event_type: "user_activity" });
      return "e449bb24-4ed3-4085-9be5-8f24fcb08248";
    });
    readonly sendUserMessage = vi.fn((text: string) => {
      this.commands({ elevenlabs_event_type: "user_message", data: { text } });
      return "03a3af11-9008-49f6-8809-15045c99626f";
    });
    readonly stop = vi.fn(async () => undefined);
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
      AVATAR_TRANSCRIPTION_CHUNK: "avatar.transcription.chunk",
      ELEVENLABS_AGENT_EVENT: "elevenlabs_agent_event",
      SESSION_STOPPED: "session.stopped",
    },
    ElevenLabsAgentSession: MockElevenLabsAgentSession,
    LiveAvatarSession: class {
      constructor() {
        throw new Error("Group calls must use the public ElevenLabsAgentSession API");
      }
    },
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
  access: {
    type: "owner" as const,
    canEdit: true,
    canDelete: true,
    canShare: true,
    canInteract: true,
    limits: null,
    consent: null,
  },
  interactionAvailability: { status: "ready" as const, readyMembers: 2, totalMembers: 2 },
  sharingEligibility: { status: "eligible" as const },
  sharingChannels: { account: true, public: true },
  activityEnabled: true,
  membershipVersion: 1,
  hasActiveSharingChannels: false,
  members: [
    {
      id: "avatar-1",
      name: "Ada",
      description: "Matemática",
      thumbnailUrl: null,
      viewerAccess: "owned" as const,
      accessType: "owner" as const,
      position: 0,
      available: true,
    },
    {
      id: "avatar-2",
      name: "Grace",
      description: "Programación",
      thumbnailUrl: null,
      viewerAccess: "owned" as const,
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

const thirdMember = {
  id: "avatar-3",
  name: "Lin",
  description: "Sistemas",
  thumbnailUrl: null,
  viewerAccess: "owned" as const,
  accessType: "owner" as const,
  position: 2,
  available: true,
};

const threeParticipantGroup = {
  ...group,
  members: [...group.members, thirdMember],
  interactionAvailability: { status: "ready" as const, readyMembers: 3, totalMembers: 3 },
};

const threeParticipants = [
  ...participants,
  {
    id: "participant-3",
    participantAttemptId: "attempt-3",
    avatar: thirdMember,
    realtimeSessionId: "realtime-3",
    status: "active" as const,
    sessionToken: "token-3",
    sessionId: "live-3",
    error: null,
  },
];

function mockThreeParticipantStart() {
  apiMocks.getAvatarGroup.mockResolvedValueOnce({ group: threeParticipantGroup });
  apiMocks.startGroupVoiceSession.mockResolvedValueOnce({
    voiceSession: {
      id: "group-session-1",
      groupId: group.id,
      conversationId: "conversation-1",
      status: "active",
      expiresAt: "2026-08-21T12:10:00.000Z",
      participants: threeParticipants,
    },
  });
}

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

async function settleSpeechCompletion() {
  await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
  await flushAsyncWork();
}

async function renderActiveCall() {
  const view = render(<TestGroupInteractCall groupId="group-1" />);
  await act(flushAsyncWork);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
    await flushAsyncWork();
  });
  expect(screen.getByText("En vivo")).toBeTruthy();
  return view;
}

function recordedCommands(instanceIndex: number) {
  return liveAvatarMocks.instances[instanceIndex]!.commands.mock.calls.map(([command]) => command);
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function interruptedRoundResponse(sourceEventId: string) {
  return {
    phase: "listening",
    directive: { action: "listen", reason: "interrupted" },
    floor: null,
    interruption: {
      sourceEventId,
      status: "cancelled",
      turnId: "turn-1",
      avatarIds: ["avatar-1"],
    },
  };
}

function nextHumanRoundResponse(avatarId = "avatar-2") {
  return {
    round: { id: "round-2", intent: "normal", status: "queued", contextVersion: 2 },
    phase: "queued",
    floor: { turnId: "turn-new", avatarId, leaseExpiresAt: "2026-08-21T12:01:15.000Z" },
    directive: {
      action: "speak",
      turnId: "turn-new",
      avatarId,
      avatarName: avatarId === "avatar-1" ? "Ada" : "Grace",
      context: "Ada fue interrumpida; lo oído no está confirmado y el borrador sigue pendiente.",
      instruction: "Respondé a la nueva intervención.",
      leaseExpiresAt: "2026-08-21T12:01:15.000Z",
    },
  };
}

async function requestInterruptionRecovery() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_001);
    await flushAsyncWork();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
    await flushAsyncWork();
    await settleSpeechCompletion();
  });
}

async function renderSpeakingCall() {
  const view = await renderActiveCall();
  await act(async () => {
    scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
    await flushAsyncWork();
    liveAvatarMocks.instances[0]!.emit("avatar.speak_started", {
      event_id: "barge-owner-start",
      source_event_id: `speech:${liveAvatarMocks.instances[0]!.token}:1`,
    });
    await flushAsyncWork();
  });
  expect(view.container.querySelectorAll("video")[0]!.muted).toBe(false);
  return view;
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
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(diagnosticLogs);
    restoreConsoleInfo = () => consoleInfo.mockRestore();
    diagnosticLogs.mockClear();
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
    restoreConsoleInfo();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps the group header accessible without transcript or turn overlays", async () => {
    const { container, unmount } = await renderActiveCall();
    const historyButton = screen.getByRole("button", { name: "Historial" });

    expect(screen.getByRole("button", { name: "Grupos" }).querySelector("svg")).toBeTruthy();
    expect(historyButton.querySelector("svg")).toBeTruthy();
    expect(historyButton.querySelector('[class*="topbarControlLabel"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-history-open="false"]')).toHaveLength(2);
    expect(screen.queryByText(/^Tu turno · (podés hablar|activá el micrófono para hablar)$/)).toBeNull();

    await act(async () => {
      scribeMocks.connection?.emit("partial_transcript", { text: "Esto no se muestra" });
      await flushAsyncWork();
    });
    expect(screen.queryByText(/^Vos: Esto no se muestra$/)).toBeNull();

    await act(async () => {
      fireEvent.click(historyButton);
      await flushAsyncWork();
    });
    expect(container.querySelectorAll('[data-history-open="true"]')).toHaveLength(2);
    expect(screen.getByRole("complementary", { name: "Historial" })).toBeTruthy();
    unmount();
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
      instance.commands.mockClear();
      instance.keepAlive.mockClear();
    }
    apiMocks.heartbeatGroupVoiceSession.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(apiMocks.heartbeatGroupVoiceSession).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 2; index += 1) {
      expect(recordedCommands(index)).toContainEqual({
        elevenlabs_event_type: "user_activity",
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
    expect(recordedCommands(0).map((command) => command.elevenlabs_event_type)).toEqual([
      "contextual_update",
      "user_message",
    ]);
    expect(recordedCommands(1).at(-1)).toEqual({
      elevenlabs_event_type: "user_activity",
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
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledTimes(providerEventCount + 1);
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenLastCalledWith(
      "group-session-1",
      expect.objectContaining({ type: "interruption", turnId: "turn-1", avatarId: "avatar-1" })
    );
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

    let mutedAfterStreamReadyDuringSettle = true;
    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", { event_id: "owner-start-1" });
      await flushAsyncWork();
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", { event_id: "owner-end-1" });
      liveAvatarMocks.instances[0]!.emit("session.stream_ready");
      mutedAfterStreamReadyDuringSettle = videos[0]!.muted;
    });
    expect(mutedAfterStreamReadyDuringSettle).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
      await flushAsyncWork();
    });
    expect(videos.every((video) => video.muted)).toBe(true);
    unmount();
  });

  it("uses only public command methods and does not treat returned IDs as provider acknowledgements", async () => {
    const { container, unmount } = await renderActiveCall();
    const providerEventsBeforeDispatch = apiMocks.reportGroupProviderEvent.mock.calls.length;

    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Una pregunta lenta" });
      await flushAsyncWork();
    });
    const owner = liveAvatarMocks.instances[0]!;
    const directive = (await apiMocks.submitGroupTurn.mock.results[0]!.value).directive;
    expect(owner).not.toHaveProperty("room");
    expect(owner.sendContextualUpdate).toHaveBeenCalledExactlyOnceWith(directive.context);
    expect(owner.sendUserMessage).toHaveBeenCalledExactlyOnceWith(directive.instruction);
    expect(liveAvatarMocks.instances[1]!.sendUserActivity).toHaveBeenCalledExactlyOnceWith();
    expect(recordedCommands(0).map((command) => command.elevenlabs_event_type)).toEqual([
      "contextual_update",
      "user_message",
    ]);
    expect(owner.sendContextualUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      owner.sendUserMessage.mock.invocationCallOrder[0]!
    );
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledTimes(providerEventsBeforeDispatch);
    expect(diagnosticLogs).toHaveBeenCalledWith("[group-call] command_dispatched", {
      callEpoch: expect.any(Number),
      sessionId: "group-session-1",
      turnId: "turn-1",
      avatarId: "avatar-1",
      participantAttemptId: "attempt-1",
      contextCommandId: "8d1808bc-9ed6-4e79-8e83-6b07242068ce",
      providerCommandId: "03a3af11-9008-49f6-8809-15045c99626f",
      commandDispatchedAt: Date.now(),
      providerAcknowledged: false,
    });
    const loggedMetadata = JSON.stringify(diagnosticLogs.mock.calls);
    expect(loggedMetadata).not.toContain(directive.context);
    expect(loggedMetadata).not.toContain(directive.instruction);
    expect(container.querySelector('[data-turn-owner="true"]')?.getAttribute("data-speaking")).toBe("false");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_251);
      await flushAsyncWork();
    });
    expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "timeout", {
      avatarId: "avatar-1",
      turnId: "turn-1",
    });

    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(owner.sendUserMessage).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps audio silent and reports a synchronous public SDK dispatch failure", async () => {
    const { container, unmount } = await renderActiveCall();
    const owner = liveAvatarMocks.instances[0]!;
    owner.sendContextualUpdate.mockImplementationOnce(() => {
      throw new Error("Session must be connected before sending ElevenLabs agent commands");
    });
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Una pregunta" });
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });
    expect(owner.sendUserMessage).not.toHaveBeenCalled();
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledWith(
      "group-session-1",
      "avatar-1",
      expect.objectContaining({
        sourceEventId: "dispatch-failed:turn-1:avatar-1",
        expectedTurnId: "turn-1",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
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

  it("retries the same settled end after both POST attempts fail without reopening audio", async () => {
    const { container, unmount } = await renderActiveCall();
    const owner = liveAvatarMocks.instances[0]!;
    const endEvent = { event_id: "retry-end", source_event_id: "retry-speech-source" };
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
      owner.emit("avatar.speak_started", { event_id: "retry-start", source_event_id: "retry-speech-source" });
      await flushAsyncWork();
    });
    apiMocks.reportGroupProviderEvent
      .mockRejectedValueOnce(new Error("end-network-1"))
      .mockRejectedValueOnce(new Error("end-network-2"));
    await act(async () => {
      owner.emit("avatar.speak_ended", endEvent);
      await settleSpeechCompletion();
    });
    const endCalls = () =>
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended");
    expect(endCalls()).toHaveLength(2);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);

    await act(async () => {
      owner.emit("avatar.speak_ended", endEvent);
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS - 1);
      await flushAsyncWork();
    });
    expect(endCalls()).toHaveLength(2);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flushAsyncWork();
    });
    expect(endCalls()).toHaveLength(3);
    expect(new Set(endCalls().map(([, input]) => input.sourceEventId))).toEqual(
      new Set(["speak_ended:avatar-1:turn:turn-1"])
    );
    expect(endCalls().every(([, input]) => input.turnId === "turn-1" && input.avatarId === "avatar-1")).toBe(
      true
    );
    expect((screen.getByRole("button", { name: "Silenciar micrófono" }) as HTMLButtonElement).disabled).toBe(
      false
    );
    await act(async () => {
      owner.emit("avatar.speak_ended", endEvent);
      await settleSpeechCompletion();
    });
    expect(endCalls()).toHaveLength(3);
    expect(owner.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(owner.interrupt).not.toHaveBeenCalled();
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
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
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
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

  it("settles startup continuations before enabling Scribe without interrupting the cue", async () => {
    liveAvatarMocks.startBehaviors.set("token-1", async () => {
      const owner = liveAvatarMocks.instances.find((instance) => instance.token === "token-1")!;
      owner.emit("session.stream_ready");
      owner.emit("avatar.speak_started", { event_id: "cue-start-1", source_event_id: "cue-source-1" });
      owner.emit("avatar.speak_ended", { event_id: "cue-end-1", source_event_id: "cue-source-1" });
    });
    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
      await flushAsyncWork();
    });
    expect(scribeMocks.connection).toBeNull();
    expect(screen.queryByText("En vivo")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(646);
      liveAvatarMocks.instances[0]!.emit("avatar.speak_started", {
        event_id: "cue-start-2",
        source_event_id: "cue-source-1",
      });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS - 646);
      await flushAsyncWork();
    });
    expect(scribeMocks.connection).toBeNull();
    expect(liveAvatarMocks.instances[0]!.interrupt).not.toHaveBeenCalled();

    await act(async () => {
      liveAvatarMocks.instances[0]!.emit("avatar.speak_ended", {
        event_id: "cue-end-2",
        source_event_id: "cue-source-1",
      });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
      await flushAsyncWork();
    });
    expect(screen.getByText("En vivo")).toBeTruthy();
    expect(scribeMocks.connection).not.toBeNull();
    expect(apiMocks.reportGroupProviderEvent).not.toHaveBeenCalled();
    expect([...view.container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    view.unmount();
  });

  it("keeps the real 408 ms end and 646 ms continuation audible and dispatches B only after final settle", async () => {
    const { container, unmount } = await renderActiveCall();
    const defaultReport = apiMocks.reportGroupProviderEvent.getMockImplementation()!;
    apiMocks.reportGroupProviderEvent.mockImplementation((sessionId, input) => {
      if (input.type !== "speak_ended") return defaultReport(sessionId, input);
      return Promise.resolve({
        phase: "queued",
        floor: {
          turnId: "turn-2",
          avatarId: "avatar-2",
          leaseExpiresAt: "2026-08-21T12:01:15.000Z",
        },
        directive: {
          action: "speak",
          turnId: "turn-2",
          avatarId: "avatar-2",
          avatarName: "Grace",
          context: "Ada terminó la respuesta completa.",
          instruction: "Respondé después de Ada.",
          leaseExpiresAt: "2026-08-21T12:01:15.000Z",
        },
      });
    });
    const [owner, next] = liveAvatarMocks.instances;
    const videos = [...container.querySelectorAll("video")];
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondan en una palabra" });
      await flushAsyncWork();
      owner!.emit("avatar.speak_started", { event_id: "natural-start-1", source_event_id: "natural-source" });
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(408);
      owner!.emit("avatar.speak_ended", { event_id: "natural-end-1", source_event_id: "natural-source" });
      await vi.advanceTimersByTimeAsync(300);
      owner!.emit("avatar.transcription", { event_id: "natural-transcript", text: "Completa." });
      await flushAsyncWork();
    });
    expect(videos[0]!.muted).toBe(false);
    expect(videos[1]!.muted).toBe(true);
    expect(next!.sendUserMessage).not.toHaveBeenCalled();
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(346);
      owner!.emit("avatar.speak_started", { event_id: "natural-start-2", source_event_id: "natural-source" });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
      await flushAsyncWork();
    });
    expect(videos[0]!.muted).toBe(false);
    expect(next!.sendUserMessage).not.toHaveBeenCalled();
    expect(owner!.interrupt).not.toHaveBeenCalled();
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_started")
    ).toHaveLength(1);

    await act(async () => {
      owner!.emit("avatar.speak_ended", { event_id: "natural-end-2", source_event_id: "natural-source" });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS - 1);
    });
    expect(videos[0]!.muted).toBe(false);
    expect(next!.sendUserMessage).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(1);
    expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledWith(
      "group-session-1",
      expect.objectContaining({
        type: "speak_ended",
        turnId: "turn-1",
        content: "Completa.",
      })
    );
    expect(next!.sendUserMessage).toHaveBeenCalledExactlyOnceWith("Respondé después de Ada.");
    expect(videos.map((video) => video.muted)).toEqual([true, false]);
    await act(async () => {
      owner!.emit("avatar.speak_started", {
        event_id: "natural-late-start",
        source_event_id: "natural-source",
      });
      owner!.emit("avatar.speak_ended", { event_id: "natural-late-end", source_event_id: "natural-source" });
      await settleSpeechCompletion();
    });
    expect(videos.map((video) => video.muted)).toEqual([true, false]);
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(1);
    expect(owner!.interrupt).not.toHaveBeenCalled();
    expect(next!.interrupt).not.toHaveBeenCalled();
    unmount();
  });

  it("invalidates a settled end queued behind a pending start ACK when its owner continues", async () => {
    const { container, unmount } = await renderActiveCall();
    let resolveStart: (value: unknown) => void = () => undefined;
    const defaultReport = apiMocks.reportGroupProviderEvent.getMockImplementation()!;
    apiMocks.reportGroupProviderEvent.mockImplementation((sessionId, input) => {
      if (input.type === "speak_started" && input.turnId === "turn-1") {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      return defaultReport(sessionId, input);
    });
    const owner = liveAvatarMocks.instances[0]!;
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
      owner.emit("avatar.speak_started", { event_id: "pending-start-1", source_event_id: "pending-source" });
      await flushAsyncWork();
      owner.emit("avatar.speak_ended", { event_id: "pending-end-1", source_event_id: "pending-source" });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
      await flushAsyncWork();
      owner.emit("avatar.speak_started", { event_id: "pending-start-2", source_event_id: "pending-source" });
      resolveStart({
        phase: "speaking",
        directive: null,
        floor: { turnId: "turn-1", avatarId: "avatar-1", leaseExpiresAt: "2026-08-21T12:01:15.000Z" },
      });
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(0);
    expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
    expect(owner.interrupt).not.toHaveBeenCalled();
    await act(async () => {
      owner.emit("avatar.speak_ended", { event_id: "pending-end-2", source_event_id: "pending-source" });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(1);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    unmount();
  });

  it("does not extend natural settle for duplicate end deliveries or visibility changes", async () => {
    const { container, unmount } = await renderActiveCall();
    const owner = liveAvatarMocks.instances[0]!;
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
      await flushAsyncWork();
      owner.emit("avatar.speak_started", { event_id: "dedupe-start" });
      await flushAsyncWork();
      owner.emit("avatar.speak_ended", { event_id: "dedupe-end" });
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS / 2);
      owner.emit("avatar.speak_ended", { event_id: "dedupe-end" });
      owner.emit("avatar.speak_started", { event_id: "dedupe-start" });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      await flushAsyncWork();
    });
    expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS / 2);
      await flushAsyncWork();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(1);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    unmount();
  });

  it("ignores retired provider sources instead of closing a later turn of the same avatar", async () => {
    const { container, unmount } = await renderActiveCall();
    const owner = liveAvatarMocks.instances[0]!;
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Primera pregunta" });
      await flushAsyncWork();
      owner.emit("avatar.speak_started", { event_id: "retired-start-1", source_event_id: "retired-source" });
      await flushAsyncWork();
      owner.emit("avatar.speak_ended", { event_id: "retired-end-1", source_event_id: "retired-source" });
      await settleSpeechCompletion();
    });
    apiMocks.submitGroupTurn.mockResolvedValueOnce({
      round: { id: "round-2", intent: "normal", status: "queued", contextVersion: 2 },
      phase: "queued",
      floor: { turnId: "turn-2", avatarId: "avatar-1", leaseExpiresAt: "2026-08-21T12:02:00.000Z" },
      directive: {
        action: "speak",
        turnId: "turn-2",
        avatarId: "avatar-1",
        avatarName: "Ada",
        context: "Turno anterior completo",
        instruction: "Segunda respuesta",
        leaseExpiresAt: "2026-08-21T12:02:00.000Z",
      },
    });
    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Segunda pregunta" });
      await flushAsyncWork();
      owner.emit("avatar.speak_started", { event_id: "current-start", source_event_id: "current-source" });
      await flushAsyncWork();
      owner.emit("avatar.speak_started", {
        event_id: "retired-start-late",
        source_event_id: "retired-source",
      });
      owner.emit("avatar.speak_ended", { event_id: "retired-end-late", source_event_id: "retired-source" });
      await settleSpeechCompletion();
    });
    expect(owner.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(owner.interrupt).not.toHaveBeenCalled();
    expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(1);
    await act(async () => {
      owner.emit("avatar.speak_ended", { event_id: "current-end", source_event_id: "current-source" });
      await settleSpeechCompletion();
    });
    expect(
      apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
    ).toHaveLength(2);
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    unmount();
  });

  it.each(["failure", "end", "unmount"] as const)(
    "cancels pending natural completion on %s",
    async (termination) => {
      mockThreeParticipantStart();
      const { container, unmount } = await renderActiveCall();
      const owner = liveAvatarMocks.instances[0]!;
      const videos = [...container.querySelectorAll("video")];
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
        await flushAsyncWork();
        owner.emit("avatar.speak_started", { event_id: `cancel-start-${termination}` });
        await flushAsyncWork();
        owner.emit("avatar.speak_ended", { event_id: `cancel-end-${termination}` });
        await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS / 2);
        if (termination === "failure") owner.emit("session.disconnected", { reason: "network" });
        else if (termination === "end")
          fireEvent.click(screen.getByRole("button", { name: "Finalizar llamada" }));
        else unmount();
        await vi.advanceTimersByTimeAsync(0);
        await flushAsyncWork();
      });
      expect(videos.every((video) => video.muted)).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS * 2);
        owner.emit("avatar.speak_started", { event_id: `stale-start-${termination}` });
        owner.emit("avatar.speak_ended", { event_id: `stale-end-${termination}` });
        await flushAsyncWork();
      });
      expect(
        apiMocks.reportGroupProviderEvent.mock.calls.filter(([, input]) => input.type === "speak_ended")
      ).toHaveLength(0);
      expect(videos.every((video) => video.muted)).toBe(true);
      if (termination !== "unmount") unmount();
    }
  );

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

  it("does not let a provider-only interruption or its listening ACK release the human-controlled floor", async () => {
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

    const videos = [...container.querySelectorAll("video")];
    expect(videos.map((video) => video.muted)).toEqual([false, true]);
    expect(videos[0]!.closest("article")?.getAttribute("data-turn-owner")).toBe("true");
    expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
    expect(liveAvatarMocks.instances[0]!.interrupt).not.toHaveBeenCalled();
    expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("retains the input for explicit retry and dispatches nobody when the busy router accepts no round", async () => {
    const { container, unmount } = await renderActiveCall();
    for (const instance of liveAvatarMocks.instances) instance.commands.mockClear();
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
    expect(liveAvatarMocks.instances.every((instance) => instance.commands.mock.calls.length === 0)).toBe(
      true
    );
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeTruthy();
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
    for (const instance of liveAvatarMocks.instances) instance.commands.mockClear();

    await act(async () => {
      scribeMocks.connection?.emit("committed_transcript", { text: "Consulta con floor cruzado" });
      await flushAsyncWork();
    });

    expect(liveAvatarMocks.instances.every((instance) => instance.commands.mock.calls.length === 0)).toBe(
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
    const commandsBeforeAck = liveAvatarMocks.instances[0]!.commands.mock.calls.length;
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

    expect(liveAvatarMocks.instances[0]!.commands).toHaveBeenCalledTimes(commandsBeforeAck);
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
    for (const instance of liveAvatarMocks.instances) instance.commands.mockClear();
    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });

    expect(liveAvatarMocks.instances[1]!.commands).not.toHaveBeenCalled();
    expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
    expect(container.querySelectorAll("article")[1]!.getAttribute("data-turn-owner")).toBe("false");
    unmount();
  });

  it("shows the server expiry countdown while the call is active", async () => {
    const { unmount } = await renderActiveCall();

    expect(screen.getByText("Tiempo · 9:59")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText("Tiempo · 9:58")).toBeTruthy();
    unmount();
  });

  it("sends the versioned group consent when a shared recipient starts a call", async () => {
    const sharedGroup = {
      ...group,
      access: {
        ...group.access,
        type: "shared" as const,
        canEdit: false,
        canDelete: false,
        canShare: false,
        consent: { scopeId: "group-access-grant:grant-1", version: "3" },
      },
    };
    apiMocks.getAvatarGroup.mockResolvedValueOnce({ group: sharedGroup });

    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    const dialog = screen.getByRole("dialog", { name: "Antes de iniciar la llamada" });
    expect(dialog.textContent).toContain("El creador de Consejo podrá consultar");

    fireEvent.click(within(dialog).getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);

    expect(apiMocks.startGroupVoiceSession).toHaveBeenCalledWith("group-1", {
      consentScopeId: "group-access-grant:grant-1",
      consentVersion: "3",
    });
    view.unmount();
  });

  it("aborts an authenticated shared start when any roster member fails in the browser", async () => {
    const sharedGroup = {
      ...group,
      access: {
        ...group.access,
        type: "shared" as const,
        canEdit: false,
        canDelete: false,
        canShare: false,
        consent: { scopeId: "group-access-grant:grant-1", version: "3" },
      },
    };
    apiMocks.getAvatarGroup.mockResolvedValueOnce({ group: sharedGroup });
    liveAvatarMocks.startBehaviors.set("token-2", async () => {
      throw new Error("shared participant failed");
    });

    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Antes de iniciar la llamada" })).getByRole("button", {
        name: "Iniciar llamada",
      })
    );
    await act(flushAsyncWork);
    await act(settleSpeechCompletion);

    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "no_participants");
    expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
    expect(screen.queryByText("En vivo · parcial")).toBeNull();
    view.unmount();
  });

  it("refreshes the group and reopens privacy when shared consent is stale", async () => {
    const sharedGroup = {
      ...group,
      access: {
        ...group.access,
        type: "shared" as const,
        canEdit: false,
        canDelete: false,
        canShare: false,
        consent: { scopeId: "group-access-grant:grant-1", version: "3" },
      },
    };
    const refreshedGroup = {
      ...sharedGroup,
      membershipVersion: 4,
      access: {
        ...sharedGroup.access,
        consent: { scopeId: "group-access-grant:grant-1", version: "4" },
      },
    };
    apiMocks.getAvatarGroup
      .mockResolvedValueOnce({ group: sharedGroup })
      .mockResolvedValueOnce({ group: refreshedGroup });
    apiMocks.startGroupVoiceSession.mockRejectedValueOnce(
      new ApiClientError("El grupo cambió.", 409, "CONFLICT", "CONSENT_VERSION_STALE")
    );

    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Antes de iniciar la llamada" })).getByRole("button", {
        name: "Iniciar llamada",
      })
    );
    await act(flushAsyncWork);

    const refreshedDialog = screen.getByRole("dialog", { name: "Antes de iniciar la llamada" });
    expect(refreshedDialog.hasAttribute("open")).toBe(true);
    expect(apiMocks.getAvatarGroup).toHaveBeenCalledTimes(2);
    expect(apiMocks.startGroupVoiceSession).toHaveBeenLastCalledWith("group-1", {
      consentScopeId: "group-access-grant:grant-1",
      consentVersion: "3",
    });

    fireEvent.click(within(refreshedDialog).getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    expect(apiMocks.startGroupVoiceSession).toHaveBeenLastCalledWith("group-1", {
      consentScopeId: "group-access-grant:grant-1",
      consentVersion: "4",
    });
    view.unmount();
  });

  it("discloses only available shared avatars and prompts again when a new shared member is added", async () => {
    const mixedGroup = {
      ...group,
      members: [
        group.members[0]!,
        {
          ...group.members[1]!,
          viewerAccess: "direct_grant" as const,
          accessType: "shared" as const,
        },
        {
          id: "avatar-3",
          name: "Lin",
          description: "Sistemas",
          thumbnailUrl: null,
          viewerAccess: "direct_grant" as const,
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
        members: [
          group.members[0]!,
          {
            ...group.members[1]!,
            viewerAccess: "direct_grant" as const,
            accessType: "shared" as const,
          },
        ],
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
    apiMocks.getAvatarGroup.mockResolvedValueOnce({ group: threeParticipantGroup });
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
          threeParticipants[2]!,
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
    await act(settleSpeechCompletion);
    expect(screen.getByText("En vivo · parcial")).toBeTruthy();
    expect(liveAvatarMocks.instances).toHaveLength(2);
    expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(flushAsyncWork);
    expect(liveAvatarMocks.instances).toHaveLength(2);
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
    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "no_participants");
    unmount();
  });

  it("keeps three participants degraded after one failure and ends after the second", async () => {
    mockThreeParticipantStart();
    apiMocks.reportGroupParticipantFailure.mockImplementation(async (_sessionId, avatarId) => ({
      phase: "listening",
      directive: null,
      floor: null,
      participant: { avatarId, status: "errored", error: "Sin conexión" },
    }));
    const { unmount } = await renderActiveCall();

    liveAvatarMocks.instances[0]!.emit("session.disconnected", { reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });
    expect(screen.getByText("En vivo · parcial")).toBeTruthy();
    expect(apiMocks.endGroupVoiceSession).not.toHaveBeenCalled();

    liveAvatarMocks.instances[1]!.emit("session.disconnected", { reason: "network" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await flushAsyncWork();
    });
    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "no_participants");
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
    mockThreeParticipantStart();
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
    expect((microphone as HTMLButtonElement).disabled).toBe(true);
    await act(settleSpeechCompletion);
    expect((microphone as HTMLButtonElement).disabled).toBe(false);
    scribeMocks.connection?.emit("committed_transcript", { text: "Ahora sí respondan" });
    await act(flushAsyncWork);
    expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("bounds participant startup at 20 seconds and continues in degraded mode", async () => {
    mockThreeParticipantStart();
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

  it("ends a two-participant owner start when one browser connection fails", async () => {
    liveAvatarMocks.startBehaviors.set("token-2", async () => {
      throw new Error("owner participant failed");
    });

    const view = render(<TestGroupInteractCall groupId="group-1" />);
    await act(flushAsyncWork);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    await act(settleSpeechCompletion);

    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("group-session-1", "no_participants");
    expect(screen.queryByText("En vivo · parcial")).toBeNull();
    view.unmount();
  });

  it("cleans up a strict external start without exposing degraded recovery", async () => {
    apiMocks.startGroupVoiceSession.mockResolvedValueOnce({
      voiceSession: {
        id: "public-group-session-1",
        groupId: group.id,
        conversationId: "public-conversation-1",
        status: "connecting",
        expiresAt: "2026-08-21T12:10:00.000Z",
        participants,
      },
    });
    liveAvatarMocks.startBehaviors.set("token-2", async () => {
      throw new Error("public participant failed");
    });

    const view = render(
      <ToastProvider>
        <GroupInteractCall
          groupId={group.id}
          initialGroup={group}
          privacyPrompt="handled"
          historyEnabled={false}
        />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }));
    await act(flushAsyncWork);
    await act(settleSpeechCompletion);

    expect(apiMocks.endGroupVoiceSession).toHaveBeenCalledWith("public-group-session-1", "no_participants");
    expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
    expect(screen.queryByText("En vivo · parcial")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
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
    await act(settleSpeechCompletion);
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
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
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
      await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
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
        await vi.advanceTimersByTimeAsync(GROUP_SPEECH_END_SETTLE_MS);
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
    mockThreeParticipantStart();
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

    const nextParticipants = threeParticipants.map((participant, index) => ({
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
    await act(settleSpeechCompletion);
    expect(liveAvatarMocks.instances).toHaveLength(6);

    liveAvatarMocks.instances[3]!.emit("session.disconnected", { reason: "new-network" });
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
    expect(liveAvatarMocks.instances).toHaveLength(6);
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
    await act(settleSpeechCompletion);
    expect((screen.getByRole("button", { name: "Silenciar micrófono" }) as HTMLButtonElement).disabled).toBe(
      false
    );
    unmount();
  });

  describe("Scribe-authoritative human interruption", () => {
    beforeEach(() => {
      liveAvatarMocks.autoInterruptTerminal = true;
      apiMocks.confirmGroupParticipantInterruptionReady.mockResolvedValue({
        applied: true,
        phase: "listening",
        floor: null,
      });
      apiMocks.interruptGroupVoiceSession.mockImplementation(async (_sessionId, reason, input) =>
        reason === "user"
          ? interruptedRoundResponse(input.sourceEventId)
          : { phase: "listening", directive: { action: "listen", reason: "interrupted" }, floor: null }
      );
      apiMocks.retryGroupParticipant.mockResolvedValue({
        participant: {
          ...participants[0]!,
          participantAttemptId: "attempt-after-interruption",
          sessionToken: "token-after-interruption",
          sessionId: "live-after-interruption",
          realtimeSessionId: "realtime-after-interruption",
        },
      });
    });

    it("retains silence and the human phrase without replacing when terminal evidence is absent or unrelated", async () => {
      liveAvatarMocks.autoInterruptTerminal = false;
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Ahora quiero hablar de otra cosa" });
        owner.emit("avatar.speak_ended", { event_id: "unknown-end", source_event_id: "unrelated" });
        owner.emit("avatar.speak_ended", { event_id: "source-less-end" });
        await vi.advanceTimersByTimeAsync(5_001);
        await flushAsyncWork();
      });
      expect(apiMocks.confirmGroupParticipantInterruptionReady).not.toHaveBeenCalled();
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(owner.stop).not.toHaveBeenCalled();
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      expect(screen.getByRole("button", { name: /Reintentar interrupción/ })).toBeTruthy();
      // A terminal after timeout is retained, but never silently resumes failed recovery.
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        owner.emit("avatar.speak_ended", {
          event_id: "late-valid-end",
          source_event_id: `speech:${owner.token}:1`,
        });
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("Ahora quiero hablar de otra cosa");
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(owner.stop).not.toHaveBeenCalled();
      unmount();
    });

    it("waits for a correlated terminal arriving after cancellation before resolving reuse", async () => {
      liveAvatarMocks.autoInterruptTerminal = false;
      const { unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Mejor que responda Grace" });
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.confirmGroupParticipantInterruptionReady).not.toHaveBeenCalled();
      await act(async () => {
        owner.emit("avatar.speak_ended", {
          event_id: "terminal-after-cancel",
          source_event_id: `speech:${owner.token}:1`,
        });
        await flushAsyncWork();
      });
      expect(apiMocks.confirmGroupParticipantInterruptionReady).toHaveBeenCalledWith(
        "group-session-1",
        "avatar-1",
        expect.objectContaining({
          evidence: {
            type: "speak_ended",
            eventId: "terminal-after-cancel",
            speechSourceEventId: `speech:${owner.token}:1`,
          },
        })
      );
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(owner.stop).not.toHaveBeenCalled();
      unmount();
    });

    it("retries the identical reuse ACK after a lost response without starting replacement", async () => {
      apiMocks.confirmGroupParticipantInterruptionReady.mockRejectedValueOnce(new Error("ACK lost"));
      const { unmount } = await renderSpeakingCall();
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Que responda Grace" });
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
      });
      const calls = apiMocks.confirmGroupParticipantInterruptionReady.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual(calls[0]);
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      unmount();
    });

    it("resolves both affected A→B attempts and proves that B was never dispatched", async () => {
      const { unmount } = await renderSpeakingCall();
      apiMocks.interruptGroupVoiceSession.mockImplementation(async (_sessionId, _reason, input) => ({
        ...interruptedRoundResponse(input.sourceEventId),
        interruption: {
          ...interruptedRoundResponse(input.sourceEventId).interruption,
          avatarIds: ["avatar-1", "avatar-2"],
          affectedParticipants: [
            {
              avatarId: "avatar-1",
              participantAttemptId: participants[0]!.participantAttemptId,
              interruptedTurnId: "turn-1",
            },
            {
              avatarId: "avatar-2",
              participantAttemptId: participants[1]!.participantAttemptId,
              interruptedTurnId: "turn-b-cancelled",
            },
          ],
        },
      }));
      const secondAck = deferred();
      apiMocks.confirmGroupParticipantInterruptionReady
        .mockResolvedValueOnce({ applied: true, phase: "listening", floor: null })
        .mockReturnValueOnce(secondAck.promise);
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Esperá, reformulo" });
        await flushAsyncWork();
      });
      expect(apiMocks.confirmGroupParticipantInterruptionReady).toHaveBeenNthCalledWith(
        2,
        "group-session-1",
        "avatar-2",
        expect.objectContaining({
          interruptedTurnId: "turn-b-cancelled",
          evidence: { type: "not_dispatched" },
        })
      );
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      await act(async () => {
        secondAck.resolve({ applied: true, phase: "listening", floor: null });
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(liveAvatarMocks.instances).toHaveLength(2);
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      unmount();
    });

    it("captures B's terminal before the cancellation ACK when the human phrase began on A", async () => {
      liveAvatarMocks.autoInterruptTerminal = false;
      const { unmount } = await renderSpeakingCall();
      const a = liveAvatarMocks.instances[0]!;
      const b = liveAvatarMocks.instances[1]!;
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      apiMocks.reportGroupProviderEvent.mockImplementation(async (_sessionId, input) =>
        input.type === "speak_ended" && input.avatarId === "avatar-1"
          ? nextHumanRoundResponse("avatar-2")
          : {
              phase: "speaking",
              floor: {
                turnId: input.turnId,
                avatarId: input.avatarId,
                leaseExpiresAt: "2026-08-21T12:01:15.000Z",
              },
              directive: null,
            }
      );
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "sí" });
        a.emit("avatar.speak_ended", { event_id: "a-natural-end", source_event_id: `speech:${a.token}:1` });
        await settleSpeechCompletion();
        b.emit("avatar.speak_started", { event_id: "b-start", source_event_id: "b-source" });
        await flushAsyncWork();
        scribeMocks.connection?.emit("partial_transcript", { text: "sí, pero esperá" });
        await flushAsyncWork();
      });
      expect(a.interrupt).toHaveBeenCalledTimes(1);
      expect(b.interrupt).toHaveBeenCalledTimes(1);
      const sourceEventId = apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId;
      await act(async () => {
        b.emit("avatar.speak_ended", { event_id: "b-native-terminal", source_event_id: "b-source" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Reformulo para ambos" });
        await flushAsyncWork();
      });
      expect(apiMocks.confirmGroupParticipantInterruptionReady).not.toHaveBeenCalled();
      await act(async () => {
        cancellation.resolve({
          ...interruptedRoundResponse(sourceEventId),
          interruption: {
            ...interruptedRoundResponse(sourceEventId).interruption,
            avatarIds: ["avatar-1", "avatar-2"],
            affectedParticipants: [
              {
                avatarId: "avatar-1",
                participantAttemptId: participants[0]!.participantAttemptId,
                interruptedTurnId: "turn-1",
              },
              {
                avatarId: "avatar-2",
                participantAttemptId: participants[1]!.participantAttemptId,
                interruptedTurnId: "turn-new",
              },
            ],
          },
        });
        await flushAsyncWork();
      });
      expect(apiMocks.confirmGroupParticipantInterruptionReady).toHaveBeenCalledTimes(2);
      expect(apiMocks.confirmGroupParticipantInterruptionReady).toHaveBeenLastCalledWith(
        "group-session-1",
        "avatar-2",
        expect.objectContaining({
          evidence: { type: "speak_ended", eventId: "b-native-terminal", speechSourceEventId: "b-source" },
        })
      );
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      unmount();
    });

    it("recovers a real failed attempt when the server applied reuse but its ACK was lost", async () => {
      mockThreeParticipantStart();
      apiMocks.confirmGroupParticipantInterruptionReady.mockRejectedValueOnce(
        new Error("response lost after apply")
      );
      const { unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Guardá esta nueva intención" });
        await flushAsyncWork();
        owner.emit("session.disconnected");
        await vi.advanceTimersByTimeAsync(0);
        await flushAsyncWork();
      });
      expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.retryGroupParticipant).toHaveBeenCalledWith("group-session-1", "avatar-1", {
        interruptionSourceEventId: apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId,
        failedParticipantAttemptId: participants[0]!.participantAttemptId,
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("Guardá esta nueva intención");
      unmount();
    });

    it("keeps retired speech and transcription out of the new turn on the same connector", async () => {
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse("avatar-1"));
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Ada, otra explicación" });
        await flushAsyncWork();
        owner.emit("session.stream_ready");
        owner.emit("avatar.speak_started", {
          event_id: "retired-start",
          source_event_id: `speech:${owner.token}:1`,
        });
        owner.emit("avatar.speak_started", { event_id: "missing-source" });
      });
      expect(container.querySelectorAll("video")[0]!.muted).toBe(true);
      await act(async () => {
        owner.emit("avatar.speak_started", { event_id: "fresh-start", source_event_id: "fresh-new" });
        owner.emit("avatar.transcription", {
          event_id: "retired-text",
          source_event_id: `speech:${owner.token}:1`,
          text: "Borrador retirado",
        });
        owner.emit("avatar.speak_ended", { event_id: "late-no-source" });
        owner.emit("avatar.speak_ended", {
          event_id: "late-unrelated-source",
          source_event_id: "unrelated-old",
        });
        owner.emit("avatar.speak_ended", {
          event_id: "retired-end",
          source_event_id: `speech:${owner.token}:1`,
        });
        await vi.advanceTimersByTimeAsync(1_100);
        await flushAsyncWork();
      });
      expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
      expect(
        apiMocks.reportGroupProviderEvent.mock.calls.some(
          ([, event]) => event.type === "speak_ended" && event.turnId === "turn-new"
        )
      ).toBe(false);
      unmount();
    });

    it.each(["session.stopped", "session.disconnected"])(
      "reports genuine %s after reuse on the current connector",
      async (event) => {
        mockThreeParticipantStart();
        const { unmount } = await renderSpeakingCall();
        const owner = liveAvatarMocks.instances[0]!;
        apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse("avatar-1"));
        await act(async () => {
          scribeMocks.connection?.emit("committed_transcript", { text: "Ada, otra explicación" });
          await flushAsyncWork();
          owner.emit("avatar.speak_started", { event_id: "new-owner-start", source_event_id: "fresh-owner" });
          await flushAsyncWork();
          owner.emit(event);
          await vi.advanceTimersByTimeAsync(0);
          await flushAsyncWork();
        });
        expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledWith(
          "group-session-1",
          "avatar-1",
          expect.objectContaining({
            participantAttemptId: participants[0]!.participantAttemptId,
            expectedTurnId: "turn-new",
          }),
          expect.anything()
        );
        expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
        unmount();
      }
    );

    it.each(["pará", "sí, pero esperá"])(
      "closes audio synchronously for %s before the cancellation request resolves",
      async (text) => {
        const cancellation = deferred();
        apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
        const { container, unmount } = await renderSpeakingCall();
        const videos = [...container.querySelectorAll("video")];
        const owner = liveAvatarMocks.instances[0]!;
        let mutedAtRequest = false;
        apiMocks.interruptGroupVoiceSession.mockImplementation(() => {
          mutedAtRequest = videos.every((video) => video.muted);
          return cancellation.promise;
        });

        await act(async () => {
          scribeMocks.connection?.emit("partial_transcript", { text });
          expect(videos.every((video) => video.muted)).toBe(true);
          await flushAsyncWork();
        });

        expect(mutedAtRequest).toBe(true);
        expect(owner.interrupt).toHaveBeenCalledTimes(1);
        expect(liveAvatarMocks.instances[1]!.interrupt).not.toHaveBeenCalled();
        expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledExactlyOnceWith(
          "group-session-1",
          "user",
          expect.objectContaining({
            avatarId: "avatar-1",
            turnId: "turn-1",
            sourceEventId: expect.any(String),
            trigger: "voice",
          })
        );
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
        expect(
          (screen.getByRole("button", { name: "Silenciar micrófono" }) as HTMLButtonElement).disabled
        ).toBe(true);
        expect(
          (screen.getByRole("button", { name: "Interrumpir avatar" }) as HTMLButtonElement).disabled
        ).toBe(true);
        unmount();
      }
    );

    it("waits 300 ms once for ordinary significant speech without resetting on later partials", async () => {
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;

      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "Quiero cambiar" });
        await vi.advanceTimersByTimeAsync(200);
        scribeMocks.connection?.emit("partial_transcript", { text: "Quiero cambiar la pregunta" });
        await vi.advanceTimersByTimeAsync(99);
      });
      expect(owner.interrupt).not.toHaveBeenCalled();
      expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        await flushAsyncWork();
      });
      expect(owner.interrupt).toHaveBeenCalledTimes(1);
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      unmount();
    });

    it.each(["Okey.", "sí sí", "ok dale", "ajá mhm claro"])(
      "does not cut or reroute a backchannel-only partial and commit: %s",
      async (text) => {
        const { container, unmount } = await renderSpeakingCall();
        await act(async () => {
          scribeMocks.connection?.emit("partial_transcript", { text });
          await vi.advanceTimersByTimeAsync(350);
          scribeMocks.connection?.emit("committed_transcript", { text });
          await flushAsyncWork();
        });
        expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
        expect(liveAvatarMocks.instances[0]!.interrupt).not.toHaveBeenCalled();
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
        expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
        unmount();
      }
    );

    it("allows muting while the avatar speaks and ignores late Scribe events from the closed microphone", async () => {
      const { container, unmount } = await renderSpeakingCall();
      const scribe = scribeMocks.connection!;
      const microphone = screen.getByRole("button", { name: "Silenciar micrófono" });
      expect((microphone as HTMLButtonElement).disabled).toBe(false);
      await act(async () => {
        fireEvent.click(microphone);
        await flushAsyncWork();
        scribe.emit("partial_transcript", { text: "pará" });
        scribe.emit("committed_transcript", { text: "pará, quiero otra cosa" });
        await vi.advanceTimersByTimeAsync(350);
        await flushAsyncWork();
      });
      expect(scribe.close).toHaveBeenCalledTimes(1);
      expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
      expect(screen.getByRole("button", { name: "Activar micrófono" })).toBeTruthy();
      unmount();
    });

    it("ignores echoed avatar text, but cuts when the same partial adds a new user intervention", async () => {
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      const { container, unmount } = await renderSpeakingCall();
      await act(async () => {
        liveAvatarMocks.instances[0]!.emit("avatar.transcription", {
          event_id: "echo-source",
          text: "Podemos empezar por los requisitos y seguir con el diseño.",
        });
        scribeMocks.connection?.emit("partial_transcript", {
          text: "Podemos empezar por los requisitos y seguir con el diseño.",
        });
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
      expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", {
          text: "Podemos empezar por los requisitos y seguir con el diseño, quiero otra alternativa.",
        });
        await vi.advanceTimersByTimeAsync(299);
      });
      expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      unmount();
    });

    it("retains a new committed phrase during pending orchestration and cancels before dispatching the obsolete instruction", async () => {
      const firstRoute = deferred();
      apiMocks.submitGroupTurn.mockReturnValueOnce(firstRoute.promise);
      const { unmount } = await renderActiveCall();
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Primera pregunta" });
        await flushAsyncWork();
        scribeMocks.connection?.emit("committed_transcript", { text: "Mejor expliquen otra cosa" });
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
      await act(async () => {
        firstRoute.resolve(nextHumanRoundResponse("avatar-1"));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(liveAvatarMocks.instances[0]!.sendUserMessage).toHaveBeenCalledTimes(1);
      expect(apiMocks.confirmGroupParticipantInterruptionReady).toHaveBeenCalledWith(
        "group-session-1",
        "avatar-1",
        expect.objectContaining({ evidence: { type: "not_dispatched" } })
      );
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("Mejor expliquen otra cosa");
      unmount();
    });

    it.each(["before", "after"])(
      "keeps a human commit %s the cancellation ACK and reroutes it exactly once after confirmed connector reuse",
      async (order) => {
        const cancellation = deferred();
        apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
        const { container, unmount } = await renderSpeakingCall();
        apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
        const owner = liveAvatarMocks.instances[0]!;
        await act(async () => {
          scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
          scribeMocks.connection?.emit("partial_transcript", { text: "pará, reformulo" });
          await flushAsyncWork();
        });
        const sourceEventId = apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId;
        const commit = () =>
          scribeMocks.connection?.emit("committed_transcript", { text: "Quiero otra explicación" });
        await act(async () => {
          if (order === "before") commit();
          await flushAsyncWork();
        });
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
        await act(async () => {
          cancellation.resolve(interruptedRoundResponse(sourceEventId));
          await flushAsyncWork();
          if (order === "after") commit();
          await flushAsyncWork();
          await settleSpeechCompletion();
        });
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
        expect(apiMocks.submitGroupTurn.mock.calls[1]![1]).toEqual(
          expect.objectContaining({ content: "Quiero otra explicación", sourceEventId: expect.any(String) })
        );
        expect(owner.interrupt).toHaveBeenCalledTimes(1);
        expect(owner.stop).not.toHaveBeenCalled();
        expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
        expect(apiMocks.confirmGroupParticipantInterruptionReady).toHaveBeenCalledWith(
          "group-session-1",
          "avatar-1",
          expect.objectContaining({ interruptionSourceEventId: sourceEventId })
        );
        expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
        expect([...container.querySelectorAll("video")].filter((video) => !video.muted)).toHaveLength(1);
        unmount();
      }
    );

    it("commits before the 300 ms timer as an immediate fallback and never performs a second cut", async () => {
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      const { unmount } = await renderSpeakingCall();
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "Quiero otra" });
        await vi.advanceTimersByTimeAsync(100);
        scribeMocks.connection?.emit("committed_transcript", { text: "Quiero otra explicación" });
        await flushAsyncWork();
      });
      expect(liveAvatarMocks.instances[0]!.interrupt).toHaveBeenCalledTimes(1);
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
        scribeMocks.connection?.emit("committed_transcript", { text: "Quiero otra explicación" });
        await flushAsyncWork();
      });
      expect(liveAvatarMocks.instances[0]!.interrupt).toHaveBeenCalledTimes(1);
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("does not cut a partial that began while queued, but preserves its committed intervention", async () => {
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      const { unmount } = await renderActiveCall();
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
        await flushAsyncWork();
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        liveAvatarMocks.instances[0]!.emit("avatar.speak_started", {
          event_id: "after-queued-candidate",
          source_event_id: `speech:${liveAvatarMocks.instances[0]!.token}:1`,
        });
        await vi.advanceTimersByTimeAsync(500);
        scribeMocks.connection?.emit("partial_transcript", { text: "pará, reformulo" });
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(apiMocks.interruptGroupVoiceSession).not.toHaveBeenCalled();
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "pará, reformulo la pregunta" });
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      const sourceEventId = apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId;
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        cancellation.resolve(interruptedRoundResponse(sourceEventId));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("pará, reformulo la pregunta");
      unmount();
    });

    it("reuses the same connector and opens synchronous short responses only for a fresh speech source", async () => {
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse("avatar-1"));
      owner.sendUserMessage.mockImplementationOnce(() => {
        expect(container.querySelectorAll("video")[0]!.muted).toBe(true);
        owner.emit("avatar.speak_started", { event_id: "new-short-start", source_event_id: "fresh-source" });
        expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
        owner.emit("avatar.speak_ended", { event_id: "new-short-end", source_event_id: "fresh-source" });
        return "new-command-id";
      });
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Ada, explicalo más simple" });
        await flushAsyncWork();
      });
      expect(liveAvatarMocks.instances).toHaveLength(2);
      expect(owner.stop).not.toHaveBeenCalled();
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(owner.sendUserMessage).toHaveBeenCalledTimes(2);
      expect(owner.sendUserMessage).toHaveBeenLastCalledWith("Respondé a la nueva intervención.");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(645);
        owner.emit("avatar.speak_started", { event_id: "new-continuation", source_event_id: "fresh-source" });
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
      expect(
        apiMocks.reportGroupProviderEvent.mock.calls.filter(([, event]) => event.type === "speak_ended")
      ).toHaveLength(0);
      unmount();
    });

    it("attributes correction during cancellation to the interrupted turn without presenting its draft as heard", async () => {
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      await act(async () => {
        owner.emit("elevenlabs_agent_event", {
          event_id: "draft-before-cut",
          elevenlabs_event_type: "agent_response",
          data: {
            agent_response_event: {
              agent_response: "Primero esto. Luego una explicación pendiente.",
              event_id: 51,
            },
          },
        });
        await flushAsyncWork();
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Cambiemos de prioridad" });
        await flushAsyncWork();
        owner.emit("elevenlabs_agent_event", {
          event_id: "correction-after-cut",
          elevenlabs_event_type: "agent_response_correction",
          data: {
            agent_response_correction_event: {
              original_agent_response: "Primero esto. Luego una explicación pendiente.",
              corrected_agent_response: "Primero esto.",
              event_id: 51,
            },
          },
        });
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession.mock.calls[0]![2]).toEqual(
        expect.objectContaining({ generatedText: "Primero esto. Luego una explicación pendiente." })
      );
      expect(apiMocks.reportGroupProviderEvent).toHaveBeenCalledWith(
        "group-session-1",
        expect.objectContaining({
          type: "agent_response_correction",
          turnId: "turn-1",
          avatarId: "avatar-1",
          content: "Primero esto.",
        })
      );
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect(owner.sendUserMessage).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("keeps the transcript and silence after bounded cancellation failures, then retries the same episode explicitly", async () => {
      apiMocks.interruptGroupVoiceSession.mockRejectedValue(new Error("response lost"));
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Necesito cambiar de tema" });
        await flushAsyncWork();
        await vi.advanceTimersByTimeAsync(5_000);
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(3);
      const sourceEventIds = apiMocks.interruptGroupVoiceSession.mock.calls.map(
        ([, , input]) => input.sourceEventId
      );
      expect(new Set(sourceEventIds).size).toBe(1);
      expect(owner.interrupt).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();

      apiMocks.interruptGroupVoiceSession.mockResolvedValue(interruptedRoundResponse(sourceEventIds[0]!));
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(4);
      expect(apiMocks.interruptGroupVoiceSession.mock.calls[3]![2].sourceEventId).toBe(sourceEventIds[0]);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("Necesito cambiar de tema");
      expect(owner.interrupt).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("retains a commit arriving after cancellation retries are exhausted without restarting retries until explicit recovery", async () => {
      apiMocks.interruptGroupVoiceSession.mockRejectedValue(new Error("response lost"));
      const { container, unmount } = await renderSpeakingCall();
      const owner = liveAvatarMocks.instances[0]!;
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        await flushAsyncWork();
        await vi.advanceTimersByTimeAsync(5_000);
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(3);
      const sourceEventId = apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId;
      expect(screen.getByRole("button", { name: /Reintentar interrupción/ })).toBeTruthy();

      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", {
          text: "Esta frase llegó después del error y debe conservarse",
        });
        await flushAsyncWork();
        await vi.advanceTimersByTimeAsync(5_000);
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(3);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(owner.interrupt).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);

      apiMocks.interruptGroupVoiceSession.mockResolvedValue(interruptedRoundResponse(sourceEventId));
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
        await settleSpeechCompletion();
        await vi.advanceTimersByTimeAsync(2_000);
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(4);
      expect(
        apiMocks.interruptGroupVoiceSession.mock.calls.every(
          ([, , input]) => input.sourceEventId === sourceEventId
        )
      ).toBe(true);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe(
        "Esta frase llegó después del error y debe conservarse"
      );
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
      expect(owner.interrupt).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("recovers a failed connector replacement without cancelling again or losing the committed phrase", async () => {
      liveAvatarMocks.autoInterruptTerminal = false;
      apiMocks.retryGroupParticipant.mockRejectedValueOnce(new Error("replacement not available"));
      const { container, unmount } = await renderSpeakingCall();
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse("avatar-1"));
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Ada, reformulalo" });
        await flushAsyncWork();
      });
      await requestInterruptionRecovery();
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.retryGroupParticipant).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.retryGroupParticipant).toHaveBeenCalledTimes(2);
      expect(apiMocks.retryGroupParticipant.mock.calls[1]![2]).toEqual(
        apiMocks.retryGroupParticipant.mock.calls[0]![2]
      );
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("Ada, reformulalo");
      expect(liveAvatarMocks.instances[0]!.sendUserMessage).toHaveBeenCalledTimes(1);
      expect(liveAvatarMocks.instances[2]!.sendUserMessage).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("recovers Scribe after a capture error and retains the committed phrase without reopening old audio", async () => {
      const { container, unmount } = await renderSpeakingCall();
      const oldScribe = scribeMocks.connection!;
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        oldScribe.emit("partial_transcript", { text: "pará" });
        oldScribe.emit("committed_transcript", { text: "La frase sigue guardada" });
        oldScribe.emit("error", { error: "capture disconnected" });
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(oldScribe.close).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(scribeMocks.connection).not.toBe(oldScribe);
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("La frase sigue guardada");
      expect(liveAvatarMocks.instances).toHaveLength(2);
      await act(async () => {
        oldScribe.emit("partial_transcript", { text: "pará" });
        oldScribe.emit("committed_transcript", { text: "La frase sigue guardada" });
        oldScribe.emit("error", { error: "stale capture error" });
        await flushAsyncWork();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect([...container.querySelectorAll("video")].map((video) => video.muted)).toEqual([true, false]);
      unmount();
    });

    it("does not end a two-avatar call on replacement startup failure and requests a fresh attempt on recovery", async () => {
      liveAvatarMocks.autoInterruptTerminal = false;
      const failedReplacement = {
        ...participants[0]!,
        participantAttemptId: "attempt-failed-replacement",
        sessionToken: "token-failed-replacement",
        sessionId: "live-failed-replacement",
      };
      apiMocks.retryGroupParticipant.mockResolvedValueOnce({ participant: failedReplacement });
      liveAvatarMocks.startBehaviors.set("token-failed-replacement", async () => {
        throw new Error("replacement startup failed");
      });
      const { container, unmount } = await renderSpeakingCall();
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Que responda Grace después" });
        await flushAsyncWork();
      });
      await requestInterruptionRecovery();
      expect(apiMocks.endGroupVoiceSession).not.toHaveBeenCalled();
      expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Reintentar interrupción/ }));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.retryGroupParticipant).toHaveBeenCalledTimes(2);
      expect(apiMocks.retryGroupParticipant.mock.calls[1]![2]).toEqual({
        interruptionSourceEventId: apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId,
        failedParticipantAttemptId: "attempt-failed-replacement",
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe("Que responda Grace después");
      expect(liveAvatarMocks.instances).toHaveLength(4);
      expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
      unmount();
    });

    it.each(["session.stopped", "session.disconnected"])(
      "treats an old connector %s before the replacement ACK as expected retirement without degrading or ending the call",
      async (event) => {
        liveAvatarMocks.autoInterruptTerminal = false;
        const replacement = deferred();
        apiMocks.retryGroupParticipant.mockReturnValueOnce(replacement.promise);
        const { container, unmount } = await renderSpeakingCall();
        const retiredOwner = liveAvatarMocks.instances[0]!;
        apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
        await act(async () => {
          scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
          scribeMocks.connection?.emit("committed_transcript", { text: "Ahora que responda Grace" });
          await flushAsyncWork();
        });
        await requestInterruptionRecovery();
        expect(apiMocks.retryGroupParticipant).toHaveBeenCalledTimes(1);
        await act(async () => {
          retiredOwner.emit(event, { reason: "session_ended" });
          await vi.advanceTimersByTimeAsync(0);
          await flushAsyncWork();
        });
        expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
        expect(apiMocks.endGroupVoiceSession).not.toHaveBeenCalled();
        expect(screen.getByText("En vivo")).toBeTruthy();
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
        expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);

        await act(async () => {
          replacement.resolve({
            participant: {
              ...participants[0]!,
              participantAttemptId: "attempt-after-interruption",
              sessionToken: "token-after-interruption",
              sessionId: "live-after-interruption",
              realtimeSessionId: "realtime-after-interruption",
            },
          });
          await flushAsyncWork();
          await settleSpeechCompletion();
        });
        expect(apiMocks.reportGroupParticipantFailure).not.toHaveBeenCalled();
        expect(apiMocks.endGroupVoiceSession).not.toHaveBeenCalled();
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
        expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
        expect(screen.getByText("En vivo")).toBeTruthy();
        expect([...container.querySelectorAll("video")].map((video) => video.muted)).toEqual([true, false]);
        unmount();
      }
    );

    it("reports a real replacement connector failure after startup and a new turn through normal participant recovery", async () => {
      liveAvatarMocks.autoInterruptTerminal = false;
      mockThreeParticipantStart();
      const { container, unmount } = await renderSpeakingCall();
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse("avatar-1"));
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Ada, respondé más simple" });
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      await requestInterruptionRecovery();
      expect(liveAvatarMocks.instances).toHaveLength(4);
      const replacement = liveAvatarMocks.instances[3]!;
      await act(async () => {
        replacement.emit("avatar.speak_started", { event_id: "replacement-authorized-start" });
        await flushAsyncWork();
      });
      expect(container.querySelectorAll("video")[0]!.muted).toBe(false);
      await act(async () => {
        replacement.emit("session.stopped", { reason: "network" });
        replacement.emit("session.disconnected", { reason: "network" });
        await vi.advanceTimersByTimeAsync(0);
        await flushAsyncWork();
      });
      expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledTimes(1);
      expect(apiMocks.reportGroupParticipantFailure).toHaveBeenCalledWith(
        "group-session-1",
        "avatar-1",
        expect.objectContaining({
          participantAttemptId: "attempt-after-interruption",
          reason: "session_stopped",
          expectedTurnId: "turn-new",
        }),
        expect.objectContaining({ signal: expect.anything() })
      );
      expect(screen.getByText("En vivo · parcial")).toBeTruthy();
      expect(screen.getByRole("button", { name: /^Reintentar$/ })).toBeTruthy();
      expect(apiMocks.endGroupVoiceSession).not.toHaveBeenCalled();
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      unmount();
    });

    it("retries failed rerouting with the same human event ID without cancelling or replacing again", async () => {
      const { container, unmount } = await renderSpeakingCall();
      apiMocks.submitGroupTurn.mockRejectedValueOnce(new Error("route response lost"));
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Esta pregunta no debe perderse" });
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      const retainedInput = apiMocks.submitGroupTurn.mock.calls[1]![1];
      expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(3);
      expect(apiMocks.submitGroupTurn.mock.calls[2]![1]).toEqual(retainedInput);
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
      expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("coalesces multiple committed segments captured during one interruption into exactly one new round", async () => {
      const cancellation = deferred();
      apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
      const { unmount } = await renderSpeakingCall();
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Primero quiero cambiar el objetivo." });
        await vi.advanceTimersByTimeAsync(400);
        scribeMocks.connection?.emit("committed_transcript", { text: "Después evaluemos las opciones." });
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      const sourceEventId = apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId;
      await act(async () => {
        cancellation.resolve(interruptedRoundResponse(sourceEventId));
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1].content).toBe(
        "Primero quiero cambiar el objetivo.\nDespués evaluemos las opciones."
      );
      expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("buffers later committed speech while a failed human input awaits retry without overwriting either phrase", async () => {
      const { unmount } = await renderActiveCall();
      apiMocks.submitGroupTurn.mockRejectedValueOnce(new Error("first route failed"));
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Esta es la primera pregunta" });
        await flushAsyncWork();
      });
      const retainedInput = apiMocks.submitGroupTurn.mock.calls[0]![1];
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Y esta es una segunda pregunta" });
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
      apiMocks.submitGroupTurn.mockResolvedValueOnce({
        round: { id: "round-recovered", intent: "normal", status: "completed", contextVersion: 1 },
        phase: "listening",
        floor: null,
        directive: { action: "listen", reason: "round_complete" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
        await flushAsyncWork();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(3);
      expect(apiMocks.submitGroupTurn.mock.calls[1]![1]).toEqual(retainedInput);
      expect(apiMocks.submitGroupTurn.mock.calls[2]![1].content).toBe("Y esta es una segunda pregunta");
      expect(apiMocks.submitGroupTurn.mock.calls[2]![1].sourceEventId).not.toBe(retainedInput.sourceEventId);
      unmount();
    });

    it("ignores a pre-cut provider HTTP response and old connector events after the new owner starts", async () => {
      const { container, unmount } = await renderActiveCall();
      await act(async () => {
        scribeMocks.connection?.emit("committed_transcript", { text: "Respondé Ada" });
        await flushAsyncWork();
      });
      const staleResponse = deferred();
      const originalReport = apiMocks.reportGroupProviderEvent.getMockImplementation()!;
      apiMocks.reportGroupProviderEvent.mockImplementation((sessionId, input) =>
        input.type === "speak_started" && input.turnId === "turn-1"
          ? staleResponse.promise
          : originalReport(sessionId, input)
      );
      const owner = liveAvatarMocks.instances[0]!;
      await act(async () => {
        owner.emit("avatar.speak_started", {
          event_id: "old-start-pending",
          source_event_id: `speech:${owner.token}:1`,
        });
        await flushAsyncWork();
      });
      apiMocks.submitGroupTurn.mockResolvedValue(nextHumanRoundResponse());
      await act(async () => {
        scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
        scribeMocks.connection?.emit("committed_transcript", { text: "Que responda Grace" });
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.interruptGroupVoiceSession).toHaveBeenCalledTimes(1);
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect([...container.querySelectorAll("video")].map((video) => video.muted)).toEqual([true, false]);
      await act(async () => {
        staleResponse.resolve({
          phase: "speaking",
          floor: { turnId: "turn-1", avatarId: "avatar-1", leaseExpiresAt: "2026-08-21T12:01:15.000Z" },
          directive: null,
        });
        await flushAsyncWork();
        await settleSpeechCompletion();
      });
      expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(2);
      expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
      const videos = [...container.querySelectorAll("video")];
      expect(videos.map((video) => video.muted)).toEqual([true, false]);
      await act(async () => {
        owner.emit("session.stream_ready");
        owner.emit("avatar.speak_started", { event_id: "stale-uncorrelated-start" });
        owner.emit("avatar.speak_ended", { event_id: "stale-uncorrelated-end" });
        owner.emit("elevenlabs_agent_event", {
          event_id: "stale-uncorrelated-interruption",
          elevenlabs_event_type: "interruption",
          data: {},
        });
        await settleSpeechCompletion();
      });
      expect(videos.map((video) => video.muted)).toEqual([true, false]);
      expect(liveAvatarMocks.instances[1]!.sendUserMessage).toHaveBeenCalledTimes(1);
      expect(liveAvatarMocks.instances[1]!.interrupt).not.toHaveBeenCalled();
      unmount();
    });

    it.each(["close", "unmount"])(
      "invalidates an outstanding cancellation and retained commit on %s",
      async (action) => {
        const cancellation = deferred();
        apiMocks.interruptGroupVoiceSession.mockReturnValue(cancellation.promise);
        const { container, unmount } = await renderSpeakingCall();
        await act(async () => {
          scribeMocks.connection?.emit("partial_transcript", { text: "pará" });
          scribeMocks.connection?.emit("committed_transcript", {
            text: "Esta frase no debe abrir otra sesión",
          });
          await flushAsyncWork();
        });
        const sourceEventId = apiMocks.interruptGroupVoiceSession.mock.calls[0]![2].sourceEventId;
        await act(async () => {
          if (action === "unmount") unmount();
          else fireEvent.click(screen.getByRole("button", { name: "Finalizar llamada" }));
          await flushAsyncWork();
          cancellation.resolve(interruptedRoundResponse(sourceEventId));
          await vi.advanceTimersByTimeAsync(5_000);
          await flushAsyncWork();
        });
        expect(apiMocks.submitGroupTurn).toHaveBeenCalledTimes(1);
        expect(apiMocks.retryGroupParticipant).not.toHaveBeenCalled();
        expect(liveAvatarMocks.instances).toHaveLength(2);
        expect([...container.querySelectorAll("video")].every((video) => video.muted)).toBe(true);
        if (action !== "unmount") unmount();
      }
    );
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
