import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { jsonErrorResponse } from "@/lib/api-errors";
import { listHeyGenAvatars } from "@/lib/heygen";

async function handleList() {
  try {
    await requireAuth();
    const avatars = await listHeyGenAvatars();
    return NextResponse.json({ avatars });
  } catch (error: unknown) {
    return jsonErrorResponse(error);
  }
}

export async function GET() {
  return handleList();
}

export async function POST() {
  return handleList();
}
