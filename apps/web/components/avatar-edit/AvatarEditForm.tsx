"use client";

import { Button, Card, ErrorState, FormField, Input, LoadingState, Textarea, useToast } from "@yuni/ui";
import { DocumentFileDrop } from "../context/DocumentFileDrop";
import type { AvatarEditState, AvatarEditValidation } from "../../hooks/useAvatarEdit";
import type { ElevenLabsVoiceOptionsState } from "../../hooks/useElevenLabsVoiceOptions";
import type { LiveAvatarOptionsState } from "../../hooks/useLiveAvatarOptions";
import { AvatarStatusSelector } from "./AvatarStatusSelector";
import { LiveAvatarPicker } from "../live-avatar/LiveAvatarPicker";
import { VoiceSelector } from "../voice/VoiceSelector";
import styles from "./AvatarEdit.module.css";

export type AvatarEditFormProps = {
  state: AvatarEditState;
  errors: AvatarEditValidation;
  liveAvatarOptions: LiveAvatarOptionsState;
  voiceOptions: ElevenLabsVoiceOptionsState;
  isSubmitting: boolean;
  onFieldChange: <Field extends keyof AvatarEditState>(field: Field, value: AvatarEditState[Field]) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function AvatarEditForm({
  state,
  errors,
  liveAvatarOptions,
  voiceOptions,
  isSubmitting,
  onFieldChange,
  onSubmit,
  onCancel,
}: AvatarEditFormProps) {
  const toast = useToast();

  return (
    <Card padding="lg">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <section className={styles.section}>
          <SectionHeader
            title="Identidad"
            description="Datos base del avatar que después se muestran en su perfil y links públicos."
          />
          <div className={styles.identityFields}>
            <div className={styles.fieldBlock}>
              <FormField label="Nombre" htmlFor="avatar-edit-name" error={errors.name}>
                <Input
                  id="avatar-edit-name"
                  value={state.name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => onFieldChange("name", event.currentTarget.value)}
                />
              </FormField>
            </div>
            <div className={styles.fieldBlock}>
              <FormField label="Descripcion" htmlFor="avatar-edit-description">
                <Textarea
                  id="avatar-edit-description"
                  value={state.description}
                  onChange={(event) => onFieldChange("description", event.currentTarget.value)}
                />
              </FormField>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeader
            title="Estado"
            description="Define si el avatar está listo para interactuar, en preparación o fuera de uso."
          />
          <AvatarStatusSelector
            status={state.status}
            onChange={(status) => onFieldChange("status", status)}
          />
        </section>

        <section className={styles.section}>
          <SectionHeader
            title="Avatar visual"
            description="Selecciona la apariencia que tendrá el avatar durante la interacción."
          />
          <LiveAvatarPicker
            optionsState={liveAvatarOptions}
            selectedId={state.liveAvatarId}
            error={errors.liveAvatarId}
            onSelect={(avatarId) => onFieldChange("liveAvatarId", avatarId)}
          />
        </section>

        <section className={styles.section}>
          <SectionHeader title="Voz" description="Selecciona la voz para las respuestas habladas." />
          {voiceOptions.status === "loading" ? (
            <LoadingState title="Cargando voces" description="Estamos preparando el catálogo disponible." />
          ) : null}
          {voiceOptions.status === "error" ? (
            <ErrorState title="No pudimos cargar las voces" description={voiceOptions.error} />
          ) : null}
          {voiceOptions.status === "empty" ? (
            <ErrorState
              title="No hay voces disponibles"
              description="Todavía no hay voces configuradas para usar en este avatar."
            />
          ) : null}
          {voiceOptions.status === "ready" ? (
            <VoiceSelector
              options={voiceOptions.options}
              selectedId={state.voiceId}
              error={errors.voiceId}
              onSelect={(voiceId) => onFieldChange("voiceId", voiceId)}
              onPreviewError={(voice) =>
                toast.error("Probá nuevamente o elegí otra voz.", {
                  title: `No pudimos reproducir ${voice.displayName.split(" - ")[0] ?? "la muestra"}`,
                  dedupeKey: `voice:${voice.id}:preview:error`,
                })
              }
            />
          ) : null}
        </section>

        <section className={styles.section}>
          <SectionHeader
            title="Persona"
            description="Define cómo debe comportarse el agente cuando responda."
          />
          <FormField
            label="Instrucciones"
            htmlFor="avatar-edit-instructions"
            hint="Ejemplo: responde con claridad, pregunta cuando falte contexto y evita inventar."
            error={errors.instructions}
          >
            <Textarea
              id="avatar-edit-instructions"
              value={state.instructions}
              invalid={Boolean(errors.instructions)}
              onChange={(event) => onFieldChange("instructions", event.currentTarget.value)}
            />
          </FormField>
        </section>

        <section className={styles.section}>
          <SectionHeader
            title="Contexto"
            description="Agrega información para orientar las respuestas del agente."
          />
          <FormField label="Contexto textual" htmlFor="avatar-edit-context">
            <Textarea
              id="avatar-edit-context"
              value={state.context}
              maxLength={20_000}
              onChange={(event) => onFieldChange("context", event.currentTarget.value)}
            />
          </FormField>
          <DocumentFileDrop files={state.files} onFilesSelected={(files) => onFieldChange("files", files)} />
        </section>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className={styles.sectionHeader}>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
