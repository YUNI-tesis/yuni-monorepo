"use client";

import { useState, type MouseEvent } from "react";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Textarea,
  YuniIcon,
  type YuniIconName,
  useToast,
} from "@yuni/ui";
import type { AvatarEditState, AvatarEditValidation } from "../../hooks/useAvatarEdit";
import type { ElevenLabsVoiceOptionsState } from "../../hooks/useElevenLabsVoiceOptions";
import type { LiveAvatarOptionsState } from "../../hooks/useLiveAvatarOptions";
import { LiveAvatarPicker } from "../live-avatar/LiveAvatarPicker";
import { VoiceSelector } from "../voice/VoiceSelector";
import { AvatarStatusSelector, avatarStatusOptions } from "./AvatarStatusSelector";
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
  const selectedAvatar = liveAvatarOptions.options.find((option) => option.id === state.liveAvatarId) ?? null;
  const thumbnailUrl = selectedAvatar?.thumbnailUrl ?? state.liveAvatarThumbnailUrl;
  const visualName = selectedAvatar?.displayName ?? state.liveAvatarDisplayName;
  const status =
    avatarStatusOptions.find((option) => option.value === state.status) ?? avatarStatusOptions[1];
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.editorLayout}>
        <aside className={styles.previewColumn} aria-label="Resumen del avatar">
          <Card className={styles.summaryCard} padding="md">
            <div className={styles.summaryVisual}>
              {thumbnailUrl && failedThumbnailUrl !== thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={`Vista previa de ${visualName || state.name}`}
                  width={320}
                  height={240}
                  onError={() => setFailedThumbnailUrl(thumbnailUrl)}
                />
              ) : (
                <span aria-hidden="true">{getAvatarInitial(state.name)}</span>
              )}
            </div>
            <div className={styles.summaryIdentity}>
              <Badge tone={status?.tone ?? "neutral"}>{status?.label ?? "Sin estado"}</Badge>
              <div>
                <strong>{state.name.trim() || "Avatar sin nombre"}</strong>
                <p>{state.description.trim() || "Agregá una descripción para reconocerlo fácilmente."}</p>
              </div>
            </div>
          </Card>

          <nav className={styles.sectionNav} aria-label="Secciones de edición">
            <span className={styles.sectionNavLabel}>Configuración</span>
            <div className={styles.sectionLinks}>
              <a href="#avatar-edit-identity" onClick={handleSectionNavigation}>
                <YuniIcon name="user" />
                <span>Identidad y estado</span>
              </a>
              <a href="#avatar-edit-presence" onClick={handleSectionNavigation}>
                <YuniIcon name="sparkles" />
                <span>Apariencia y voz</span>
              </a>
              <a href="#avatar-edit-personality" onClick={handleSectionNavigation}>
                <YuniIcon name="aiBrain" />
                <span>Personalidad</span>
              </a>
            </div>
          </nav>
        </aside>

        <div className={styles.sections}>
          <Card
            as="section"
            id="avatar-edit-identity"
            className={styles.section}
            padding="md"
            aria-labelledby="avatar-edit-identity-title"
          >
            <SectionHeader
              id="avatar-edit-identity-title"
              icon="user"
              title="Identidad y estado"
              description="La información con la que vas a reconocerlo y definir quién puede usarlo."
            />
            <div className={styles.identityFields}>
              <div className={styles.nameField}>
                <FormField label="Nombre" htmlFor="avatar-edit-name" error={errors.name}>
                  <Input
                    id="avatar-edit-name"
                    value={state.name}
                    invalid={Boolean(errors.name)}
                    placeholder="Ejemplo: Guía de producto"
                    onChange={(event) => onFieldChange("name", event.currentTarget.value)}
                  />
                </FormField>
              </div>
              <div className={styles.descriptionField}>
                <FormField
                  label="Descripción"
                  htmlFor="avatar-edit-description"
                  hint="Se muestra en el perfil y ayuda a diferenciarlo de otros avatares."
                >
                  <Textarea
                    id="avatar-edit-description"
                    className={styles.descriptionInput}
                    value={state.description}
                    placeholder="Contá brevemente para qué sirve este avatar."
                    onChange={(event) => onFieldChange("description", event.currentTarget.value)}
                  />
                </FormField>
              </div>
            </div>
            <div className={styles.subsection}>
              <SubsectionHeader
                title="Disponibilidad"
                description="Elegí el estado según el momento de uso del avatar."
              />
              <AvatarStatusSelector
                status={state.status}
                onChange={(nextStatus) => onFieldChange("status", nextStatus)}
              />
            </div>
          </Card>

          <Card
            as="section"
            id="avatar-edit-presence"
            className={styles.section}
            padding="md"
            aria-labelledby="avatar-edit-presence-title"
          >
            <SectionHeader
              id="avatar-edit-presence-title"
              icon="sparkles"
              title="Apariencia y voz"
              description="Definí cómo se ve y cómo se escucha durante una interacción."
            />
            <div className={styles.subsectionPlain}>
              <SubsectionHeader
                title="Avatar visual"
                description="La apariencia que verán las personas durante la conversación."
              />
              <LiveAvatarPicker
                optionsState={liveAvatarOptions}
                selectedId={state.liveAvatarId}
                error={errors.liveAvatarId}
                onSelect={(avatarId) => onFieldChange("liveAvatarId", avatarId)}
              />
            </div>
            <div className={styles.subsection}>
              <SubsectionHeader
                title="Voz"
                description="Escuchá las muestras y elegí el tono que mejor represente al avatar."
              />
              {voiceOptions.status === "loading" ? (
                <LoadingState
                  title="Cargando voces"
                  description="Estamos preparando el catálogo disponible."
                />
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
            </div>
          </Card>

          <Card
            as="section"
            id="avatar-edit-personality"
            className={styles.section}
            padding="md"
            aria-labelledby="avatar-edit-personality-title"
          >
            <SectionHeader
              id="avatar-edit-personality-title"
              icon="aiBrain"
              title="Personalidad"
              description="Indicá cómo debe comportarse y responder durante una conversación."
            />
            <FormField
              label="Instrucciones de comportamiento"
              htmlFor="avatar-edit-instructions"
              hint="Ejemplo: respondé con claridad, preguntá cuando falte información y evitá inventar."
              error={errors.instructions}
            >
              <Textarea
                id="avatar-edit-instructions"
                className={styles.instructionsInput}
                value={state.instructions}
                invalid={Boolean(errors.instructions)}
                placeholder="Describí el tono, los límites y la forma de responder."
                onChange={(event) => onFieldChange("instructions", event.currentTarget.value)}
              />
            </FormField>
          </Card>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.actionCopy}>
          <YuniIcon name="edit" aria-hidden="true" />
          <span>
            <strong>¿Todo listo?</strong>
            <small>Guardá para aplicar los cambios al avatar.</small>
          </span>
        </div>
        <div className={styles.actionButtons}>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  );
}

function SectionHeader({
  id,
  icon,
  title,
  description,
}: {
  id: string;
  icon: YuniIconName;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionIcon} aria-hidden="true">
        <YuniIcon name={icon} />
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function SubsectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className={styles.subsectionHeader}>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function getAvatarInitial(name: string) {
  return name.trim().slice(0, 1).toLocaleUpperCase("es") || "A";
}

function handleSectionNavigation(event: MouseEvent<HTMLAnchorElement>) {
  const sectionId = event.currentTarget.hash.slice(1);
  const section = document.getElementById(sectionId);

  if (!section) return;

  event.preventDefault();

  const prefersReducedMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  section.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });

  if (window.location.hash !== event.currentTarget.hash) {
    window.history.pushState(null, "", event.currentTarget.hash);
  }
}
