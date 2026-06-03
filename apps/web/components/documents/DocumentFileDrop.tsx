"use client";

import React, { useState } from "react";
import { FileDrop } from "@yuni/ui";
import {
  acceptedDocumentExtensions,
  formatDocumentFileSize,
  maxDocumentFileSizeBytes,
  maxDocumentFiles,
  validateDocumentFiles,
  type DocumentFileRejection,
  type ExistingDocumentPreview,
} from "../../lib/document-files";
import styles from "./DocumentFileDrop.module.css";

export type DocumentFileDropProps = {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  existingDocuments?: ExistingDocumentPreview[];
  title?: string;
  description?: string;
};

export function DocumentFileDrop({
  files,
  onFilesSelected,
  existingDocuments = [],
  title = "Subir documentos de contexto",
  description = "Carga PDF, TXT, DOC o DOCX para que el agente pueda basar sus respuestas en ese contenido.",
}: DocumentFileDropProps) {
  const [rejections, setRejections] = useState<DocumentFileRejection[]>([]);

  function handleFilesSelected(proposedFiles: File[]) {
    if (proposedFiles.length < files.length) {
      setRejections([]);
      onFilesSelected(proposedFiles);
      return;
    }

    const incomingFiles = proposedFiles.filter((file) => !files.some((existingFile) => isSameFile(existingFile, file)));
    const result = validateDocumentFiles(files, incomingFiles);

    setRejections(result.rejections);
    onFilesSelected(result.acceptedFiles);
  }

  return (
    <div className={styles.root}>
      {existingDocuments.length > 0 ? (
        <section className={styles.existing} aria-label="Documentos existentes">
          <div className={styles.sectionHeader}>
            <strong>Documentos asociados</strong>
            <span>Archivos de contexto disponibles para este avatar.</span>
          </div>
          <ul className={styles.list}>
            {existingDocuments.map((document) => (
              <li className={styles.item} key={document.id}>
                <span className={styles.fileIcon} aria-hidden="true">
                  DOC
                </span>
                <span className={styles.fileInfo}>
                  <strong>{document.fileName}</strong>
                  <span>
                    {formatDocumentFileSize(document.sizeBytes)} · {formatDocumentStatus(document.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FileDrop
        title={title}
        description={description}
        accept={acceptedDocumentExtensions.join(",")}
        files={files}
        onFilesSelected={handleFilesSelected}
      />

      <p className={styles.note}>
        Máximo {maxDocumentFiles} archivos de {formatDocumentFileSize(maxDocumentFileSizeBytes)} cada uno.
      </p>

      {rejections.length > 0 ? (
        <ul className={styles.errors} aria-label="Archivos rechazados">
          {rejections.map((rejection) => (
            <li key={`${rejection.file.name}-${rejection.reason}`}>{rejection.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isSameFile(leftFile: File, rightFile: File): boolean {
  return (
    leftFile.name === rightFile.name &&
    leftFile.size === rightFile.size &&
    leftFile.lastModified === rightFile.lastModified
  );
}

function formatDocumentStatus(status: ExistingDocumentPreview["status"]): string {
  const labels: Record<ExistingDocumentPreview["status"], string> = {
    uploaded: "Subido",
    ingesting: "Procesando",
    ready: "Listo",
    failed: "Falló",
  };

  return labels[status];
}
