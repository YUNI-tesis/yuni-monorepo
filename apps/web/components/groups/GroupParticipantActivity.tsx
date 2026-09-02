"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  DataList,
  Drawer,
  DropdownMenu,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@yuni/ui";
import { useGroupParticipantActivity } from "../../hooks/useGroupParticipantActivity";
import type { ApiActivityParticipant } from "../../lib/api/activity-api";
import {
  formatActivityConversationTitle,
  formatActivityDate,
  getActivityParticipantPresentation,
} from "../../lib/avatar-activity";
import type { ApiGroupActivityConversationDetail } from "../../lib/api/group-activity-api";
import { formatDashboardDuration } from "../../lib/creator-dashboard";
import { formatGroupRoster, getGroupActivityPath } from "../../lib/group-activity";
import styles from "../avatar-profile/AvatarParticipantActivity.module.css";

export function GroupParticipantActivity({
  groupId,
  participantKey,
}: {
  groupId: string;
  participantKey: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activity = useGroupParticipantActivity(groupId, participantKey);
  const transcriptDrawer = useRef<HTMLDialogElement>(null);
  const openedConversationFromUrl = useRef<string | null>(null);
  const requestedConversationId = searchParams.get("conversation");

  useEffect(() => {
    if (
      activity.participant.status !== "ready" ||
      !requestedConversationId ||
      openedConversationFromUrl.current === requestedConversationId
    ) {
      return;
    }
    openedConversationFromUrl.current = requestedConversationId;
    transcriptDrawer.current?.showModal();
    void activity.loadTranscript(requestedConversationId);
  }, [activity, requestedConversationId]);

  function goBack() {
    router.push(getGroupActivityPath(groupId));
  }

  function openTranscript(conversationId: string) {
    transcriptDrawer.current?.showModal();
    void activity.loadTranscript(conversationId);
  }

  if (activity.participant.status === "loading") {
    return <LoadingState title="Cargando actividad" description="Estamos preparando el historial." />;
  }

  if (activity.participant.status === "not-found") {
    return (
      <ErrorState
        title="No encontramos esta actividad"
        description="El grupo o el participante no existe para esta cuenta."
        action={<Button onClick={goBack}>Volver al grupo</Button>}
      />
    );
  }

  if (activity.participant.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar la actividad"
        description={activity.participant.error ?? "Intentá nuevamente."}
        action={<Button onClick={() => void activity.reloadParticipant()}>Reintentar</Button>}
      />
    );
  }

  if (!activity.participant.group || !activity.participant.data) return null;
  const group = activity.participant.group;
  const participant = activity.participant.data;
  const presentation = participant.accessState
    ? getActivityParticipantPresentation(participant.accessState)
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.backNavigation}>
        <Button variant="secondary" onClick={goBack}>
          ← Volver a la actividad del grupo
        </Button>
      </div>

      <PageHeader
        eyebrow={`Actividad · ${group.name}`}
        title={participant.participantName ?? participant.participantEmail}
        description={`Conversaciones completas de ${participant.participantEmail} con el grupo.`}
      />

      <Card padding="md" className={styles.summary}>
        <SummaryItem label="Nombre" value={participant.participantName ?? "Sin nombre"} />
        <SummaryItem label="Email" value={participant.participantEmail} />
        <SummaryItem
          label="Origen"
          value={
            <span className={styles.summaryBadges}>
              {participant.origins.includes("access_grant") ? (
                <Badge tone="neutral">Cuenta compartida</Badge>
              ) : null}
              {participant.origins.includes("public_link") ? (
                <Badge tone="warning">Link público</Badge>
              ) : null}
              {presentation ? <Badge tone={presentation.tone}>{presentation.label}</Badge> : null}
            </span>
          }
        />
        <SummaryItem label="Conversaciones" value={String(participant.totalConversations)} />
        <SummaryItem label="Última conversación" value={formatActivityDate(participant.lastActivityAt)} />
      </Card>

      <Card padding="md" className={styles.conversationsCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Conversaciones grupales</h2>
            <p>Cada llamada activada aparece una vez e incluye el roster histórico usado en esa sesión.</p>
          </div>
        </div>

        <ConversationsTable
          participant={participant}
          state={activity.conversations}
          onRetry={activity.retryConversations}
          onLoadMore={activity.loadMore}
          onOpenTranscript={openTranscript}
        />
      </Card>

      <Drawer
        ref={transcriptDrawer}
        title={
          activity.transcript.data
            ? formatActivityConversationTitle(
                activity.transcript.data,
                activity.transcript.data.participantEmail
              )
            : "Transcript de la conversación"
        }
        description={transcriptDescription(
          activity.transcript.data,
          activity.transcript.data?.participantEmail ?? participant.participantEmail
        )}
        onClose={activity.clearTranscript}
      >
        <TranscriptContent
          state={activity.transcript}
          onRetry={(conversationId) => void activity.loadTranscript(conversationId)}
        />
      </Drawer>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.summaryItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConversationsTable({
  participant,
  state,
  onRetry,
  onLoadMore,
  onOpenTranscript,
}: {
  participant: ApiActivityParticipant;
  state: ReturnType<typeof useGroupParticipantActivity>["conversations"];
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenTranscript: (conversationId: string) => void;
}) {
  if (state.status === "loading" && state.data.length === 0) {
    return <LoadingState title="Cargando conversaciones" description="Estamos recuperando el historial." />;
  }

  if (state.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar las conversaciones"
        description={state.error ?? "Intentá nuevamente."}
        action={<Button onClick={onRetry}>Reintentar</Button>}
      />
    );
  }

  if (state.data.length === 0) {
    return (
      <EmptyState
        title="Sin conversaciones activadas"
        description="Este participante todavía no completó una interacción con el grupo."
      />
    );
  }

  return (
    <>
      <DataList
        ariaLabel={`Conversaciones grupales de ${participant.participantEmail}`}
        items={state.data}
        getRowKey={(conversation) => conversation.id}
        columns={[
          {
            key: "title",
            header: "Conversación",
            minWidth: "240px",
            render: (conversation) => (
              <strong>{formatActivityConversationTitle(conversation, participant.participantEmail)}</strong>
            ),
          },
          {
            key: "roster",
            header: "Integrantes",
            minWidth: "190px",
            render: (conversation) => formatGroupRoster(conversation.roster) || "Roster no disponible",
          },
          {
            key: "origin",
            header: "Origen",
            minWidth: "150px",
            render: (conversation) =>
              conversation.origin === "public_link"
                ? `Link público · ${conversation.shareLinkName ?? "Link eliminado"}`
                : "Cuenta compartida",
          },
          {
            key: "duration",
            header: "Duración",
            minWidth: "110px",
            render: (conversation) => formatDashboardDuration(conversation.durationSeconds),
          },
          {
            key: "date",
            header: "Activada",
            minWidth: "190px",
            render: (conversation) => formatActivityDate(conversation.activatedAt ?? conversation.createdAt),
          },
          {
            key: "actions",
            header: "Acciones",
            align: "end",
            width: "88px",
            render: (conversation) => (
              <div className={styles.actionsCell}>
                <DropdownMenu
                  compact
                  label="Acciones de la conversación"
                  triggerContent={<MoreIcon />}
                  items={[
                    {
                      label: "Ver transcript",
                      icon: <TranscriptIcon />,
                      onSelect: () => onOpenTranscript(conversation.id),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />

      {state.error ? (
        <div className={styles.inlineError} role="alert">
          <span>{state.error}</span>
          <Button size="sm" variant="secondary" onClick={onLoadMore}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {state.nextCursor ? (
        <div className={styles.loadMore}>
          <Button variant="secondary" loading={state.isLoadingMore} onClick={onLoadMore}>
            Cargar más
          </Button>
        </div>
      ) : null}
    </>
  );
}

function TranscriptContent({
  state,
  onRetry,
}: {
  state: ReturnType<typeof useGroupParticipantActivity>["transcript"];
  onRetry: (conversationId: string) => void;
}) {
  if (state.status === "loading") {
    return <LoadingState title="Cargando transcript" description="Estamos recuperando los mensajes." />;
  }

  if (state.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar el transcript"
        description={state.error ?? "Intentá nuevamente."}
        action={
          state.conversationId ? (
            <Button onClick={() => onRetry(state.conversationId!)}>Reintentar</Button>
          ) : undefined
        }
      />
    );
  }

  if (!state.data || state.data.messages.length === 0) {
    return (
      <EmptyState title="Sin transcript" description="Esta conversación no tiene mensajes registrados." />
    );
  }

  return (
    <ol className={styles.transcript} aria-label="Transcript de la conversación grupal">
      {state.data.messages.map((message) => (
        <li key={message.id} data-role={message.role}>
          <div className={styles.messageHeader}>
            <strong>
              {message.role === "user" ? "Participante" : (message.speakerName ?? "Integrante del grupo")}
            </strong>
            <time dateTime={message.createdAt}>{formatActivityDate(message.createdAt)}</time>
          </div>
          <p>{message.content}</p>
        </li>
      ))}
    </ol>
  );
}

function transcriptDescription(
  conversation: ApiGroupActivityConversationDetail | null,
  participantEmail: string
) {
  if (!conversation) return `Participante: ${participantEmail}`;
  const roster = formatGroupRoster(conversation.roster);
  return roster
    ? `Participante: ${participantEmail} · Grupo histórico: ${roster}`
    : `Participante: ${participantEmail}`;
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

function TranscriptIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M6 3.5h9l3 3V20.5H6Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 10h6M9 13.5h6M9 17h4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
