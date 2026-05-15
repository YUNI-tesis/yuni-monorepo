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

export const CreateDocumentChunkInputSchema = z.strictObject({
  content: z.string().min(1),
  embedding: z.record(z.string(), z.unknown()).optional(),
  chunkIndex: z.number().int().nonnegative(),
  tokenCount: z.number().int().positive().optional(),
});

export type CreateDocumentChunkInput = z.infer<typeof CreateDocumentChunkInputSchema>;
