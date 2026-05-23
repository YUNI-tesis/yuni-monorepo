import { avatarBuilderSteps } from "../../hooks/useAvatarBuilder";
import styles from "./AvatarBuilder.module.css";

export type BuilderStepsProps = {
  currentStepIndex: number;
};

export function BuilderSteps({ currentStepIndex }: BuilderStepsProps) {
  return (
    <div className={styles.steps} aria-label="Pasos de creacion">
      {avatarBuilderSteps.map((step, index) => (
        <span
          className={styles.step}
          data-active={index === currentStepIndex}
          data-complete={index < currentStepIndex}
          key={step}
        >
          <span className={styles.stepNumber}>{index + 1}</span>
          {step}
        </span>
      ))}
    </div>
  );
}
