import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getObjectStorage } from "@/lib/storage/storage.factory";
import { AzureBlobStorage } from "@/lib/storage/azure-blob.storage";
import { loadStorageConfig } from "@/lib/storage/storage-config";
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

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
    start = end - CHUNK_OVERLAP;
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

      if (storage instanceof AzureBlobStorage) {
        buffer = await storage.downloadBlob(document.storageKey);
      } else {
        // For other providers, we'd need to implement downloadBlob
        throw new Error("Server-side download not implemented for this storage provider");
      }

      // Extract text
      const text = await extractText(buffer, document.mimeType);

      // Chunk text
      const chunks = chunkText(text);

      // Delete existing chunks
      await prisma.documentChunk.deleteMany({
        where: { documentId },
      });

      // Insert new chunks
      await prisma.documentChunk.createMany({
        data: chunks.map((chunkText, index) => ({
          documentId,
          index,
          text: chunkText,
        })),
      });

      // Update status to READY
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "READY", error: null },
      });

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
