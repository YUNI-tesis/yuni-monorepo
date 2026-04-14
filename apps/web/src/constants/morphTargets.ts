/**
 * Morph target channel names used by the avatar renderer.
 * The renderer only drives channels that already exist on the loaded model.
 */
export const LIPSYNC_MORPH_CHANNELS = {
  // Oculus LipSync visemes (exact names)
  viseme_sil: ["viseme_sil"],
  viseme_PP: ["viseme_PP"],
  viseme_FF: ["viseme_FF"],
  viseme_TH: ["viseme_TH"],
  viseme_DD: ["viseme_DD"],
  viseme_kk: ["viseme_kk"],
  viseme_CH: ["viseme_CH"],
  viseme_SS: ["viseme_SS"],
  viseme_nn: ["viseme_nn"],
  viseme_RR: ["viseme_RR"],
  viseme_aa: ["viseme_aa"],
  viseme_E: ["viseme_E"],
  viseme_I: ["viseme_I"],
  viseme_O: ["viseme_O"],
  viseme_U: ["viseme_U"],
  // Extra expressions and fallbacks for models with richer face rigs
  mouthOpen: ["mouthOpen", "jawOpen"],
  mouthClose: ["mouthClose"],
  mouthSmile: ["mouthSmile"],
  eyesClosed: ["eyesClosed"],
  eyeBlinkLeft: ["eyeBlinkLeft"],
  eyeBlinkRight: ["eyeBlinkRight"],
  browInnerUp: ["browInnerUp"],
  browDownLeft: ["browDownLeft"],
  browDownRight: ["browDownRight"],
  eyesLookUp: ["eyesLookUp"],
  eyesLookDown: ["eyesLookDown"],
} as const;

export type LipSyncChannelName = keyof typeof LIPSYNC_MORPH_CHANNELS;

/**
 * Ordered viseme channels for audio-driven lip sync (Oculus LipSync order).
 * Renderer maps analyser output to these and writes morphTargetInfluences.
 */
export const LIPSYNC_VISEME_CHANNELS: readonly LipSyncChannelName[] = [
  "viseme_sil",
  "viseme_PP",
  "viseme_FF",
  "viseme_TH",
  "viseme_DD",
  "viseme_kk",
  "viseme_CH",
  "viseme_SS",
  "viseme_nn",
  "viseme_RR",
  "viseme_aa",
  "viseme_E",
  "viseme_I",
  "viseme_O",
  "viseme_U",
];

/** @deprecated Use LIPSYNC_VISEME_CHANNELS. Kept for backwards compatibility. */
export const LIPSYNC_CHANNELS = LIPSYNC_VISEME_CHANNELS;

/**
 * Find morph target index by name patterns (exact then partial, case-insensitive).
 */
export function findMorphTargetIndex(
  morphTargetDictionary: Record<string, number> | undefined,
  namePatterns: readonly string[]
): number | null {
  if (!morphTargetDictionary) return null;

  for (const pattern of namePatterns) {
    for (const [name, index] of Object.entries(morphTargetDictionary)) {
      if (name.toLowerCase() === pattern.toLowerCase()) return index;
    }
    for (const [name, index] of Object.entries(morphTargetDictionary)) {
      if (
        name.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(name.toLowerCase())
      )
        return index;
    }
  }

  return null;
}

/**
 * Build a map of logical channel name -> morph target index for a given mesh.
 * Only includes channels whose morph target exists on the mesh.
 * Use once per mesh; in useFrame set morphTargetInfluences[index] = value.
 */
export function buildChannelToIndexMap(
  morphTargetDictionary: Record<string, number> | undefined
): Partial<Record<LipSyncChannelName, number>> {
  const map: Partial<Record<LipSyncChannelName, number>> = {};
  if (!morphTargetDictionary) return map;

  for (const channel of Object.keys(LIPSYNC_MORPH_CHANNELS) as LipSyncChannelName[]) {
    const patterns = LIPSYNC_MORPH_CHANNELS[channel];
    const index = findMorphTargetIndex(morphTargetDictionary, patterns);
    if (index !== null) map[channel] = index;
  }

  return map;
}
