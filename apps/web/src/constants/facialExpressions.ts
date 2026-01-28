/**
 * Facial Expressions
 * Defines facial expression states and their corresponding animations
 */

export enum FacialExpression {
  DEFAULT = "default",
  SMILE = "smile",
  SAD = "sad",
  ANGRY = "angry",
  SURPRISED = "surprised",
  FUNNY = "funnyFace",
  THOUGHTFUL = "thoughtful",
}

/**
 * Expression configuration
 */
export interface ExpressionConfig {
  name: FacialExpression;
  morphTargetWeight: number; // 0-1, how much the morph target should be applied
  jawOffset: number; // Additional jaw rotation offset
  headTilt: { x: number; y: number }; // Head rotation adjustments
  eyeState: "open" | "half" | "closed";
  duration?: number; // Transition duration in seconds
}

export const EXPRESSION_CONFIGS: Record<FacialExpression, ExpressionConfig> = {
  [FacialExpression.DEFAULT]: {
    name: FacialExpression.DEFAULT,
    morphTargetWeight: 0.0,
    jawOffset: 0.0,
    headTilt: { x: 0, y: 0 },
    eyeState: "open",
  },
  [FacialExpression.SMILE]: {
    name: FacialExpression.SMILE,
    morphTargetWeight: 0.8,
    jawOffset: 0.1, // Slight jaw opening for smile
    headTilt: { x: 0.02, y: 0 }, // Slight upward tilt
    eyeState: "half", // Eyes slightly closed when smiling
    duration: 0.3,
  },
  [FacialExpression.SAD]: {
    name: FacialExpression.SAD,
    morphTargetWeight: 0.7,
    jawOffset: -0.05, // Jaw slightly closed
    headTilt: { x: -0.03, y: 0 }, // Slight downward tilt
    eyeState: "half",
    duration: 0.4,
  },
  [FacialExpression.ANGRY]: {
    name: FacialExpression.ANGRY,
    morphTargetWeight: 0.9,
    jawOffset: 0.15, // Jaw more open (talking/yelling)
    headTilt: { x: 0.01, y: 0.02 }, // Slight forward tilt
    eyeState: "open",
    duration: 0.2,
  },
  [FacialExpression.SURPRISED]: {
    name: FacialExpression.SURPRISED,
    morphTargetWeight: 1.0,
    jawOffset: 0.3, // Wide open mouth
    headTilt: { x: 0.05, y: 0 }, // Head back
    eyeState: "open",
    duration: 0.3,
  },
  [FacialExpression.FUNNY]: {
    name: FacialExpression.FUNNY,
    morphTargetWeight: 0.6,
    jawOffset: 0.2,
    headTilt: { x: 0, y: 0.03 }, // Head tilt
    eyeState: "half",
    duration: 0.25,
  },
  [FacialExpression.THOUGHTFUL]: {
    name: FacialExpression.THOUGHTFUL,
    morphTargetWeight: 0.3,
    jawOffset: -0.02, // Slightly closed
    headTilt: { x: -0.01, y: -0.02 }, // Slight tilt down and to side
    eyeState: "half",
    duration: 0.5,
  },
};

/**
 * Animation types for body movement
 */
export enum AnimationType {
  IDLE = "Idle",
  TALKING_ONE = "TalkingOne",
  TALKING_THREE = "TalkingThree",
  SAD_IDLE = "SadIdle",
  DEFEATED = "Defeated",
  ANGRY = "Angry",
  SURPRISED = "Surprised",
  DISMISSING_GESTURE = "DismissingGesture",
  THOUGHTFUL_HEAD_SHAKE = "ThoughtfulHeadShake",
}

/**
 * Expression to animation mapping
 */
export const EXPRESSION_TO_ANIMATION: Record<FacialExpression, AnimationType> = {
  [FacialExpression.DEFAULT]: AnimationType.IDLE,
  [FacialExpression.SMILE]: AnimationType.TALKING_ONE,
  [FacialExpression.SAD]: AnimationType.SAD_IDLE,
  [FacialExpression.ANGRY]: AnimationType.ANGRY,
  [FacialExpression.SURPRISED]: AnimationType.SURPRISED,
  [FacialExpression.FUNNY]: AnimationType.TALKING_THREE,
  [FacialExpression.THOUGHTFUL]: AnimationType.THOUGHTFUL_HEAD_SHAKE,
};

/**
 * Get expression config
 */
export function getExpressionConfig(expression: FacialExpression): ExpressionConfig {
  return EXPRESSION_CONFIGS[expression] || EXPRESSION_CONFIGS[FacialExpression.DEFAULT];
}
