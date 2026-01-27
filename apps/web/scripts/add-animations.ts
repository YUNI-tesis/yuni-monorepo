/**
 * Add-animations — Creates everything necessary for natural, human-like lip sync animations.
 * 
 * This script transforms an unrigged GLB model into a fully animated avatar ready for
 * natural speech synchronization. It creates ALL components needed for realistic lip sync:
 * 
 * 1. COMPLETE VISEME MORPH TARGETS (All mouth shapes for natural speech):
 *    - viseme_sil (A - Closed: M, B, P sounds)
 *    - viseme_oh (B - Slightly open: O, U vowels)
 *    - viseme_aa (C - Open: A, E mid vowels)
 *    - viseme_ee (D - Wide: E, I high vowels)
 *    - viseme_ff (E - Narrow: F, V, TH fricatives)
 *    - mouthPuckered (F - Puckered: rounded O, U)
 *    - viseme_ss (G - Teeth visible: S, SH, CH, Z sibilants)
 *    - viseme_aa_wide (H - Wide open: A, AI diphthongs)
 *    - mouthNeutral (X - Rest/neutral position)
 * 
 * 2. BONE RIG (For jaw movement and head motion):
 *    - Root, Head, Jaw, Eye_L, Eye_R bones
 *    - Properly weighted skinning for natural jaw rotation
 *    - Head bone for subtle head movements during speech
 * 
 * 3. EYE ANIMATIONS (For natural blinking):
 *    - eyeBlink, eyeBlinkLeft, eyeBlinkRight morph targets
 * 
 * The script intelligently identifies facial regions (head, face, jaw, eyes) and creates
 * procedurally-generated morph targets that work together with the bone rig to produce
 * natural, human-like speech animations. The AvatarRenderer will use morph targets when
 * available (more natural), falling back to bone-based animation if needed.
 * 
 * Uses @gltf-transform/core. Run: pnpm rig:animations [input] [output]
 * Example: pnpm rig:animations public/assets/santi.glb public/assets/santi-animated.glb
 */

import * as path from "path";
import { NodeIO, Accessor, type Primitive, type Scene, type Mesh, type Document, type PrimitiveTarget } from "@gltf-transform/core";

const DEFAULT_INPUT = "public/assets/santi.glb";
const DEFAULT_OUTPUT = "public/assets/santi-animated.glb";

// Eye band: upper-mid face only (avoid forehead). Y in [EYE_Y_MIN, EYE_Y_MAX] of bbox height.
const EYE_X_MARGIN = 0.08; // exclude |x - centerX| < EYE_X_MARGIN*width (nose bridge)
const EYE_X_OFFSET = 0.12; // bone pivot: centerX ± EYE_X_OFFSET * width

// Scale factors - balanced for visible but natural animations
const MORPH_SCALE_FACTOR = 0.008; // 0.8% of model height for mouth morphs (increased for better visibility)
const BLINK_SCALE_FACTOR = 0.004; // 0.4% of model height for eye blinks (increased for better visibility)

function getPositions(prim: Primitive): Float32Array | null {
  const pos = prim.getAttribute("POSITION");
  if (!pos) return null;
  const arr = pos.getArray();
  if (!arr || !(arr instanceof Float32Array)) return null;
  return arr;
}

interface BBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
  centerX: number;
  centerY: number;
  centerZ: number;
}

