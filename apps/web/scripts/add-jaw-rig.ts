/**
 * Add-rig — add a face-rig skeleton to an unrigged GLB: Root, Head, Jaw, Eye_L, Eye_R.
 * Enables AvatarRenderer's lip sync (Jaw), head nod/sway (Head), and blinking (Eye_L, Eye_R).
 *
 * Uses @gltf-transform/core. Run: pnpm rig:jaw [input] [output]
 * Example: pnpm rig:jaw public/assets/pennywise.glb public/assets/pennywise-rigged.glb
 */

import * as path from "path";
import { NodeIO, Accessor, type Primitive, type Scene } from "@gltf-transform/core";

const DEFAULT_INPUT = "public/assets/pennywise.glb";
const DEFAULT_OUTPUT = "public/assets/pennywise-rigged.glb";

const JAW_RATIO = 0.25; // lowest 25% Y → Jaw
const HINGE_RATIO = 0.2; // jaw pivot Y = minY + HINGE_RATIO * height
const HEAD_Y_RATIO = 0.6; // head node Y = minY + HEAD_Y_RATIO * height

// Eye band: upper-mid face only (avoid forehead). Y in [EYE_Y_MIN, EYE_Y_MAX] of bbox height.
const EYE_Y_MIN = 0.50; // bottom of eye band (just above nose/cheek)
const EYE_Y_MAX = 0.70; // top of eye band (below forehead)
const EYE_X_MARGIN = 0.08; // exclude |x - centerX| < EYE_X_MARGIN*width (nose bridge)
const EYE_X_OFFSET = 0.12; // bone pivot: centerX ± EYE_X_OFFSET * width

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
    console.log("Model already has skin(s); skipping add-jaw-rig.");
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
  const { minY, height, width, centerX, centerZ } = box;
  const jawThreshold = minY + JAW_RATIO * height;
  const jawY = minY + HINGE_RATIO * height;
  const headY = minY + HEAD_Y_RATIO * height;

  const eyeYMin = minY + EYE_Y_MIN * height;
  const eyeYMax = minY + EYE_Y_MAX * height;
  const eyeXThresh = EYE_X_MARGIN * width;
  const eyeY = minY + ((EYE_Y_MIN + EYE_Y_MAX) / 2) * height;
  const eyeX_L = centerX - EYE_X_OFFSET * width;
  const eyeX_R = centerX + EYE_X_OFFSET * width;

  // Per-vertex joint: only assign Eye_L/Eye_R when clearly in the eye band (narrow Y, lateral X)
  const jointIndex = new Uint8Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const x = posArr[i * 3], y = posArr[i * 3 + 1];
    if (y < jawThreshold) {
      jointIndex[i] = J.JAW;
    } else if (y >= eyeYMin && y <= eyeYMax) {
      if (x < centerX - eyeXThresh) jointIndex[i] = J.EYE_L;
      else if (x > centerX + eyeXThresh) jointIndex[i] = J.EYE_R;
      else jointIndex[i] = J.HEAD; // nose bridge / center in eye Y band
    } else {
      jointIndex[i] = J.HEAD;
    }
  }

  const buffer = prim.getAttribute("POSITION")!.getBuffer() ?? root.listBuffers()[0];
  if (!buffer) {
    console.error("No buffer for accessors.");
    process.exit(1);
  }

  // JOINTS_0: VEC4 UNSIGNED_BYTE — 0=Root, 1=Head, 2=Jaw, 3=Eye_L, 4=Eye_R
  const jointsData = new Uint8Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    const j = i * 4;
    jointsData[j] = jointIndex[i];
    jointsData[j + 1] = 0;
    jointsData[j + 2] = 0;
    jointsData[j + 3] = 0;
  }
  const jointsAccessor = doc
    .createAccessor("JOINTS_0")
    .setArray(jointsData)
    .setType(Accessor.Type.VEC4)
    .setBuffer(buffer);

  const weightsData = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    const j = i * 4;
    weightsData[j] = 1;
    weightsData[j + 1] = 0;
    weightsData[j + 2] = 0;
    weightsData[j + 3] = 0;
  }
  const weightsAccessor = doc
    .createAccessor("WEIGHTS_0")
    .setArray(weightsData)
    .setType(Accessor.Type.VEC4)
    .setBuffer(buffer);

  prim.setAttribute("JOINTS_0", jointsAccessor);
  prim.setAttribute("WEIGHTS_0", weightsAccessor);

  // Hierarchy: Root → Head → { Eye_L, Eye_R, Jaw }. All positions in world; children in Head-local.
  const rootNode = doc.createNode("Root").setTranslation([0, 0, 0]);
  const headNode = doc.createNode("Head").setTranslation([0, headY, 0]);
  const jawNode = doc.createNode("Jaw").setTranslation([0, jawY - headY, 0]); // Head-local
  const eyeLNode = doc.createNode("Eye_L").setTranslation([eyeX_L, eyeY - headY, centerZ]);
  const eyeRNode = doc.createNode("Eye_R").setTranslation([eyeX_R, eyeY - headY, centerZ]);

  rootNode.addChild(headNode);
  headNode.addChild(jawNode);
  headNode.addChild(eyeLNode);
  headNode.addChild(eyeRNode);

  // Inverse bind: for each joint at world (tx,ty,tz) in bind, IBM = T(-tx,-ty,-tz) (column-major)
  const toInv = (tx: number, ty: number, tz: number) =>
    new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -tx, -ty, -tz, 1]);

  const ibm = new Float32Array(5 * 16);
  ibm.set(toInv(0, 0, 0), 0);              // Root
  ibm.set(toInv(0, headY, 0), 16);         // Head
  ibm.set(toInv(0, jawY, 0), 32);          // Jaw (world)
  ibm.set(toInv(eyeX_L, eyeY, centerZ), 48); // Eye_L (world)
  ibm.set(toInv(eyeX_R, eyeY, centerZ), 64); // Eye_R (world)

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
  console.log(`Wrote rigged GLB: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
