"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";
import {
  buildChannelToIndexMap,
  LIPSYNC_VISEME_CHANNELS,
  type RPMChannelName,
} from "@/constants/morphTargets";

const HEAD_NODE_NAMES = ["Wolf3D_Head", "Head"] as const;

const BONE_NAMES_HEAD = ["Head", "head"];
const BONE_NAMES_NECK = ["Neck", "neck"];
const BONE_NAMES_CHEST = ["Chest", "UpperChest", "chest", "upperChest"];
const BONE_NAMES_SPINE = ["Spine", "Spine1", "Spine2", "spine"];

function getHeadMesh(nodes: Record<string, THREE.Object3D>): THREE.Mesh | null {
  for (const name of HEAD_NODE_NAMES) {
    const node = nodes[name];
    if (node && (node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      if (mesh.morphTargetDictionary) return mesh;
      return mesh;
    }
  }
  return null;
}

interface NaturalMotionBones {
  head: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  spine: THREE.Object3D | null;
}

function findBonesByAllowlist(scene: THREE.Object3D, allowlist: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    if ((obj as THREE.Object3D & { type?: string }).type !== "Bone") return;
    const name = (obj as THREE.Object3D & { name?: string }).name ?? "";
    for (const candidate of allowlist) {
      if (name === candidate || name.toLowerCase() === candidate.toLowerCase()) {
        found = obj;
        return;
      }
    }
  });
  return found;
}

function discoverBones(scene: THREE.Object3D): NaturalMotionBones {
  return {
    head: findBonesByAllowlist(scene, BONE_NAMES_HEAD),
    neck: findBonesByAllowlist(scene, BONE_NAMES_NECK),
    chest: findBonesByAllowlist(scene, BONE_NAMES_CHEST),
    spine: findBonesByAllowlist(scene, BONE_NAMES_SPINE),
  };
}

interface AvatarRendererProps {
  modelPath: string;
  style?: React.CSSProperties;
  className?: string;
  cameraControls?: boolean;
  playbackAnalyser?: AnalyserNode | null;
  lipsyncAnimation?: boolean;
}

interface AvatarProps {
  modelPath: string;
  playbackAnalyser: AnalyserNode | null;
  lipsyncAnimation: boolean;
}

/** Head-center Y for RPM half-body (origin at feet). LookAt and camera aim at this. */
const HEAD_CENTER_Y = 1.58;

function FaceCamera() {
  useFrame(({ camera }) => {
    camera.lookAt(0, HEAD_CENTER_Y, 0);
  });
  return null;
}

const BLINK_DURATION = 0.15;
const MIN_BLINK_INTERVAL = 2;
const MAX_BLINK_INTERVAL = 5;
const SMILE_MIN_INTERVAL = 8;
const SMILE_MAX_INTERVAL = 20;
const SMILE_DURATION_MIN = 1;
const SMILE_DURATION_MAX = 3;
const SMILE_WEIGHT = 0.4;
const BREATH_PERIOD = 3;
const BREATH_ROTATION_AMPLITUDE = 0.02;
const HEAD_NOD_AMPLITUDE = 0.02;
const HEAD_TILT_AMPLITUDE = 0.015;
const HEAD_PERIOD = 5;
const BODY_SWAY_AMPLITUDE = 0.012;
const BODY_PERIOD = 6;
const BROW_AMPLITUDE = 0.15;
const BROW_PERIOD = 4;

