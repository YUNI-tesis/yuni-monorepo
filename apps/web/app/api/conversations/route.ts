import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/storage";
import { CreateConversationSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get("agentId") || undefined;
    const conversations = await listConversations(agentId);
    return NextResponse.json(conversations);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateConversationSchema.parse(body);
    const conversation = await createConversation(data.agentId, data.mode);
    return NextResponse.json(conversation, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

