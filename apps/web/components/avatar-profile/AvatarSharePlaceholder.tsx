import { Card } from "@yuni/ui";
import styles from "./AvatarProfile.module.css";

export function AvatarSharePlaceholder() {
  return (
    <Card className={styles.sharePlaceholder} padding="md">
      <p className="yuni-eyebrow">Compartir</p>
      <h2>Share se implementa en el proximo modulo</h2>
      <p className={styles.emptyText}>
        Esta tab queda reservada para links publicos, metricas basicas y acciones de compartir.
      </p>
    </Card>
  );
}
