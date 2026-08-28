"use client";

import React from "react";
import type { BadgeTone } from "@yuni/ui";
import type { AvatarEditState } from "../../hooks/useAvatarEdit";
import styles from "./AvatarEdit.module.css";

export type AvatarStatusSelectorProps = {
  status: AvatarEditState["status"];
  onChange: (status: AvatarEditState["status"]) => void;
};

export const avatarStatusOptions: Array<{
  value: AvatarEditState["status"];
  label: string;
  description: string;
  tone: BadgeTone;
}> = [
  {
    value: "active",
    label: "Activo",
    tone: "success",
    description:
      "Habilita los links públicos, el acceso compartido y el uso en grupos. La voz, la apariencia y la sincronización también deben estar listas.",
  },
  {
    value: "draft",
    label: "Borrador",
    tone: "warning",
    description:
      "Indica que todavía está en preparación. Podés editarlo y probarlo, pero otras personas no pueden usarlo.",
  },
  {
    value: "disabled",
    label: "Inactivo",
    tone: "danger",
    description:
      "Lo retira temporalmente sin borrar su configuración ni su historial. Bloquea los links públicos, el acceso compartido y el uso en grupos.",
  },
];

export function AvatarStatusSelector({ status, onChange }: AvatarStatusSelectorProps) {
  return (
    <div className={styles.statusSelector} role="radiogroup" aria-label="Estado del avatar">
      {avatarStatusOptions.map((option) => {
        const descriptionId = `avatar-status-${option.value}-description`;

        return (
          <button
            key={option.value}
            className={styles.statusOption}
            data-selected={status === option.value}
            data-status={option.value}
            type="button"
            role="radio"
            aria-checked={status === option.value}
            aria-describedby={descriptionId}
            onClick={() => onChange(option.value)}
          >
            <span className={styles.statusOptionHeader}>
              <span className={styles.statusIndicator} aria-hidden="true" />
              <strong>{option.label}</strong>
            </span>
            <span id={descriptionId} className={styles.statusDescription}>
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
