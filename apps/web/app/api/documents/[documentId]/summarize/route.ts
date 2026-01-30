import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@yuni/database";
import { generateDocumentSummary } from "../../../../../../agent/tools/summarization";

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
      include: {
        agent: true,
        chunks: {
          orderBy: { index: "asc" },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.agent.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if document is ready for summarization
    if (document.status !== "READY") {
      return NextResponse.json(
        { error: `Document must be READY for summarization. Current status: ${document.status}` },
        { status: 400 }
      );
    }

    // Check if chunks exist
    if (document.chunks.length === 0) {
      return NextResponse.json(
        { error: "Document has no text chunks. Please re-ingest the document." },
        { status: 400 }
      );
    }

    // Update status to INGESTING (for summary)
    await prisma.document.update({
      where: { id: documentId },
      data: { summaryStatus: "INGESTING", summaryError: null },
    });

    try {
      // Reconstruct full text from chunks
      const fullText = document.chunks.map((chunk) => chunk.text).join("\n\n");

      // Generate summary using LLM
      const summary = await generateDocumentSummary(fullText, document.filename);

      // Update document with summary
      const updatedDocument = await prisma.document.update({
        where: { id: documentId },
        data: {
          summary: summary as any,
          summaryStatus: "READY",
          summaryError: null,
        },
      });

      return NextResponse.json({
        ok: true,
        status: updatedDocument.summaryStatus,
        summary: updatedDocument.summary,
      });
    } catch (error: any) {
      // Update status to FAILED
      await prisma.document.update({
        where: { id: documentId },
        data: {
          summaryStatus: "FAILED",
          summaryError: error.message || "Summarization failed",
        },
      });

      throw error;
    }
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error in summarize route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
