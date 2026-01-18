"use client";

import { useState, useEffect, useRef } from "react";
import { ConversationState, ChatMessage } from "@/lib/schemas";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { CostMeter } from "./CostMeter";
import { CallMode } from "./CallMode";
import { fetchWithAuth } from "@/lib/fetch-client";

interface ChatPanelProps {
  agentId: string;
  conversationId?: string;
}

export function ChatPanel({ agentId, conversationId: initialConversationId }: ChatPanelProps) {
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [callMode, setCallMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialConversationId) {
      loadConversation(initialConversationId);
    } else {
      createNewConversation();
    }
  }, [initialConversationId, agentId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function createNewConversation() {
    try {
      const res = await fetchWithAuth("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, mode: "text" }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      const conv: ConversationState = await res.json();
      setConversation(conv);
      setMessages(conv.messages);
    } catch (err: any) {
      console.error("Failed to create conversation", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadConversation(id: string) {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to load conversation");
      const conv: ConversationState = await res.json();
      setConversation(conv);
      setMessages(conv.messages);
    } catch (err: any) {
      console.error("Failed to load conversation", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(message: string) {
    if (!conversation || sending) return;

    setSending(true);
    setStreamingText("");

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          conversationId: conversation.id,
          message,
          mode: "text",
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      // Read streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                // Reload conversation to get updated state
                await loadConversation(conversation.id);
                setStreamingText("");
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullResponse += parsed.text;
                  setStreamingText(fullResponse);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to send message", err);
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setSending(false);
      setStreamingText("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando conversación...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="glass rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4">
          <p className="text-red-400">Error: No se pudo crear la conversación</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-transparent to-black/20">
      <div className="px-6 py-4 border-b border-white/10 glass-strong flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h2 className="text-2xl font-bold gradient-text tracking-tight">Chat</h2>
          <div className="flex gap-2 glass rounded-xl p-1 border border-white/10">
            <button
              onClick={() => setCallMode(false)}
              className={`cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                !callMode
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Texto
              </span>
            </button>
            <button
              onClick={() => setCallMode(true)}
              className={`cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                callMode
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Llamada
              </span>
            </button>
          </div>
        </div>
        <CostMeter conversationId={conversation.id} />
      </div>

      {callMode ? (
        <CallMode
          agentId={agentId}
          conversationId={conversation.id}
          onClose={() => {
            setCallMode(false);
            // Reload conversation to show any new messages
            if (conversation.id) {
              loadConversation(conversation.id);
            }
          }}
        />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col">
              <MessageList messages={messages} />
              {streamingText && (
                <div className="px-6 pb-4">
                  <div className="flex justify-start items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div className="max-w-[75%] glass-strong rounded-2xl px-5 py-4 border border-white/10 text-gray-100">
                      <p className="whitespace-pre-wrap leading-relaxed">{streamingText}</p>
                      <span className="inline-block w-2 h-4 bg-purple-400 rounded animate-pulse ml-1" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <MessageComposer onSend={handleSendMessage} disabled={sending} />
        </>
      )}
    </div>
  );
}

