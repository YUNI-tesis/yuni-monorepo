import { Badge } from "@yuni/ui";
import { liveAvatarOptions } from "../options";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function LiveAvatarStep({ builder }: { builder: AvatarBuilderController }) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Avatar visual"
        description="Elegi una opcion de Live Avatar. La sesion real se conectara en el modulo de integracion."
      />
      <div className={styles.optionGrid}>
        {liveAvatarOptions.map((option) => (
          <button
            className={styles.option}
            data-selected={builder.state.liveAvatarId === option.id}
            key={option.id}
            type="button"
            onClick={() => builder.updateField("liveAvatarId", option.id)}
          >
            <span className={styles.avatarPreview} aria-hidden="true">
              {option.name.slice(0, 1)}
            </span>
            <span>
              <strong>{option.name}</strong>
              <small>{option.description}</small>
            </span>
            <Badge tone={builder.state.liveAvatarId === option.id ? "success" : "neutral"}>Lite sandbox</Badge>
          </button>
        ))}
      </div>
      {builder.errors.liveAvatarId ? (
        <p className="yuni-form-field__error">{builder.errors.liveAvatarId}</p>
      ) : null}
    </section>
  );
}
