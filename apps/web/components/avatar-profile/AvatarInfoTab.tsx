"use client";

import React, { useId, useState } from "react";
import { YuniIcon } from "@yuni/ui";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import { getVoiceSummary, hasConfiguredVoice } from "./formatters";
import styles from "./AvatarInfoTab.module.css";

export function AvatarInfoTab({ avatar }: { avatar: ApiAvatar }) {
  const voice = getVoiceSummary(avatar);
  const instructions = avatar.instructions.trim();
  const hasVoice = hasConfiguredVoice(avatar);
  const id = useId();

  return (
    <div className={styles.sheet}>
      <section className={styles.section} aria-labelledby={`${id}-personality`}>
        <div className={styles.sectionLabel}>
          <h2 id={`${id}-personality`}>Personalidad</h2>
          <p>Cómo responde y se relaciona con las personas.</p>
        </div>
        <div className={styles.sectionContent}>
          {instructions ? (
            <PersonalityText key={instructions} text={instructions} />
          ) : (
            <p className={styles.empty}>Todavía no definiste cómo debe responder.</p>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby={`${id}-voice`}>
        <div className={styles.sectionLabel}>
          <h2 id={`${id}-voice`}>Voz</h2>
          <p>La voz del avatar en las conversaciones.</p>
        </div>
        <div className={styles.sectionContent}>
          {hasVoice ? (
            <div className={styles.voice}>
              <span className={styles.voiceIcon} aria-hidden="true">
                <YuniIcon name="mic" size={20} />
              </span>
              <div className={styles.voiceContent}>
                <strong>{voice.selectedVoice}</strong>
                <p>{voice.description}</p>
              </div>
            </div>
          ) : (
            <p className={styles.empty}>Todavía no elegiste una voz.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function PersonalityText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  // Bound both prose and line-heavy instructions, preserving the complete original on expansion.
  const excerpt = text.slice(0, 600).split("\n").slice(0, 8).join("\n");
  const shortened = excerpt.length < text.length;
  const secondParagraphEnd = [...excerpt.matchAll(/\n[\t ]*\n/g)][1]?.index;
  const boundary = Math.max(excerpt.lastIndexOf(" "), excerpt.lastIndexOf("\n"));
  const preview = shortened
    ? secondParagraphEnd !== undefined
      ? excerpt.slice(0, secondParagraphEnd).trimEnd()
      : `${excerpt.slice(0, boundary > 0 ? boundary : excerpt.length).trimEnd()}…`
    : text;

  return (
    <div className={styles.personality}>
      <p id={id} className={styles.instructions}>
        {expanded ? text : preview}
      </p>
      {shortened ? (
        <button
          className={styles.disclosure}
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Ver menos" : "Ver personalidad completa"}
          <YuniIcon name="chevronDown" size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
