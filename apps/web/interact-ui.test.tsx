import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  formatContextStatusLabel,
  formatConversationTitle,
  InteractCallControls,
  InteractConversationHistoryPanel,
  InteractDebugPanel,
  shouldShowInteractDiagnostics,
} from "./components/interact/InteractCall";
import type { LiveAvatarDiagnostics } from "./hooks/useLiveAvatarSession";
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
    expect(formatContextStatusLabel("synced")).toBe("Listo");
    expect(formatContextStatusLabel("not_synced")).toBe("Procesando");
    expect(formatContextStatusLabel("failed")).toBe("No se pudo actualizar");
  });

  it("renders primary call controls without live transcript controls", () => {
    const html = renderToStaticMarkup(
      createElement(InteractCallControls, {
        status: "active",
        isMuted: false,
        canStart: false,
        isInCall: true,
        onStart: vi.fn(),
        onToggleMute: vi.fn(),
        onEnd: vi.fn(),
      })
    );

    expect(html).toContain("Iniciar");
    expect(html).toContain("Silenciar");
    expect(html).toContain("Finalizar");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Historial");
    expect(html).not.toContain("Transcript");
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
