import { avatarBuilderSteps } from "../../hooks/useAvatarBuilder";
import styles from "./AvatarBuilder.module.css";

export type BuilderStepsProps = {
  currentStepIndex: number;
};

export function BuilderSteps({ currentStepIndex }: BuilderStepsProps) {
  return (
    <ol className={styles.steps} aria-label="Pasos de creación">
      {avatarBuilderSteps.map((step, index) => (
        <li
          className={styles.step}
          data-active={index === currentStepIndex}
          data-complete={index < currentStepIndex}
          aria-current={index === currentStepIndex ? "step" : undefined}
          key={step}
        >
          <span className={styles.stepNumber}>{index + 1}</span>
          <strong className={styles.stepText}>{getStepLabel(step)}</strong>
        </li>
      ))}
    </ol>
  );
}

function getStepLabel(step: (typeof avatarBuilderSteps)[number]) {
  if (step === "Avatar") return "Avatar visual";
  if (step === "Review") return "Revisión";
  return step;
}
