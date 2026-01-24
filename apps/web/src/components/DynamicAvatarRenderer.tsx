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
}

export default function DynamicAvatarRenderer({
  modelPath,
  style,
  className,
  cameraControls,
}: DynamicAvatarRendererProps) {
  return (
    <AvatarRenderer
      modelPath={modelPath}
      style={style}
      className={className}
      cameraControls={cameraControls}
    />
  );
}
