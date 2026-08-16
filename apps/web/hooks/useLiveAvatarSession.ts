"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
} from "@heygen/liveavatar-web-sdk";
import {
  endVoiceSession,
  startVoiceSession,
  type ApiVoiceSession,
  type VoiceSessionTranscriptEntry,
} from "../lib/api/avatar-api";
import { ApiClientError } from "../lib/api/http-client";

export type LiveAvatarSessionStatus = "idle" | "starting" | "active" | "ending" | "ended" | "error";

export type LiveAvatarConversationState = "idle" | "listening" | "thinking" | "speaking" | "interrupted";

export type LiveAvatarTranscriptEntry = VoiceSessionTranscriptEntry & {
  id: string;
};

export type LiveAvatarVoiceSession = Pick<
  ApiVoiceSession,
  "conversationId" | "realtimeSessionId" | "sessionToken" | "sessionId"
>;

export type LiveAvatarDiagnostics = {
  voiceChatState: string;
  microphoneLevel: number | null;
  eventCount: number;
  lastEventType: string | null;
  lastElevenLabsEventType: string | null;
  elevenLabsConversationId: string | null;
  textProbeStatus: "idle" | "sending" | "sent" | "error";
  textProbeError: string | null;
};

export type LiveAvatarSessionState = {
  status: LiveAvatarSessionStatus;
  error: string | null;
  isMuted: boolean;
  isUserSpeaking: boolean;
  isAvatarSpeaking: boolean;
  conversationState: LiveAvatarConversationState;
  voiceSession: LiveAvatarVoiceSession | null;
  transcript: LiveAvatarTranscriptEntry[];
  diagnostics: LiveAvatarDiagnostics;
};

export type UseLiveAvatarSessionOptions = {
  onEnded?: () => void | Promise<void>;
  onStarted?: (realtimeSessionId: string) => void | Promise<void>;
  startSession?: (sessionKey: string) => Promise<{ voiceSession: LiveAvatarVoiceSession }>;
  endSession?: (realtimeSessionId: string, transcript: VoiceSessionTranscriptEntry[]) => Promise<unknown>;
  endSessionOnUnload?: (realtimeSessionId: string, transcript: VoiceSessionTranscriptEntry[]) => void;
  formatStartError?: (error: unknown, fallback: (error: unknown) => string) => string;
};

const initialDiagnostics: LiveAvatarDiagnostics = {
  voiceChatState: "INACTIVE",
  microphoneLevel: null,
  eventCount: 0,
  lastEventType: null,
  lastElevenLabsEventType: null,
  elevenLabsConversationId: null,
  textProbeStatus: "idle",
  textProbeError: null,
};

const initialState: LiveAvatarSessionState = {
  status: "idle",
  error: null,
  isMuted: false,
  isUserSpeaking: false,
  isAvatarSpeaking: false,
  conversationState: "idle",
  voiceSession: null,
  transcript: [],
  diagnostics: initialDiagnostics,
};

