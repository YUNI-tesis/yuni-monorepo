import React from "react";
import { Button, Card, YuniIcon } from "@yuni/ui";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import styles from "./AvatarProfile.module.css";

export function AvatarContextTab({
  avatar,
  onEditContext,
}: {
  avatar: ApiAvatar;
  onEditContext: () => void;
}) {
  const hasContext = avatar.context.trim().length > 0;

  return (
    <div className={styles.preparedGrid}>
      <Card className={styles.panel} padding="md">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon} aria-hidden="true">
            <YuniIcon name="aiBrain" />
          </span>
          <div>
            <h2>Contexto del avatar</h2>
            <p>
              Información que ayuda al avatar a responder con el enfoque y los conocimientos que necesitás.
            </p>
          </div>
        </div>

        <div className={styles.contextPreview}>
          <span className={styles.contextStatus} data-ready={hasContext ? "true" : "false"}>
            {hasContext ? "Contexto agregado" : "Todavía no agregaste contexto"}
          </span>
          <p>
            {hasContext
              ? avatar.context
              : "Agregá información para que el avatar pueda dar respuestas más precisas."}
          </p>
        </div>

        <div className={styles.inlineActions}>
          <Button variant="secondary" icon={<YuniIcon name="edit" />} onClick={onEditContext}>
            Editar contexto
          </Button>
        </div>
      </Card>

      <Card className={styles.panel} padding="md">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon} aria-hidden="true">
            <YuniIcon name="document" />
          </span>
          <div>
            <h2>Documentos</h2>
            <p>Materiales de apoyo que el avatar podrá usar para complementar sus respuestas.</p>
          </div>
        </div>

        <div className={styles.documentEmptyState}>
          <span className={styles.documentIcon} aria-hidden="true">
            <YuniIcon name="document" size={24} />
          </span>
          <div>
            <strong>Todavía no agregaste documentos</strong>
            <p>Esta opción estará disponible próximamente.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
