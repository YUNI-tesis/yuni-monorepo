"use client";

import DynamicAvatarRenderer from "@/components/DynamicAvatarRenderer";
import { DEFAULT_LOCAL_AVATAR } from "@/lib/schemas";

interface Local3DAvatarRendererProps {
  modelPath?: string;
  playbackAnalyser?: AnalyserNode | null;
  lipsyncAnimation?: boolean;
}

export function Local3DAvatarRenderer({
  modelPath,
  playbackAnalyser,
  lipsyncAnimation = true,
}: Local3DAvatarRendererProps) {
  return (
    <DynamicAvatarRenderer
      modelPath={modelPath || DEFAULT_LOCAL_AVATAR.fallbackModelPath!}
      style={{ width: "100%", height: "100%" }}
      className="rounded-2xl overflow-hidden"
      cameraControls={false}
      playbackAnalyser={playbackAnalyser}
      lipsyncAnimation={lipsyncAnimation}
    />
  );
}
