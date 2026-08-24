import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  formatContextStatusLabel,
  formatInteractionCountdown,
  formatConversationTitle,
  formatSharedCallPrivacyDescription,
  getSharedCallConsentStorageKey,
  InteractCallControls,
  InteractConversationHistoryPanel,
  InteractDebugPanel,
  readRememberedPrivacyChoice,
  rememberPrivacyChoiceForAvatar,
  shouldShowInteractDiagnostics,
} from "./components/interact/InteractCall";
import { CallParticipantStage } from "./components/interact/CallExperience";
import {
  dismissLiveAvatarSessionError,
  formatVoiceSessionEndError,
  formatVoiceSessionStartError,
  hasLiveAvatarSessionExpired,
  hasPendingLiveAvatarEnd,
  interruptActiveLiveAvatarSession,
  isLiveAvatarLifecycleCurrent,
  recoverLiveAvatarStateAfterPageRestore,
  type LiveAvatarDiagnostics,
  type LiveAvatarSessionState,
} from "./hooks/useLiveAvatarSession";
import { ApiClientError } from "./lib/api/http-client";
import type { ApiConversationDetail, ApiConversationSummary } from "./lib/api/avatar-api";

const diagnostics: LiveAvatarDiagnostics = {
  voiceChatState: "ACTIVE",
  microphoneLevel: 0.25,
  eventCount: 2,
  lastEventType: "event",
  lastElevenLabsEventType: "agent_response",
  elevenLabsConversationId: "conversation-1",
  textProbeStatus: "idle",
  textProbeError: null,
};

const conversationSummary: ApiConversationSummary = {
  id: "conversation-1",
  avatarAgentId: "avatar-1",
  title: "Practica de derivadas",
  mode: "voice",
  status: "ended",
  lastMessageAt: "2026-06-21T13:00:00.000Z",
  createdAt: "2026-06-21T12:55:00.000Z",
  updatedAt: "2026-06-21T13:00:00.000Z",
};

const conversationDetail: ApiConversationDetail = {
  ...conversationSummary,
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "Hola, quiero practicar derivadas.",
      metadata: null,
      createdAt: "2026-06-21T12:56:00.000Z",
    },
    {
      id: "message-2",
      role: "assistant",
      content: "Perfecto, empecemos con una regla simple.",
      metadata: null,
      createdAt: "2026-06-21T12:56:10.000Z",
    },
  ],
};

