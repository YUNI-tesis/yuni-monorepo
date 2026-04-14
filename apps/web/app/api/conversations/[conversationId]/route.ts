import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/storage";
import { requireAuth } from "@/lib/auth-helpers";
import { errorHasMessage, jsonErrorResponse } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  void request;

  try {
    const user = await requireAuth();
    const { conversationId } = await params;
    const conversation = await getConversation(conversationId, user.id);
    return NextResponse.json(conversation);
  } catch (error: unknown) {
    if (errorHasMessage(error, "not found")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Not found" }, { status: 404 });
    }
    return jsonErrorResponse(error);
  }
}
