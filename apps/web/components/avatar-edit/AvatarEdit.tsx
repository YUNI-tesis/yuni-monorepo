"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, ErrorState, LoadingState, PageHeader, useToast } from "@yuni/ui";
import { type ApiAvatar, updateAvatar, uploadAvatarDocument } from "../../lib/api/avatar-api";
import { ApiClientError } from "../../lib/api/http-client";
import { buildUpdateAvatarRequest, useAvatarEdit } from "../../hooks/useAvatarEdit";
import { useElevenLabsVoiceOptions } from "../../hooks/useElevenLabsVoiceOptions";
import { invalidateAvatarListCache } from "../../hooks/useAvatarList";
import { useLiveAvatarOptions } from "../../hooks/useLiveAvatarOptions";
import { AvatarEditForm } from "./AvatarEditForm";
import styles from "./AvatarEdit.module.css";

export function AvatarEdit({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const toast = useToast();
  const edit = useAvatarEdit(avatarId);
  const liveAvatarOptions = useLiveAvatarOptions({
    currentAvatarId: edit.loadState.state?.liveAvatarId,
    includeCurrentFallback: true,
  });
  const voiceOptions = useElevenLabsVoiceOptions({
    currentVoiceId: edit.loadState.state?.voiceId,
    currentVoiceDisplayName: edit.loadState.state?.voiceDisplayName,
    currentVoiceDescription: edit.loadState.state?.voiceDescription,
    currentVoiceProvider: edit.loadState.state?.voiceProvider,
    includeCurrentFallback: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const uploadedFiles = useRef(new Set<string>());
  const saveToastId = useRef<string | null>(null);

  if (edit.loadState.status === "loading") {
    return <LoadingState title="Cargando avatar" description="Estamos preparando la edicion." />;
  }

  if (edit.loadState.status === "not-found") {
    return (
      <ErrorState
        title="No encontramos este avatar"
        description={edit.loadState.error}
        action={
          <Button className={styles.notFoundAction} onClick={() => router.push("/dashboard")}>
            Volver al dashboard
          </Button>
        }
      />
    );
  }

  if (edit.loadState.status === "error") {
    return <ErrorState title="No pudimos cargar el avatar" description={edit.loadState.error} />;
  }

  const { avatar, state } = edit.loadState;

  if (!avatar || !state) {
    return null;
  }

  const editableState = state;
  const selectedLiveAvatar =
    liveAvatarOptions.options.find((option) => option.id === editableState.liveAvatarId) ?? null;
  const selectedVoice = voiceOptions.options.find((option) => option.id === editableState.voiceId) ?? null;

  async function saveChanges() {
    if (isSubmitting || !edit.validateAll()) {
      return;
    }

    if (saveToastId.current) {
      toast.dismiss(saveToastId.current);
      saveToastId.current = null;
    }
    setIsSubmitting(true);

    let savedAvatar: ApiAvatar;
    try {
      const { avatar: updatedAvatar } = await updateAvatar(
        avatarId,
        buildUpdateAvatarRequest(editableState, selectedLiveAvatar, selectedVoice)
      );
      savedAvatar = updatedAvatar;
      invalidateAvatarListCache();
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError || caughtError instanceof Error
          ? caughtError.message
          : "No pudimos guardar los cambios.";
      saveToastId.current = toast.error(message, {
        title: "No pudimos guardar los cambios",
        dedupeKey: `avatar:${avatarId}:update:error`,
      });
      setIsSubmitting(false);
      return;
    }

    try {
      for (const file of editableState.files) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (uploadedFiles.current.has(key)) continue;
        await uploadAvatarDocument(savedAvatar.id, file);
        uploadedFiles.current.add(key);
      }
    } catch {
      saveToastId.current = toast.warning(
        "Los cambios ya están guardados, pero quedaron documentos sin subir. Volvé a guardar para reintentarlo.",
        {
          title: "Cambios guardados, con documentos pendientes",
          dedupeKey: `avatar:${savedAvatar.id}:documents:error`,
        }
      );
      setIsSubmitting(false);
      return;
    }

    saveToastId.current = toast.success(`${savedAvatar.name} se actualizó correctamente.`, {
      title: "Cambios guardados",
      dedupeKey: `avatar:${savedAvatar.id}:updated`,
    });
    router.push(`/avatars/${savedAvatar.id}`);
    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Mis avatares"
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
        voiceOptions={voiceOptions}
        isSubmitting={isSubmitting}
        onFieldChange={edit.updateField}
        onSubmit={saveChanges}
        onCancel={() => router.push(`/avatars/${avatar.id}`)}
      />
    </div>
  );
}
