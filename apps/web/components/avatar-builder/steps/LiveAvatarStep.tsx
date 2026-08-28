import { LiveAvatarPicker } from "../../live-avatar/LiveAvatarPicker";
import type { LiveAvatarOptionsState } from "../../../hooks/useLiveAvatarOptions";
import { StepHeading } from "../StepHeading";
import type { AvatarBuilderController } from "../types";
import styles from "../AvatarBuilder.module.css";

export function LiveAvatarStep({
  builder,
  liveAvatarOptions,
}: {
  builder: AvatarBuilderController;
  liveAvatarOptions: LiveAvatarOptionsState;
}) {
  return (
    <section className={styles.panel}>
      <StepHeading
        title="Avatar visual"
        description="Elegí la apariencia que verán las personas durante la conversación."
      />
      <LiveAvatarPicker
        optionsState={liveAvatarOptions}
        selectedId={builder.state.liveAvatarId}
        error={builder.errors.liveAvatarId}
        onSelect={(avatarId) => builder.updateField("liveAvatarId", avatarId)}
      />
    </section>
  );
}