export function useLiveAvatarSession(avatarId: string, options: UseLiveAvatarSessionOptions = {}) {
  const [state, setState] = useState<LiveAvatarSessionState>(initialState);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const voiceSessionRef = useRef<LiveAvatarVoiceSession | null>(null);
  const optionsRef = useRef(options);
  const transcriptRef = useRef<LiveAvatarTranscriptEntry[]>([]);
  const eventIdsRef = useRef(new Set<string>());
  const endingRef = useRef(false);
  const diagnosticsCleanupRef = useRef<(() => void) | null>(null);
  const interruptionResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const closeCurrentSession = useCallback(async (options: { includeTranscript: boolean }) => {
    const currentSession = sessionRef.current;
    const currentVoiceSession = voiceSessionRef.current;

    cleanupDiagnostics(diagnosticsCleanupRef);
    clearInterruptionReset(interruptionResetTimeoutRef);
    sessionRef.current = null;

    if (currentSession) {
      await currentSession.stop().catch(() => undefined);
    }

    if (currentVoiceSession) {
      await (optionsRef.current.endSession ?? endVoiceSession)(
        currentVoiceSession.realtimeSessionId,
        options.includeTranscript
          ? transcriptRef.current.map(({ role, content, metadata }) => ({
              role,
              content,
              ...(metadata ? { metadata } : {}),
            }))
          : []
      );
      voiceSessionRef.current = null;
    }
  }, []);

  const closeCurrentSessionOnUnload = useCallback(() => {
    const currentSession = sessionRef.current;
    const currentVoiceSession = voiceSessionRef.current;
    const endSessionOnUnload = optionsRef.current.endSessionOnUnload;

    cleanupDiagnostics(diagnosticsCleanupRef);
    clearInterruptionReset(interruptionResetTimeoutRef);
    sessionRef.current = null;
    voiceSessionRef.current = null;

    if (currentVoiceSession && endSessionOnUnload) {
      endSessionOnUnload(
        currentVoiceSession.realtimeSessionId,
        transcriptRef.current.map(({ role, content }) => ({ role, content }))
      );
    }
    if (currentSession) {
      void currentSession.stop().catch(() => undefined);
    }
  }, []);

  const appendTranscript = useCallback((entry: LiveAvatarTranscriptEntry) => {
    if (eventIdsRef.current.has(entry.id)) {
      return;
    }

    eventIdsRef.current.add(entry.id);
    transcriptRef.current = [...transcriptRef.current, entry];
    setState((current) => ({ ...current, transcript: transcriptRef.current }));
  }, []);

  const attachMediaElement = useCallback((element: HTMLMediaElement | null) => {
    mediaElementRef.current = element;

    if (element && sessionRef.current) {
      sessionRef.current.attach(element);
    }
  }, []);

  const markInterrupted = useCallback(() => {
    clearInterruptionReset(interruptionResetTimeoutRef);
    setState((current) => ({
      ...current,
      error: null,
      conversationState: "interrupted",
      isAvatarSpeaking: false,
    }));
    interruptionResetTimeoutRef.current = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        conversationState: current.status === "active" ? "listening" : current.conversationState,
      }));
      interruptionResetTimeoutRef.current = null;
    }, 1400);
  }, []);

  const end = useCallback(async () => {
    const currentVoiceSession = voiceSessionRef.current;

    if (endingRef.current || !currentVoiceSession) {
      return;
    }

    endingRef.current = true;
    setState((current) => ({ ...current, status: "ending", error: null }));

    try {
      await closeCurrentSession({ includeTranscript: true });
      setState((current) => ({
        ...current,
        status: "ended",
        isUserSpeaking: false,
        isAvatarSpeaking: false,
        conversationState: "idle",
        voiceSession: null,
      }));
      void optionsRef.current.onEnded?.();
    } catch (error) {
      endingRef.current = false;
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "No pudimos cerrar la llamada.",
      }));
    }
  }, [closeCurrentSession]);

  const start = useCallback(async () => {
    if (state.status === "starting" || state.status === "active") {
      return;
    }

    transcriptRef.current = [];
    eventIdsRef.current = new Set<string>();
    endingRef.current = false;
    setState({ ...initialState, status: "starting" });

    let liveAvatarSession: LiveAvatarSession | null = null;

    try {
      const { voiceSession } = await (optionsRef.current.startSession ?? startVoiceSession)(avatarId);
      liveAvatarSession = new LiveAvatarSession(voiceSession.sessionToken, {
        voiceChat: { defaultMuted: false },
      });
      const session = liveAvatarSession;

      voiceSessionRef.current = voiceSession;
      sessionRef.current = session;
      registerSessionEvents(session, {
        appendTranscript,
        attachCurrentMediaElement: () => {
          if (mediaElementRef.current) {
            session.attach(mediaElementRef.current);
          }
        },
        end,
        markInterrupted,
        setState,
      });

      await session.start();
      await ensureVoiceChatStarted(session);
      await optionsRef.current.onStarted?.(voiceSession.realtimeSessionId);
      diagnosticsCleanupRef.current = startMicrophoneLevelProbe(session, setState);

      setState((current) => ({
        ...current,
        status: "active",
        voiceSession,
        error: null,
        isMuted: session.voiceChat.isMuted,
        conversationState: "listening",
        diagnostics: {
          ...current.diagnostics,
          voiceChatState: String(session.voiceChat.state),
        },
      }));
    } catch (error) {
      if (liveAvatarSession && !sessionRef.current) {
        await liveAvatarSession.stop().catch(() => undefined);
      }

      if (voiceSessionRef.current || sessionRef.current) {
        endingRef.current = true;
        await closeCurrentSession({ includeTranscript: false }).catch(() => undefined);
        endingRef.current = false;
      } else {
        cleanupDiagnostics(diagnosticsCleanupRef);
        clearInterruptionReset(interruptionResetTimeoutRef);
      }

      setState((current) => ({
        ...current,
        status: "error",
        conversationState: "idle",
        error: optionsRef.current.formatStartError
          ? optionsRef.current.formatStartError(error, formatVoiceSessionStartError)
          : formatVoiceSessionStartError(error),
      }));
    }
  }, [appendTranscript, avatarId, end, markInterrupted, state.status]);

  useEffect(() => {
    const cleanup = () => {
      if (endingRef.current || (!sessionRef.current && !voiceSessionRef.current)) {
        return;
      }

      endingRef.current = true;
      if (optionsRef.current.endSessionOnUnload) {
        closeCurrentSessionOnUnload();
        return;
      }
      void closeCurrentSession({ includeTranscript: true }).finally(() => {
        endingRef.current = false;
      });
    };

    window.addEventListener("pagehide", cleanup);

    return () => {
      window.removeEventListener("pagehide", cleanup);
      cleanup();
    };
  }, [closeCurrentSession, closeCurrentSessionOnUnload]);

  const toggleMute = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) {
      return;
    }

    await ensureVoiceChatStarted(session);

    if (session.voiceChat.isMuted) {
      await session.voiceChat.unmute();
    } else {
      await session.voiceChat.mute();
    }

    setState((current) => ({ ...current, isMuted: session.voiceChat.isMuted }));
  }, []);

  const interrupt = useCallback(() => {
    const session = sessionRef.current;

    try {
      if (interruptActiveLiveAvatarSession(session, state.status)) {
        markInterrupted();
      }
    } catch {
      setState((current) => ({
        ...current,
        error: "No pudimos interrumpir al avatar. Intentá nuevamente.",
      }));
    }
  }, [markInterrupted, state.status]);

  const sendTextProbe = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) {
      return;
    }

    setState((current) => ({
      ...current,
      diagnostics: {
        ...current.diagnostics,
        textProbeStatus: "sending",
        textProbeError: null,
      },
    }));

    try {
      await sendElevenLabsUserMessage(session, "Hola, podes responderme con una frase corta?");
      setState((current) => ({
        ...current,
        diagnostics: {
          ...current.diagnostics,
          textProbeStatus: "sent",
          textProbeError: null,
        },
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        diagnostics: {
          ...current.diagnostics,
          textProbeStatus: "error",
          textProbeError: error instanceof Error ? error.message : "No pudimos enviar el mensaje de prueba.",
        },
      }));
    }
  }, []);

  return {
    ...state,
    attachMediaElement,
    start,
    end,
    toggleMute,
    interrupt,
    sendTextProbe,
  };
}

