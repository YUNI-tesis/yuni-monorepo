import { Card } from "@yuni/ui";
import styles from "./AvatarProfile.module.css";

export function AvatarSharePlaceholder() {
  return (
    <Card className={styles.sharePlaceholder} padding="md">
      <p className="yuni-eyebrow">Compartir</p>
      <h2>Links públicos del avatar</h2>
      <p className={styles.emptyText}>
        Crea y administra enlaces para que otras personas puedan interactuar con este avatar.
      </p>
    </Card>
  );
}
