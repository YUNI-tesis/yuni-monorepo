"use client";

import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  DataList,
  DropdownMenu,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  YuniIcon,
} from "@yuni/ui";
import { useGroupActivityParticipants } from "../../hooks/useGroupActivityParticipants";
import type { ApiActivityParticipant } from "../../lib/api/activity-api";
import { formatActivityDate, getActivityParticipantPresentation } from "../../lib/avatar-activity";
import { getGroupParticipantActivityPath } from "../../lib/group-activity";
import styles from "../avatar-profile/AvatarActivityTab.module.css";
import navigationStyles from "./GroupPageNavigation.module.css";

export function GroupActivityPage({ groupId }: { groupId: string }) {
  const router = useRouter();
  const activity = useGroupActivityParticipants(groupId);

  if (activity.participants.status === "loading") {
    return (
      <LoadingState
        title="Cargando actividad"
        description="Estamos buscando las personas que utilizaron este grupo."
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

  if (!activity.participants.group) return null;
  const group = activity.participants.group;

  return (
    <div className={styles.layout}>
      <Button
        className={navigationStyles.backButton}
        variant="ghost"
        icon={<YuniIcon name="arrowLeft" />}
        onClick={() => router.push("/groups")}
      >
        Grupos
      </Button>

      <PageHeader
        eyebrow="Actividad compartida · Grupo"
        title={group.name}
        description="Consultá quién utilizó el grupo y accedé al detalle de sus conversaciones completas."
        actions={group.archived ? <Badge tone="neutral">Grupo archivado</Badge> : undefined}
      />

      {activity.participants.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay participantes"
          description="Cuando des acceso a una cuenta o alguien use un link público, su actividad aparecerá acá. Las llamadas que no llegaron a activarse no se muestran."
        />
      ) : (
        <Card padding="md">
          <DataList
            ariaLabel="Actividad por participante del grupo"
            items={activity.participants.data}
            getRowKey={(participant) => participant.participantKey}
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
                key: "origin",
                header: "Origen",
                minWidth: "190px",
                render: (participant) => <ParticipantOriginBadges participant={participant} />,
              },
              {
                key: "state",
                header: "Estado",
                minWidth: "170px",
                render: (participant) => <ParticipantState participant={participant} />,
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
                          icon: <YuniIcon name="view" />,
                          onSelect: () =>
                            router.push(getGroupParticipantActivityPath(groupId, participant.participantKey)),
                        },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function ParticipantOriginBadges({ participant }: { participant: ApiActivityParticipant }) {
  return (
    <div className={styles.badgesCell}>
      {participant.origins.includes("access_grant") ? <Badge tone="neutral">Cuenta compartida</Badge> : null}
      {participant.origins.includes("public_link") ? <Badge tone="warning">Link público</Badge> : null}
    </div>
  );
}

function ParticipantState({ participant }: { participant: ApiActivityParticipant }) {
  if (!participant.accessState) return <span>—</span>;
  const presentation = getActivityParticipantPresentation(participant.accessState);
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
