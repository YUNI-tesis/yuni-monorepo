"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorState, PageHeader, PageShell } from "@yuni/ui";
import { createAvatar } from "../../lib/api/avatar-api";
import { ApiClientError } from "../../lib/api/http-client";
import { buildCreateAvatarRequest, useAvatarBuilder } from "../../hooks/useAvatarBuilder";
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
  const liveAvatarOptions = useLiveAvatarOptions();
  const builder = useAvatarBuilder(liveAvatarOptions.options);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function saveAvatar() {
    if (isSubmitting || !builder.validateAll()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { avatar } = await createAvatar(buildCreateAvatarRequest(builder.state, builder.selectedLiveAvatar));
      router.push(`/avatars/${avatar.id}`);
      router.refresh();
    } catch (caughtError) {
      const message =
        caughtError instanceof ApiClientError || caughtError instanceof Error
          ? caughtError.message
          : "No pudimos crear el avatar.";
      builder.setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell maxWidth="980px">
      <PageHeader
        eyebrow="Avatares"
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
          {builder.currentStep === "Voz" ? <VoiceStep builder={builder} /> : null}
          {builder.currentStep === "Persona" ? <PersonaStep builder={builder} /> : null}
          {builder.currentStep === "Contexto" ? <ContextStep builder={builder} /> : null}
          {builder.currentStep === "Review" ? <ReviewStep builder={builder} /> : null}
        </div>

        {builder.errors.form ? <ErrorState title="No pudimos guardar" description={builder.errors.form} /> : null}

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
    </PageShell>
  );
}
