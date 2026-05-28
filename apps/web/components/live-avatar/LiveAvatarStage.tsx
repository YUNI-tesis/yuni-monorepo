import type { ApiLiveAvatarOption } from "../../lib/api/live-avatar-api";
import styles from "./LiveAvatarStage.module.css";

export type LiveAvatarStageProps = {
  avatar: Pick<ApiLiveAvatarOption, "displayName" | "thumbnailUrl"> | null;
  emptyLabel?: string;
};

export function LiveAvatarStage({ avatar, emptyLabel = "Selecciona un avatar visual" }: LiveAvatarStageProps) {
  if (!avatar) {
    return <div className={styles.placeholder}>{emptyLabel}</div>;
  }

  return (
    <div className={styles.stage}>
      <div className={styles.preview}>
        {avatar.thumbnailUrl ? (
          <img className={styles.image} src={avatar.thumbnailUrl} alt={avatar.displayName} />
        ) : (
          <span className={styles.initials} aria-hidden="true">
            {getInitials(avatar.displayName)}
          </span>
        )}
      </div>
      <div className={styles.body}>
        <p className={styles.name}>{avatar.displayName}</p>
      </div>
    </div>
  );
}

export function getInitials(value: string): string {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "A";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
