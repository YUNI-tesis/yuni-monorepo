"use client";

import { useState } from "react";
import { FileDrop } from "@yuni/ui";
import { getSupportedDocumentMimeType } from "../../lib/api/avatar-api";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function DocumentFileDrop({
  files,
  onFilesSelected,
  disabled,
}: {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  function validate(nextFiles: File[]) {
    const result = validateDocumentFiles(nextFiles);
    setError(result.error);
    onFilesSelected(result.files);
  }

  return (
    <div>
      <FileDrop
        title="Subir documentos"
        description="PDF, DOCX, TXT, Markdown, HTML o EPUB · hasta 20 MB por archivo."
        accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm,.epub"
        files={files}
        disabled={disabled}
        onFilesSelected={validate}
      />
      {error ? (
        <p className="yuni-form-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function validateDocumentFiles(nextFiles: File[]) {
  const unique = new Map<string, File>();
  let error: string | null = null;
  for (const file of nextFiles) {
    try {
      getSupportedDocumentMimeType(file);
    } catch (caughtError) {
      error ??= caughtError instanceof Error ? caughtError.message : "Formato no soportado.";
      continue;
    }
    if (file.size <= 0) {
      error ??= `${file.name} está vacío.`;
      continue;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      error ??= `${file.name} supera el límite de 20 MB.`;
      continue;
    }
    unique.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  }
  return { files: [...unique.values()], error };
}