describe("Interact contextual UI", () => {
  it("formats user-facing context states", () => {
    expect(formatContextStatusLabel("ready")).toBe("Listo");
    expect(formatContextStatusLabel("processing")).toBe("Procesando");
    expect(formatContextStatusLabel("failed")).toBe("No se pudo actualizar");
  });

  it("formats shared countdown and concrete session-limit errors", () => {
    expect(formatInteractionCountdown(60)).toBe("1:00");
    expect(
      formatVoiceSessionStartError(
        new ApiClientError("limited", 429, "RATE_LIMITED", "SHARE_SESSION_COUNT_LIMIT", 120)
      )
    ).toBe("Ya alcanzaste la cantidad de llamadas permitidas.");
    expect(
      formatVoiceSessionStartError(new ApiClientError("active", 409, "CONFLICT", "ACTIVE_SESSION_EXISTS"))
    ).toContain("llamada activa");
    expect(formatVoiceSessionStartError(new TypeError("Failed to fetch"))).toBe(
      "No pudimos conectar la llamada. Intentá nuevamente."
    );
    expect(formatVoiceSessionEndError(new Error("provider token leaked"))).toBe(
      "No pudimos guardar la llamada. Reintentá el guardado."
    );
  });

  it("mentions usage limits in consent only when the participant has configured limits", () => {
    expect(formatSharedCallPrivacyDescription(null)).not.toContain("Límites");
    expect(
      formatSharedCallPrivacyDescription({
        maxSessionDurationSeconds: 30,
        maxSessionsPer24Hours: null,
      })
    ).toContain("Límites: 30 s por llamada.");
  });

  it("scopes remembered privacy choices by user and avatar", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    const firstKey = getSharedCallConsentStorageKey("user-1", "avatar-1");
    const otherAvatarKey = getSharedCallConsentStorageKey("user-1", "avatar-2");
    const otherUserKey = getSharedCallConsentStorageKey("user-2", "avatar-1");

    expect(readRememberedPrivacyChoice(firstKey)).toBe(false);
    rememberPrivacyChoiceForAvatar(firstKey);
    expect(readRememberedPrivacyChoice(firstKey)).toBe(true);
    expect(readRememberedPrivacyChoice(otherAvatarKey)).toBe(false);
    expect(readRememberedPrivacyChoice(otherUserKey)).toBe(false);

    vi.unstubAllGlobals();
  });

  it("treats unavailable local storage as a non-blocking preference failure", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    const key = getSharedCallConsentStorageKey("user-1", "avatar-1");
    expect(readRememberedPrivacyChoice(key)).toBe(false);
    expect(() => rememberPrivacyChoiceForAvatar(key)).not.toThrow();

    vi.unstubAllGlobals();
  });

  it("renders active call controls as three accessible icon-only buttons in the expected order", () => {
    const html = renderToStaticMarkup(
      createElement(InteractCallControls, {
        status: "active",
        isMuted: false,
        canStart: false,
        onStart: vi.fn(),
        onToggleMute: vi.fn(),
        onInterrupt: vi.fn(),
        onEnd: vi.fn(),
      })
    );

    const microphoneIndex = html.indexOf('aria-label="Silenciar micrófono"');
    const interruptIndex = html.indexOf('aria-label="Interrumpir avatar"');
    const endIndex = html.indexOf('aria-label="Finalizar llamada"');

    expect(html.match(/<button/g)).toHaveLength(3);
    expect(microphoneIndex).toBeGreaterThan(-1);
    expect(interruptIndex).toBeGreaterThan(microphoneIndex);
    expect(endIndex).toBeGreaterThan(interruptIndex);
    expect(html).toContain("<svg");
    expect(html).not.toContain("controlLabel");
    expect(html).not.toContain("Historial");
    expect(html).not.toContain("Transcript");
  });

  it("uses the same adaptive stage for one or several participants", () => {
    const createParticipant = (id: string, name: string) => ({
      id,
      name,
      status: "ready" as const,
      statusLabel: "Listo",
      attachMediaElement: vi.fn(),
    });
    const single = renderToStaticMarkup(
      createElement(CallParticipantStage, {
        label: "Llamada individual",
        participants: [createParticipant("avatar-1", "Ada")],
        dock: createElement("span", null, "Controles"),
      })
    );
    const group = renderToStaticMarkup(
      createElement(CallParticipantStage, {
        label: "Llamada grupal",
        participants: [
          { ...createParticipant("avatar-1", "Ada"), mediaMuted: true },
          { ...createParticipant("avatar-2", "Alan"), mediaMuted: true },
          { ...createParticipant("avatar-3", "Grace"), mediaMuted: true },
        ],
        dock: createElement("span", null, "Controles"),
      })
    );

    expect(single).toContain('data-count="1"');
    expect(single.match(/<video/g)).toHaveLength(1);
    expect(single).not.toContain('muted=""');
    expect(group).toContain('data-count="3"');
    expect(group.match(/<video/g)).toHaveLength(3);
    expect(group.match(/muted=""/g)).toHaveLength(3);
    expect(group.indexOf("Ada")).toBeLessThan(group.indexOf("Alan"));
    expect(group.indexOf("Alan")).toBeLessThan(group.indexOf("Grace"));
  });

  it.each([
    ["idle", true, "Iniciar llamada", false],
    ["starting", false, "Iniciando llamada", true],
    ["active", false, "Finalizar llamada", false],
    ["ending", false, "Finalizando llamada", true],
    ["ended", true, "Iniciar llamada", false],
    ["error", true, "Iniciar llamada", false],
  ] as const)(
    "renders the combined call action for %s",
    (status, canStart, expectedLabel, expectDisabled) => {
      const html = renderToStaticMarkup(
        createElement(InteractCallControls, {
          status,
          isMuted: false,
          canStart,
          onStart: vi.fn(),
          onToggleMute: vi.fn(),
          onInterrupt: vi.fn(),
          onEnd: vi.fn(),
        })
      );
      const callButton = html.slice(html.lastIndexOf("<button"));

      expect(callButton).toContain(`aria-label="${expectedLabel}"`);
      expect(callButton.includes(' disabled=""')).toBe(expectDisabled);
    }
  );

  it("shows the muted microphone as crossed out and visually red", () => {
    const html = renderToStaticMarkup(
      createElement(InteractCallControls, {
        status: "active",
        isMuted: true,
        canStart: false,
        onStart: vi.fn(),
        onToggleMute: vi.fn(),
        onInterrupt: vi.fn(),
        onEnd: vi.fn(),
      })
    );

    expect(html).toContain('aria-label="Activar micrófono"');
    expect(html).toContain('data-state="muted"');
    expect(html).toContain("controlButtonMuted");
    expect(html).not.toContain('aria-label="Silenciar micrófono"');
  });

  it("interrupts only active LiveAvatar sessions", () => {
    const interrupt = vi.fn();
    const session = { interrupt };

    expect(interruptActiveLiveAvatarSession(session, "active")).toBe(true);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(interruptActiveLiveAvatarSession(session, "ending")).toBe(false);
    expect(interruptActiveLiveAvatarSession(null, "active")).toBe(false);
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed session pending after its toast is dismissed", () => {
    const state: LiveAvatarSessionState = {
      status: "error",
      error: "No pudimos guardar la llamada.",
      isMuted: false,
      isUserSpeaking: false,
      isAvatarSpeaking: false,
      conversationState: "idle",
      voiceSession: {
        conversationId: "conversation-1",
        realtimeSessionId: "realtime-1",
        sessionToken: "temporary-token",
        expiresAt: null,
      },
      remainingSeconds: null,
      endedByLimit: false,
      transcript: [],
      diagnostics,
    };

    expect(hasPendingLiveAvatarEnd(state)).toBe(true);
    expect(dismissLiveAvatarSessionError(state)).toMatchObject({
      status: "error",
      error: null,
      voiceSession: state.voiceSession,
    });
    expect(dismissLiveAvatarSessionError({ ...state, voiceSession: null })).toMatchObject({
      status: "idle",
      error: null,
      voiceSession: null,
    });
  });

  it("recognizes a provider stop that arrives at the exact session deadline", () => {
    expect(
      hasLiveAvatarSessionExpired("2026-08-19T12:00:00.000Z", Date.parse("2026-08-19T12:00:00.000Z"))
    ).toBe(true);
    expect(
      hasLiveAvatarSessionExpired("2026-08-19T12:00:01.000Z", Date.parse("2026-08-19T12:00:00.000Z"))
    ).toBe(false);
    expect(hasLiveAvatarSessionExpired(null)).toBe(false);
  });

  it("does not restore a phantom active call after returning from page cache", () => {
    const state: LiveAvatarSessionState = {
      status: "active",
      error: null,
      isMuted: false,
      isUserSpeaking: true,
      isAvatarSpeaking: false,
      conversationState: "listening",
      voiceSession: {
        conversationId: "conversation-1",
        realtimeSessionId: "realtime-1",
        sessionToken: "temporary-token",
        expiresAt: "2026-08-21T12:30:00.000Z",
      },
      remainingSeconds: 30,
      endedByLimit: false,
      transcript: [],
      diagnostics,
    };

    expect(recoverLiveAvatarStateAfterPageRestore(state)).toMatchObject({
      status: "ended",
      voiceSession: null,
      remainingSeconds: null,
      isUserSpeaking: false,
      conversationState: "idle",
    });
    expect(
      recoverLiveAvatarStateAfterPageRestore({
        ...state,
        status: "error",
        error: "No pudimos guardar la conversación.",
      })
    ).toMatchObject({
      status: "ended",
      error: null,
      voiceSession: null,
    });
  });

  it("invalidates asynchronous starts across a page lifecycle transition", () => {
    expect(isLiveAvatarLifecycleCurrent(true, 3, 3)).toBe(true);
    expect(isLiveAvatarLifecycleCurrent(false, 3, 3)).toBe(false);
    expect(isLiveAvatarLifecycleCurrent(true, 4, 3)).toBe(false);
  });

  it("renders history side panel content with literal chat details", () => {
    const html = renderToStaticMarkup(
      createElement(InteractConversationHistoryPanel, {
        avatarName: "Tutor Demo",
        summaries: [conversationSummary],
        summariesStatus: "ready",
        summariesError: null,
        selectedConversationId: "conversation-1",
        detail: conversationDetail,
        detailStatus: "ready",
        detailError: null,
        onRefresh: vi.fn(),
        onSelectConversation: vi.fn(),
      })
    );

    expect(html).toContain("Chats guardados");
    expect(html).toContain("Practica de derivadas");
    expect(html).toContain("Transcripcion literal");
    expect(html).toContain("Hola, quiero practicar derivadas.");
    expect(html).toContain("Perfecto, empecemos con una regla simple.");
  });

  it("shows the actual speaker name in a multi-participant history", () => {
    const html = renderToStaticMarkup(
      createElement(InteractConversationHistoryPanel, {
        avatarName: "Equipo docente",
        summaries: [conversationSummary],
        summariesStatus: "ready",
        summariesError: null,
        selectedConversationId: "conversation-1",
        detail: {
          id: "conversation-1",
          title: "Presentaciones",
          messages: [
            {
              id: "message-group-1",
              role: "assistant",
              content: "Soy Juana, tutora de contabilidad.",
              speakerName: "Juana Balance",
            },
          ],
        },
        detailStatus: "ready",
        detailError: null,
        onRefresh: vi.fn(),
        onSelectConversation: vi.fn(),
      })
    );

    expect(html).toContain("Juana Balance");
    expect(html).toContain("Soy Juana, tutora de contabilidad.");
  });

  it("renders controlled empty history state", () => {
    const html = renderToStaticMarkup(
      createElement(InteractConversationHistoryPanel, {
        avatarName: "Tutor Demo",
        summaries: [],
        summariesStatus: "ready",
        summariesError: null,
        selectedConversationId: null,
        detail: null,
        detailStatus: "idle",
        detailError: null,
        onRefresh: vi.fn(),
        onSelectConversation: vi.fn(),
      })
    );

    expect(html).toContain("Todavia no hay chats");
    expect(html).toContain("Elegí un chat");
  });

  it("falls back to avatar name for untitled chats", () => {
    expect(formatConversationTitle(null, "Tutor Demo")).toBe("Llamada con Tutor Demo");
  });

  it("keeps technical diagnostics out of normal UI", () => {
    const html = renderToStaticMarkup(
      createElement(InteractDebugPanel, {
        isVisible: shouldShowInteractDiagnostics("test"),
        diagnostics,
        callStatus: "active",
        providerSyncError: "provider failed",
        onSendTextProbe: vi.fn(),
      })
    );

    expect(shouldShowInteractDiagnostics("development")).toBe(true);
    expect(shouldShowInteractDiagnostics("production")).toBe(false);
    expect(html).not.toContain("Diagnostico tecnico");
    expect(html).not.toContain("provider failed");
  });
});
