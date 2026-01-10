import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/storage";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await requireAuth();
    const { conversationId } = await params;
    const conversation = await getConversation(conversationId, user.id);
    return NextResponse.json(conversation);
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

