import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@yuni/database";
import { getObjectStorage } from "@/lib/storage/storage.factory";

export async function DELETE(
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

    // Delete blob from storage
    const storage = getObjectStorage();
    try {
      await storage.deleteObject({ key: document.storageKey });
    } catch (error: any) {
      // Log but don't fail if blob doesn't exist
      console.warn(`Failed to delete blob ${document.storageKey}:`, error.message);
    }

    // Delete document (cascade will delete chunks)
    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error in delete route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
