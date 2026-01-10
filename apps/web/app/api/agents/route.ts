import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/storage";
import { CreateAgentSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requireAuth();
    const agents = await listAgents(user.id);
    return NextResponse.json(agents);
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  } catch (error: any) {
    if (error.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

