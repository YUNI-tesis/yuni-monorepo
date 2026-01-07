import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/audio-utils";
import { TTSRequestSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const body = await request.json();
    const data = TTSRequestSchema.parse(body);

    const audioBuffer = await synthesizeSpeech(data.text, apiKey, {
      voice: (data.voice as any) || "alloy",
    });

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

