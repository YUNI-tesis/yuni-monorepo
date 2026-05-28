"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorState, LoadingState, PageHeader, PageShell } from "@yuni/ui";
import { updateAvatar } from "../../lib/api/avatar-api";
import { ApiClientError } from "../../lib/api/http-client";
import { buildUpdateAvatarRequest, useAvatarEdit } from "../../hooks/useAvatarEdit";
import { useLiveAvatarOptions } from "../../hooks/useLiveAvatarOptions";
import { AvatarEditForm } from "./AvatarEditForm";
import styles from "./AvatarEdit.module.css";

export function AvatarEdit({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const edit = useAvatarEdit(avatarId);
  const liveAvatarOptions = useLiveAvatarOptions({
    currentAvatarId: edit.loadState.state?.liveAvatarId,
    includeCurrentFallback: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (edit.loadState.status === "loading") {
    return (
      <PageShell maxWidth="980px">
        <LoadingState title="Cargando avatar" description="Estamos preparando la edicion." />
      </PageShell>
    );
  }

  if (edit.loadState.status === "not-found") {
    return (
      <PageShell maxWidth="760px">
        <ErrorState
          title="No encontramos este avatar"
          description={edit.loadState.error}
          action={
            <Button className={styles.notFoundAction} onClick={() => router.push("/dashboard")}>
              Volver al dashboard
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (edit.loadState.status === "error") {
    return (
      <PageShell maxWidth="760px">
        <ErrorState title="No pudimos cargar el avatar" description={edit.loadState.error} />
      </PageShell>
    );
  }

  const { avatar, state } = edit.loadState;

  if (!avatar || !state) {
    return null;
  }

  const editableState = state;
  const selectedLiveAvatar =
    liveAvatarOptions.options.find((option) => option.id === editableState.liveAvatarId) ?? null;

  async function saveChanges() {
    if (isSubmitting || !edit.validateAll()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { avatar: updatedAvatar } = await updateAvatar(
        avatarId,
        buildUpdateAvatarRequest(editableState, selectedLiveAvatar)
      );
      edit.setSuccess("Cambios guardados.");
      router.push(`/avatars/${updatedAvatar.id}`);
      router.refresh();
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError || caughtError instanceof Error
          ? caughtError.message
          : "No pudimos guardar los cambios.";
      edit.setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell maxWidth="980px">
      <div className={styles.root}>
        <PageHeader
          eyebrow="Avatares"
          title="Editar avatar"
          description={avatar.description || avatar.name}
          actions={
            <Button variant="secondary" onClick={() => router.push(`/avatars/${avatar.id}`)}>
              Volver al perfil
            </Button>
          }
        />

        <AvatarEditForm
          state={editableState}
          errors={edit.errors}
          liveAvatarOptions={liveAvatarOptions}
          voiceOptions={edit.voiceEditOptions}
          isSubmitting={isSubmitting}
          onFieldChange={edit.updateField}
          onSubmit={saveChanges}
          onCancel={() => router.push(`/avatars/${avatar.id}`)}
        />
      </div>
    </PageShell>
  );
}