export function interruptActiveLiveAvatarSession(
  session: Pick<LiveAvatarSession, "interrupt"> | null,
  status: LiveAvatarSessionStatus
) {
  if (!session || status !== "active") {
    return false;
  }

  session.interrupt();
  return true;
}

type RegisterSessionEventsOptions = {
  appendTranscript: (entry: LiveAvatarTranscriptEntry) => void;
  attachCurrentMediaElement: () => void;
  end: () => Promise<void>;
  markInterrupted: () => void;
  setState: Dispatch<SetStateAction<LiveAvatarSessionState>>;
};

function registerSessionEvents(session: LiveAvatarSession, options: RegisterSessionEventsOptions) {
  session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (voiceChatState) => {
    options.setState((current) => ({
      ...current,
      isMuted: voiceChatState !== VoiceChatState.ACTIVE || session.voiceChat.isMuted,
      diagnostics: {
        ...current.diagnostics,
        voiceChatState,
      },
    }));
  });

  session.voiceChat.on(VoiceChatEvent.MUTED, () => {
    options.setState((current) => ({ ...current, isMuted: true }));
  });

  session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
    options.setState((current) => ({ ...current, isMuted: false }));
  });

  session.on(SessionEvent.SESSION_STREAM_READY, () => {
    markEvent(options, SessionEvent.SESSION_STREAM_READY);
    options.attachCurrentMediaElement();
  });

  session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
    markEvent(options, AgentEventsEnum.USER_SPEAK_STARTED);
    options.setState((current) => ({ ...current, isUserSpeaking: true, conversationState: "listening" }));
  });

  session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
    markEvent(options, AgentEventsEnum.USER_SPEAK_ENDED);
    options.setState((current) => ({ ...current, isUserSpeaking: false, conversationState: "thinking" }));
  });

  session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
    markEvent(options, AgentEventsEnum.AVATAR_SPEAK_STARTED);
    options.setState((current) => ({ ...current, isAvatarSpeaking: true, conversationState: "speaking" }));
  });

  session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
    markEvent(options, AgentEventsEnum.AVATAR_SPEAK_ENDED);
    options.setState((current) => ({ ...current, isAvatarSpeaking: false, conversationState: "listening" }));
  });

  session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event) => {
    markEvent(options, event.event_type);
    options.appendTranscript({
      id: event.event_id,
      role: "user",
      content: event.text,
      metadata: { liveAvatarEventType: event.event_type },
    });
  });

  session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (event) => {
    markEvent(options, event.event_type);
    options.appendTranscript({
      id: event.event_id,
      role: "assistant",
      content: event.text,
      metadata: { liveAvatarEventType: event.event_type },
    });
  });

  session.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, (event) => {
    markEvent(options, event.event_type, {
      lastElevenLabsEventType: event.elevenlabs_event_type,
      elevenLabsConversationId: readElevenLabsConversationId(event.data),
    });

    if (event.elevenlabs_event_type === "interruption") {
      options.markInterrupted();
      void sendElevenLabsContextualUpdate(
        session,
        "El usuario interrumpio mientras el avatar hablaba. En el proximo turno, prioriza el nuevo pedido y no repitas la respuesta anterior."
      ).catch(() => undefined);
    }
  });

  session.on(AgentEventsEnum.SESSION_STOPPED, (event) => {
    markEvent(options, event.event_type);
    void options.end();
  });
}

