import React from "react";
import { Button, YuniIcon } from "@yuni/ui";
import type { ApiAvatarContext } from "../../lib/api/avatar-api";
import { getContextIssues } from "./context-state";
import styles from "./AvatarProfile.module.css";

export function ContextNotice({
  context,
  onReview,
}: {
  context: ApiAvatarContext | null;
  onReview?: (() => void) | undefined;
}) {
  const issues = getContextIssues(context);
  if (!issues.count) return null;
  return (
    <div className={styles.contextNotice} role="status">
      <YuniIcon name="warning" size={22} />
      <div>
        <strong>{issues.title}</strong>
        <p>Hay contenido que no se pudo actualizar. Revisá el motivo y las opciones para resolverlo.</p>
      </div>
      {onReview ? (
        <Button variant="secondary" onClick={onReview}>
          Revisar contexto
        </Button>
      ) : null}
    </div>
  );
}
