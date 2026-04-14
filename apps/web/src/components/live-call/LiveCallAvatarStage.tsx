"use client";

import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";
import { HeyGenAvatarSession } from "@/components/HeyGenAvatarSession";
import { DEFAULT_AGENT_MODEL_PATH } from "@/lib/avatar-config";
import type { AgentAvatar } from "@/lib/schemas";
import type { SpeechRequest } from "./types";

interface LiveCallAvatarStageProps {
  agentName: string;
  avatar?: AgentAvatar;
  canUseHeyGen: boolean;
  heyGenState: "idle" | "loading" | "ready" | "failed";
  heyGenSessionToken: string | null;
  speechRequest: SpeechRequest | null;
  interruptVersion: number;
  playbackAnalyser: AnalyserNode | null;
  onAvatarReady: () => void;
  onAvatarError: (message: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
}

function LoadingAvatarPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-slate-950 text-center">
      <div>
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-cyan-400/20 border-t-cyan-300 animate-spin" />
        <p className="text-sm text-white">{message}</p>
      </div>
    </div>
  );
}

export function LiveCallAvatarStage({
  agentName,
  avatar,
  canUseHeyGen,
  heyGenState,
  heyGenSessionToken,
  speechRequest,
  interruptVersion,
  playbackAnalyser,
  onAvatarReady,
  onAvatarError,
  onSpeakingChange,
}: LiveCallAvatarStageProps) {
  if (canUseHeyGen && heyGenSessionToken && avatar) {
    return (
      <HeyGenAvatarSession
        sessionToken={heyGenSessionToken}
        avatar={avatar}
        agentName={agentName}
        speechRequest={speechRequest}
        interruptVersion={interruptVersion}
        onReady={onAvatarReady}
        onSpeakingChange={onSpeakingChange}
        onError={onAvatarError}
        className="h-full w-full"
      />
    );
  }

  if (avatar?.provider === "heygen" && heyGenState === "loading") {
    return <LoadingAvatarPlaceholder message="Conectando el avatar de la llamada..." />;
  }

  return (
    <DynamicAvatarRenderer
      modelPath={DEFAULT_AGENT_MODEL_PATH}
      style={{ width: "100%", height: "100%" }}
      className="rounded-2xl overflow-hidden"
      cameraControls={false}
      playbackAnalyser={playbackAnalyser}
      lipsyncAnimation={true}
    />
  );
}
