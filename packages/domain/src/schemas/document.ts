import { z } from "zod";
import { YuniIdSchema } from "../ids";

export const CreateDocumentInputSchema = z.strictObject({
  avatarAgentId: YuniIdSchema,
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().trim().min(1),
});

export type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>;

export const SupportedDocumentMimeTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/html",
  "application/epub+zip",
]);

export type SupportedDocumentMimeType = z.infer<typeof SupportedDocumentMimeTypeSchema>;

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_CONTEXT_CHARACTERS = 20_000;

export const PresignDocumentUploadInputSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255),
  mimeType: SupportedDocumentMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_SIZE_BYTES),
});

export type PresignDocumentUploadInput = z.infer<typeof PresignDocumentUploadInputSchema>;

export const CreateDocumentChunkInputSchema = z.strictObject({
  content: z.string().min(1),
  embedding: z.record(z.string(), z.unknown()).optional(),
  chunkIndex: z.number().int().nonnegative(),
  tokenCount: z.number().int().positive().optional(),
});

export type CreateDocumentChunkInput = z.infer<typeof CreateDocumentChunkInputSchema>;
