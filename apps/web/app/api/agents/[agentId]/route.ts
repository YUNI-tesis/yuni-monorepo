import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgent, deleteAgent } from "@/lib/storage";
import { UpdateAgentSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { agentId } = await params;
    const agent = await getAgent(agentId, user.id);
    return NextResponse.json(agent);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { agentId } = await params;
    const body = await request.json();
    const data = UpdateAgentSchema.parse(body);
    const agent = await updateAgent(agentId, user.id, data);
    return NextResponse.json(agent);
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const user = await requireAuth();
    const { agentId } = await params;
    await deleteAgent(agentId, user.id);
    return NextResponse.json({ success: true });
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

