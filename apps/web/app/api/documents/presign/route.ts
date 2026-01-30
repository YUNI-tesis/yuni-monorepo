import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@yuni/database";
import { getObjectStorage } from "@/lib/storage/storage.factory";
import { buildDocumentStorageKey } from "@/lib/storage/storage-keys";

const PresignRequestSchema = z.object({
  agentId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
});

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const MAX_SIZE_MB = parseInt(process.env.DOC_MAX_SIZE_MB || "20", 10);
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = PresignRequestSchema.parse(body);

    // Validate mime type
    if (!ALLOWED_MIME_TYPES.includes(data.mimeType as any)) {
      return NextResponse.json(
        { error: `MIME type ${data.mimeType} is not allowed` },
        { status: 400 }
      );
    }

    // Validate size
    if (data.sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_SIZE_MB}MB` },
        { status: 400 }
      );
    }

    // Verify agent ownership
    const agent = await prisma.agent.findUnique({
      where: { id: data.agentId },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create document record
    const document = await prisma.document.create({
      data: {
        agentId: data.agentId,
        filename: data.filename,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        storageKey: "", // Will be updated after we have the document ID
        status: "PENDING",
      },
    });

    // Build storage key with document ID
    const storageKey = buildDocumentStorageKey(
      data.agentId,
      document.id,
      data.filename
    );

    // Update document with storage key and set status to UPLOADING
    const updatedDocument = await prisma.document.update({
      where: { id: document.id },
      data: {
        storageKey,
        status: "UPLOADING",
      },
    });

    // Generate presigned upload URL
    const storage = getObjectStorage();
    const uploadUrl = await storage.getPresignedUploadUrl({
      key: storageKey,
      contentType: data.mimeType,
      expiresInSeconds: 3600, // 1 hour
    });

    return NextResponse.json({
      document: {
        id: updatedDocument.id,
        agentId: updatedDocument.agentId,
        filename: updatedDocument.filename,
        mimeType: updatedDocument.mimeType,
        sizeBytes: updatedDocument.sizeBytes,
        status: updatedDocument.status,
        createdAt: updatedDocument.createdAt.toISOString(),
      },
      upload: {
        url: uploadUrl.url,
        method: uploadUrl.method,
        headers: uploadUrl.headers,
        expiresAt: uploadUrl.expiresAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error in presign route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
