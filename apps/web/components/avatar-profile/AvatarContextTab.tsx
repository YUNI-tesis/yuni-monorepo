"use client";

import React from "react";
import { Badge, Button, Card, LoadingState, Textarea, YuniIcon } from "@yuni/ui";
import { DocumentFileDrop } from "../context/DocumentFileDrop";
import { useAvatarContext } from "../../hooks/useAvatarContext";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import styles from "./AvatarProfile.module.css";

export function AvatarContextTab(props: {
  avatarId?: string;
  avatar?: ApiAvatar;
  onEditContext?: () => void;
}) {
  if (!props.avatarId && props.avatar) {
    return <StaticContextTab />;
  }
  const avatarId = props.avatarId ?? props.avatar?.id ?? "";
  return <ManagedContextTab avatarId={avatarId} />;
}

function StaticContextTab() {
  return (
    <div className={styles.preparedGrid}>
      <Card className={styles.panel} padding="md">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon} aria-hidden="true">
            <YuniIcon name="aiBrain" />
          </span>
          <div>
            <h2>Contexto del avatar</h2>
            <p>
              Información que ayuda al avatar a responder con el enfoque y los conocimientos que necesitás.
            </p>
          </div>
        </div>
      </Card>
      <Card className={styles.panel} padding="md">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon} aria-hidden="true">
            <YuniIcon name="document" />
          </span>
          <div>
            <h2>Documentos</h2>
            <p>Materiales de apoyo para complementar sus respuestas.</p>
          </div>
        </div>
        <div className={styles.documentEmptyState}>
          <span className={styles.documentIcon} aria-hidden="true">
            <YuniIcon name="document" size={24} />
          </span>
          <div>
            <strong>Todavía no agregaste documentos</strong>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ManagedContextTab({ avatarId }: { avatarId: string }) {
  const manager = useAvatarContext(avatarId);
  if (manager.loading && !manager.context) {
    return <LoadingState title="Cargando contexto" description="Buscando texto y documentos." />;
  }

  return (
    <div className={styles.preparedGrid}>
      <Card className={styles.panel} padding="md">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon} aria-hidden="true">
            <YuniIcon name="aiBrain" />
          </span>
          <div>
            <h2>Contexto del avatar</h2>
            <p>
              Información que ayuda al avatar a responder con el enfoque y los conocimientos que necesitás.
            </p>
          </div>
        </div>

        <div className={styles.contextSummary}>
          <Badge
            tone={
              manager.context?.status === "ready"
                ? "success"
                : manager.context?.status === "failed"
                  ? "danger"
                  : "warning"
            }
          >
            {manager.context?.status === "ready"
              ? "Listo"
              : manager.context?.status === "failed"
                ? "Requiere atención"
                : "Procesando"}
          </Badge>
          {manager.context?.hasPreviousUsableVersion && manager.context.status !== "ready" ? (
            <span>Las conversaciones siguen usando la última versión lista.</span>
          ) : null}
        </div>

        <label className={styles.contextEditor}>
          <span>Contexto textual</span>
          <Textarea
            value={manager.text}
            maxLength={20_000}
            placeholder="Datos breves que el avatar debe tener siempre presentes."
            onChange={(event) => manager.setText(event.currentTarget.value)}
          />
          <small>{manager.text.length.toLocaleString("es-AR")} / 20.000 caracteres</small>
        </label>

        <div className={styles.inlineActions}>
          <Button
            icon={<YuniIcon name="aiBrain" />}
            loading={manager.saving}
            disabled={manager.text.trim() === manager.context?.text}
            onClick={() => void manager.saveText()}
          >
            Guardar contexto
          </Button>
        </div>
        {manager.error ? (
          <p className={styles.contextError} role="alert">
            {manager.error}
          </p>
        ) : null}
      </Card>

      <Card className={styles.panel} padding="md">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon} aria-hidden="true">
            <YuniIcon name="document" />
          </span>
          <div>
            <h2>Documentos</h2>
            <p>Materiales de apoyo que el avatar podrá usar para complementar sus respuestas.</p>
          </div>
        </div>

        <DocumentFileDrop files={[]} onFilesSelected={(files) => void manager.upload(files)} />

        {manager.uploads.length > 0 ? (
          <ul className={styles.documentList} aria-label="Subidas en curso">
            {manager.uploads.map((upload) => (
              <li key={upload.key}>
                <div>
                  <strong>{upload.fileName}</strong>
                  <span>{upload.status === "failed" ? upload.error : `${upload.progress}%`}</span>
                </div>
                <progress max={100} value={upload.progress} />
              </li>
            ))}
          </ul>
        ) : null}

        {manager.context?.documents.length ? (
          <ul className={styles.documentList} aria-label="Documentos de contexto">
            {manager.context.documents.map((document) => (
              <li key={document.id}>
                <span className={styles.documentIcon} aria-hidden="true">
                  <YuniIcon name="document" size={20} />
                </span>
                <div>
                  <strong>{document.fileName}</strong>
                  <span>
                    {formatBytes(document.sizeBytes)} · {documentStatus(document.status)}
                  </span>
                </div>
                <div className={styles.documentActions}>
                  {document.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void manager.retry(document.id, document.fileName)}
                    >
                      Reintentar
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={document.status === "deleting"}
                    onClick={() => void manager.remove(document.id, document.fileName)}
                  >
                    Eliminar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.documentEmptyState}>
            <span className={styles.documentIcon} aria-hidden="true">
              <YuniIcon name="document" size={24} />
            </span>
            <div>
              <strong>Todavía no agregaste documentos</strong>
              <p>Subí material para consultarlo durante las conversaciones.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function documentStatus(status: string) {
  return status === "ready"
    ? "Listo"
    : status === "failed"
      ? "Error"
      : status === "pending_upload"
        ? "Esperando subida"
        : status === "deleting"
          ? "Eliminando"
          : "Procesando";
}
