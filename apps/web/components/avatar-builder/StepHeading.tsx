import styles from "./AvatarBuilder.module.css";

export type StepHeadingProps = {
  title: string;
  description: string;
};

export function StepHeading({ title, description }: StepHeadingProps) {
  return (
    <div className={styles.heading}>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
