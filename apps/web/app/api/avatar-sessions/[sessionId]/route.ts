import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { getAvatarProvider } from "@/lib/avatar-providers/registry";
import { AvatarProviderSchema } from "@/lib/schemas";
import { getErrorMessage, getErrorStatus, isZodError } from "@/lib/api-error";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth();
    const { sessionId } = await params;
    const providerParam = request.nextUrl.searchParams.get("provider") || "local3d";
    const reason = request.nextUrl.searchParams.get("reason") || "USER_CLOSED";
    const providerId = AvatarProviderSchema.parse(providerParam);
    const provider = getAvatarProvider(providerId);
    await provider.stopSession?.(decodeURIComponent(sessionId), reason);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (getErrorStatus(error) === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isZodError(error)) {
      return NextResponse.json({ error: "Unsupported avatar provider" }, { status: 400 });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
