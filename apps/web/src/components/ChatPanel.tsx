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
    return <div className="p-4">Cargando conversación...</div>;
  }

  if (!conversation) {
    return <div className="p-4">Error: No se pudo crear la conversación</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-xl font-semibold">Chat</h2>
        <CostMeter conversationId={conversation.id} />
      </div>

      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} />
        {streamingText && (
          <div className="px-4 pb-4">
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg p-3 bg-gray-100 text-gray-900">
                <p className="whitespace-pre-wrap">{streamingText}</p>
                <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageComposer onSend={handleSendMessage} disabled={sending} />

      <CallMode
        agentId={agentId}
        conversationId={conversation.id}
        onTranscript={(text) => {
          // Optionally show transcript
          console.log("Transcript:", text);
        }}
        onResponse={(text) => {
          // Reload conversation to show new messages
          loadConversation(conversation.id);
        }}
      />
    </div>
  );
}

