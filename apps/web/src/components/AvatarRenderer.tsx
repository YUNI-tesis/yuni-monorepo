"use client";

/// <reference types="../types/model-viewer" />

import { useEffect } from "react";

interface AvatarRendererProps {
  modelPath: string;
  style?: React.CSSProperties;
  className?: string;
  cameraControls?: boolean;
}

export const AvatarRenderer = ({ 
  modelPath, 
  style = { width: "100%", height: "100%", minHeight: "400px" },
  className = "rounded-xl overflow-hidden border border-white/10",
  cameraControls = true
}: AvatarRendererProps) => {
  useEffect(() => {
    // Dynamically import @google/model-viewer to register the custom element
    if (typeof window !== "undefined") {
      // @ts-ignore - @google/model-viewer is a web component, types may not be available
      import("@google/model-viewer").catch((err) => {
        console.error("Failed to load model-viewer:", err);
      });
    }
  }, []);

  return (
    <model-viewer
      src={modelPath}
      ar
      camera-controls={cameraControls}
      style={style}
      className={className}
    />
  );
};