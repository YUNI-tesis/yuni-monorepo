import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/storage";
import { CreateAgentSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const agents = await listAgents();
    return NextResponse.json(agents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateAgentSchema.parse(body);
    const agent = await createAgent({
      ...data,
      toolsAllowed: data.toolsAllowed || ["none"],
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

