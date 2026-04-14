import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgent, deleteAgent } from "@/lib/storage";
import { UpdateAgentSchema } from "@/lib/schemas";
import { requireAuth } from "@/lib/auth-helpers";
import { errorHasMessage, jsonErrorResponse } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  void request;

  try {
    const user = await requireAuth();
    const { agentId } = await params;
    const agent = await getAgent(agentId, user.id);
    return NextResponse.json(agent);
  } catch (error: unknown) {
    if (errorHasMessage(error, "not found")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Not found" }, { status: 404 });
    }
    return jsonErrorResponse(error);
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
  } catch (error: unknown) {
    if (errorHasMessage(error, "not found")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Not found" }, { status: 404 });
    }
    return jsonErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  void request;

  try {
    const user = await requireAuth();
    const { agentId } = await params;
    await deleteAgent(agentId, user.id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (errorHasMessage(error, "not found")) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Not found" }, { status: 404 });
    }
    return jsonErrorResponse(error);
  }
}
