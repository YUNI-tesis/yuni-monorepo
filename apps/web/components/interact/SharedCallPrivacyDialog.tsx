"use client";

import React, { forwardRef } from "react";
import { Button, Dialog } from "@yuni/ui";
import styles from "./Interact.module.css";

export type SharedCallPrivacyDialogProps = {
  sharedAvatarNames: string[];
  rememberChoice: boolean;
  onRememberChoiceChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export const SharedCallPrivacyDialog = forwardRef<HTMLDialogElement, SharedCallPrivacyDialogProps>(
  function SharedCallPrivacyDialog(
    { sharedAvatarNames, rememberChoice, onRememberChoiceChange, onConfirm, onCancel },
    ref
  ) {
    const disclosure = formatSharedAvatarDisclosure(sharedAvatarNames);

    return (
      <Dialog
        ref={ref}
        title="Antes de iniciar la llamada"
        description={`La llamada y su transcripción se guardarán. ${disclosure}`}
        closeLabel="Cancelar"
        footer={<Button onClick={onConfirm}>Iniciar llamada</Button>}
        onClose={onCancel}
      >
        <label className={styles.privacyChoice}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(event) => onRememberChoiceChange(event.target.checked)}
          />
          <span>
            No volver a mostrar para {sharedAvatarNames.length === 1 ? "este avatar" : "estos avatares"}
          </span>
        </label>
      </Dialog>
    );
  }
);

export function getSharedCallConsentStorageKey(userId: string, avatarId: string) {
  return `yuni:shared-call-consent:v1:${userId}:${avatarId}`;
}

export function readRememberedPrivacyChoice(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

export function rememberPrivacyChoiceForAvatar(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, "true");
  } catch {
    // The preference is optional; storage failures must never block a call.
  }
}

function formatSharedAvatarDisclosure(names: string[]) {
  if (names.length === 1) {
    return `El creador de ${names[0] ?? "este avatar"} podrá consultar esta información en la sección Actividad.`;
  }
  return `Los creadores de ${formatNameList(names)} podrán consultar esta información en la sección Actividad.`;
}

function formatNameList(names: string[]) {
  if (names.length <= 1) return names[0] ?? "los avatares compartidos";
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}
