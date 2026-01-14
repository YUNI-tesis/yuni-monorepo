import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getObjectStorage } from "@/lib/storage/storage.factory";

const ConfirmUploadRequestSchema = z.object({
  documentId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = ConfirmUploadRequestSchema.parse(body);

    // Find document with agent to verify ownership
    const document = await prisma.document.findUnique({
      where: { id: data.documentId },
      include: { agent: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.agent.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if blob exists
    const storage = getObjectStorage();
    const exists = await storage.exists({ key: document.storageKey });

    if (exists) {
      // Update status to UPLOADED
      const updatedDocument = await prisma.document.update({
        where: { id: document.id },
        data: {
          status: "UPLOADED",
          error: null,
        },
      });

      return NextResponse.json({
        id: updatedDocument.id,
        agentId: updatedDocument.agentId,
        filename: updatedDocument.filename,
        mimeType: updatedDocument.mimeType,
        sizeBytes: updatedDocument.sizeBytes,
        status: updatedDocument.status,
        error: updatedDocument.error,
        createdAt: updatedDocument.createdAt.toISOString(),
        updatedAt: updatedDocument.updatedAt.toISOString(),
      });
    } else {
      // Update status to FAILED
      const updatedDocument = await prisma.document.update({
        where: { id: document.id },
        data: {
          status: "FAILED",
          error: "Blob not found after upload",
        },
      });

      return NextResponse.json(
        {
          id: updatedDocument.id,
          agentId: updatedDocument.agentId,
          filename: updatedDocument.filename,
          mimeType: updatedDocument.mimeType,
          sizeBytes: updatedDocument.sizeBytes,
          status: updatedDocument.status,
          error: updatedDocument.error,
          createdAt: updatedDocument.createdAt.toISOString(),
          updatedAt: updatedDocument.updatedAt.toISOString(),
        },
        { status: 400 }
      );
    }
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
    console.error("Error in confirm-upload route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
