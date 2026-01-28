/**
 * Morph Target Names
 * Standard names for morph targets (blend shapes) used in avatar animation
 * These should match the morph target names in your 3D model
 */

/**
 * Mouth/Viseme Morph Targets
 * These control lip sync animations
 */
export const MOUTH_MORPH_TARGETS = {
  // Viseme-based morphs (Rhubarb Lip Sync compatible)
  A: ["viseme_sil", "viseme_aa", "mouthClosed", "M", "B", "P"],
  B: ["viseme_oh", "viseme_O", "mouthSlightlyOpen", "O", "U"],
  C: ["viseme_aa", "viseme_A", "mouthOpen", "A", "AH"],
  D: ["viseme_ee", "viseme_E", "mouthWide", "E", "I", "EE"],
  E: ["viseme_ff", "viseme_F", "mouthNarrow", "F", "V", "TH"],
  F: ["viseme_oh", "viseme_O", "mouthPuckered", "O", "OU"],
  G: ["viseme_ss", "viseme_S", "mouthTeeth", "S", "SH", "CH", "Z"],
  H: ["viseme_aa", "viseme_A", "mouthWideOpen", "AH", "AI"],
  X: ["viseme_sil", "mouthNeutral", "rest"], // Rest/neutral

  // Generic fallbacks
  OPEN: ["mouthOpen", "open", "Open"],
  CLOSED: ["mouthClosed", "closed", "Closed"],
  SMILE: ["smile", "Smile", "mouthSmile"],
  FROWN: ["frown", "Frown", "mouthFrown"],
} as const;

/**
 * Eye Morph Targets
 * These control blinking and eye expressions
 */
export const EYE_MORPH_TARGETS = {
  BLINK: ["eyeBlink", "EyeBlink", "blink", "Blink"],
  BLINK_LEFT: ["eyeBlinkLeft", "EyeBlinkLeft", "blinkLeft", "BlinkLeft"],
  BLINK_RIGHT: ["eyeBlinkRight", "EyeBlinkRight", "blinkRight", "BlinkRight"],
  WIDE: ["eyeWide", "EyeWide", "wide", "Wide"],
  HAPPY: ["eyeHappy", "EyeHappy", "happy", "Happy"],
  SAD: ["eyeSad", "EyeSad", "sad", "Sad"],
  SURPRISED: ["eyeSurprised", "EyeSurprised", "surprised", "Surprised"],
} as const;

/**
 * Facial Expression Morph Targets
 * These control overall facial expressions
 */
export const EXPRESSION_MORPH_TARGETS = {
  SMILE: ["smile", "Smile", "happy", "Happy"],
  FROWN: ["frown", "Frown", "sad", "Sad"],
  ANGRY: ["angry", "Angry", "mad", "Mad"],
  SURPRISED: ["surprised", "Surprised", "shocked", "Shocked"],
  FUNNY: ["funnyFace", "FunnyFace", "funny", "Funny"],
  DEFAULT: ["default", "Default", "neutral", "Neutral"],
} as const;

/**
 * Find morph target index by name patterns
 */
export function findMorphTargetIndex(
  morphTargetDictionary: Record<string, number> | undefined,
  namePatterns: readonly string[]
): number | null {
  if (!morphTargetDictionary) return null;

  for (const pattern of namePatterns) {
    // Exact match (case-insensitive)
    for (const [name, index] of Object.entries(morphTargetDictionary)) {
      if (name.toLowerCase() === pattern.toLowerCase()) {
        return index;
      }
    }

    // Partial match (case-insensitive)
    for (const [name, index] of Object.entries(morphTargetDictionary)) {
      if (name.toLowerCase().includes(pattern.toLowerCase()) ||
          pattern.toLowerCase().includes(name.toLowerCase())) {
        return index;
      }
    }
  }

  return null;
}

/**
 * Get all morph target indices for a viseme
 */
export function getVisemeMorphIndices(
  morphTargetDictionary: Record<string, number> | undefined,
  viseme: string
): number[] {
  const patterns = MOUTH_MORPH_TARGETS[viseme as keyof typeof MOUTH_MORPH_TARGETS];
  if (!patterns) return [];

  const indices: number[] = [];
  for (const pattern of patterns) {
    const index = findMorphTargetIndex(morphTargetDictionary, [pattern]);
    if (index !== null && !indices.includes(index)) {
      indices.push(index);
    }
  }

  return indices;
}
