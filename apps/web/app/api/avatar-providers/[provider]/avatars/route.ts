import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { getAvatarProvider } from "@/lib/avatar-providers/registry";
import { AvatarProviderSchema } from "@/lib/schemas";
import { getErrorMessage, getErrorStatus, isZodError } from "@/lib/api-error";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const user = await requireAuth();
    const { provider: providerParam } = await params;
    const providerId = AvatarProviderSchema.parse(providerParam);
    const provider = getAvatarProvider(providerId);
    const avatars = await provider.listAvatars({ userId: user.id });
    return NextResponse.json({ avatars });
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
