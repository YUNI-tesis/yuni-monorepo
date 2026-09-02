"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, YuniIcon } from "@yuni/ui";
import { useGroupSharing } from "../../hooks/useGroupSharing";
import { getAvatarGroup, type ApiAvatarGroup } from "../../lib/api/avatar-group-api";
import { ApiClientError, toUserFacingApiError } from "../../lib/api/http-client";
import { ResourceSharePanel } from "../sharing/ResourceSharePanel";
import styles from "./GroupSharePage.module.css";
import navigationStyles from "./GroupPageNavigation.module.css";

type GroupState =
  | { status: "loading"; group: null; error: null }
  | { status: "ready"; group: ApiAvatarGroup; error: null }
  | { status: "not-found" | "error"; group: null; error: string };

export function GroupSharePage({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<GroupState>({ status: "loading", group: null, error: null });

  useEffect(() => {
    let mounted = true;
    setState({ status: "loading", group: null, error: null });
    getAvatarGroup(groupId)
      .then(({ group }) => {
        if (!mounted) return;
        if (group.access.type !== "owner") {
          setState({ status: "not-found", group: null, error: "No encontramos este grupo." });
          return;
        }
        setState({ status: "ready", group, error: null });
      })
      .catch((error) => {
        if (!mounted) return;
        setState({
          status: error instanceof ApiClientError && error.status === 404 ? "not-found" : "error",
          group: null,
          error:
            error instanceof ApiClientError && error.status === 404
              ? "No encontramos este grupo."
              : toUserFacingApiError(error, "No pudimos cargar el grupo."),
        });
      });
    return () => {
      mounted = false;
    };
  }, [groupId, retryKey]);

  if (state.status === "loading") {
    return (
      <LoadingState title="Cargando grupo" description="Estamos preparando sus opciones para compartir." />
    );
  }

  if (state.status === "not-found") {
    return (
      <ErrorState
        title="No encontramos este grupo"
        description={state.error}
        action={<Button onClick={() => router.push("/groups")}>Volver a grupos</Button>}
      />
    );
  }

  if (state.status === "error") {
    return (
      <ErrorState
        title="No pudimos cargar el grupo"
        description={state.error}
        action={<Button onClick={() => setRetryKey((value) => value + 1)}>Reintentar</Button>}
      />
    );
  }

  if (state.status !== "ready" || !state.group) return null;
  const group = state.group;
  return <LoadedGroupSharePage group={group} onBack={() => router.push("/groups")} />;
}

function LoadedGroupSharePage({ group, onBack }: { group: ApiAvatarGroup; onBack: () => void }) {
  const isEligible = group.sharingEligibility.status === "eligible";
  const isReady = group.interactionAvailability.status === "ready";

  return (
    <div className={styles.layout}>
      <Button
        className={navigationStyles.backButton}
        variant="ghost"
        icon={<YuniIcon name="arrowLeft" />}
        onClick={onBack}
      >
        Grupos
      </Button>

      <PageHeader
        eyebrow="Compartir grupo"
        title={group.name}
        description="Administrá links públicos y accesos por cuenta para la versión actual del grupo."
      />

      <Card padding="md" className={styles.rosterCard}>
        <div className={styles.rosterHeader}>
          <div>
            <p className="yuni-eyebrow">Integrantes actuales</p>
            <h2>El grupo se comparte completo</h2>
          </div>
          <Badge tone={isReady ? "success" : "warning"}>
            {group.interactionAvailability.readyMembers} de {group.interactionAvailability.totalMembers}{" "}
            listos
          </Badge>
        </div>
        <ol className={styles.roster}>
          {[...group.members]
            .sort((left, right) => left.position - right.position)
            .map((member) => (
              <li key={member.id}>
                <span className={styles.avatar} aria-hidden="true">
                  {member.thumbnailUrl ? <img src={member.thumbnailUrl} alt="" /> : initials(member.name)}
                </span>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.available ? "Listo" : "No disponible"}</small>
                </span>
              </li>
            ))}
        </ol>
        <p className={styles.liveNotice}>
          Los cambios de integrantes se aplican a las próximas llamadas. Si el grupo cambia, quienes tengan
          acceso deberán volver a aceptar el aviso de privacidad.
        </p>
      </Card>

      {!isEligible ? (
        <Card padding="lg" className={styles.blockedCard}>
          <ErrorState
            title="Este grupo no se puede compartir"
            description="Solo podés compartir grupos formados completamente por avatares propios. Quitá los avatares compartidos para habilitar esta opción."
            action={<Button onClick={onBack}>Volver a grupos</Button>}
          />
        </Card>
      ) : !group.sharingChannels.account && !group.sharingChannels.public ? (
        <Card padding="lg" className={styles.blockedCard}>
          <ErrorState
            title="Compartir grupos no está disponible"
            description="Los canales para compartir grupos están temporalmente deshabilitados."
            action={<Button onClick={onBack}>Volver a grupos</Button>}
          />
        </Card>
      ) : (
        <EligibleGroupSharing group={group} publiclyAvailable={isReady} />
      )}
    </div>
  );
}

function EligibleGroupSharing({
  group,
  publiclyAvailable,
}: {
  group: ApiAvatarGroup;
  publiclyAvailable: boolean;
}) {
  const sharing = useGroupSharing(group.id, group.sharingChannels);
  return (
    <ResourceSharePanel
      subject={{
        kind: "group",
        id: group.id,
        name: group.name,
        publicPrefix: "/g/",
        publiclyAvailable,
      }}
      sharing={sharing}
      channels={{ links: group.sharingChannels.public, grants: group.sharingChannels.account }}
    />
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("es"))
      .join("") || "G"
  );
}