function markEvent(
  options: RegisterSessionEventsOptions,
  eventType: string,
  diagnostics: Partial<
    Pick<LiveAvatarDiagnostics, "lastElevenLabsEventType" | "elevenLabsConversationId">
  > = {}
) {
  options.setState((current) => ({
    ...current,
    diagnostics: {
      ...current.diagnostics,
      eventCount: current.diagnostics.eventCount + 1,
      lastEventType: eventType,
      lastElevenLabsEventType:
        diagnostics.lastElevenLabsEventType ?? current.diagnostics.lastElevenLabsEventType,
      elevenLabsConversationId:
        diagnostics.elevenLabsConversationId ?? current.diagnostics.elevenLabsConversationId,
    },
  }));
}

async function ensureVoiceChatStarted(session: LiveAvatarSession) {
  if (isVoiceChatActive(session)) {
    return;
  }

  try {
    await session.voiceChat.start({ defaultMuted: false });
  } catch (error) {
    throw new Error(formatVoiceSessionStartError(error));
  }

  if (!isVoiceChatActive(session)) {
    throw new Error(
      "El avatar esta conectado, pero el microfono no quedo activo. Revisa permisos del navegador y vuelve a iniciar la llamada."
    );
  }
}

function isVoiceChatActive(session: LiveAvatarSession) {
  return (session.voiceChat.state as VoiceChatState) === VoiceChatState.ACTIVE;
}

