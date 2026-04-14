import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/storage";
import { CreateAgentSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";
import { jsonErrorResponse } from "@/lib/api-errors";

export async function GET() {
  try {
    const user = await requireAuth();
    const agents = await listAgents(user.id);
    return NextResponse.json(agents);
  } catch (error: unknown) {
    return jsonErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = CreateAgentSchema.parse(body);
    const agent = await createAgent(user.id, {
      ...data,
      toolsAllowed: data.toolsAllowed || ["none"],
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (error: unknown) {
    return jsonErrorResponse(error);
  }
}
