/**
 * API Route: GET /api/voices/elevenlabs
 * Fetches available voices from ElevenLabs API
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if ElevenLabs API key is configured
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        {
          error: "ElevenLabs API key not configured",
          voices: [],
        },
        { status: 200 } // Return 200 to handle gracefully on client
      );
    }

    // Fetch voices from ElevenLabs
    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      method: "GET",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs API] Error:", response.status, errorText);
      
      return NextResponse.json(
        {
          error: `ElevenLabs API error: ${response.status}`,
          voices: [],
        },
        { status: 200 } // Return 200 to handle gracefully on client
      );
    }

    const data = await response.json();

    // Transform voices to include relevant information
    const voices = (data.voices || []).map((voice: any) => ({
      voice_id: voice.voice_id,
      name: voice.name,
      labels: voice.labels,
      preview_url: voice.preview_url,
      category: voice.category || "generated",
      description: voice.description,
    }));

    return NextResponse.json({
      voices,
      count: voices.length,
    });
  } catch (error) {
    console.error("[API] Error fetching ElevenLabs voices:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch ElevenLabs voices",
        voices: [],
      },
      { status: 200 } // Return 200 to handle gracefully on client
    );
  }
}
