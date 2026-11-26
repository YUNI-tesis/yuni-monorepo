import { createContext, useContext } from "react";
import styles from "./AvatarBuilder.module.css";

/** Where the current step sits in the wizard, so its heading can say "Paso 2 de 6". */
export const BuilderStepPosition = createContext<{ index: number; total: number } | null>(null);

export type StepHeadingProps = {
  title: string;
  description: string;
};

export function StepHeading({ title, description }: StepHeadingProps) {
  const position = useContext(BuilderStepPosition);

  return (
    <div className={styles.heading}>
      {position ? (
        <p className={styles.stepCounter}>
          Paso {position.index + 1} de {position.total}
        </p>
      ) : null}
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
