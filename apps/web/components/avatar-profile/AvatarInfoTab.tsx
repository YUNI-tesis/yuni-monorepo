import React from "react";
import { Card, YuniIcon } from "@yuni/ui";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import { getVoiceSummary, hasConfiguredVoice } from "./formatters";
import styles from "./AvatarProfile.module.css";

export function AvatarInfoTab({ avatar }: { avatar: ApiAvatar }) {
  const voice = getVoiceSummary(avatar);
  const instructions = avatar.instructions.trim();
  const hasVoice = hasConfiguredVoice(avatar);

  return (
    <div className={styles.infoGrid}>
      <Card className={`${styles.panel} ${styles.personalityPanel}`} padding="md">
        <PanelHeader
          icon="aiBrain"
          title="Personalidad"
          description="La forma en que el avatar acompaña y responde durante una conversación."
        />
        <InfoField
          label="Cómo responde"
          value={instructions || "Todavía no definiste cómo debe responder."}
          isEmpty={!instructions}
        />
      </Card>

      <Card className={`${styles.panel} ${styles.voicePanel}`} padding="md">
        <PanelHeader
          icon="sparkles"
          title="Voz"
          description="La voz que escucharán las personas cuando interactúen con el avatar."
        />
        {hasVoice ? (
          <div className={styles.voiceIdentity}>
            <strong>{voice.selectedVoice}</strong>
            <p>{voice.description}</p>
          </div>
        ) : (
          <p className={styles.emptyValue}>Todavía no elegiste una voz.</p>
        )}
      </Card>
    </div>
  );
}

function InfoField({ label, value, isEmpty = false }: { label: string; value: string; isEmpty?: boolean }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <p className={isEmpty ? styles.emptyValue : styles.fieldValue}>{value}</p>
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  description,
}: {
  icon: "aiBrain" | "sparkles";
  title: string;
  description: string;
}) {
  return (
    <div className={styles.panelHeader}>
      <span className={styles.panelIcon} aria-hidden="true">
        <YuniIcon name={icon} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
