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
  playbackAnalyser?: AnalyserNode | null;
  lipsyncAnimation?: boolean;
}

const JAW_BONE_REGEX = /jaw|mouth/i;
const HEAD_BONE_REGEX = /head|neck|skull/i;
const BONE_FALLBACK_REGEX = /jaw|head|face|mouth|skull|neck|chest|spine/i;
const EYE_BLINK_MORPH_REGEX = /eyeBlink|blink|eye.*close|EyeBlink|eyeBlinkLeft|eyeBlinkRight/i;
const EYE_BONE_REGEX = /eye/i;

const BLINK_DURATION = 0.14;
const BLINK_INTERVAL_MIN = 2;
const BLINK_INTERVAL_MAX = 5;

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function blinkCurve(t: number): number {
  if (t <= 0.5) return smoothstep(t / 0.5);
  return 1 - smoothstep((t - 0.5) / 0.5);
}

function Avatar({
  modelPath,
  audioAnalyser,
  playbackAnalyser,
  lipsyncAnimation,
}: {
  modelPath: string;
  audioAnalyser: AnalyserNode | null;
  playbackAnalyser?: AnalyserNode | null;
  lipsyncAnimation: boolean;
}) {
  const { scene } = useGLTF(modelPath);
  const jawBone = useRef<THREE.Object3D | null>(null);
  const headBone = useRef<THREE.Object3D | null>(null);
  const mouthMorphs = useRef<{ mesh: THREE.Mesh; index: number }[]>([]);
  const blinkMorphs = useRef<{ mesh: THREE.Mesh; index: number }[]>([]);
  const blinkBones = useRef<THREE.Object3D[]>([]);
  const openSmoothed = useRef(0);
  const spreadSmoothed = useRef(0.5);
  const blinkState = useRef({
    phase: "idle" as "idle" | "blinking",
    startTime: 0,
    nextBlinkAt: 2,
  });

  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh && (mesh as THREE.SkinnedMesh).skeleton?.bones?.length) {
        const bones = (mesh as THREE.SkinnedMesh).skeleton.bones;
        if (!jawBone.current) {
          const j = bones.find((b) => JAW_BONE_REGEX.test(b.name));
          jawBone.current = j ?? bones.find((b) => BONE_FALLBACK_REGEX.test(b.name)) ?? bones[bones.length - 1] ?? bones[0];
        }
        if (!headBone.current) {
          const h = bones.find((b) => HEAD_BONE_REGEX.test(b.name) && !JAW_BONE_REGEX.test(b.name));
          if (h && h !== jawBone.current) headBone.current = h;
        }
        // Eye bones for blink (rotate to simulate close)
        const eyeBones = bones.filter((b) => EYE_BONE_REGEX.test(b.name));
        if (eyeBones.length) blinkBones.current = eyeBones;
      }
      const geom = mesh.geometry as THREE.BufferGeometry & {
        morphTargetInfluences?: number[];
        morphTargets?: { name?: string }[];
        morphTargetDictionary?: Record<string, number>;
      };
      if (geom?.morphTargetInfluences && geom.morphTargetInfluences.length > 0) {
        // Mouth: first morph as fallback if no name match; prefer ones with "mouth"/"oh"/"ee"
        const dict = geom.morphTargetDictionary ?? {};
        const targets = geom.morphTargets ?? [];
        let mouthIdx: number | null = null;
        for (const [name, idx] of Object.entries(dict)) {
          if (/mouth|oh|ee|ah|ou|smile|A|E|I|O|U/i.test(name)) {
            mouthIdx = idx;
            break;
          }
        }
        if (mouthIdx == null && targets.length) mouthIdx = 0;
        if (mouthIdx != null && !mouthMorphs.current.some((m) => m.mesh === mesh))
          mouthMorphs.current.push({ mesh, index: mouthIdx });
        // Blink morphs
        for (const [name, idx] of Object.entries(dict)) {
          if (EYE_BLINK_MORPH_REGEX.test(name) && !blinkMorphs.current.some((m) => m.mesh === mesh && m.index === idx))
            blinkMorphs.current.push({ mesh, index: idx });
        }
        if (blinkMorphs.current.length === 0 && targets.length) {
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i] as { name?: string };
            if (t?.name && EYE_BLINK_MORPH_REGEX.test(t.name))
              blinkMorphs.current.push({ mesh, index: i });
          }
        }
      }
    });
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center);
  }, [scene]);

  const dataArray = useRef<Uint8Array | null>(null);
  const effectiveAnalyser = playbackAnalyser ?? audioAnalyser;

  useEffect(() => {
    if (effectiveAnalyser) {
      dataArray.current = new Uint8Array(effectiveAnalyser.frequencyBinCount);
    }
  }, [effectiveAnalyser]);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;

    // When lip sync is disabled, keep avatar static and return
    if (!lipsyncAnimation) {
      const jaw = jawBone.current;
      const head = headBone.current;
      if (jaw) {
        jaw.rotation.x = 0;
        jaw.rotation.z = 0;
      }
      if (head) {
        head.rotation.x = 0;
        head.rotation.y = 0;
      }
      for (const { mesh, index } of blinkMorphs.current) {
        const g = mesh.geometry as THREE.BufferGeometry & { morphTargetInfluences?: number[] };
        if (g?.morphTargetInfluences && g.morphTargetInfluences[index] !== undefined)
          g.morphTargetInfluences[index] = 0;
      }
      for (const bone of blinkBones.current) bone.rotation.x = 0;
      scene.scale.setScalar(1);
      return;
    }

    // —— Blinking (runs even without audio) ——
    const bs = blinkState.current;
    if (bs.phase === "idle") {
      if (elapsed >= bs.nextBlinkAt) {
        bs.phase = "blinking";
        bs.startTime = elapsed;
      }
      // Keep eyes fully open when idle
      for (const { mesh, index } of blinkMorphs.current) {
        const g = mesh.geometry as THREE.BufferGeometry & { morphTargetInfluences?: number[] };
        if (g?.morphTargetInfluences && g.morphTargetInfluences[index] !== undefined)
          g.morphTargetInfluences[index] = 0;
      }
      for (const bone of blinkBones.current) bone.rotation.x = 0;
    } else {
      const blinkT = (elapsed - bs.startTime) / BLINK_DURATION;
      if (blinkT >= 1) {
        bs.phase = "idle";
        bs.nextBlinkAt = elapsed + BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
      }
      const amount = blinkCurve(blinkT);
      for (const { mesh, index } of blinkMorphs.current) {
        const g = mesh.geometry as THREE.BufferGeometry & { morphTargetInfluences?: number[] };
        if (g?.morphTargetInfluences && g.morphTargetInfluences[index] !== undefined)
          g.morphTargetInfluences[index] = amount;
      }
      for (const bone of blinkBones.current) bone.rotation.x = -amount * 0.4;
    }

    // —— Speech (needs analyser) ——
    const jaw = jawBone.current;
    const head = headBone.current;
    if (!effectiveAnalyser || !dataArray.current || dataArray.current.length === 0) {
      if (jaw) {
        jaw.rotation.x = 0;
        jaw.rotation.z = 0;
      }
      if (head) {
        head.rotation.x = 0.02 * Math.sin(elapsed * 0.4);
        head.rotation.y = 0.01 * Math.sin(elapsed * 0.3);
      }
      return;
    }

    effectiveAnalyser.getByteFrequencyData(dataArray.current as Uint8Array<ArrayBuffer>);
    const len = dataArray.current.length;
    const half = Math.floor(len / 2);
    let low = 0,
      mid = 0,
      high = 0;
    for (let i = 0; i < len; i++) {
      const v = dataArray.current[i];
      if (i <= 5) low += v;
      else if (i <= 20) mid += v;
      else if (i <= half) high += v;
    }
    const total = low + mid + high || 1;
    const volume = total / len;
    const openRaw = Math.min(1, volume / 28) * 0.85;
    openSmoothed.current += (openRaw - openSmoothed.current) * 0.35;
    const open = openSmoothed.current;

    // spread: high/(low+1) → "ee" vs "oh"; map to jaw.rotation.z
    const spreadRaw = Math.min(1, high / (low + 1));
    spreadSmoothed.current += (spreadRaw - spreadSmoothed.current) * 0.2;
    const spread = spreadSmoothed.current;
    const spreadZ = (spread - 0.5) * 0.12;

    if (jaw) {
      jaw.rotation.x = -open;
      jaw.rotation.z = spreadZ;
    }
    for (const { mesh, index } of mouthMorphs.current) {
      const g = mesh.geometry as THREE.BufferGeometry & { morphTargetInfluences?: number[] };
      if (g?.morphTargetInfluences) g.morphTargetInfluences[index] = open;
    }

    // Head: subtle nod with speech + idle sway
    if (head) {
      head.rotation.x = 0.028 * (open - 0.35) + 0.018 * Math.sin(elapsed * 0.45);
      head.rotation.y = 0.012 * Math.sin(elapsed * 0.35) + 0.008 * (spread - 0.5);
    }

    if (!jaw && mouthMorphs.current.length === 0) {
      scene.scale.setScalar(1 + open * 0.04);
    }
  });

  return <primitive object={scene as any} />;
}

export default function AvatarRenderer({
  modelPath,
  style,
  className,
  cameraControls = false,
  playbackAnalyser,
  lipsyncAnimation = false,
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
    if (!lipsyncAnimation || playbackAnalyser) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 512;
      source.connect(analyserNode);
      analyser.current = analyserNode;
    });
  }, [lipsyncAnimation, playbackAnalyser]);

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
          <Avatar modelPath={modelPath} audioAnalyser={analyser.current} playbackAnalyser={playbackAnalyser} lipsyncAnimation={lipsyncAnimation} />
          {cameraControls && <OrbitControls />}
        </Suspense>
      </Canvas>
    </div>
  );
}
