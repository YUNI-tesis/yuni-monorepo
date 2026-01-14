import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getObjectStorage } from "@/lib/storage/storage.factory";

export async function GET(
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

    // Generate presigned download URL
    const storage = getObjectStorage();
    const downloadUrl = await storage.getPresignedDownloadUrl({
      key: document.storageKey,
      expiresInSeconds: 3600, // 1 hour
      forceDownloadFilename: document.filename,
    });

    return NextResponse.json({
      url: downloadUrl.url,
      expiresAt: downloadUrl.expiresAt.toISOString(),
    });
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error in download route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
