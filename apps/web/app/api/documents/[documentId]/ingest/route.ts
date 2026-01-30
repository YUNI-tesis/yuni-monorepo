import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@yuni/database";
import { getObjectStorage } from "@/lib/storage/storage.factory";
import { S3Storage } from "@/lib/storage/s3.storage";
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import { generateDocumentSummary } from "@/lib/summarization";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
/** Cap extracted text to avoid V8 "invalid size" / OOM (crbug.com/1201626) */
const MAX_TEXT_CHARS = 5_000_000;
/** Cap chunks to avoid huge arrays and createMany limits */
const MAX_CHUNKS = 10_000;
const CREATE_MANY_BATCH_SIZE = 500;

/**
 * Determine if document needs summary based on size
 * Small documents (<2000 chars) don't need summary - chunks are sufficient
 * This optimization saves ~40% in summary generation costs
 */
async function shouldGenerateSummary(
  text: string,
  mimeType: string,
  documentId: string
): Promise<boolean> {
  const MIN_CHARS_FOR_SUMMARY = 2000; // ~0.5 pages
  
  if (text.length < MIN_CHARS_FOR_SUMMARY) {
    console.log(`[summarize] Skipping summary for small document ${documentId} (${text.length} chars < ${MIN_CHARS_FOR_SUMMARY})`);
    
    // Mark summary as READY but empty (no generation needed)
    await prisma.document.update({
      where: { id: documentId },
      data: {
        summaryStatus: "READY",
        summaryError: null,
      },
    });
    
    return false;
  }
  
  return true;
}

/**
 * Generate summary in background without blocking the response
 */
async function generateSummaryInBackground(documentId: string, fullText: string, filename: string) {
  try {
    console.log(`[summarize] Starting background summarization for ${documentId}`);
    
    await prisma.document.update({
      where: { id: documentId },
      data: { summaryStatus: "INGESTING", summaryError: null },
    });

    const summary = await generateDocumentSummary(fullText, filename);
    
    await prisma.document.update({
      where: { id: documentId },
      data: {
        summary: summary as any,
        summaryStatus: "READY",
        summaryError: null,
      },
    });
    
    console.log(`[summarize] Successfully summarized document ${documentId}`);
  } catch (error: any) {
    console.error(`[summarize] Failed to summarize ${documentId}:`, error);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        summaryStatus: "FAILED",
        summaryError: error.message || "Summarization failed",
      },
    }).catch(err => console.error("Failed to update summary error status:", err));
  }
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "text/plain") {
    return buffer.toString("utf-8");
  }

  if (mimeType === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Extractor not implemented for ${mimeType}`);
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    
    // Exit if we've reached the end (avoid infinite loop when overlap >= chunk size)
    if (end >= text.length) break;
    
    start = end - CHUNK_OVERLAP;
    // Safety: ensure we always advance (in case CHUNK_OVERLAP >= CHUNK_SIZE)
    if (start <= chunks.length * CHUNK_SIZE - CHUNK_SIZE) {
      start = chunks.length * (CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }

  return chunks;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Find document with agent to verify ownership
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { agent: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.agent.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update status to INGESTING
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "INGESTING", error: null },
    });

    try {
      // Download blob server-side
      const storage = getObjectStorage();
      let buffer: Buffer;

      if (storage instanceof S3Storage) {
        buffer = await storage.downloadBlob(document.storageKey);
      } else {
        throw new Error("Server-side download not implemented for this storage provider");
      }

      // Extract text (cap size to avoid V8 fatal / OOM)
      let text = await extractText(buffer, document.mimeType);
      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS);
      }

      // Chunk text (cap count to avoid huge arrays)
      let chunks = chunkText(text);
      if (chunks.length > MAX_CHUNKS) {
        chunks = chunks.slice(0, MAX_CHUNKS);
      }

      // Delete existing chunks
      await prisma.documentChunk.deleteMany({
        where: { documentId },
      });

      // Insert chunks in batches (Prisma createMany has practical limits)
      for (let i = 0; i < chunks.length; i += CREATE_MANY_BATCH_SIZE) {
        const batch = chunks.slice(i, i + CREATE_MANY_BATCH_SIZE);
        await prisma.documentChunk.createMany({
          data: batch.map((chunkText, j) => ({
            documentId,
            index: i + j,
            text: chunkText,
          })),
        });
      }

      // Update status to READY
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "READY", error: null },
      });

      // Auto-generate summary in background (only for large documents)
      if (await shouldGenerateSummary(text, document.mimeType, documentId)) {
        generateSummaryInBackground(documentId, text, document.filename);
      }

      return NextResponse.json({
        ok: true,
        status: "READY",
        chunksCount: chunks.length,
      });
    } catch (error: any) {
      // Update status to FAILED
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "FAILED",
          error: error.message || "Ingestion failed",
        },
      });

      throw error;
    }
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error in ingest route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
