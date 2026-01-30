import { prisma, Prisma } from "@yuni/database";
import { classifyQueryWithLLM } from "./query-classifier";

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
 */
export async function retrieveRelevantChunks(
  agentId: string,
  query: string,
  limit: number = 6
): Promise<DocumentChunk[]> {
  // Extract keywords from query (words >= 3 chars)
  // Support Unicode letters (including ñ, á, é, etc.) and numbers
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, "")) // Remove punctuation (¿?.,;:!etc)
    .filter((word) => word.length >= 3)
    .filter((word) => /^[\p{L}\p{N}]+$/u.test(word)) // Unicode letters and numbers
    .filter((word) => !/^[0-9]+$/.test(word)); // Exclude pure numbers

  console.log(`[RAG] Extracted keywords: [${keywords.join(", ")}]`);

  if (keywords.length === 0) {
    console.log(`[RAG] No valid keywords found`);
    return [];
  }

  try {
    const whereConditions = keywords.map((keyword) => ({
      text: {
        contains: keyword,
        mode: "insensitive" as const,
      },
    }));

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
    return [];
  }
}

/**
 * Analyze query to determine if it's GENERAL or SPECIFIC
 */
function analyzeQueryType(query: string): "general" | "specific" {
  const lowerQuery = query.toLowerCase();
  
  // Remove punctuation for better matching
  const cleanQuery = lowerQuery.replace(/[^\p{L}\p{N}\s]/gu, "");

  const specificIndicators = [
    "contraseña", "password", "clave", "código", "code",
    "exacto", "exact", "número", "number", "fecha", "date",
    "cuándo", "when", "cuánto", "how much", "how many",
    "cita", "quote", "literalmente", "literally",
    "específicamente", "specifically", "página", "page",
    "sección", "section", "valor", "value", "cuál", "cual",
    "which", "qué dice", "what does", "dónde dice", "where does",
  ];

  const generalIndicators = [
    "resumen", "summary", "sobre qué", "what about",
    "de qué trata", "qué es", "what is", "explica", "explain",
    "describe", "general", "visión general", "overview",
    "principales", "main",
  ];

  // Check for specific indicators first (higher priority)
  for (const indicator of specificIndicators) {
    if (cleanQuery.includes(indicator)) {
      console.log(`[RAG] Matched specific indicator: "${indicator}"`);
      return "specific";
    }
  }

  // Check for general indicators
  for (const indicator of generalIndicators) {
    if (cleanQuery.includes(indicator)) {
      console.log(`[RAG] Matched general indicator: "${indicator}"`);
      return "general";
    }
  }

  // Default to specific for safety (better to retrieve chunks than miss info)
  console.log(`[RAG] No indicator matched, defaulting to specific`);
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
        summary: { not: Prisma.DbNull },
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
  console.log(`[RAG] Query: "${query}"`);
  // Use LLM-based classification for better accuracy (Phase 1 improvement)
  const queryType = await classifyQueryWithLLM(query);
  console.log(`[RAG] Query type: ${queryType}`);

  const summaries = await getDocumentSummaries(agentId);
  console.log(`[RAG] Found ${summaries.length} document summaries`);

  // Always retrieve chunks for specific queries OR when summaries are not available
  const shouldRetrieveChunks = queryType === "specific" || summaries.length === 0;
  
  if (shouldRetrieveChunks) {
    const chunks = await retrieveRelevantChunks(agentId, query, limit);
    console.log(`[RAG] Found ${chunks.length} relevant chunks`);
    if (chunks.length > 0) {
      console.log(`[RAG] First chunk preview: ${chunks[0].text.substring(0, 100)}...`);
    }

    return {
      summaryContext: formatSummaries(summaries),
      detailedChunks: chunks,
    };
  }

  // For general queries with available summaries, use summaries only
  console.log(`[RAG] Using summaries only (general query with ${summaries.length} summaries)`);
  return {
    summaryContext: formatSummaries(summaries),
    detailedChunks: [],
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
