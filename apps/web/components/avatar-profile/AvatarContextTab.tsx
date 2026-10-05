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
  manager?: ReturnType<typeof useAvatarContext>;
}) {
  if (props.manager) return <ManagedContextTab manager={props.manager} />;
  if (!props.avatarId && props.avatar) {
    return <StaticContextTab />;
  }
  const avatarId = props.avatarId ?? props.avatar?.id ?? "";
  return <ContextTabLoader key={avatarId} avatarId={avatarId} />;
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

function ContextTabLoader({ avatarId }: { avatarId: string }) {
  const manager = useAvatarContext(avatarId);
  return <ManagedContextTab manager={manager} />;
}

export function ManagedContextTab({ manager }: { manager: ReturnType<typeof useAvatarContext> }) {
  const context = manager.context;
  if (manager.loading && !context) {
    return <LoadingState title="Cargando contexto" description="Buscando texto y documentos." />;
  }
  if (!context) {
    return (
      <div className={styles.contextNotice} role="alert">
        <YuniIcon name="warning" />
        <div>
          <strong>No pudimos cargar el contexto</strong>
          <p>{manager.error}</p>
        </div>
        <Button variant="secondary" onClick={() => void manager.reload()}>
          Volver a intentar
        </Button>
      </div>
    );
  }
  const documents = [...context.documents].sort(
    (a, b) => Number(b.status === "failed") - Number(a.status === "failed")
  );
  const failed = documents.filter((document) => document.status === "failed").length;
  const ready = documents.filter((document) => document.status === "ready").length;
  const pending = documents.length - ready - failed;
  const changed = manager.text.trim() !== context.text;
  const textFailed = context.textStatus === "failed";

  return (
    <div className={styles.contextWorkspace}>
      {manager.error ? (
        <div className={styles.contextRefreshError} role="alert">
          <span>No pudimos actualizar el estado. {manager.error}</span>
          <Button variant="ghost" onClick={() => void manager.reload()}>
            Actualizar
          </Button>
        </div>
      ) : null}
      <Card className={`${styles.panel} ${styles.documentsPanel}`} padding="md">
        <div className={styles.contextSectionHeader}>
          <div>
            <h2>Documentos</h2>
            <p>Fuentes que el avatar consulta para responder.</p>
          </div>
          <span className={styles.sourceCount}>{documents.length}</span>
        </div>
        {documents.length > 0 ? (
          <div className={styles.sourceSummary} aria-label="Estado de los documentos">
            <span>
              <YuniIcon name="success" size={16} /> {ready} listos
            </span>
            {failed > 0 ? (
              <span data-tone="danger">
                <YuniIcon name="warning" size={16} /> {failed} con errores
              </span>
            ) : null}
            {pending > 0 ? (
              <span>
                <YuniIcon name="clock" size={16} /> {pending} en preparación
              </span>
            ) : null}
          </div>
        ) : null}

        {documents.length ? (
          <ul className={styles.documentList} aria-label="Documentos de contexto">
            {documents.map((document) => {
              const busy = manager.pendingDocuments[document.id];
              const failedDocument = document.status === "failed";
              return (
                <li key={document.id} data-status={document.status}>
                  <div className={styles.documentRow}>
                    <span className={styles.documentIcon} aria-hidden="true">
                      <YuniIcon name="document" size={20} />
                    </span>
                    <div className={styles.documentIdentity}>
                      <strong>{document.fileName}</strong>
                      <span>
                        {formatBytes(document.sizeBytes)} <span aria-hidden="true">·</span>{" "}
                        {documentStatus(document.status)}
                      </span>
                    </div>
                    {!failedDocument ? (
                      <YuniIcon
                        name={document.status === "ready" ? "success" : "clock"}
                        size={18}
                        className={styles.documentStateIcon}
                      />
                    ) : null}
                  </div>
                  {failedDocument ? (
                    <div className={styles.documentFailure}>
                      <p>
                        {document.error ||
                          "No recibimos un motivo específico. Reintentá procesar el documento."}
                      </p>
                      <small>
                        {document.hasPreviousUsableVersion
                          ? "El avatar sigue usando la última versión disponible de este archivo."
                          : "Este archivo todavía no está disponible para las conversaciones."}
                      </small>
                    </div>
                  ) : null}
                  <div className={styles.documentActions}>
                    {failedDocument ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Reintentar ${document.fileName}`}
                        loading={busy === "retry"}
                        disabled={Boolean(busy)}
                        onClick={() => void manager.retry(document.id, document.fileName)}
                      >
                        Reintentar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Eliminar ${document.fileName}`}
                      loading={busy === "remove"}
                      disabled={Boolean(busy) || document.status === "deleting"}
                      onClick={() => void manager.remove(document.id, document.fileName)}
                    >
                      Eliminar
                    </Button>
                  </div>
                  {manager.documentErrors[document.id] ? (
                    <p className={styles.contextError} role="alert">
                      {manager.documentErrors[document.id]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.documentEmptyState}>
            <YuniIcon name="document" size={24} />
            <div>
              <strong>Agregá la primera fuente</strong>
              <p>Manuales, preguntas frecuentes o material de referencia para tu avatar.</p>
            </div>
          </div>
        )}

        <div className={styles.compactUpload}>
          <DocumentFileDrop files={[]} onFilesSelected={(files) => void manager.upload(files)} />
        </div>
        {manager.uploads.some((upload) => upload.status !== "confirmed") ? (
          <ul className={styles.uploadList} aria-label="Subidas en curso">
            {manager.uploads
              .filter((upload) => upload.status !== "confirmed")
              .map((upload) => (
                <li key={upload.key}>
                  <strong>{upload.fileName}</strong>
                  {upload.status === "failed" ? (
                    <p role="alert">{upload.error} Volvé a seleccionar el archivo para subirlo.</p>
                  ) : (
                    <>
                      <span>Subiendo · {upload.progress}%</span>
                      <progress
                        aria-label={`Subiendo ${upload.fileName}`}
                        max={100}
                        value={upload.progress}
                      />
                    </>
                  )}
                </li>
              ))}
          </ul>
        ) : null}
      </Card>

      <Card className={`${styles.panel} ${styles.textPanel}`} padding="md">
        <div className={styles.contextSectionHeader}>
          <div>
            <h2>Contexto textual</h2>
            <p>
              Datos breves que el avatar debe tener presentes. Su forma de responder se define en
              Personalidad.
            </p>
          </div>
        </div>
        {context.textStatus ? (
          <div className={styles.textState}>
            <Badge tone={textFailed ? "danger" : context.textStatus === "processing" ? "warning" : "neutral"}>
              {textFailed
                ? "No se pudo actualizar"
                : context.textStatus === "processing"
                  ? "Preparando texto"
                  : context.text
                    ? "Texto listo"
                    : "Sin texto adicional"}
            </Badge>
          </div>
        ) : null}
        {textFailed ? (
          <div className={styles.textFailure}>
            <p>{context.textError || "No pudimos actualizar el texto. Reintentá guardarlo."}</p>
            {context.textHasPreviousUsableVersion ? (
              <small>El avatar sigue usando la última versión disponible del texto.</small>
            ) : null}
          </div>
        ) : null}
        <label className={styles.contextEditor}>
          <span className={styles.editorLabel}>Información para el avatar</span>
          <Textarea
            value={manager.text}
            maxLength={20_000}
            rows={9}
            placeholder="Por ejemplo: nuestros horarios, detalles del producto o información de la organización."
            onChange={(event) => manager.setText(event.currentTarget.value)}
          />
          <small>{manager.text.length.toLocaleString("es-AR")} / 20.000 caracteres</small>
        </label>
        <div className={styles.textSaveActions}>
          <Button
            variant="secondary"
            loading={manager.saving}
            disabled={manager.saving || (!changed && !textFailed)}
            onClick={() => void manager.saveText()}
          >
            {textFailed && !changed ? "Reintentar guardar" : "Guardar contexto"}
          </Button>
          {changed ? <span>Cambios sin guardar</span> : null}
        </div>
        {manager.saveError ? (
          <p className={styles.contextError} role="alert">
            {manager.saveError}
          </p>
        ) : null}
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
      ? "No se pudo procesar"
      : status === "pending_upload"
        ? "Esperando subida"
        : status === "deleting"
          ? "Eliminando"
          : "Procesando";
}
