import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { listAvatarProviders } from "@/lib/avatar-providers/registry";
import { getErrorMessage, getErrorStatus } from "@/lib/api-error";

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({ providers: listAvatarProviders() });
  } catch (error: unknown) {
    if (getErrorStatus(error) === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
