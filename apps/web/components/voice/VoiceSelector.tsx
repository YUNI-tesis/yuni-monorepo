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

          return (
            <button
              className={styles.option}
              data-selected={isSelected}
              key={voice.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(voice.id)}
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
                <Badge tone={isSelected ? "success" : "neutral"}>{voice.provider === "openai" ? "OpenAI" : voice.provider}</Badge>
                <span>{voice.recommendedFor}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="yuni-form-field__error">{error}</p> : null}
    </div>
  );
}
