import { EmptyState, ErrorState, LoadingState } from "@yuni/ui";
import type { ApiLiveAvatarOption } from "../../lib/api/live-avatar-api";
import { getInitials } from "./LiveAvatarStage";
import styles from "./LiveAvatarStage.module.css";

export type LiveAvatarSelectorProps = {
  options: ApiLiveAvatarOption[];
  selectedId: string;
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  onSelect: (avatarId: string) => void;
};

export function LiveAvatarSelector({ options, selectedId, status, error, onSelect }: LiveAvatarSelectorProps) {
  if (status === "loading") {
    return <LoadingState title="Cargando avatares" description="Buscando opciones disponibles en Live Avatar." />;
  }

  if (status === "error") {
    return <ErrorState title="No pudimos cargar Live Avatar" description={error ?? "Intenta nuevamente."} />;
  }

  if (status === "empty") {
    return <EmptyState title="No hay avatares disponibles" description="Live Avatar no devolvio opciones visuales." />;
  }

  return (
    <div className={styles.selectorGrid}>
      {options.map((option) => (
        <button
          className={styles.option}
          data-selected={selectedId === option.id}
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
        >
          <span className={styles.optionPreview} aria-hidden="true">
            {option.thumbnailUrl ? (
              <img src={option.thumbnailUrl} alt="" />
            ) : (
              <span className={styles.optionInitials}>{getInitials(option.displayName)}</span>
            )}
          </span>
          <span className={styles.optionText}>
            <strong>{option.displayName}</strong>
          </span>
        </button>
      ))}
    </div>
  );
}