function bboxFromPositions(arr: Float32Array): BBox {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  const depth = Math.max(1e-6, maxZ - minZ);
  return {
    minX, maxX, minY, maxY, minZ, maxZ,
    width, height, depth,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

// Joint indices: 0=Root, 1=Head, 2=Jaw, 3=Eye_L, 4=Eye_R
const J = { ROOT: 0, HEAD: 1, JAW: 2, EYE_L: 3, EYE_R: 4 } as const;

/**
 * Generate morph target displacements for a viseme
 * Uses very conservative, scale-relative displacements
 */
function generateVisemeMorph(
  positions: Float32Array,
  bbox: BBox,
  visemeType: string
): Float32Array {
  const vertexCount = positions.length / 3;
  const displacements = new Float32Array(positions.length);
  const { minY, maxY, minZ, maxZ, height, width, centerX, centerZ } = bbox;
  
  // Models are always head-only, so use full height (exclude 2% top/bottom)
  const headYMin = minY + 0.02 * height;
  const headYMax = minY + 0.98 * height;
  const headHeight = headYMax - headYMin;
  
  // Face region: detect front of model (face is typically at max Z for bust models)
  // Use the front 50% of Z range, but prefer maxZ for bust models
  const zRange = maxZ - minZ;
  const faceZMin = zRange > 0.1 ? Math.max(centerZ + (maxZ - centerZ) * 0.4, maxZ - zRange * 0.3) : maxZ - zRange * 0.2;
  const faceYMin = headYMin + 0.12 * headHeight; // Slightly lower start
  const faceYMax = headYMin + 0.92 * headHeight; // Slightly higher end
  const faceHeight = faceYMax - faceYMin;
  const faceXWidth = width * 0.45; // Slightly wider
  
  // Mouth region: lower 40% of face (starting 3% above bottom to avoid chin), centered (35% width), forward (same Z as face)
  const mouthYMin = faceYMin + 0.03 * faceHeight; // Start 3% above face bottom
  const mouthYMax = faceYMin + 0.43 * faceHeight; // Bottom 43% of face (slightly wider)
  const mouthCenterY = (mouthYMin + mouthYMax) / 2;
  const mouthWidth = width * 0.35; // Wider to catch more vertices
  const mouthZMin = faceZMin; // Use same Z threshold as face
  
  // Scale factor: very conservative fixed percentage of model height
  const scaleFactor = height * MORPH_SCALE_FACTOR;
  
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    // Only affect vertices in mouth region
    const inHeadY = y >= headYMin && y <= headYMax;
    const inFaceY = y >= faceYMin && y <= faceYMax;
    const inFaceZ = z >= faceZMin;
    const inFaceX = Math.abs(x - centerX) < faceXWidth / 2;
    const inMouthY = y >= mouthYMin && y <= mouthYMax;
    const inMouthX = Math.abs(x - centerX) < mouthWidth / 2;
    const inMouthZ = z >= mouthZMin;
    
    if (!inHeadY || !inFaceY || !inFaceZ || !inFaceX || !inMouthY || !inMouthX || !inMouthZ) {
      displacements[i * 3] = 0;
      displacements[i * 3 + 1] = 0;
      displacements[i * 3 + 2] = 0;
      continue;
    }
    
    // Calculate falloff from mouth center
    const distY = Math.abs(y - mouthCenterY) / (mouthYMax - mouthYMin);
    const distX = Math.abs(x - centerX) / (mouthWidth / 2);
    const falloff = Math.max(0, 1 - Math.max(distY, distX));
    const falloffSmooth = falloff * falloff * (3 - 2 * falloff); // Smoothstep
    
    let dx = 0, dy = 0, dz = 0;
    
    switch (visemeType) {
      case "viseme_sil":
      case "mouthClosed":
      case "viseme_A":
        // Closed - no displacement
        break;
        
      case "viseme_oh":
      case "mouthSlightlyOpen":
      case "viseme_B":
        dy = -0.025 * falloffSmooth;
        dz = 0.01 * falloffSmooth;
        break;
        
      case "viseme_aa":
      case "mouthOpen":
      case "viseme_C":
        dy = -0.06 * falloffSmooth;
        dx = (x - centerX) * 0.1 * falloffSmooth;
        break;
        
      case "viseme_ee":
      case "mouthWide":
      case "viseme_D":
        dy = -0.05 * falloffSmooth;
        dx = (x - centerX) * 0.35 * falloffSmooth;
        dz = -0.01 * falloffSmooth;
        break;
        
      case "viseme_ff":
      case "mouthNarrow":
      case "viseme_E":
        dy = -0.02 * falloffSmooth;
        dx = -(x - centerX) * 0.25 * falloffSmooth;
        dz = 0.015 * falloffSmooth;
        break;
        
      case "mouthPuckered":
      case "viseme_F":
        dy = -0.035 * falloffSmooth;
        dx = -(x - centerX) * 0.2 * falloffSmooth;
        dz = 0.04 * falloffSmooth;
        break;
        
      case "viseme_ss":
      case "mouthTeeth":
      case "viseme_G":
        dy = -0.03 * falloffSmooth;
        dx = (x - centerX) * 0.25 * falloffSmooth;
        dz = -0.015 * falloffSmooth;
        break;
        
      case "viseme_aa_wide":
      case "mouthWideOpen":
      case "viseme_H":
        dy = -0.08 * falloffSmooth;
        dx = (x - centerX) * 0.2 * falloffSmooth;
        break;
        
      case "mouthNeutral":
      case "viseme_X":
      case "rest":
        dy = -0.005 * falloffSmooth;
        break;
    }
    
    // Apply conservative scale factor
    displacements[i * 3] = dx * scaleFactor;
    displacements[i * 3 + 1] = dy * scaleFactor;
    displacements[i * 3 + 2] = dz * scaleFactor;
  }
  
  return displacements;
}

/**
 * Generate eye blink morph target
 */
function generateBlinkMorph(
  positions: Float32Array,
  bbox: BBox,
  eyeSide: "left" | "right" | "both"
): Float32Array {
  const vertexCount = positions.length / 3;
  const displacements = new Float32Array(positions.length);
  const { minY, maxY, minZ, maxZ, height, width, centerX, centerZ } = bbox;
  
  // Models are always head-only
  const headYMin = minY + 0.02 * height;
  const headYMax = minY + 0.98 * height;
  const headHeight = headYMax - headYMin;
  
  // Face region: detect front of model (same logic as morph generation)
  const zRange = maxZ - minZ;
  const faceZMin = zRange > 0.1 ? Math.max(centerZ + (maxZ - centerZ) * 0.4, maxZ - zRange * 0.3) : maxZ - zRange * 0.2;
  const faceYMin = headYMin + 0.12 * headHeight;
  const faceYMax = headYMin + 0.92 * headHeight;
  const faceHeight = faceYMax - faceYMin;
  
  // Eye region: upper-middle of face
  const eyeYMin = faceYMin + 0.45 * faceHeight;
  const eyeYMax = faceYMin + 0.75 * faceHeight;
  const eyeCenterY = (eyeYMin + eyeYMax) / 2;
  
  // Conservative scale factor
  const scaleFactor = height * BLINK_SCALE_FACTOR;
  
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const inHeadY = y >= headYMin && y <= headYMax;
    const inFaceZ = z >= faceZMin;
    const inEyeY = y >= eyeYMin && y <= eyeYMax;
    
    if (!inHeadY || !inFaceZ || !inEyeY) continue;
    
    const distFromCenterX = x - centerX;
    let inEye = false;
    let eyeCenterX = centerX;
    
    if (eyeSide === "both") {
      inEye = Math.abs(distFromCenterX) > width * 0.08 && Math.abs(distFromCenterX) < width * 0.35;
    } else if (eyeSide === "left") {
      inEye = distFromCenterX < -width * 0.05 && distFromCenterX > -width * 0.35;
      eyeCenterX = centerX - width * 0.2;
    } else {
      inEye = distFromCenterX > width * 0.05 && distFromCenterX < width * 0.35;
      eyeCenterX = centerX + width * 0.2;
    }
    
    if (inEye) {
      const distX = Math.abs(x - eyeCenterX) / (width * 0.15);
      const distY = (y - eyeCenterY) / ((eyeYMax - eyeYMin) / 2);
      
      const xFalloff = Math.max(0, 1 - distX);
      const xSmooth = xFalloff * xFalloff * (3 - 2 * xFalloff);
      
      let dy = 0;
      if (distY > 0) {
        const upperFalloff = Math.max(0, 1 - distY * 1.2);
        const upperSmooth = upperFalloff * upperFalloff;
        dy = -0.025 * upperSmooth * xSmooth;
      } else {
        const lowerFalloff = Math.max(0, 1 + distY * 2.0);
        const lowerSmooth = lowerFalloff * lowerFalloff;
        dy = 0.008 * lowerSmooth * xSmooth;
      }
      
      displacements[i * 3 + 1] = dy * scaleFactor;
      const inward = (x - eyeCenterX) * 0.015 * xSmooth;
      displacements[i * 3] = -inward * scaleFactor;
      displacements[i * 3 + 2] = 0.003 * xSmooth * scaleFactor;
    }
  }
  
  return displacements;
}

