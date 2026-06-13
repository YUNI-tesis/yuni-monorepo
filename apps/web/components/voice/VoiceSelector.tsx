import React from "react";
import { Badge } from "@yuni/ui";
import type { VoiceOption } from "../../lib/voice-config";
import styles from "./VoiceSelector.module.css";

export type VoiceSelectorProps = {
  options: VoiceOption[];
  selectedId: string;
  error?: string | undefined;
  onSelect: (voiceId: string) => void;
};

export function VoiceSelector({ options, selectedId, error, onSelect }: VoiceSelectorProps) {
  return (
    <div className={styles.root}>
      <div className={styles.grid} role="radiogroup" aria-label="Voz del avatar">
        {options.map((voice) => {
          const isSelected = selectedId === voice.id;
          const previewUrl = voice.previewUrl;

          return (
            <div
              className={styles.option}
              data-selected={isSelected}
              key={voice.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => onSelect(voice.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(voice.id);
                }
              }}
            >
              <span className={styles.header}>
                <span className={styles.mark} aria-hidden="true">
                  {voice.displayName.slice(0, 1)}
                </span>
                <span className={styles.title}>
                  <strong>{voice.displayName}</strong>
                  <small>{voice.toneLabel}</small>
                </span>
              </span>
              <span className={styles.description}>{voice.description}</span>
              <span className={styles.footer}>
                <Badge tone={isSelected ? "success" : "neutral"}>
                  {voice.provider === "openai" ? "OpenAI" : "ElevenLabs"}
                </Badge>
                <span>{voice.recommendedFor}</span>
                {previewUrl ? (
                  <button
                    className={styles.previewButton}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      playPreview(previewUrl);
                    }}
                  >
                    Escuchar preview
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {error ? <p className="yuni-form-field__error">{error}</p> : null}
    </div>
  );
}

function playPreview(previewUrl: string) {
  if (typeof Audio === "undefined") {
    return;
  }

  void new Audio(previewUrl).play().catch(() => undefined);
}
