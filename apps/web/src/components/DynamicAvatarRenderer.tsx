import dynamic from "next/dynamic";

const AvatarRenderer = dynamic(
  () => import("@/components/AvatarRenderer"),
  { ssr: false }
);

interface DynamicAvatarRendererProps {
  modelPath: string;
  style?: React.CSSProperties;
  className?: string;
  cameraControls?: boolean;
  playbackAnalyser?: AnalyserNode | null;
  lipsyncAnimation?: boolean;
}

export default function DynamicAvatarRenderer({
  modelPath,
  style,
  className,
  cameraControls,
  playbackAnalyser,
  lipsyncAnimation,
}: DynamicAvatarRendererProps) {
  return (
    <AvatarRenderer
      modelPath={modelPath}
      style={style}
      className={className}
      cameraControls={cameraControls}
      playbackAnalyser={playbackAnalyser}
      lipsyncAnimation={lipsyncAnimation}
    />
  );
}
