"use client";

import React from "react";
import { Tooltip } from "@yuni/ui";
import type { AvatarEditState } from "../../hooks/useAvatarEdit";
import styles from "./AvatarEdit.module.css";

export type AvatarStatusSelectorProps = {
  status: AvatarEditState["status"];
  onChange: (status: AvatarEditState["status"]) => void;
};

const statusOptions: Array<{
  value: AvatarEditState["status"];
  label: string;
  description: string;
}> = [
  {
    value: "active",
    label: "Activo",
    description:
      "Habilita los links públicos, el acceso compartido y el uso en grupos. La voz, la apariencia y la sincronización también deben estar listas.",
  },
  {
    value: "draft",
    label: "Borrador",
    description:
      "Indica que todavía está en preparación. Podés editarlo y probarlo, pero otras personas no pueden usarlo.",
  },
  {
    value: "disabled",
    label: "Inactivo",
    description:
      "Lo retira temporalmente sin borrar su configuración ni su historial. Bloquea los links públicos, el acceso compartido y el uso en grupos.",
  },
];

export function AvatarStatusSelector({ status, onChange }: AvatarStatusSelectorProps) {
  return (
    <div className={styles.statusSelector} role="radiogroup" aria-label="Estado del avatar">
      {statusOptions.map((option) => {
        const descriptionId = `avatar-status-${option.value}-description`;

        return (
          <Tooltip key={option.value} content={<span id={descriptionId}>{option.description}</span>}>
            <button
              className={styles.statusChip}
              data-selected={status === option.value}
              data-status={option.value}
              type="button"
              role="radio"
              aria-checked={status === option.value}
              aria-describedby={descriptionId}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
