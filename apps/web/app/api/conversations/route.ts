import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/storage";
import { CreateConversationSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";
import { jsonErrorResponse } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get("agentId") || undefined;
    const conversations = await listConversations(user.id, agentId);
    return NextResponse.json(conversations);
  } catch (error: unknown) {
    return jsonErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = CreateConversationSchema.parse(body);
    const conversation = await createConversation(user.id, data.agentId, data.mode);
    return NextResponse.json(conversation, { status: 201 });
  } catch (error: unknown) {
    return jsonErrorResponse(error);
  }
}
