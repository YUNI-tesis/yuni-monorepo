"use client";

import { useState } from "react";
import { Button } from "./common";

interface MessageComposerProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  }

  return (
    <div className="px-6 py-4 border-t border-theme glass-strong">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={disabled}
            placeholder="Escribe un mensaje..."
            rows={2}
            className="flex-1 px-4 py-3 glass rounded-xl border border-theme text-theme placeholder:text-muted-theme resize-none focus:outline-none focus-visible:border-[var(--color-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] transition-all bg-surface focus-gradient disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <Button
            variant="outline"
            size="md"
            disabled={disabled || !message.trim()}
          >
            {disabled ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Enviar
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-theme pt-2 px-1">
          Presiona Enter para enviar, Shift+Enter para nueva línea
        </p>
      </form>
    </div>
  );
}

