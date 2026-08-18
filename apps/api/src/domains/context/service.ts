import { createHash, randomUUID } from "node:crypto";
import {
  MAX_CONTEXT_CHARACTERS,
  MAX_DOCUMENT_SIZE_BYTES,
  OwnershipError,
  type PresignDocumentUploadInput,
} from "@yuni/domain";
import type { ObjectStorage } from "@yuni/storage";
import { DocumentStateConflictError, type AvatarContextRepository } from "./repository";

const EXTENSIONS_BY_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "text/plain": ["txt"],
  "text/markdown": ["md", "markdown"],
  "text/html": ["html", "htm"],
  "application/epub+zip": ["epub"],
};

export class ContextNotFoundError extends Error {}
export class ContextStorageUnavailableError extends Error {}
export class InvalidStoredUploadError extends Error {}

export type AvatarContextServiceDependencies = {
  repository: AvatarContextRepository;
  storage?: ObjectStorage;
};

export function createAvatarContextService(dependencies: AvatarContextServiceDependencies) {
  const requireStorage = () => {
    if (!dependencies.storage) throw new ContextStorageUnavailableError("Document storage is not configured");
    return dependencies.storage;
  };

  return {
    async get(ownerId: string, avatarId: string) {
      try {
        return toContextDto(await dependencies.repository.getForOwner(ownerId, avatarId));
      } catch (error) {
        throw mapOwnership(error);
      }
    },

    async updateText(ownerId: string, avatarId: string, text: string) {
      if (text.length > MAX_CONTEXT_CHARACTERS) {
        throw new InvalidStoredUploadError("Context exceeds 20,000 characters");
      }
      const fingerprint = createHash("sha256").update(text).digest("hex");
      try {
        await dependencies.repository.updateText(ownerId, avatarId, text, fingerprint);
        return toContextDto(await dependencies.repository.getForOwner(ownerId, avatarId));
      } catch (error) {
        throw mapOwnership(error);
      }
    },

    async presign(ownerId: string, avatarId: string, input: PresignDocumentUploadInput) {
      validateFileExtension(input.fileName, input.mimeType);
      const storage = requireStorage();
      const documentId = randomUUID();
      const storageKey = `avatars/${avatarId}/documents/${documentId}/${sanitizeFileName(input.fileName)}`;
      try {
        const document = await dependencies.repository.createPendingDocument(
          ownerId,
          avatarId,
          documentId,
          storageKey,
          input
        );
        const upload = await storage.createPresignedUpload({ key: storageKey, contentType: input.mimeType });
        return { document: toDocumentDto(document), upload };
      } catch (error) {
        throw mapOwnership(error);
      }
    },

    async confirm(ownerId: string, documentId: string) {
      const storage = requireStorage();
      const document = await dependencies.repository.findDocumentForOwner(ownerId, documentId);
      if (!document || document.deletedAt) throw new ContextNotFoundError("Document not found");
      if (document.uploadConfirmedAt) return toDocumentDto(document);
      const object = await storage.head(document.storageKey);
      if (!object) throw new InvalidStoredUploadError("Uploaded file was not found");
      if (object.sizeBytes !== document.sizeBytes || object.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
        throw new InvalidStoredUploadError("Uploaded file size does not match the request");
      }
      if (normalizeMime(object.contentType) !== document.mimeType) {
        throw new InvalidStoredUploadError("Uploaded file type does not match the request");
      }
      return toDocumentDto(await dependencies.repository.confirmUpload(ownerId, documentId, object.etag));
    },

    async retry(ownerId: string, documentId: string) {
      try {
        return toDocumentDto(await dependencies.repository.retry(ownerId, documentId));
      } catch (error) {
        if (error instanceof DocumentStateConflictError) throw error;
        throw mapOwnership(error);
      }
    },

    async remove(ownerId: string, documentId: string) {
      try {
        await dependencies.repository.markDeleting(ownerId, documentId);
        return { ok: true } as const;
      } catch (error) {
        throw mapOwnership(error);
      }
    },
  };
}

function toContextDto(record: Awaited<ReturnType<AvatarContextRepository["getForOwner"]>>) {
  const documents = record.documents.map(toDocumentDto);
  const statuses = [record.providerContextSyncStatus, ...documents.map((document) => document.status)];
  const status = statuses.some((value) => value === "failed")
    ? "failed"
    : statuses.some((value) =>
          ["pending", "pending_upload", "processing", "syncing", "deleting"].includes(value)
        )
      ? "processing"
      : "ready";
  return {
    text: record.context,
    status,
    hasPreviousUsableVersion: Boolean(record.providerContextLastUsableAt || record.providerLastUsableAt),
    updatedAt: record.updatedAt.toISOString(),
    documents,
  };
}

function toDocumentDto(document: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  providerSync?: { status: string; providerLastUsableAt: Date | null } | null;
}) {
  const providerStatus = document.providerSync?.status;
  const status =
    document.status === "pending_upload"
      ? "pending_upload"
      : document.status === "deleting"
        ? "deleting"
        : document.status === "failed" || providerStatus === "failed"
          ? "failed"
          : document.status === "ready" && providerStatus === "synced"
            ? "ready"
            : "processing";
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status,
    hasPreviousUsableVersion: Boolean(document.providerSync?.providerLastUsableAt),
    error: status === "failed" ? "No pudimos procesar este documento. Podés reintentarlo." : null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function validateFileExtension(fileName: string, mimeType: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!EXTENSIONS_BY_MIME[mimeType]?.includes(extension)) {
    throw new InvalidStoredUploadError("File extension does not match its content type");
  }
}

function sanitizeFileName(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(-120) || "document"
  );
}

function normalizeMime(value: string | undefined) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function mapOwnership(error: unknown) {
  return error instanceof OwnershipError ? new ContextNotFoundError("Resource not found") : error;
}
