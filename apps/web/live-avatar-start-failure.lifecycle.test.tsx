import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveAvatarSession } from "./hooks/useLiveAvatarSession";

const sdkMocks = vi.hoisted(() => ({
  stop: vi.fn(async () => undefined),
  startBehavior: "throw" as "throw" | "stop_then_resolve",
}));

vi.mock("@heygen/liveavatar-web-sdk", () => {
  class FailingLiveAvatarSession {
    private sessionStoppedHandler: ((event: { event_type: string }) => void) | null = null;

    readonly voiceChat = {
      isMuted: false,
      state: "INACTIVE",
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      mute: vi.fn(async () => undefined),
      unmute: vi.fn(async () => undefined),
    };

    on(event: string, handler: (event: { event_type: string }) => void) {
      if (event === "session_stopped") {
        this.sessionStoppedHandler = handler;
      }
      return this;
    }

    attach() {}

    interrupt() {}

    async start() {
      if (sdkMocks.startBehavior === "stop_then_resolve") {
        this.sessionStoppedHandler?.({ event_type: "session_stopped" });
        return;
      }
      throw new Error("SDK startup failed");
    }

    stop = sdkMocks.stop;
  }

  return {
    AgentEventsEnum: {
      USER_SPEAK_STARTED: "user_speak_started",
      USER_SPEAK_ENDED: "user_speak_ended",
      AVATAR_SPEAK_STARTED: "avatar_speak_started",
      AVATAR_SPEAK_ENDED: "avatar_speak_ended",
      USER_TRANSCRIPTION: "user_transcription",
      AVATAR_TRANSCRIPTION: "avatar_transcription",
      ELEVENLABS_AGENT_EVENT: "elevenlabs_agent_event",
      SESSION_STOPPED: "session_stopped",
    },
    LiveAvatarSession: FailingLiveAvatarSession,
    SessionEvent: {
      SESSION_STREAM_READY: "session_stream_ready",
      SESSION_DISCONNECTED: "session_disconnected",
    },
    VoiceChatEvent: {
      STATE_CHANGED: "state_changed",
      MUTED: "muted",
      UNMUTED: "unmuted",
    },
    VoiceChatState: { ACTIVE: "ACTIVE" },
  };
});

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let render: typeof import("@testing-library/react").render;

type LiveCall = ReturnType<typeof useLiveAvatarSession>;
let liveCall: LiveCall;

function LiveCallProbe({
  failStart,
  endSession,
}: {
  failStart: (realtimeSessionId: string) => Promise<unknown>;
  endSession: (realtimeSessionId: string) => Promise<unknown>;
}) {
  liveCall = useLiveAvatarSession("avatar-1", {
    startSession: async () => ({
      voiceSession: {
        conversationId: "conversation-1",
        realtimeSessionId: "realtime-1",
        sessionToken: "provider-token",
        expiresAt: null,
      },
    }),
    failStart,
    endSession,
  });
  return <output>{liveCall.status}</output>;
}

describe("LiveAvatar startup failure lifecycle", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);

    ({ act, cleanup, render } = await import("@testing-library/react"));
  });

  beforeEach(() => {
    sdkMocks.stop.mockClear();
    sdkMocks.startBehavior = "throw";
  });

  afterEach(() => cleanup());

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("retries the error transition without falling back to the normal end endpoint", async () => {
    const failStart = vi
      .fn<(realtimeSessionId: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({});
    const endSession = vi.fn(async () => ({}));

    render(<LiveCallProbe failStart={failStart} endSession={endSession} />);
    await act(async () => liveCall.start());

    expect(liveCall.status).toBe("error");
    expect(liveCall.hasPendingEnd).toBe(true);
    expect(failStart).toHaveBeenCalledOnce();
    expect(endSession).not.toHaveBeenCalled();
    expect(sdkMocks.stop).toHaveBeenCalledOnce();

    await act(async () => liveCall.end());

    expect(liveCall.status).toBe("ended");
    expect(failStart).toHaveBeenCalledTimes(2);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("treats SESSION_STOPPED before activation confirmation as a startup failure", async () => {
    sdkMocks.startBehavior = "stop_then_resolve";
    const failStart = vi.fn(async () => ({}));
    const endSession = vi.fn(async () => ({}));

    render(<LiveCallProbe failStart={failStart} endSession={endSession} />);
    await act(async () => liveCall.start());

    expect(liveCall.status).toBe("error");
    expect(liveCall.hasPendingEnd).toBe(false);
    expect(failStart).toHaveBeenCalledWith("realtime-1");
    expect(endSession).not.toHaveBeenCalled();
    expect(sdkMocks.stop).toHaveBeenCalledOnce();
  });
});
