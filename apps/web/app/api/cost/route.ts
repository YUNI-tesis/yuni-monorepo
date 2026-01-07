import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/storage";
import { CostRequestSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CostRequestSchema.parse(body);
    const conversation = await getConversation(data.conversationId);
    return NextResponse.json({
      usd: conversation.cost.usd,
      tokensIn: conversation.cost.tokensIn,
      tokensOut: conversation.cost.tokensOut,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

