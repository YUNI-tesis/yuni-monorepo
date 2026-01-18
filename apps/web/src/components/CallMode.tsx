"use client";

/**
 * CallMode Component
 * Provides two modes for voice interaction:
 * 1. Realtime Mode: OpenAI Realtime API (real-time, low latency)
 * 2. Legacy Mode: Whisper → LLM → TTS (for compatibility)
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { LiveCall } from "./LiveCall";
import { Button } from "@/components/common";

interface CallModeProps {
  agentId: string;
  conversationId: string;
  onClose?: () => void;
}

type CallModeType = "realtime" | "legacy" | null;

export function CallMode({ agentId, conversationId, onClose }: CallModeProps) {
  const [mode, setMode] = useState<CallModeType>(null);
  const { data: session } = useSession();

  if (mode === "realtime") {
    if (!session?.user?.id) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="glass rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4">
            <p className="text-red-400">Error: Sesión no válida</p>
          </div>
        </div>
      );
    }

    return (
      <LiveCall
        agentId={agentId}
        conversationId={conversationId}
        userId={session.user.id}
        onClose={() => {
          setMode(null);
          onClose?.();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-transparent to-black/20 p-8">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold gradient-text mb-2 tracking-tight">
            Voice Call Mode
          </h2>
          <p className="text-white/70">
            Elige cómo quieres interactuar con el agente
          </p>
        </div>

        {/* Realtime Mode Card */}
        <div className="glass-strong rounded-2xl p-6 border-2 border-purple-500/50 hover:border-purple-500/80 transition-all">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
                Realtime Mode
                <span className="px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                  Recomendado
                </span>
              </h3>
              <p className="text-sm text-white/70 mb-4">
                Conversación en tiempo real con OpenAI Realtime API. Turnos naturales, baja latencia
                y soporte para interrupciones.
              </p>
              <ul className="space-y-2 mb-4">
                <li className="flex items-center text-sm text-white/80">
                  <svg className="w-4 h-4 text-purple-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Latencia ultra-baja (~500ms)
                </li>
                <li className="flex items-center text-sm text-white/80">
                  <svg className="w-4 h-4 text-purple-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Flujo de conversación natural
                </li>
                <li className="flex items-center text-sm text-white/80">
                  <svg className="w-4 h-4 text-purple-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Soporte para interrupciones (barge-in)
                </li>
                <li className="flex items-center text-sm text-white/80">
                  <svg className="w-4 h-4 text-purple-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Detección automática de turnos
                </li>
              </ul>
              <Button
                onClick={() => setMode("realtime")}
                variant="primary"
                size="lg"
                className="w-full shadow-lg hover:shadow-xl"
              >
                Iniciar Llamada Realtime
              </Button>
            </div>
          </div>
        </div>

        {/* Legacy Mode Card (optional, for compatibility) */}
        {/* 
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-gray-600 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Legacy Mode
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Traditional push-to-talk mode. Record, transcribe, get response, play audio.
              </p>
              <button
                onClick={() => setMode("legacy")}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                Use Legacy Mode
              </button>
            </div>
          </div>
        </div>
        */}

        <div className="text-center">
          <button
            onClick={onClose}
            className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

