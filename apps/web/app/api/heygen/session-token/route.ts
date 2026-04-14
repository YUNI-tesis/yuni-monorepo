import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { AppRouteError, jsonErrorResponse } from "@/lib/api-errors";
import { createHeyGenSessionToken, hasLiveAvatarCredentials } from "@/lib/heygen";

const RequestSchema = z.object({
  avatarId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  language: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    if (!hasLiveAvatarCredentials()) {
      throw new AppRouteError("LiveAvatar credentials are not configured", 503);
    }

    const body = await request.json();
    const data = RequestSchema.parse(body);
    const sessionToken = await createHeyGenSessionToken(data);

    return NextResponse.json({ sessionToken });
  } catch (error: unknown) {
    return jsonErrorResponse(error);
  }
}