function Avatar({
  modelPath,
  playbackAnalyser,
  lipsyncAnimation,
}: AvatarProps) {
  const { scene, nodes } = useGLTF(modelPath);
  const headMesh = getHeadMesh(nodes as Record<string, THREE.Object3D>);

  const dataArray = useRef<Uint8Array | null>(null);
  const channelMapRef = useRef<Partial<Record<RPMChannelName, number>> | null>(null);
  const lastVolumeRef = useRef(0);
  const bonesRef = useRef<NaturalMotionBones | null>(null);
  const nextBlinkAtRef = useRef(0);
  const blinkEndTimeRef = useRef(0);
  const nextSmileAtRef = useRef(0);
  const smileEndTimeRef = useRef(0);
  const smileWeightRef = useRef(0);

  useEffect(() => {
    if (!headMesh?.morphTargetDictionary) return;
    channelMapRef.current = buildChannelToIndexMap(headMesh.morphTargetDictionary);
  }, [headMesh]);

  useEffect(() => {
    bonesRef.current = discoverBones(scene);
  }, [scene]);

  useEffect(() => {
    if (!playbackAnalyser) return;
    dataArray.current = new Uint8Array(playbackAnalyser.frequencyBinCount);
  }, [playbackAnalyser]);

  useFrame((state) => {
    if (!headMesh?.morphTargetInfluences || !channelMapRef.current) return;

    const influences = headMesh.morphTargetInfluences;
    const channelMap = channelMapRef.current;
    const elapsed = state.clock.getElapsedTime();
    const delta = state.clock.getDelta();

    let volume = 0;
    if (lipsyncAnimation && playbackAnalyser) {
      if (!dataArray.current) dataArray.current = new Uint8Array(playbackAnalyser.frequencyBinCount);
      playbackAnalyser.getByteFrequencyData(dataArray.current as any);
      let sum = 0;
      for (let i = 0; i < dataArray.current.length; i++) sum += dataArray.current[i];
      volume = THREE.MathUtils.lerp(lastVolumeRef.current, (sum / dataArray.current.length / 255) * 2.5, 0.6);
      lastVolumeRef.current = volume;
    }

    const isSpeaking = volume > 0.08;

    // --- Blink (time-based) ---
    let blinkWeight = 0;
    if (blinkEndTimeRef.current > 0 && elapsed < blinkEndTimeRef.current) {
      const blinkStart = blinkEndTimeRef.current - BLINK_DURATION;
      blinkWeight = Math.sin(((elapsed - blinkStart) / BLINK_DURATION) * Math.PI);
    } else {
      blinkEndTimeRef.current = 0;
      if (nextBlinkAtRef.current === 0) nextBlinkAtRef.current = elapsed + 0.8 + Math.random() * 0.7;
      if (elapsed >= nextBlinkAtRef.current) {
        blinkEndTimeRef.current = elapsed + BLINK_DURATION;
        nextBlinkAtRef.current = blinkEndTimeRef.current + MIN_BLINK_INTERVAL + Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL);
      }
    }
    const blinkBlend = 0.5;
    for (const ch of ["eyesClosed", "eyeBlinkLeft", "eyeBlinkRight"] as const) {
      const idx = channelMap[ch];
      if (idx !== undefined) influences[idx] = THREE.MathUtils.lerp(influences[idx], blinkWeight, blinkBlend);
    }

    // --- Occasional smile (no smile while speaking) ---
    let smileTarget = 0;
    if (!isSpeaking) {
      if (nextSmileAtRef.current === 0) nextSmileAtRef.current = elapsed + SMILE_MIN_INTERVAL + Math.random() * (SMILE_MAX_INTERVAL - SMILE_MIN_INTERVAL);
      if (elapsed >= nextSmileAtRef.current && smileEndTimeRef.current === 0) smileEndTimeRef.current = elapsed + SMILE_DURATION_MIN + Math.random() * (SMILE_DURATION_MAX - SMILE_DURATION_MIN);
      if (smileEndTimeRef.current > 0) {
        if (elapsed < smileEndTimeRef.current) smileTarget = SMILE_WEIGHT;
        else {
          smileEndTimeRef.current = 0;
          nextSmileAtRef.current = elapsed + SMILE_MIN_INTERVAL + Math.random() * (SMILE_MAX_INTERVAL - SMILE_MIN_INTERVAL);
        }
      }
    }
    smileWeightRef.current = THREE.MathUtils.lerp(smileWeightRef.current, smileTarget, delta * 3);
    const mouthSmileIdx = channelMap.mouthSmile;
    if (mouthSmileIdx !== undefined) influences[mouthSmileIdx] = smileWeightRef.current;

    // --- Eyebrows (slow subtle motion) ---
    const browPhase = (elapsed / BROW_PERIOD) * Math.PI * 2;
    const browUp = Math.max(0, Math.sin(browPhase) * BROW_AMPLITUDE);
    const browDownL = Math.max(0, Math.sin(browPhase + 0.5) * BROW_AMPLITUDE * 0.6);
    const browDownR = Math.max(0, Math.sin(browPhase + 0.8) * BROW_AMPLITUDE * 0.6);
    const browBlend = 0.3;
    const browInnerUpIdx = channelMap.browInnerUp;
    if (browInnerUpIdx !== undefined) influences[browInnerUpIdx] = THREE.MathUtils.lerp(influences[browInnerUpIdx], browUp, browBlend);
    const browDownLeftIdx = channelMap.browDownLeft;
    if (browDownLeftIdx !== undefined) influences[browDownLeftIdx] = THREE.MathUtils.lerp(influences[browDownLeftIdx], browDownL, browBlend);
    const browDownRightIdx = channelMap.browDownRight;
    if (browDownRightIdx !== undefined) influences[browDownRightIdx] = THREE.MathUtils.lerp(influences[browDownRightIdx], browDownR, browBlend);

    // --- Chest breathing & head/body (bones) ---
    const bones = bonesRef.current;
    if (bones) {
      const breath = Math.sin((elapsed / BREATH_PERIOD) * Math.PI * 2) * BREATH_ROTATION_AMPLITUDE;
      const headNod = Math.sin((elapsed / HEAD_PERIOD) * Math.PI * 2) * HEAD_NOD_AMPLITUDE;
      const headTilt = Math.sin((elapsed / HEAD_PERIOD) * Math.PI * 2 + 1) * HEAD_TILT_AMPLITUDE;
      const bodySway = Math.sin((elapsed / BODY_PERIOD) * Math.PI * 2) * BODY_SWAY_AMPLITUDE;

      if (bones.chest) {
        (bones.chest as THREE.Object3D).rotation.x = breath;
      }
      if (bones.spine && !bones.chest) {
        (bones.spine as THREE.Object3D).rotation.x = breath;
      }
      if (bones.head) {
        (bones.head as THREE.Object3D).rotation.x = headNod;
        (bones.head as THREE.Object3D).rotation.y = headTilt;
      }
      if (bones.neck) {
        (bones.neck as THREE.Object3D).rotation.x = headNod * 0.5;
        (bones.neck as THREE.Object3D).rotation.y = headTilt * 0.5;
      }
      if (bones.spine) {
        (bones.spine as THREE.Object3D).rotation.z = bodySway;
      }
      if (bones.chest) {
        (bones.chest as THREE.Object3D).rotation.z = bodySway * 0.7;
      }
    }

    // --- Lip sync (playback only) or mouth rest ---
    if (!lipsyncAnimation || !playbackAnalyser) {
      const silIndex = channelMap.viseme_sil;
      if (silIndex !== undefined) influences[silIndex] = 1;
      for (const ch of LIPSYNC_VISEME_CHANNELS) {
        if (ch !== "viseme_sil") {
          const idx = channelMap[ch];
          if (idx !== undefined) influences[idx] = 0;
        }
      }
      const mouthOpenIdx = channelMap.mouthOpen;
      const mouthCloseIdx = channelMap.mouthClose;
      if (mouthOpenIdx !== undefined) influences[mouthOpenIdx] = 0;
      if (mouthCloseIdx !== undefined) influences[mouthCloseIdx] = 1;
      return;
    }

    const openVal = Math.min(1, volume * 1.3);
    const silVal = Math.max(0, 1 - openVal);
    const blend = 0.6;
    for (const ch of LIPSYNC_VISEME_CHANNELS) {
      const idx = channelMap[ch];
      if (idx === undefined) continue;
      if (ch === "viseme_sil") influences[idx] = THREE.MathUtils.lerp(influences[idx], silVal, blend);
      else if (ch === "viseme_aa") influences[idx] = THREE.MathUtils.lerp(influences[idx], openVal, blend);
      else influences[idx] = THREE.MathUtils.lerp(influences[idx], 0, blend);
    }
    const mouthOpenIdx = channelMap.mouthOpen;
    const mouthCloseIdx = channelMap.mouthClose;
    if (mouthOpenIdx !== undefined) influences[mouthOpenIdx] = THREE.MathUtils.lerp(influences[mouthOpenIdx], openVal, blend);
    if (mouthCloseIdx !== undefined) influences[mouthCloseIdx] = THREE.MathUtils.lerp(influences[mouthCloseIdx], silVal, blend);
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
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
        camera={{
          position: [0, HEAD_CENTER_Y + 0.05, 0.9],
          fov: 42,
          near: 0.1,
          far: 1000,
        }}
      >
        <FaceCamera />
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} />
          <Avatar
            modelPath={modelPath}
            playbackAnalyser={playbackAnalyser ?? null}
            lipsyncAnimation={lipsyncAnimation}
          />
          {cameraControls && <OrbitControls />}
        </Suspense>
      </Canvas>
    </div>
  );
}
