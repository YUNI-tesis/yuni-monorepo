/**
 * Viseme Mapping
 * Maps phonetic sounds to viseme types (mouth shapes) for lip sync
 * Based on Rhubarb Lip Sync viseme system
 */

export enum VisemeType {
  A = "A", // Closed (silence, M, B, P)
  B = "B", // Slightly open (low vowels: O, U)
  C = "C", // Open (mid vowels: A, E)
  D = "D", // Wide (high vowels: E, I)
  E = "E", // Narrow (fricatives: F, V, TH)
  F = "F", // Puckered (rounded vowels: O, U)
  G = "G", // Teeth visible (sibilants: S, SH, CH, Z)
  H = "H", // Open wide (A, wide mouth)
  X = "X", // Rest/neutral
}

/**
 * Phoneme to Viseme mapping
 * Maps common phonemes to their corresponding viseme types
 */
export const PHONEME_TO_VISEME: Record<string, VisemeType> = {
  // Closed sounds
  m: VisemeType.A,
  b: VisemeType.A,
  p: VisemeType.A,
  
  // Low vowels (slightly open)
  o: VisemeType.B,
  u: VisemeType.B,
  ʊ: VisemeType.B, // "oo" as in "book"
  ɔ: VisemeType.B, // "aw" as in "law"
  
  // Mid vowels (open)
  a: VisemeType.C,
  æ: VisemeType.C, // "a" as in "cat"
  ə: VisemeType.C, // schwa
  ɜ: VisemeType.C, // "er" as in "her"
  
  // High vowels (wide)
  i: VisemeType.D,
  ɪ: VisemeType.D, // "i" as in "bit"
  e: VisemeType.D,
  ɛ: VisemeType.D, // "e" as in "bed"
  
  // Fricatives (narrow)
  f: VisemeType.E,
  v: VisemeType.E,
  θ: VisemeType.E, // "th" as in "think"
  ð: VisemeType.E, // "th" as in "the"
  
  // Rounded vowels (puckered)
  oʊ: VisemeType.F, // "o" as in "go"
  ɔɪ: VisemeType.F, // "oy" as in "boy"
  
  // Sibilants (teeth)
  s: VisemeType.G,
  z: VisemeType.G,
  ʃ: VisemeType.G, // "sh"
  ʒ: VisemeType.G, // "zh" as in "measure"
  tʃ: VisemeType.G, // "ch"
  dʒ: VisemeType.G, // "j"
  
  // Wide open
  aɪ: VisemeType.H, // "ai" as in "eye"
  aʊ: VisemeType.H, // "au" as in "out"
};

/**
 * Frequency band to viseme mapping
 * Used for real-time audio analysis when phoneme data is not available
 */
export interface FrequencyVisemeMapping {
  viseme: VisemeType;
  jawOpen: number; // 0-1
  jawSpread: number; // -1 to 1 (negative = narrow, positive = wide)
  jawProtrude: number; // -1 to 1 (negative = retracted, positive = puckered)
  intensity: number; // 0-1, base intensity multiplier
}

export const FREQUENCY_TO_VISEME: Record<VisemeType, FrequencyVisemeMapping> = {
  [VisemeType.A]: {
    viseme: VisemeType.A,
    jawOpen: 0.0,
    jawSpread: 0.0,
    jawProtrude: 0.0,
    intensity: 0.0,
  },
  [VisemeType.B]: {
    viseme: VisemeType.B,
    jawOpen: 0.25,
    jawSpread: -0.1,
    jawProtrude: 0.2,
    intensity: 0.4,
  },
  [VisemeType.C]: {
    viseme: VisemeType.C,
    jawOpen: 0.5,
    jawSpread: 0.1,
    jawProtrude: 0.0,
    intensity: 0.6,
  },
  [VisemeType.D]: {
    viseme: VisemeType.D,
    jawOpen: 0.6,
    jawSpread: 0.5,
    jawProtrude: -0.1,
    intensity: 0.7,
  },
  [VisemeType.E]: {
    viseme: VisemeType.E,
    jawOpen: 0.2,
    jawSpread: -0.3,
    jawProtrude: 0.1,
    intensity: 0.5,
  },
  [VisemeType.F]: {
    viseme: VisemeType.F,
    jawOpen: 0.4,
    jawSpread: -0.2,
    jawProtrude: 0.5,
    intensity: 0.6,
  },
  [VisemeType.G]: {
    viseme: VisemeType.G,
    jawOpen: 0.3,
    jawSpread: 0.3,
    jawProtrude: -0.2,
    intensity: 0.6,
  },
  [VisemeType.H]: {
    viseme: VisemeType.H,
    jawOpen: 0.8,
    jawSpread: 0.4,
    jawProtrude: 0.0,
    intensity: 0.8,
  },
  [VisemeType.X]: {
    viseme: VisemeType.X,
    jawOpen: 0.0,
    jawSpread: 0.0,
    jawProtrude: 0.0,
    intensity: 0.0,
  },
};

/**
 * Detect viseme from frequency analysis
 */
export function detectVisemeFromFrequency(
  lowBand: number,
  midBand: number,
  highBand: number,
  vHighBand: number,
  totalEnergy: number,
  volume: number
): VisemeType {
  if (volume < 0.15) {
    return VisemeType.X; // Silence/rest
  }

  const lowNorm = Math.min(1, lowBand / 5000);
  const midNorm = Math.min(1, midBand / 15000);
  const highNorm = Math.min(1, highBand / 8000);
  const vHighNorm = Math.min(1, vHighBand / 5000);

  const lowRatio = lowBand / (totalEnergy + 1);
  const highRatio = (highBand + vHighBand) / (totalEnergy + 1);
  const midRatio = midBand / (totalEnergy + 1);

  // Sibilants (S, SH, CH) - teeth visible
  if (vHighNorm > 0.3 && highNorm > 0.2) {
    return VisemeType.G;
  }

  // Fricatives (F, V, TH) - narrow opening
  if (highNorm > 0.25 && volume > 0.2) {
    return VisemeType.E;
  }

  // Rounded vowels (O, U) - puckered
  if (lowRatio > 0.4 && midNorm > 0.2) {
    return VisemeType.F;
  }

  // High vowels (E, I) - wide
  if (highRatio > 0.3 && midNorm > 0.25) {
    return VisemeType.D;
  }

  // Mid vowels (A, E) - open
  if (midNorm > 0.2 || lowNorm > 0.15) {
    return VisemeType.C;
  }

  // Low vowels (O, U) - slightly open
  if (lowNorm > 0.1) {
    return VisemeType.B;
  }

  return VisemeType.X;
}
