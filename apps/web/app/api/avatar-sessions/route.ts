import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { getAgent } from "@/lib/storage";
import {
  getAvatarProvider,
  resolveAvatarConfig,
} from "@/lib/avatar-providers/registry";
import {
  getErrorMessage,
  getErrorStatus,
  getZodIssues,
  isZodError,
} from "@/lib/api-error";

const CreateAvatarSessionSchema = z.object({
  agentId: z.string().min(1),
  conversationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = CreateAvatarSessionSchema.parse(await request.json());
    const agent = await getAgent(body.agentId, user.id);
    const avatar = resolveAvatarConfig(agent.avatar);
    const provider = getAvatarProvider(avatar.provider);

    if (provider.isRemote && !provider.isConfigured()) {
      return NextResponse.json(
        { error: `${provider.label} is not configured` },
        { status: 503 }
      );
    }

    const session = await provider.createSession(avatar, {
      userId: user.id,
      agentId: agent.id,
      conversationId: body.conversationId,
    });

    return NextResponse.json({ session });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (getErrorStatus(error) === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isZodError(error)) {
      return NextResponse.json({ error: getZodIssues(error) }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