/**
 * Add morph targets to a primitive
 */
function addMorphTargets(
  doc: Document,
  prim: Primitive,
  positions: Float32Array,
  bbox: BBox,
  buffer: any
): void {
  const visemeTargets = [
    { name: "viseme_sil", type: "viseme_sil" },
    { name: "viseme_oh", type: "viseme_oh" },
    { name: "viseme_aa", type: "viseme_aa" },
    { name: "viseme_ee", type: "viseme_ee" },
    { name: "viseme_ff", type: "viseme_ff" },
    { name: "mouthPuckered", type: "mouthPuckered" },
    { name: "viseme_ss", type: "viseme_ss" },
    { name: "viseme_aa_wide", type: "viseme_aa_wide" },
    { name: "mouthNeutral", type: "mouthNeutral" },
  ];
  
  for (const target of visemeTargets) {
    const displacements = generateVisemeMorph(positions, bbox, target.type);
    const accessor = doc
      .createAccessor(target.name)
      .setArray(displacements as any)
      .setType(Accessor.Type.VEC3)
      .setBuffer(buffer);
    
    const morphTarget = (doc as any).createPrimitiveTarget(target.name);
    morphTarget.setAttribute("POSITION", accessor);
    prim.addTarget(morphTarget);
  }
  
  // Eye blink morph targets
  const blinkDisplacements = generateBlinkMorph(positions, bbox, "both");
  const blinkAccessor = doc
    .createAccessor("eyeBlink")
    .setArray(blinkDisplacements as any)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);
  const blinkTarget = (doc as any).createPrimitiveTarget("eyeBlink");
  blinkTarget.setAttribute("POSITION", blinkAccessor);
  prim.addTarget(blinkTarget);
  
  const blinkLeftDisplacements = generateBlinkMorph(positions, bbox, "left");
  const blinkLeftAccessor = doc
    .createAccessor("eyeBlinkLeft")
    .setArray(blinkLeftDisplacements as any)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);
  const blinkLeftTarget = (doc as any).createPrimitiveTarget("eyeBlinkLeft");
  blinkLeftTarget.setAttribute("POSITION", blinkLeftAccessor);
  prim.addTarget(blinkLeftTarget);
  
  const blinkRightDisplacements = generateBlinkMorph(positions, bbox, "right");
  const blinkRightAccessor = doc
    .createAccessor("eyeBlinkRight")
    .setArray(blinkRightDisplacements as any)
    .setType(Accessor.Type.VEC3)
    .setBuffer(buffer);
  const blinkRightTarget = (doc as any).createPrimitiveTarget("eyeBlinkRight");
  blinkRightTarget.setAttribute("POSITION", blinkRightAccessor);
  prim.addTarget(blinkRightTarget);
}

