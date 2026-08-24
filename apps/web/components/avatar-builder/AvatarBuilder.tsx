"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Card, PageHeader, useToast } from "@yuni/ui";
import { createAvatar, type ApiAvatar, updateAvatar, uploadAvatarDocument } from "../../lib/api/avatar-api";
import { ApiClientError } from "../../lib/api/http-client";
import { buildCreateAvatarRequest, useAvatarBuilder } from "../../hooks/useAvatarBuilder";
import { useElevenLabsVoiceOptions } from "../../hooks/useElevenLabsVoiceOptions";
import { invalidateAvatarListCache } from "../../hooks/useAvatarList";
import { useLiveAvatarOptions } from "../../hooks/useLiveAvatarOptions";
import { BuilderSteps } from "./BuilderSteps";
import { ContextStep } from "./steps/ContextStep";
import { IdentityStep } from "./steps/IdentityStep";
import { LiveAvatarStep } from "./steps/LiveAvatarStep";
import { PersonaStep } from "./steps/PersonaStep";
import { ReviewStep } from "./steps/ReviewStep";
import { VoiceStep } from "./steps/VoiceStep";
import styles from "./AvatarBuilder.module.css";

export function AvatarBuilder() {
  const router = useRouter();
  const toast = useToast();
  const liveAvatarOptions = useLiveAvatarOptions();
  const voiceOptions = useElevenLabsVoiceOptions();
  const builder = useAvatarBuilder(liveAvatarOptions.options, voiceOptions.options);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAvatarId, setCreatedAvatarId] = useState<string | null>(null);
  const uploadedFiles = useRef(new Set<string>());
  const saveToastId = useRef<string | null>(null);

  async function saveAvatar() {
    if (isSubmitting || !builder.validateAll()) {
      return;
    }

    if (saveToastId.current) {
      toast.dismiss(saveToastId.current);
      saveToastId.current = null;
    }
    setIsSubmitting(true);

    let savedAvatar: ApiAvatar;
    try {
      const request = buildCreateAvatarRequest(
        builder.state,
        builder.selectedLiveAvatar,
        builder.selectedVoice
      );
      const { avatar } = createdAvatarId
        ? await updateAvatar(createdAvatarId, request)
        : await createAvatar(request);
      savedAvatar = avatar;
      if (!createdAvatarId) setCreatedAvatarId(avatar.id);
      invalidateAvatarListCache();
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError || caughtError instanceof Error
          ? caughtError.message
          : "No pudimos crear el avatar.";
      saveToastId.current = toast.error(message, {
        title: createdAvatarId ? "No pudimos actualizar el avatar" : "No pudimos crear el avatar",
        dedupeKey: "avatar:create:error",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      for (const file of builder.state.files) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (uploadedFiles.current.has(key)) continue;
        await uploadAvatarDocument(savedAvatar.id, file);
        uploadedFiles.current.add(key);
      }
    } catch {
      saveToastId.current = toast.warning(
        "El avatar ya está guardado, pero quedaron documentos sin subir. Volvé a guardar para reintentarlo.",
        {
          title: "Avatar creado, con documentos pendientes",
          dedupeKey: `avatar:${savedAvatar.id}:documents:error`,
        }
      );
      setIsSubmitting(false);
      return;
    }

    saveToastId.current = toast.success(`${savedAvatar.name} quedó listo en Mis avatares.`, {
      title: "Avatar creado",
      dedupeKey: `avatar:${savedAvatar.id}:created`,
    });
    router.push(`/avatars/${savedAvatar.id}`);
    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Mis avatares"
        title="Crear avatar"
        description="Configura la identidad, voz y contexto base para probarlo despues en conversaciones."
      />

      <Card padding="lg" className={styles.root}>
        <BuilderSteps currentStepIndex={builder.currentStepIndex} />

        <div className={styles.content}>
          {builder.currentStep === "Identidad" ? <IdentityStep builder={builder} /> : null}
          {builder.currentStep === "Avatar" ? (
            <LiveAvatarStep builder={builder} liveAvatarOptions={liveAvatarOptions} />
          ) : null}
          {builder.currentStep === "Voz" ? <VoiceStep builder={builder} voiceOptions={voiceOptions} /> : null}
          {builder.currentStep === "Persona" ? <PersonaStep builder={builder} /> : null}
          {builder.currentStep === "Contexto" ? <ContextStep builder={builder} /> : null}
          {builder.currentStep === "Review" ? <ReviewStep builder={builder} /> : null}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={builder.goBack} disabled={!builder.canGoBack || isSubmitting}>
            Volver
          </Button>
          {builder.isLastStep ? (
            <Button onClick={saveAvatar} loading={isSubmitting}>
              Guardar avatar
            </Button>
          ) : (
            <Button onClick={builder.goNext}>Continuar</Button>
          )}
        </div>
      </Card>
    </>
  );
}
