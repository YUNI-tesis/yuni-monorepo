import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveAvatarSession } from "./hooks/useLiveAvatarSession";
import { LIVE_AVATAR_TRACE_LIMIT } from "./lib/live-avatar-event-trace";

type MockSession = { emit: (event: string, payload?: Record<string, unknown>) => void };
const sdk = vi.hoisted(() => ({
  sessions: [] as MockSession[],
  publishData: vi.fn<(data: Uint8Array, options: { reliable: boolean; topic: string }) => Promise<void>>(
    async () => undefined
  ),
  stop: vi.fn(async () => undefined),
}));

vi.mock("@heygen/liveavatar-web-sdk", () => {
  class LiveAvatarSession {
    private handlers = new Map<string, Array<(payload?: Record<string, unknown>) => void>>();
    readonly voiceChat = {
      isMuted: false,
      state: "ACTIVE",
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      mute: vi.fn(async () => undefined),
      unmute: vi.fn(async () => undefined),
    };
    readonly room = { localParticipant: { publishData: sdk.publishData } };
    constructor() {
      sdk.sessions.push(this);
    }
    on(event: string, handler: (payload?: Record<string, unknown>) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit(event: string, payload?: Record<string, unknown>) {
      this.handlers.get(event)?.forEach((handler) => handler(payload));
    }
    attach() {}
    interrupt() {}
    async start() {}
    stop = sdk.stop;
  }
  return {
    LiveAvatarSession,
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
    SessionEvent: { SESSION_STREAM_READY: "stream_ready" },
    VoiceChatEvent: { STATE_CHANGED: "state_changed", MUTED: "muted", UNMUTED: "unmuted" },
    VoiceChatState: { ACTIVE: "ACTIVE" },
  };
});

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let render: typeof import("@testing-library/react").render;
let liveCall: ReturnType<typeof useLiveAvatarSession>;
const endSession = vi.fn(async () => ({}));

function Probe({ profile }: { profile?: "standard" | "natural" | undefined }) {
  liveCall = useLiveAvatarSession("avatar-1", {
    startSession: async () => ({
      voiceSession: {
        conversationId: "conversation-1",
        realtimeSessionId: "realtime-1",
        sessionToken: "private-session-token",
        expiresAt: null,
        ...(profile ? { conversationProfile: profile } : {}),
      },
    }),
    endSession,
  });
  return <output>{liveCall.status}</output>;
}

function emit(type: string, data: Record<string, unknown> = {}, session = sdk.sessions.at(-1)!) {
  act(() => session.emit(type, { event_type: type, ...data }));
}

function eleven(type: string, payload: Record<string, unknown>, session = sdk.sessions.at(-1)!) {
  emit(
    "elevenlabs_agent_event",
    {
      elevenlabs_event_type: type,
      data: { [`${type}_event`]: payload },
    },
    session
  );
}

function transcript(id: string, text: string) {
  emit("avatar_transcription", { event_id: id, text });
}

describe("LiveAvatar one-to-one conversation lifecycle", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    ({ act, cleanup, render } = await import("@testing-library/react"));
  });
  beforeEach(() => {
    sdk.sessions.length = 0;
    sdk.publishData.mockClear();
    sdk.stop.mockClear();
    endSession.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("lets the natural pilot handle interruptions natively while keeping the microphone active", async () => {
    render(<Probe profile="natural" />);
    await act(async () => liveCall.start());
    expect(liveCall.status).toBe("active");
    expect(liveCall.isMuted).toBe(false);
    emit("avatar_speak_started");
    eleven("interruption", { event_id: 1 });
    expect(liveCall.conversationState).toBe("interrupted");
    expect(sdk.publishData).not.toHaveBeenCalled();
    expect(liveCall.isMuted).toBe(false);
  });

  it.each([undefined, "standard"] as const)(
    "preserves the contextual interruption update for profile %s",
    async (profile) => {
      render(<Probe profile={profile} />);
      await act(async () => liveCall.start());
      eleven("interruption", { event_id: 1 });
      expect(sdk.publishData).toHaveBeenCalledOnce();
      const command = JSON.parse(new TextDecoder().decode(sdk.publishData.mock.calls[0]![0]));
      expect(command.elevenlabs_event_type).toBe("contextual_update");
      expect(liveCall.diagnostics.eventTimeline).toBeUndefined();
    }
  );

  it("corrects the identified earlier response without overwriting a newer turn, and saves the correction", async () => {
    render(<Probe profile="natural" />);
    await act(async () => liveCall.start());
    transcript("live-avatar-a", "Te cuento la historia completa.");
    eleven("agent_response", { event_id: 11, agent_response: "Te cuento la historia completa." });
    transcript("live-avatar-b", "Claro, seguimos con otro tema.");
    eleven("agent_response", { event_id: 12, agent_response: "Claro, seguimos con otro tema." });
    eleven("agent_response_correction", {
      event_id: 11,
      original_agent_response: "Claro, seguimos con otro tema.",
      corrected_agent_response: "Incorrecto.",
    });
    eleven("agent_response_correction", {
      event_id: 11,
      original_agent_response: "Te cuento la historia completa.",
      corrected_agent_response: "Te cuento...",
    });
    // A replay of the provider's original text must not restore the removed tail.
    transcript("live-avatar-a", "Te cuento la historia completa.");
    eleven("agent_response_correction", {
      event_id: 11,
      original_agent_response: "Te cuento la historia completa.",
      corrected_agent_response: "Te cuento la historia completa.",
    });
    expect(liveCall.transcript.map((entry) => entry.content)).toEqual([
      "Te cuento...",
      "Claro, seguimos con otro tema.",
    ]);
    await act(async () => liveCall.end());
    expect(endSession).toHaveBeenCalledWith("realtime-1", [
      expect.objectContaining({
        content: "Te cuento...",
        metadata: expect.objectContaining({ interrupted: true }),
      }),
      expect.objectContaining({ content: "Claro, seguimos con otro tema." }),
    ]);
  });

  it("reconciles corrections delivered before final transcription and removes fully interrupted text", async () => {
    render(<Probe profile="natural" />);
    await act(async () => liveCall.start());
    eleven("agent_response_correction", {
      event_id: 11,
      original_agent_response: "No llegó a escucharse.",
      corrected_agent_response: "",
    });
    transcript("live-avatar-a", "No llegó a escucharse.");
    transcript("live-avatar-b", "Esta respuesta sí.");
    expect(liveCall.transcript.map((entry) => entry.content)).toEqual(["Esta respuesta sí."]);
  });

  it("does not guess among repeated text or apply an old unidentified correction to a new turn", async () => {
    render(<Probe profile="natural" />);
    await act(async () => liveCall.start());
    transcript("a", "Claro.");
    eleven("agent_response_correction", {
      original_agent_response: "Claro.",
      corrected_agent_response: "Cla...",
    });
    transcript("b", "Claro.");
    eleven("agent_response_correction", {
      original_agent_response: "Claro.",
      corrected_agent_response: "Cl...",
    });
    eleven("agent_response_correction", {
      event_id: 11,
      original_agent_response: "Claro.",
      corrected_agent_response: "Cl...",
    });
    transcript("c", "Repetido.");
    transcript("d", "Repetido.");
    eleven("agent_response_correction", {
      event_id: 44,
      original_agent_response: "Repetido.",
      corrected_agent_response: "Re...",
    });
    expect(liveCall.transcript.map((entry) => entry.content)).toEqual([
      "Cla...",
      "Claro.",
      "Repetido.",
      "Repetido.",
    ]);
  });

  it("keeps a bounded timeline of provider event receipt gaps without recording payloads", async () => {
    let time = 100;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    render(<Probe profile="natural" />);
    await act(async () => liveCall.start());
    emit("user_speak_ended");
    time = 450;
    emit("avatar_speak_started");
    time = 500;
    eleven("interruption", { event_id: 11, private: "private-payload" });
    time = 630;
    emit("avatar_speak_ended");
    expect(liveCall.diagnostics.eventTimeline).toEqual([
      { event: "user_speech_ended", observedAtMs: 100 },
      { event: "avatar_speech_started", observedAtMs: 450, userEndToAvatarStartEventGapMs: 350 },
      { event: "interruption", observedAtMs: 500 },
      { event: "avatar_speech_ended", observedAtMs: 630, interruptionToAvatarEndEventGapMs: 130 },
    ]);
    for (let index = 0; index < LIVE_AVATAR_TRACE_LIMIT; index += 1) emit("user_speak_started");
    expect(liveCall.diagnostics.eventTimeline).toHaveLength(LIVE_AVATAR_TRACE_LIMIT);
    expect(JSON.stringify(liveCall.diagnostics)).not.toMatch(/private-payload|private-session-token/);
    await act(async () => liveCall.end());
    const previous = sdk.sessions[0]!;
    await act(async () => liveCall.start());
    eleven("interruption", { event_id: 11 }, previous);
    expect(liveCall.diagnostics.eventTimeline).toBeUndefined();
    expect(liveCall.transcript).toEqual([]);
    expect(liveCall.conversationState).toBe("listening");
  });
});
