import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface DocumentChunk {
  id: string;
  documentId: string;
  index: number;
  text: string;
}

/**
 * Retrieve relevant document chunks for a given agent and query using naive keyword matching.
 * @param agentId - The agent ID to retrieve chunks for
 * @param query - The search query
 * @param limit - Maximum number of chunks to return (default: 6)
 * @returns Array of relevant chunks with metadata
 */
export async function retrieveRelevantChunks(
  agentId: string,
  query: string,
  limit: number = 6
): Promise<DocumentChunk[]> {
  // Extract keywords from query (words >= 3 chars)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word) => /^[a-z0-9]+$/i.test(word)); // Only alphanumeric

  if (keywords.length === 0) {
    return [];
  }

  try {
    // Build OR conditions for ILIKE matching using raw SQL for PostgreSQL ILIKE
    // Prisma doesn't have direct ILIKE support, so we use contains with case-insensitive mode
    const whereConditions = keywords.map((keyword) => ({
      text: {
        contains: keyword,
        mode: "insensitive" as const,
      },
    }));

    // Query chunks from ready documents for this agent
    const chunks = await prisma.documentChunk.findMany({
      where: {
        document: {
          agentId,
          status: "READY",
        },
        OR: whereConditions.length > 0 ? whereConditions : undefined,
      },
      include: {
        document: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { documentId: "asc" },
        { index: "asc" },
      ],
      take: limit,
    });

    return chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.document.id,
      index: chunk.index,
      text: chunk.text,
    }));
  } catch (error: any) {
    console.error("Error retrieving chunks:", error);
    // Return empty array on error to not break the flow
    return [];
  }
}

/**
 * Format retrieved chunks into a context string for the LLM prompt
 */
export function formatRetrievalContext(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) {
    return "";
  }

  const contextParts = chunks.map(
    (chunk) => `[doc:${chunk.documentId} chunk:${chunk.index}]\n${chunk.text}`
  );

  return `\n\n--- Relevant Context from Uploaded Documents ---\n${contextParts.join("\n\n---\n\n")}\n--- End of Context ---\n`;
}
