"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";

interface AvatarRendererProps {
  modelPath: string;
  style?: React.CSSProperties;
  className?: string;
  cameraControls?: boolean;
}

function Avatar({
  modelPath,
  audioAnalyser,
}: {
  modelPath: string;
  audioAnalyser: AnalyserNode | null;
}) {
  const { scene } = useGLTF(modelPath);
  const jaw = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      if (obj.name.toLowerCase().includes("jaw")) {
        jaw.current = obj;
      }
    });
    // Center the model at the origin so OrbitControls orbits around its center
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center);
  }, [scene]);

  const dataArray = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (audioAnalyser) {
      dataArray.current = new Uint8Array(audioAnalyser.frequencyBinCount);
    }
  }, [audioAnalyser]);

  useFrame(() => {
    if (!audioAnalyser || !jaw.current || !dataArray.current || dataArray.current.length === 0) return;

    audioAnalyser.getByteFrequencyData(dataArray.current as Uint8Array<ArrayBuffer>);

    const volume =
      dataArray.current.reduce((a, b) => a + b, 0) /
      dataArray.current.length;

    const open = THREE.MathUtils.clamp(volume / 80, 0, 0.4);

    jaw.current.rotation.x = -open;
  });

  return <primitive object={scene} />;
}

export default function AvatarRenderer({
  modelPath,
  style,
  className,
  cameraControls = false,
}: AvatarRendererProps) {
  const analyser = useRef<AnalyserNode | null>(null);
  const [ready, setReady] = useState(false);

  // Defer Canvas mount to avoid creating WebGL during React Strict Mode's
  // initial mount→unmount→remount, which can trigger "Context Lost"
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 512;
      source.connect(analyserNode);
      analyser.current = analyserNode;
    });
  }, []);

  if (!ready) {
    return (
      <div style={style} className={className}>
        <div className="flex items-center justify-center h-full bg-black/5">
          <span className="text-gray-500 text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={style} className={className}>
      <Canvas
        camera={{ position: [0, 1.0, 3], fov: 40 }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} />
          <Avatar modelPath={modelPath} audioAnalyser={analyser.current} />
          {cameraControls && <OrbitControls />}
        </Suspense>
      </Canvas>
    </div>
  );
}
