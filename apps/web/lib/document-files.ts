export const acceptedDocumentExtensions = [".pdf", ".txt", ".doc", ".docx"] as const;

export const acceptedDocumentMimeTypes = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const maxDocumentFileSizeBytes = 10 * 1024 * 1024;
export const maxDocumentFiles = 5;

export type AcceptedDocumentFile = File;

export type ExistingDocumentPreview = {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: "uploaded" | "ingesting" | "ready" | "failed";
};

export type DocumentFileRejectionReason =
  | "unsupported-type"
  | "file-too-large"
  | "too-many-files"
  | "duplicate";

export type DocumentFileRejection = {
  file: File;
  reason: DocumentFileRejectionReason;
  message: string;
};

export type ValidateDocumentFilesResult = {
  acceptedFiles: AcceptedDocumentFile[];
  rejections: DocumentFileRejection[];
};

export function validateDocumentFiles(
  existingFiles: readonly File[],
  incomingFiles: readonly File[]
): ValidateDocumentFilesResult {
  const acceptedFiles = [...existingFiles];
  const seenKeys = new Set(existingFiles.map(getDocumentFileKey));
  const rejections: DocumentFileRejection[] = [];

  for (const file of incomingFiles) {
    if (seenKeys.has(getDocumentFileKey(file))) {
      rejections.push(createRejection(file, "duplicate"));
      continue;
    }

    if (!isAcceptedDocumentType(file)) {
      rejections.push(createRejection(file, "unsupported-type"));
      continue;
    }

    if (file.size > maxDocumentFileSizeBytes) {
      rejections.push(createRejection(file, "file-too-large"));
      continue;
    }

    if (acceptedFiles.length >= maxDocumentFiles) {
      rejections.push(createRejection(file, "too-many-files"));
      continue;
    }

    acceptedFiles.push(file);
    seenKeys.add(getDocumentFileKey(file));
  }

  return { acceptedFiles, rejections };
}

export function formatDocumentFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isAcceptedDocumentType(file: File): boolean {
  const extension = getFileExtension(file.name);

  if (extension && acceptedDocumentExtensions.includes(extension)) {
    return true;
  }

  return Boolean(file.type) && acceptedDocumentMimeTypes.includes(file.type as (typeof acceptedDocumentMimeTypes)[number]);
}

function getFileExtension(fileName: string): (typeof acceptedDocumentExtensions)[number] | "" {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  const extension = fileName.slice(dotIndex).toLowerCase();
  return acceptedDocumentExtensions.find((acceptedExtension) => acceptedExtension === extension) ?? "";
}

function getDocumentFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function createRejection(file: File, reason: DocumentFileRejectionReason): DocumentFileRejection {
  return {
    file,
    reason,
    message: getRejectionMessage(file, reason),
  };
}

function getRejectionMessage(file: File, reason: DocumentFileRejectionReason): string {
  if (reason === "unsupported-type") {
    return `${file.name}: formato no soportado. Usa PDF, TXT, DOC o DOCX.`;
  }

  if (reason === "file-too-large") {
    return `${file.name}: supera el máximo de ${formatDocumentFileSize(maxDocumentFileSizeBytes)}.`;
  }

  if (reason === "too-many-files") {
    return `${file.name}: solo puedes seleccionar hasta ${maxDocumentFiles} archivos.`;
  }

  return `${file.name}: este archivo ya está seleccionado.`;
}
