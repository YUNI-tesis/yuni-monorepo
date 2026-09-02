import React from "react";
import { Badge, Card, YuniIcon, type BadgeTone } from "@yuni/ui";
import type {
  ApiCreatorDashboardSummary,
  ApiDashboardAttentionGroup,
  ApiDashboardAttentionItem,
} from "../../../lib/api/dashboard-api";
import {
  formatDashboardDate,
  getDashboardAttentionPath,
  getDashboardResourceName,
} from "../../../lib/creator-dashboard";
import styles from "../Dashboard.module.css";

export function AttentionPanel({
  summary,
  onNavigate,
}: {
  summary: ApiCreatorDashboardSummary;
  onNavigate: (path: string) => void;
}) {
  const groups = (
    [
      {
        key: "unused",
        title: "Accesos directos sin usar",
        description: "Activos hace al menos 7 días y todavía sin actividad directa.",
        tone: "warning",
        group: summary.attention.unusedDirectAccesses,
      },
      {
        key: "inactive",
        title: "Participantes para retomar",
        description: "Con acceso activo, uso previo y sin actividad hace al menos 14 días.",
        tone: "warning",
        group: summary.attention.inactiveParticipants,
      },
      {
        key: "errors",
        title: "Interacciones interrumpidas",
        description: "La llamada más reciente de la conversación terminó con error.",
        tone: "danger",
        group: summary.attention.interruptedInteractions,
      },
      {
        key: "avatars",
        title: "Avatares no disponibles",
        description: "Fallos terminales sin una versión utilizable.",
        tone: "danger",
        group: summary.attention.unavailableAvatars,
      },
      ...(summary.attention.unavailableGroups
        ? [
            {
              key: "groups",
              title: "Grupos no disponibles",
              description: "Uno o más integrantes no tienen una versión grupal utilizable.",
              tone: "danger" as const,
              group: summary.attention.unavailableGroups,
            },
          ]
        : []),
    ] satisfies Array<{
      key: string;
      title: string;
      description: string;
      tone: BadgeTone;
      group: ApiDashboardAttentionGroup;
    }>
  ).filter((item) => item.group.count > 0);

  return (
    <Card className={styles.attentionCard} padding="md" aria-labelledby="attention-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="yuni-eyebrow">Acciones concretas</p>
          <h2 id="attention-title" className={styles.sectionTitle}>
            Necesita atención
          </h2>
          <p className={styles.sectionDescription}>Estado actual, independientemente del período elegido.</p>
        </div>
        <Badge tone={summary.attention.total > 0 ? "warning" : "success"}>
          {summary.attention.total > 0
            ? `${summary.attention.total} ${summary.attention.total === 1 ? "situación" : "situaciones"}`
            : "Todo al día"}
        </Badge>
      </div>

      {groups.length === 0 ? (
        <div className={styles.attentionEmpty}>
          <YuniIcon name="sparkles" size={22} />
          <p>No hay situaciones que requieran una acción en este momento.</p>
        </div>
      ) : (
        <div className={styles.attentionGrid}>
          {groups.map(({ key, ...group }) => (
            <AttentionGroup key={key} {...group} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AttentionGroup({
  title,
  description,
  tone,
  group,
  onNavigate,
}: {
  title: string;
  description: string;
  tone: BadgeTone;
  group: ApiDashboardAttentionGroup;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className={styles.attentionGroup}>
      <div className={styles.attentionGroupHeader}>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Badge tone={tone}>{group.count}</Badge>
      </div>
      <div className={styles.attentionItems}>
        {group.items.map((item) => (
          <div key={`${item.type}-${item.id}`} className={styles.attentionItem}>
            <span>
              <strong>{attentionItemTitle(item)}</strong>
              <small>{attentionItemDetail(item)}</small>
            </span>
            <button type="button" onClick={() => onNavigate(getDashboardAttentionPath(item))}>
              {attentionItemAction(item)}
            </button>
          </div>
        ))}
        {group.count > group.items.length ? (
          <p className={styles.moreItems}>+{group.count - group.items.length} situaciones adicionales</p>
        ) : null}
      </div>
    </section>
  );
}

function attentionItemTitle(item: ApiDashboardAttentionItem) {
  if (item.type === "unavailable_avatar" || item.type === "unavailable_group") {
    return getDashboardResourceName(item);
  }
  return item.participantName || item.participantEmail || getDashboardResourceName(item);
}

function attentionItemDetail(item: ApiDashboardAttentionItem) {
  const resourceName = getDashboardResourceName(item);
  if (item.type === "unavailable_avatar" || item.type === "unavailable_group") {
    return "Sin versión utilizable";
  }
  if (item.type === "interrupted_interaction")
    return `${resourceName} · ${formatDashboardDate(item.occurredAt)}`;
  if (item.type === "unused_direct_access")
    return `${resourceName} · compartido ${formatDashboardDate(item.occurredAt)}`;
  return `${resourceName} · última actividad ${formatDashboardDate(item.occurredAt)}`;
}

function attentionItemAction(item: ApiDashboardAttentionItem) {
  if (item.type === "unused_direct_access") return "Abrir Compartir";
  if (item.type === "inactive_participant") return "Ver actividad";
  if (item.type === "interrupted_interaction") return "Ver conversación";
  if (item.type === "unavailable_group") return "Revisar grupo";
  return "Revisar configuración";
}
