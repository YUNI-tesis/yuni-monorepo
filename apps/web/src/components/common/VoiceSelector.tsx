"use client";

import React from "react";

export interface VoiceOption {
  id: string;
  name: string;
  icon?: React.ReactNode;
}

export interface VoiceSelectorProps {
  selectedVoiceId?: string;
  voices?: VoiceOption[];
  onSelect?: (voiceId: string) => void;
}

/**
 * Voice Selector Component
 * Allows selecting a voice for the avatar
 */
export function VoiceSelector({
  selectedVoiceId,
  voices = [],
  onSelect,
}: VoiceSelectorProps) {
  const defaultVoices: VoiceOption[] = [
    { id: "1", name: "Voz personalizada 1" },
    { id: "2", name: "Voz personalizada 2" },
    { id: "3", name: "Voz personalizada 3" },
  ];

  const voiceList = voices.length > 0 ? voices : defaultVoices;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-theme mb-2">
        Voice
      </label>
      
      <div className="space-y-2">
        {voiceList.map((voice) => (
          <div
            key={voice.id}
            className={`
              p-4 rounded-lg border cursor-pointer transition-all duration-200
              ${selectedVoiceId === voice.id
                ? "border-[#D365FF] bg-[#D365FF]/10 ring-2 ring-[#D365FF] ring-opacity-50"
                : "border-theme bg-surface hover:border-theme-strong hover:bg-surface-hover"
              }
            `}
            onClick={() => onSelect?.(voice.id)}
          >
            <div className="flex items-center gap-3">
              {voice.icon || (
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{voice.name}</p>
              </div>
              {selectedVoiceId === voice.id && (
                <div className="text-accent-theme">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