async function main() {
  const input = process.argv[2] || DEFAULT_INPUT;
  const output = process.argv[3] || DEFAULT_OUTPUT;
  const overwrite = process.argv.includes("--overwrite");
  const outPath = overwrite ? input : output;

  const base = path.resolve(process.cwd(), input);
  const out = path.resolve(process.cwd(), outPath);

  const io = new NodeIO();
  const doc = await io.read(base);
  const root = doc.getRoot();

  // Skip if already has skins
  if (root.listSkins().length > 0) {
    console.log("Model already has skin(s); skipping add-animations.");
    process.exit(0);
  }

  const mesh = root.listMeshes()[0];
  if (!mesh) {
    console.error("No mesh found.");
    process.exit(1);
  }

  const prim = mesh.listPrimitives()[0];
  if (!prim) {
    console.error("No primitive in first mesh.");
    process.exit(1);
  }

  const posArr = getPositions(prim);
  if (!posArr) {
    console.error("First primitive has no POSITION attribute.");
    process.exit(1);
  }

  const vertexCount = posArr.length / 3;
  const box = bboxFromPositions(posArr);
  
  // Debug: Print bounding box information
  console.log("\n📐 Model Analysis:");
  console.log(`  Bounding Box:`);
  console.log(`    X: [${box.minX.toFixed(4)}, ${box.maxX.toFixed(4)}] (width: ${box.width.toFixed(4)})`);
  console.log(`    Y: [${box.minY.toFixed(4)}, ${box.maxY.toFixed(4)}] (height: ${box.height.toFixed(4)})`);
  console.log(`    Z: [${box.minZ.toFixed(4)}, ${box.maxZ.toFixed(4)}] (depth: ${box.depth.toFixed(4)})`);
  console.log(`    Center: (${box.centerX.toFixed(4)}, ${box.centerY.toFixed(4)}, ${box.centerZ.toFixed(4)})`);
  console.log(`    Total vertices: ${vertexCount}`);
  
  // Check existing morph targets
  const existingMorphTargets = prim.listTargets();
  const hasExistingMorphs = existingMorphTargets.length > 0;
  
  if (hasExistingMorphs) {
    console.log(`\n✓ Found ${existingMorphTargets.length} existing morph target(s):`);
    const morphNames: string[] = [];
    existingMorphTargets.forEach((target, idx) => {
      const name = target.getName() || `MorphTarget_${idx}`;
      morphNames.push(name);
      console.log(`  - ${name}`);
    });
    
    const visemePatterns = [
      /viseme|mouth/i,
      /eyeBlink|blink/i,
      /smile|frown|angry|surprised/i,
    ];
    const hasVisemes = morphNames.some((name) =>
      visemePatterns.some((pattern) => pattern.test(name))
    );
    
    if (hasVisemes) {
      console.log("  ✓ Viseme/expression morph targets detected - lip sync will use morphs!");
      console.log("  ℹ Skipping morph target generation (existing morphs found).");
    } else {
      console.log("  ⚠ Existing morphs found but no viseme morphs detected.");
      console.log("  💡 Generating viseme morph targets...");
    }
  } else {
    console.log("\n⚠ No morph targets found.");
    console.log("  💡 Generating viseme morph targets procedurally...");
  }
  
  // Generate morph targets if they don't exist or don't have visemes
  const existingMorphNames = existingMorphTargets.map((t) => t.getName() || "").join(" ").toLowerCase();
  const hasVisemeMorphs = /viseme|mouth/i.test(existingMorphNames);
  
  if (!hasVisemeMorphs) {
    let buffer = prim.getAttribute("POSITION")!.getBuffer() ?? root.listBuffers()[0];
    if (!buffer) {
      buffer = doc.createBuffer();
    }
    
    console.log("  Generating complete lip sync animation system...");
    addMorphTargets(doc, prim, posArr, box, buffer);
    console.log("  ✓ Generated complete viseme morph targets for natural speech:");
    console.log("    - viseme_sil (A - Closed: M, B, P)");
    console.log("    - viseme_oh (B - Slightly open: O, U)");
    console.log("    - viseme_aa (C - Open: A, E)");
    console.log("    - viseme_ee (D - Wide: E, I)");
    console.log("    - viseme_ff (E - Narrow: F, V, TH)");
    console.log("    - mouthPuckered (F - Puckered: rounded O, U)");
    console.log("    - viseme_ss (G - Teeth: S, SH, CH, Z)");
    console.log("    - viseme_aa_wide (H - Wide open: A, AI)");
    console.log("    - mouthNeutral (X - Rest/neutral)");
    console.log("  ✓ Generated eye animation morph targets:");
    console.log("    - eyeBlink, eyeBlinkLeft, eyeBlinkRight");
  }
  
  const { minY, maxY, height, width, centerX, centerZ, maxZ, minZ } = box;
  
  // Region detection for bone rig (models are always head-only)
  const headYMin = minY + 0.02 * height;
  const headYMax = minY + 0.98 * height;
  const headHeight = headYMax - headYMin;
  
  // Face region: detect front of model (same logic as morph generation)
  const zRange = maxZ - minZ;
  const faceZMin = zRange > 0.1 ? Math.max(centerZ + (maxZ - centerZ) * 0.4, maxZ - zRange * 0.3) : maxZ - zRange * 0.2;
  const faceYMin = headYMin + 0.12 * headHeight;
  const faceYMax = headYMin + 0.92 * headHeight;
  const faceHeight = faceYMax - faceYMin;
  const faceXWidth = width * 0.45; // Slightly wider
  
  // Jaw region: lower 40% of face (starting 3% above bottom), wider X, same Z as face
  const jawYMin = faceYMin + 0.03 * faceHeight; // Start 3% above face bottom
  const jawYMax = faceYMin + 0.43 * faceHeight; // Bottom 43% of face
  const jawXWidth = width * 0.35; // Wider to catch more vertices
  const jawZMin = faceZMin; // Use same Z threshold as face
  
  const eyeYMin = faceYMin + 0.45 * faceHeight;
  const eyeYMax = faceYMin + 0.75 * faceHeight;
  const eyeXThresh = EYE_X_MARGIN * width;
  const eyeZMin = faceZMin;
  
  // Bone positions
  const jawY = jawYMin + (jawYMax - jawYMin) * 0.5;
  const headY = faceYMin + faceHeight * 0.65;
  const eyeY = (eyeYMin + eyeYMax) / 2;
  const eyeX_L = centerX - EYE_X_OFFSET * width;
  const eyeX_R = centerX + EYE_X_OFFSET * width;

  // Debug: Print detected regions and scale factors
  console.log(`\n🎯 Detected Regions:`);
  console.log(`  Head: Y [${headYMin.toFixed(4)}, ${headYMax.toFixed(4)}] (height: ${headHeight.toFixed(4)})`);
  console.log(`  Face: Y [${faceYMin.toFixed(4)}, ${faceYMax.toFixed(4)}], Z >= ${faceZMin.toFixed(4)}, X width: ${faceXWidth.toFixed(4)}`);
  console.log(`  Jaw/Mouth: Y [${jawYMin.toFixed(4)}, ${jawYMax.toFixed(4)}], Z >= ${jawZMin.toFixed(4)}, X width: ${jawXWidth.toFixed(4)}`);
  console.log(`  Eyes: Y [${eyeYMin.toFixed(4)}, ${eyeYMax.toFixed(4)}], Z >= ${eyeZMin.toFixed(4)}`);
  console.log(`\n📏 Scale Factors:`);
  console.log(`  Morph targets (mouth): ${(height * MORPH_SCALE_FACTOR).toFixed(6)} (${(MORPH_SCALE_FACTOR * 100).toFixed(2)}% of model height)`);
  console.log(`  Blink targets (eyes): ${(height * BLINK_SCALE_FACTOR).toFixed(6)} (${(BLINK_SCALE_FACTOR * 100).toFixed(2)}% of model height)`);

  // Count vertices in each region for bone assignment
  let jawCount = 0, eyeLCount = 0, eyeRCount = 0, headCount = 0;
  // Diagnostic counters for jaw region detection
  let jawYCount = 0, jawXCount = 0, jawZCount = 0, jawAllCount = 0;
  // Track Y distribution of face vertices to help locate mouth
  const faceYValues: number[] = [];

  const jointIndex = new Uint8Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const x = posArr[i * 3];
    const y = posArr[i * 3 + 1];
    const z = posArr[i * 3 + 2];
    
    const inHeadY = y >= headYMin && y <= headYMax;
    if (!inHeadY) {
      jointIndex[i] = J.HEAD;
      continue;
    }
    
    const inFaceY = y >= faceYMin && y <= faceYMax;
    const inFaceZ = z >= faceZMin;
    const inFaceX = Math.abs(x - centerX) < faceXWidth / 2;
    
    if (!(inFaceY && inFaceZ && inFaceX)) {
      jointIndex[i] = J.HEAD;
      continue;
    }
    
    // Track Y values for diagnostic
    faceYValues.push(y);
    
    // Check JAW first (has priority)
    const inJawY = y >= jawYMin && y <= jawYMax;
    const inJawX = Math.abs(x - centerX) < jawXWidth / 2;
    const inJawZ = z >= jawZMin;
    
    // Diagnostic counting
    if (inJawY) jawYCount++;
    if (inJawX) jawXCount++;
    if (inJawZ) jawZCount++;
    if (inJawY && inJawX && inJawZ) jawAllCount++;
    
    if (inJawY && inJawX && inJawZ) {
      jointIndex[i] = J.JAW;
      jawCount++;
      continue;
    }
    
    // Check EYES
    const inEyeY = y >= eyeYMin && y <= eyeYMax;
    const inEyeZ = z >= eyeZMin;
    
    if (inEyeY && inEyeZ) {
      if (x < centerX - eyeXThresh) {
        jointIndex[i] = J.EYE_L;
        eyeLCount++;
      } else if (x > centerX + eyeXThresh) {
        jointIndex[i] = J.EYE_R;
        eyeRCount++;
      } else {
        jointIndex[i] = J.HEAD;
        headCount++;
      }
      continue;
    }
    
    jointIndex[i] = J.HEAD;
    headCount++;
  }
  
  // Debug output
  console.log(`\n📊 Vertex assignment summary:`);
  console.log(`  - Jaw/Mouth: ${jawCount} vertices`);
  console.log(`  - Eye_L: ${eyeLCount} vertices`);
  console.log(`  - Eye_R: ${eyeRCount} vertices`);
  console.log(`  - Head/Other: ${headCount} vertices`);
  console.log(`  - Total: ${jawCount + eyeLCount + eyeRCount + headCount} vertices`);
  
  if (jawCount === 0) {
    console.warn(`  ⚠️  WARNING: No vertices assigned to JAW! Lip sync may not work.`);
    console.log(`  🔍 Jaw region diagnostic (vertices in face region):`);
    console.log(`     - Pass Y filter: ${jawYCount}`);
    console.log(`     - Pass X filter: ${jawXCount}`);
    console.log(`     - Pass Z filter: ${jawZCount}`);
    console.log(`     - Pass all filters: ${jawAllCount}`);
    if (faceYValues.length > 0) {
      faceYValues.sort((a, b) => a - b);
      const minY = faceYValues[0];
      const maxY = faceYValues[faceYValues.length - 1];
      const p25 = faceYValues[Math.floor(faceYValues.length * 0.25)];
      const p50 = faceYValues[Math.floor(faceYValues.length * 0.50)];
      const p75 = faceYValues[Math.floor(faceYValues.length * 0.75)];
      console.log(`  📊 Face Y distribution (${faceYValues.length} vertices):`);
      console.log(`     - Min: ${minY.toFixed(4)}, 25%: ${p25.toFixed(4)}, 50%: ${p50.toFixed(4)}, 75%: ${p75.toFixed(4)}, Max: ${maxY.toFixed(4)}`);
      console.log(`     - Jaw Y range: [${jawYMin.toFixed(4)}, ${jawYMax.toFixed(4)}]`);
    }
  }
  if (eyeLCount === 0 || eyeRCount === 0) {
    console.warn(`  ⚠️  WARNING: No vertices assigned to EYES!`);
  }

  // Create bone rig with proper weight falloff to avoid distortion
  let buffer = prim.getAttribute("POSITION")!.getBuffer() ?? root.listBuffers()[0];
  if (!buffer) {
    buffer = doc.createBuffer();
  }

  // JOINTS_0: VEC4 UNSIGNED_BYTE
  const jointsData = new Uint8Array(vertexCount * 4);
  const weightsData = new Float32Array(vertexCount * 4);
  
  for (let i = 0; i < vertexCount; i++) {
    const j = i * 4;
    const joint = jointIndex[i];
    
    // Primary joint gets most weight, with smooth falloff for nearby regions
    jointsData[j] = joint;
    jointsData[j + 1] = J.HEAD; // Secondary always Head for smooth blending
    jointsData[j + 2] = 0;
    jointsData[j + 3] = 0;
    
    // Calculate weights with falloff to prevent harsh transitions
    const x = posArr[i * 3];
    const y = posArr[i * 3 + 1];
    const z = posArr[i * 3 + 2];
    
    let primaryWeight = 1.0;
    let secondaryWeight = 0.0;
    
    // For jaw vertices, add smooth falloff to head
    if (joint === J.JAW) {
      const distFromJawCenter = Math.abs(y - jawY);
      const maxDist = (jawYMax - jawYMin) * 0.5;
      const falloff = Math.min(1, distFromJawCenter / maxDist);
      primaryWeight = 0.7 + 0.3 * (1 - falloff); // 0.7-1.0 range
      secondaryWeight = 1.0 - primaryWeight;
    } else if (joint === J.EYE_L || joint === J.EYE_R) {
      // Eye vertices blend with head
      primaryWeight = 0.8;
      secondaryWeight = 0.2;
    } else {
      // Head vertices stay fully on head
      primaryWeight = 1.0;
      secondaryWeight = 0.0;
    }
    
    weightsData[j] = primaryWeight;
    weightsData[j + 1] = secondaryWeight;
    weightsData[j + 2] = 0;
    weightsData[j + 3] = 0;
  }
  
  const jointsAccessor = doc
    .createAccessor("JOINTS_0")
    .setArray(jointsData)
    .setType(Accessor.Type.VEC4)
    .setBuffer(buffer);

  const weightsAccessor = doc
    .createAccessor("WEIGHTS_0")
    .setArray(weightsData)
    .setType(Accessor.Type.VEC4)
    .setBuffer(buffer);

  prim.setAttribute("JOINTS_0", jointsAccessor);
  prim.setAttribute("WEIGHTS_0", weightsAccessor);

  // Create bone hierarchy
  const rootNode = doc.createNode("Root").setTranslation([0, 0, 0]);
  const headNode = doc.createNode("Head").setTranslation([0, headY, 0]);
  const jawNode = doc.createNode("Jaw").setTranslation([0, jawY - headY, 0]);
  const eyeLNode = doc.createNode("Eye_L").setTranslation([eyeX_L, eyeY - headY, centerZ]);
  const eyeRNode = doc.createNode("Eye_R").setTranslation([eyeX_R, eyeY - headY, centerZ]);

  rootNode.addChild(headNode);
  headNode.addChild(jawNode);
  headNode.addChild(eyeLNode);
  headNode.addChild(eyeRNode);

  // Inverse bind matrices
  const toInv = (tx: number, ty: number, tz: number) =>
    new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -tx, -ty, -tz, 1]);

  const ibm = new Float32Array(5 * 16);
  ibm.set(toInv(0, 0, 0), 0);
  ibm.set(toInv(0, headY, 0), 16);
  ibm.set(toInv(0, jawY, 0), 32);
  ibm.set(toInv(eyeX_L, eyeY, centerZ), 48);
  ibm.set(toInv(eyeX_R, eyeY, centerZ), 64);

  const ibmAccessor = doc
    .createAccessor("IBM")
    .setArray(ibm)
    .setType(Accessor.Type.MAT4)
    .setBuffer(buffer);

  const skin = doc
    .createSkin("FaceRig")
    .addJoint(rootNode)
    .addJoint(headNode)
    .addJoint(jawNode)
    .addJoint(eyeLNode)
    .addJoint(eyeRNode)
    .setSkeleton(rootNode)
    .setInverseBindMatrices(ibmAccessor);

  const meshNode = root.listNodes().find((n) => n.getMesh() === mesh) ?? null;
  if (!meshNode) {
    console.error("No node found that uses the first mesh.");
    process.exit(1);
  }
  meshNode.setSkin(skin);

  const scene: Scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (scene) scene.addChild(rootNode);

  await io.write(out, doc);
  console.log(`\n✓ Successfully created animated avatar: ${out}`);
  console.log("\n📋 Complete Animation System Summary:");
  console.log("  🦴 Bone Rig:");
  console.log("     - Root, Head, Jaw, Eye_L, Eye_R (5 bones)");
  console.log("     - Properly weighted skinning with smooth falloff");
  console.log("  🎭 Morph Targets:");
  const finalMorphCount = prim.listTargets().length;
  if (hasVisemeMorphs) {
    console.log(`     - ${finalMorphCount} morph targets (preserved existing + generated)`);
  } else {
    console.log(`     - ${finalMorphCount} morph targets (all generated procedurally)`);
  }
  console.log("     - Complete viseme set (A-H, X) for natural speech");
  console.log("     - Eye blink animations");
  console.log("\n✨ Your avatar is now ready for natural, human-like lip sync!");
  console.log("   The AvatarRenderer will automatically use these animations.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
