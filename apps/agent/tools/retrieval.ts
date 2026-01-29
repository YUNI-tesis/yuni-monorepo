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

export interface DocumentSummary {
  documentId: string;
  filename: string;
  mainTopic: string;
  sections: Array<{
    title: string;
    description: string;
  }>;
  keyEntities: Array<{
    type: string;
    value: string;
  }>;
  conclusions: string[];
}

export interface RetrievalContext {
  summaryContext: string;
  detailedChunks: DocumentChunk[];
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
 * Analyze query to determine if it's GENERAL or SPECIFIC
 */
function analyzeQueryType(query: string): "general" | "specific" {
  const lowerQuery = query.toLowerCase();

  // Specific query indicators
  const specificIndicators = [
    "exacto",
    "exact",
    "número",
    "number",
    "fecha",
    "date",
    "cuándo",
    "when",
    "cuánto",
    "how much",
    "how many",
    "cita",
    "quote",
    "literalmente",
    "literally",
    "específicamente",
    "specifically",
    "página",
    "page",
    "sección",
    "section",
    "valor",
    "value",
  ];

  // General query indicators
  const generalIndicators = [
    "resumen",
    "summary",
    "sobre qué",
    "what about",
    "de qué trata",
    "qué es",
    "what is",
    "explica",
    "explain",
    "describe",
    "general",
    "visión general",
    "overview",
    "principales",
    "main",
  ];

  // Check for specific indicators
  for (const indicator of specificIndicators) {
    if (lowerQuery.includes(indicator)) {
      return "specific";
    }
  }

  // Check for general indicators
  for (const indicator of generalIndicators) {
    if (lowerQuery.includes(indicator)) {
      return "general";
    }
  }

  // If query is short (< 10 words), likely general
  if (query.split(/\s+/).length < 10) {
    return "general";
  }

  // Default to specific for safety (better to over-retrieve than under-retrieve)
  return "specific";
}

/**
 * Retrieve document summaries for an agent
 */
async function getDocumentSummaries(agentId: string): Promise<DocumentSummary[]> {
  try {
    const documents = await prisma.document.findMany({
      where: {
        agentId,
        status: "READY",
        summaryStatus: "READY",
        summary: { not: null },
      },
      select: {
        id: true,
        filename: true,
        summary: true,
      },
    });

    return documents.map((doc) => ({
      documentId: doc.id,
      filename: doc.filename,
      ...(doc.summary as any),
    }));
  } catch (error: any) {
    console.error("Error retrieving summaries:", error);
    return [];
  }
}

/**
 * Intelligent retrieval combining summaries and chunks based on query type
 */
export async function retrieveContextForAgent(
  agentId: string,
  query: string,
  limit: number = 6
): Promise<RetrievalContext> {
  const queryType = analyzeQueryType(query);

  // Always get summaries
  const summaries = await getDocumentSummaries(agentId);

  if (queryType === "general") {
    // For general queries, use primarily summaries
    return {
      summaryContext: formatSummaries(summaries),
      detailedChunks: [], // No detailed chunks for general queries
    };
  }

  // For specific queries, use summaries + detailed chunks
  const chunks = await retrieveRelevantChunks(agentId, query, limit);

  return {
    summaryContext: formatSummaries(summaries),
    detailedChunks: chunks,
  };
}

/**
 * Format document summaries into context string
 */
function formatSummaries(summaries: DocumentSummary[]): string {
  if (summaries.length === 0) {
    return "";
  }

  const summaryTexts = summaries.map((summary) => {
    const sectionsText = summary.sections
      .map((s) => `  - ${s.title}: ${s.description}`)
      .join("\n");

    const entitiesText =
      summary.keyEntities.length > 0
        ? `\nKey Entities: ${summary.keyEntities.map((e) => `${e.value} (${e.type})`).join(", ")}`
        : "";

    const conclusionsText =
      summary.conclusions.length > 0
        ? `\nConclusions:\n${summary.conclusions.map((c) => `  - ${c}`).join("\n")}`
        : "";

    return `[Document: ${summary.filename}]
Topic: ${summary.mainTopic}

Sections:
${sectionsText}${entitiesText}${conclusionsText}`;
  });

  return `--- Document Summaries ---\n\n${summaryTexts.join("\n\n---\n\n")}\n\n--- End of Summaries ---`;
}

/**
 * Format retrieved chunks into a context string for the LLM prompt
 */
export function formatDetailedChunks(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) {
    return "";
  }

  const contextParts = chunks.map(
    (chunk) => `[doc:${chunk.documentId} chunk:${chunk.index}]\n${chunk.text}`
  );

  return `\n\n--- Detailed Context from Documents ---\n${contextParts.join("\n\n---\n\n")}\n--- End of Detailed Context ---\n`;
}

/**
 * Format complete retrieval context (summaries + chunks)
 */
export function formatRetrievalContext(context: RetrievalContext): string {
  const parts: string[] = [];

  if (context.summaryContext) {
    parts.push(context.summaryContext);
  }

  if (context.detailedChunks.length > 0) {
    parts.push(formatDetailedChunks(context.detailedChunks));
  }

  if (parts.length === 0) {
    return "";
  }

  return `\n\n${parts.join("\n\n")}\n`;
}
