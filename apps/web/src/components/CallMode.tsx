"use client";

import { useState, useRef } from "react";

interface CallModeProps {
  agentId: string;
  conversationId: string;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
}

export function CallMode({ agentId, conversationId, onTranscript, onResponse }: CallModeProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await processAudio();
      };

      mediaRecorder.start();
      setRecording(true);
      setError(null);
    } catch (err: any) {
      setError(`Error al acceder al micrófono: ${err.message}`);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  async function processAudio() {
    setProcessing(true);
    setError(null);

    try {
      // Combine audio chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

      // Step 1: Transcribe
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      const sttRes = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (!sttRes.ok) throw new Error("Failed to transcribe audio");
      const { transcript } = await sttRes.json();
      onTranscript?.(transcript);

      // Step 2: Send to chat
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          conversationId,
          message: transcript,
          mode: "voice",
        }),
      });

      if (!chatRes.ok) throw new Error("Failed to get response");

      // Read streaming response
      const reader = chatRes.body?.getReader();
      const decoder = new TextDecoder();
      let responseText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  responseText += parsed.text;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      onResponse?.(responseText);

      // Step 3: Synthesize and play
      if (responseText) {
        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: responseText }),
        });

        if (!ttsRes.ok) throw new Error("Failed to synthesize speech");

        const audioBlob = await ttsRes.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        await audio.play();
        audio.onended = () => URL.revokeObjectURL(audioUrl);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="p-4 border-t">
      <h3 className="text-lg font-semibold mb-4">Modo Llamada (MVP)</h3>
      {error && <div className="mb-4 p-2 bg-red-50 text-red-600 text-sm rounded">{error}</div>}

      <div className="flex gap-4 items-center">
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={processing}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {processing ? "Procesando..." : "🎤 Grabar"}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            ⏹ Detener
          </button>
        )}

        {processing && (
          <div className="text-sm text-gray-600">
            Transcribiendo → Enviando → Generando respuesta → Sintetizando...
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Graba tu mensaje, se transcribirá, se enviará al agente, y la respuesta se leerá en voz alta.
      </p>
    </div>
  );
}

