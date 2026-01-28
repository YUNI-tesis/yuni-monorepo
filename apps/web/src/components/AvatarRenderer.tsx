"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
import * as THREE from "three";
import {
  VisemeType,
  detectVisemeFromFrequency,
  FREQUENCY_TO_VISEME,
} from "@/constants/visemesMapping";
import {
  MOUTH_MORPH_TARGETS,
  findMorphTargetIndex,
  getVisemeMorphIndices,
} from "@/constants/morphTargets";
import {
  FacialExpression,
  getExpressionConfig,
} from "@/constants/facialExpressions";

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
  const mouthMorphs = useRef<{ mesh: THREE.Mesh; viseme: VisemeType; indices: number[] }[]>([]);
  const openSmoothed = useRef(0);
  const spreadSmoothed = useRef(0);
  const protrudeSmoothed = useRef(0);
  const currentViseme = useRef<VisemeType>(VisemeType.X);
  const currentExpression = useRef<FacialExpression>(FacialExpression.DEFAULT);

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
      }
      const geom = mesh.geometry as THREE.BufferGeometry & {
        morphTargetInfluences?: number[];
        morphTargets?: { name?: string }[];
        morphTargetDictionary?: Record<string, number>;
      };
      if (geom?.morphTargetInfluences && geom.morphTargetInfluences.length > 0) {
        const dict = geom.morphTargetDictionary ?? {};
        
        // Find viseme morph targets using constants
        for (const viseme of Object.values(VisemeType)) {
          const indices = getVisemeMorphIndices(dict, viseme);
          if (indices.length > 0) {
            const existing = mouthMorphs.current.find(
              (m) => m.mesh === mesh && m.viseme === viseme
            );
            if (!existing) {
              mouthMorphs.current.push({ mesh, viseme, indices });
            }
          }
        }
        
        // Fallback: if no viseme morphs found, try generic mouth morphs
        if (mouthMorphs.current.filter((m) => m.mesh === mesh).length === 0) {
          const openIdx = findMorphTargetIndex(dict, MOUTH_MORPH_TARGETS.OPEN);
          const closedIdx = findMorphTargetIndex(dict, MOUTH_MORPH_TARGETS.CLOSED);
          if (openIdx !== null || closedIdx !== null) {
            mouthMorphs.current.push({
              mesh,
              viseme: VisemeType.C,
              indices: [openIdx, closedIdx].filter((i): i is number => i !== null),
            });
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
      scene.scale.setScalar(1);
      return;
    }

    // —— Speech Lip Sync (viseme-like analysis) ——
    const jaw = jawBone.current;
    const head = headBone.current;
    
    if (!effectiveAnalyser || !dataArray.current || dataArray.current.length === 0) {
      // Idle animation when no audio
      if (jaw) {
        jaw.rotation.x = 0;
        jaw.rotation.z = 0;
      }
      if (head) {
        head.rotation.x = 0.02 * Math.sin(elapsed * 0.4);
        head.rotation.y = 0.01 * Math.sin(elapsed * 0.3);
      }
      // Reset mouth morphs to rest state
      for (const { mesh, viseme, indices } of mouthMorphs.current) {
        const g = mesh.geometry as THREE.BufferGeometry & { morphTargetInfluences?: number[] };
        if (g?.morphTargetInfluences) {
          for (const idx of indices) {
            if (g.morphTargetInfluences[idx] !== undefined) {
              g.morphTargetInfluences[idx] = 0;
            }
          }
        }
      }
      currentViseme.current = VisemeType.X;
      return;
    }

    // Get frequency data
    effectiveAnalyser.getByteFrequencyData(dataArray.current as Uint8Array<ArrayBuffer>);
    const len = dataArray.current.length;
    const sampleRate = effectiveAnalyser.context.sampleRate;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / len;

    // Speech frequency bands (Hz)
    let lowBand = 0;   // 85-255 Hz
    let midBand = 0;   // 255-2000 Hz
    let highBand = 0;  // 2000-4000 Hz
    let vHighBand = 0; // 4000+ Hz
    
    for (let i = 0; i < len; i++) {
      const freq = i * binWidth;
      const value = dataArray.current[i];
      
      if (freq >= 85 && freq < 255) {
        lowBand += value;
      } else if (freq >= 255 && freq < 2000) {
        midBand += value;
      } else if (freq >= 2000 && freq < 4000) {
        highBand += value;
      } else if (freq >= 4000) {
        vHighBand += value;
      }
    }

    // Calculate overall volume
    const totalEnergy = lowBand * 1.2 + midBand * 1.5 + highBand * 1.0 + vHighBand * 0.8;
    const volume = Math.min(1, totalEnergy / 30000);

    // Detect viseme using constants
    const detectedViseme = detectVisemeFromFrequency(
      lowBand,
      midBand,
      highBand,
      vHighBand,
      totalEnergy,
      volume
    );

    // Get viseme configuration from constants
    const visemeConfig = FREQUENCY_TO_VISEME[detectedViseme];
    const expressionConfig = getExpressionConfig(currentExpression.current);

    // Calculate jaw parameters with expression influence
    const baseJawOpen = visemeConfig.jawOpen * visemeConfig.intensity * volume;
    const baseJawSpread = visemeConfig.jawSpread;
    const baseJawProtrude = visemeConfig.jawProtrude;

    // Apply expression adjustments
    const finalJawOpen = Math.min(1, baseJawOpen + expressionConfig.jawOffset);
    const finalJawSpread = baseJawSpread;
    const finalJawProtrude = baseJawProtrude;

    // Smooth transitions (critical for natural lip sync)
    const smoothingFactor = 0.45; // Higher = smoother but more lag
    openSmoothed.current += (finalJawOpen - openSmoothed.current) * smoothingFactor;
    spreadSmoothed.current += (finalJawSpread - spreadSmoothed.current) * 0.35;
    protrudeSmoothed.current += (finalJawProtrude - protrudeSmoothed.current) * 0.25;
    
    currentViseme.current = detectedViseme;

    // Apply to jaw bone
    if (jaw) {
      // X rotation: open/close (negative = open)
      jaw.rotation.x = -openSmoothed.current * 0.85;
      // Z rotation: spread (left/right for wide/narrow)
      jaw.rotation.z = spreadSmoothed.current * 0.18;
      // Y rotation: protrude/retract (subtle)
      jaw.rotation.y = protrudeSmoothed.current * 0.12;
    }

    // Apply viseme morph targets
    for (const { mesh, viseme, indices } of mouthMorphs.current) {
      const g = mesh.geometry as THREE.BufferGeometry & { morphTargetInfluences?: number[] };
      if (g?.morphTargetInfluences) {
        // Reset all viseme morphs first
        for (const idx of indices) {
          if (g.morphTargetInfluences[idx] !== undefined) {
            g.morphTargetInfluences[idx] = 0;
          }
        }
        
        // Apply current viseme morph
        if (viseme === detectedViseme && indices.length > 0) {
          const weight = openSmoothed.current * visemeConfig.intensity;
          for (const idx of indices) {
            if (g.morphTargetInfluences[idx] !== undefined) {
              g.morphTargetInfluences[idx] = weight;
            }
          }
        }
      }
    }

    // Head: subtle nod with speech + idle sway + expression
    if (head) {
      const speechNod = openSmoothed.current > 0.2 ? 0.028 * (openSmoothed.current - 0.2) : 0;
      const expressionTilt = expressionConfig.headTilt;
      head.rotation.x = speechNod + 0.018 * Math.sin(elapsed * 0.45) + expressionTilt.x;
      head.rotation.y = 0.012 * Math.sin(elapsed * 0.35) + 0.006 * spreadSmoothed.current + expressionTilt.y;
    }

    // Fallback: scale entire scene if no jaw or morphs
    if (!jaw && mouthMorphs.current.length === 0) {
      scene.scale.setScalar(1 + openSmoothed.current * 0.03);
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
        camera={{ position: [0, 0.25, 3], fov: 40 }}
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
