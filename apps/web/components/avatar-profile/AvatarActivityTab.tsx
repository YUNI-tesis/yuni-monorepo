"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, DataList, DropdownMenu, EmptyState, ErrorState, LoadingState } from "@yuni/ui";
import { useAvatarActivityParticipants } from "../../hooks/useAvatarActivityParticipants";
import type { ApiActivityParticipant } from "../../lib/api/activity-api";
import {
  formatActivityDate,
  getActivityParticipantPresentation,
  getParticipantActivityPath,
} from "../../lib/avatar-activity";
import styles from "./AvatarActivityTab.module.css";

export function AvatarActivityTab({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const activity = useAvatarActivityParticipants(avatarId);

  if (activity.participants.status === "loading") {
    return (
      <LoadingState
        title="Cargando actividad"
        description="Estamos buscando las personas que utilizaron este avatar."
      />
    );
  }

  if (activity.participants.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar la actividad"
        description={activity.participants.error ?? "Intentá nuevamente."}
        action={<Button onClick={() => void activity.reloadParticipants()}>Reintentar</Button>}
      />
    );
  }

  if (activity.participants.data.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay participantes"
        description="Cuando des acceso a una cuenta, su actividad aparecerá en esta sección."
      />
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <p className="yuni-eyebrow">Actividad compartida</p>
        <h2>Actividad por participante</h2>
        <p>Consultá quién utilizó el avatar y accedé al detalle de sus conversaciones.</p>
      </header>

      <Card padding="md">
        <DataList
          ariaLabel="Actividad por participante"
          items={activity.participants.data}
          getRowKey={(participant) => participant.accessGrantId}
          columns={[
            {
              key: "name",
              header: "Nombre",
              minWidth: "160px",
              render: (participant) => participant.participantName ?? "—",
            },
            {
              key: "email",
              header: "Email",
              minWidth: "220px",
              render: (participant) => participant.participantEmail,
            },
            {
              key: "state",
              header: "Estado",
              minWidth: "150px",
              render: (participant) => <ParticipantStateBadge participant={participant} />,
            },
            {
              key: "conversations",
              header: "Conversaciones",
              align: "center",
              minWidth: "130px",
              render: (participant) => participant.totalConversations,
            },
            {
              key: "lastActivity",
              header: "Última conversación",
              minWidth: "190px",
              render: (participant) => formatActivityDate(participant.lastActivityAt),
            },
            {
              key: "actions",
              header: "Acciones",
              align: "end",
              width: "88px",
              render: (participant) => (
                <div className={styles.actionsCell}>
                  <DropdownMenu
                    compact
                    label={`Acciones para ${participant.participantEmail}`}
                    triggerContent={<MoreIcon />}
                    items={[
                      {
                        label: "Ver actividad",
                        icon: <EyeIcon />,
                        onSelect: () =>
                          router.push(getParticipantActivityPath(avatarId, participant.accessGrantId)),
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function ParticipantStateBadge({ participant }: { participant: ApiActivityParticipant }) {
  const presentation = getActivityParticipantPresentation(participant.state);
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
