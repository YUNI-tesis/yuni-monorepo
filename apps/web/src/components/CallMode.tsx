"use client";

/**
 * CallMode Component
 * Provides two modes for voice interaction:
 * 1. Realtime Mode: OpenAI Realtime API (real-time, low latency)
 * 2. Legacy Mode: Whisper → LLM → TTS (for compatibility)
 */

import { useState } from "react";
import { LiveCall } from "./LiveCall";

interface CallModeProps {
  agentId: string;
  conversationId: string;
  userId: string;
  onClose?: () => void;
}

type CallModeType = "realtime" | "legacy" | null;

export function CallMode({ agentId, conversationId, userId, onClose }: CallModeProps) {
  const [mode, setMode] = useState<CallModeType>(null);

  if (mode === "realtime") {
    return (
      <LiveCall
        agentId={agentId}
        conversationId={conversationId}
        userId={userId}
        onClose={() => {
          setMode(null);
          onClose?.();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Voice Call Mode
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Choose how you want to interact with the agent
          </p>
        </div>

        {/* Realtime Mode Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border-2 border-blue-500">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-blue-600 dark:text-blue-400"
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
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Realtime Mode
                <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                  Recommended
                </span>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Real-time conversation with OpenAI Realtime API. Natural turn-taking, low latency,
                and interruption support.
              </p>
              <ul className="space-y-2 mb-4">
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Ultra-low latency (~500ms)
                </li>
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Natural conversation flow
                </li>
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Interruption support (barge-in)
                </li>
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Automatic turn detection
                </li>
              </ul>
              <button
                onClick={() => setMode("realtime")}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Start Realtime Call
              </button>
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
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

