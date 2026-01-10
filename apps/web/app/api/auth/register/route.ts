import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await registerUser(body);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to register user" },
      { status: 400 }
    );
  }
}
