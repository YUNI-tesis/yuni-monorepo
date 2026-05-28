"use client";

import { useRef } from "react";
import type { MouseEvent } from "react";
import { Button } from "@yuni/ui";
import type { LiveAvatarOptionsState } from "../../hooks/useLiveAvatarOptions";
import { getInitials } from "./LiveAvatarStage";
import { LiveAvatarSelector } from "./LiveAvatarSelector";
import styles from "./LiveAvatarStage.module.css";

export type LiveAvatarPickerProps = {
  optionsState: LiveAvatarOptionsState;
  selectedId: string;
  error?: string | undefined;
  onSelect: (avatarId: string) => void;
};

export function LiveAvatarPicker({ optionsState, selectedId, error, onSelect }: LiveAvatarPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedAvatar = optionsState.options.find((option) => option.id === selectedId) ?? null;

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function selectAvatar(avatarId: string) {
    onSelect(avatarId);
    dialogRef.current?.close();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function closeOnBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    <div className={styles.picker}>
      <button
        className={styles.pickerPreview}
        type="button"
        onClick={openDialog}
        disabled={optionsState.status === "loading"}
      >
        {optionsState.status === "loading" ? (
          <span className={styles.pickerLoading} aria-live="polite">
            <span className="yuni-loading-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>Cargando avatares</span>
          </span>
        ) : selectedAvatar ? (
          <>
            <span className={styles.pickerMedia} aria-hidden="true">
              {selectedAvatar.thumbnailUrl ? (
                <img src={selectedAvatar.thumbnailUrl} alt="" />
              ) : (
                <span>{getInitials(selectedAvatar.displayName)}</span>
              )}
            </span>
            <span className={styles.pickerText}>
              <small>Avatar seleccionado</small>
              <strong>{selectedAvatar.displayName}</strong>
              <span>Click para cambiarlo</span>
            </span>
          </>
        ) : (
          <span className={styles.pickerText}>
            <small>Avatar visual</small>
            <strong>Selecciona un avatar</strong>
            <span>Click para ver las opciones disponibles</span>
          </span>
        )}
      </button>

      {error ? <p className="yuni-form-field__error">{error}</p> : null}

      <dialog
        ref={dialogRef}
        className={styles.pickerDialog}
        aria-label="Seleccionar avatar visual"
        onClick={closeOnBackdropClick}
      >
        <div className={styles.pickerDialogBody}>
          <button
            className={styles.pickerDialogClose}
            type="button"
            aria-label="Cerrar selector"
            onClick={closeDialog}
          >
            x
          </button>
          <div className={styles.pickerDialogHeader}>
            <p className="yuni-eyebrow">Live Avatar</p>
            <h2>Seleccionar avatar visual</h2>
            <p className={styles.pickerDialogDescription}>
              Elegí la apariencia que tendrá el avatar durante la interacción.
            </p>
          </div>
          <div className={styles.pickerDialogContent}>
            <LiveAvatarSelector
              options={optionsState.options}
              selectedId={selectedId}
              status={optionsState.status}
              error={optionsState.error}
              onSelect={selectAvatar}
            />
          </div>
          <Button variant="secondary" type="button" onClick={closeDialog}>
            Cerrar
          </Button>
        </div>
      </dialog>
    </div>
  );
}
