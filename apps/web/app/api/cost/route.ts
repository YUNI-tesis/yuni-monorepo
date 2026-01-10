import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/storage";
import { CostRequestSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = CostRequestSchema.parse(body);
    const conversation = await getConversation(data.conversationId, user.id);
    return NextResponse.json({
      usd: conversation.cost.usd,
      tokensIn: conversation.cost.tokensIn,
      tokensOut: conversation.cost.tokensOut,
    });
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