function startMicrophoneLevelProbe(
  session: LiveAvatarSession,
  setState: Dispatch<SetStateAction<LiveAvatarSessionState>>
) {
  const track = readVoiceChatMediaStreamTrack(session);
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!track || !AudioContextConstructor) {
    return () => undefined;
  }

  const audioContext = new AudioContextConstructor();
  const stream = new MediaStream([track]);
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  const samples = new Uint8Array(analyser.fftSize);

  source.connect(analyser);
  void audioContext.resume().catch(() => undefined);

  const intervalId = window.setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    let total = 0;

    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      total += normalized * normalized;
    }

    const microphoneLevel = Math.sqrt(total / samples.length);
    setState((current) => ({
      ...current,
      diagnostics: {
        ...current.diagnostics,
        microphoneLevel,
        voiceChatState: String(session.voiceChat.state),
      },
    }));
  }, 250);

  return () => {
    window.clearInterval(intervalId);
    source.disconnect();
    void audioContext.close().catch(() => undefined);
  };
}

function cleanupDiagnostics(ref: { current: (() => void) | null }) {
  ref.current?.();
  ref.current = null;
}

function clearInterruptionReset(ref: { current: number | null }) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

function readVoiceChatMediaStreamTrack(session: LiveAvatarSession): MediaStreamTrack | null {
  const voiceChat = session.voiceChat as unknown as {
    track?: { mediaStreamTrack?: MediaStreamTrack } | MediaStreamTrack | null;
  };
  const track = voiceChat.track;

  if (!track) {
    return null;
  }

  if (typeof MediaStreamTrack !== "undefined" && track instanceof MediaStreamTrack) {
    return track;
  }

  return "mediaStreamTrack" in track ? (track.mediaStreamTrack ?? null) : null;
}

async function sendElevenLabsUserMessage(session: LiveAvatarSession, text: string) {
  await sendElevenLabsCommand(session, "user_message", { text });
}

async function sendElevenLabsContextualUpdate(session: LiveAvatarSession, text: string) {
  await sendElevenLabsCommand(session, "contextual_update", { text });
}

async function sendElevenLabsCommand(
  session: LiveAvatarSession,
  elevenlabsEventType: "user_message" | "contextual_update",
  data: Record<string, string>
) {
  const room = (
    session as unknown as {
      room?: {
        localParticipant?: {
          publishData?: (
            data: Uint8Array,
            options: { reliable: boolean; topic: string }
          ) => Promise<void> | void;
        };
      };
    }
  ).room;
  const publishData = room?.localParticipant?.publishData;

  if (!publishData) {
    throw new Error("No pudimos acceder al canal de comandos de LiveAvatar.");
  }

  const payload = {
    event_type: "elevenlabs_agent_command",
    elevenlabs_event_type: elevenlabsEventType,
    data,
  };

  await publishData.call(room.localParticipant, new TextEncoder().encode(JSON.stringify(payload)), {
    reliable: true,
    topic: "agent-control",
  });
}

function readElevenLabsConversationId(data: Record<string, unknown>): string | null {
  const event = readRecord(data.conversation_initiation_metadata_event);

  return readString(event?.conversation_id) ?? readString(data.conversation_id);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatVoiceSessionStartError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "El navegador bloqueo el microfono. Habilita permisos de microfono para localhost y vuelve a iniciar la llamada.";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No encontramos un microfono disponible. Conecta o selecciona un microfono y vuelve a iniciar la llamada.";
  }

  if (error instanceof ApiClientError && error.reason === "AVATAR_NOT_READY") {
    return "Este avatar todavía no está disponible para interactuar. Avisale al creador.";
  }

  if (error instanceof ApiClientError && error.status === 404) {
    return "Ya no tenés acceso a este avatar. Volvé a Mis avatares para actualizar la lista.";
  }

  return error instanceof Error ? error.message : "No pudimos iniciar la llamada.";
}
