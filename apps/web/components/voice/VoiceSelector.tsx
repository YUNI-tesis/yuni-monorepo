import React, { useEffect, useId, useRef, useState } from "react";
import { YuniIcon } from "@yuni/ui";
import type { VoiceOption } from "../../lib/voice-config";
import styles from "./VoiceSelector.module.css";

export type VoiceSelectorProps = {
  options: VoiceOption[];
  selectedId: string;
  error?: string | undefined;
  onSelect: (voiceId: string) => void;
};

export function VoiceSelector({ options, selectedId, error, onSelect }: VoiceSelectorProps) {
  const groupId = useId().replace(/:/g, "");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function stopPreview() {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    audioRef.current = null;
    setPlayingVoiceId(null);
  }

  function togglePreview(voiceId: string, previewUrl: string) {
    if (typeof Audio === "undefined") {
      return;
    }

    if (playingVoiceId === voiceId) {
      stopPreview();
      return;
    }

    stopPreview();

    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);

    const clearPreview = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingVoiceId(null);
      }
    };

    audio.addEventListener("ended", clearPreview, { once: true });
    audio.addEventListener("error", clearPreview, { once: true });
    void audio.play().catch(clearPreview);
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid} role="radiogroup" aria-label="Voz del avatar">
        {options.map((voice, index) => {
          const isSelected = selectedId === voice.id;
          const previewUrl = voice.previewUrl;
          const isPlaying = playingVoiceId === voice.id;
          const presentation = getVoicePresentation(voice);
          const inputId = `${groupId}-voice-${index}`;

          return (
            <div className={styles.option} data-selected={isSelected} key={voice.id}>
              <input
                className={styles.radioInput}
                id={inputId}
                name={`${groupId}-voice`}
                type="radio"
                value={voice.id}
                checked={isSelected}
                onChange={() => onSelect(voice.id)}
              />
              <label className={styles.optionLabel} htmlFor={inputId}>
                <span className={styles.header} data-has-preview={Boolean(previewUrl)}>
                  <span className={styles.title}>
                    <strong>{presentation.name}</strong>
                  </span>
                </span>

                <span className={styles.description}>{presentation.summary}</span>

                {presentation.traits.length > 0 ? (
                  <span className={styles.traits} aria-label="Características de la voz">
                    {presentation.traits.map((trait) => (
                      <span className={styles.trait} key={trait}>
                        {trait}
                      </span>
                    ))}
                  </span>
                ) : null}
              </label>

              {previewUrl ? (
                <button
                  className={styles.previewButton}
                  data-playing={isPlaying}
                  type="button"
                  aria-label={`${isPlaying ? "Pausar" : "Reproducir"} muestra de ${presentation.name}`}
                  aria-pressed={isPlaying}
                  title={`${isPlaying ? "Pausar" : "Reproducir"} muestra`}
                  onClick={() => togglePreview(voice.id, previewUrl)}
                >
                  <YuniIcon name={isPlaying ? "pause" : "play"} size={20} strokeWidth={2} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p className="yuni-form-field__error">{error}</p> : null}
    </div>
  );
}

type VoicePresentation = {
  name: string;
  summary: string;
  traits: string[];
};

const traitTranslations: Record<string, string> = {
  argentine: "Argentina",
  argentinian: "Argentina",
  british: "Británica",
  colombian: "Colombiana",
  female: "Femenina",
  male: "Masculina",
  mexican: "Mexicana",
  middle_aged: "Adulta",
  neutral: "Neutra",
  old: "Mayor",
  spanish: "Española",
  young: "Joven",
};

const qualityTranslations: Array<[RegExp, string]> = [
  [/\bwarm\b|\bcálid[oa]\b/i, "cálido"],
  [/\brelaxed\b|\brelajad[oa]\b/i, "relajado"],
  [/\bapproachable\b|\bcercan[oa]\b/i, "cercano"],
  [/\bnatural\b/i, "natural"],
  [/\bclear\b|\bclar[oa]\b/i, "claro"],
  [/\benergetic\b|\benérgic[oa]\b/i, "enérgico"],
  [/\bconfident\b|\bsegur[oa]\b/i, "seguro"],
  [/\bfriendly\b|\bamigable\b/i, "amigable"],
  [/\bexpressive\b|\bexpresiv[oa]\b/i, "expresivo"],
  [/\bcalm\b|\bseren[oa]\b/i, "sereno"],
  [/\bdeep\b|\bprofund[oa]\b/i, "profundo"],
  [/\bbright\b|\bluminos[oa]\b/i, "luminoso"],
  [/\bprofessional\b|\bprofesional\b/i, "profesional"],
  [/\bconversational\b|\bconversacional\b/i, "conversacional"],
  [/\bengaging\b|\benvolvente\b/i, "envolvente"],
  [/\bsmooth\b|\bsuave\b/i, "suave"],
  [/\bversatile\b|\bversátil\b/i, "versátil"],
  [/\byouthful\b|\bjuvenil\b/i, "juvenil"],
];

export function getVoicePresentation(voice: VoiceOption): VoicePresentation {
  const [shortName = voice.displayName] = voice.displayName.split(/\s+[—–-]\s+/, 1);
  const traits = [voice.labels?.accent, voice.labels?.gender, voice.labels?.age]
    .map(translateTrait)
    .filter((trait): trait is string => Boolean(trait))
    .filter((trait, index, list) => list.indexOf(trait) === index)
    .slice(0, 3);
  const qualitySource = `${voice.displayName} ${voice.description} ${voice.toneLabel}`;
  const qualities = qualityTranslations
    .filter(([pattern]) => pattern.test(qualitySource))
    .map(([, label]) => label)
    .slice(0, 3);

  return {
    name: shortName.trim() || voice.displayName,
    summary: createVoiceSummary(voice, qualities, traits),
    traits,
  };
}

function translateTrait(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLocaleLowerCase("es").replace(/[\s-]+/g, "_");
  return traitTranslations[normalized] ?? (isSpanishCopy(value) ? capitalize(value.trim()) : null);
}

function createVoiceSummary(voice: VoiceOption, qualities: string[], traits: string[]): string {
  if (qualities.length > 0) {
    return `Tono ${joinNaturalLanguage(qualities)}.`;
  }

  if (isSpanishCopy(voice.description)) {
    return shortenSentence(voice.description);
  }

  if (traits.length > 0) {
    return `Voz ${joinNaturalLanguage(traits.map(lowercaseFirst))}.`;
  }

  return "Escuchá la muestra para conocer su tono.";
}

function joinNaturalLanguage(values: string[]): string {
  if (values.length < 2) {
    return values[0] ?? "natural";
  }

  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}

function isSpanishCopy(value: string): boolean {
  return /[áéíóúñ¿¡]|\b(voz|para|conversaciones|natural|ritmo|guías|respuestas|actual|guardada)\b/i.test(value);
}

function shortenSentence(value: string): string {
  const sentence = value.trim().split(/(?<=[.!?])\s+/, 1)[0] ?? value.trim();

  if (sentence.length <= 112) {
    return sentence;
  }

  return `${sentence.slice(0, 109).trimEnd()}…`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase("es")}${value.slice(1)}`;
}

function lowercaseFirst(value: string): string {
  return `${value.charAt(0).toLocaleLowerCase("es")}${value.slice(1)}`;
}
