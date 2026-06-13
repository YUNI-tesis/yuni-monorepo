"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, PageShell } from "@yuni/ui";
import { ApiClientError } from "../../lib/api/http-client";
import { listAvatars, type ApiAvatar } from "../../lib/api/avatar-api";
import styles from "./Interact.module.css";

type InteractListState =
  | { status: "loading"; avatars: ApiAvatar[]; error: null }
  | { status: "ready"; avatars: ApiAvatar[]; error: null }
  | { status: "error"; avatars: ApiAvatar[]; error: string };

export function InteractList() {
  const router = useRouter();
  const [state, setState] = useState<InteractListState>({
    status: "loading",
    avatars: [],
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    listAvatars()
      .then(({ avatars }) => {
        if (isMounted) {
          setState({ status: "ready", avatars, error: null });
        }
      })
      .catch((error) => {
        if (error instanceof ApiClientError && error.status === 401) {
          router.push("/auth/login");
          return;
        }

        if (isMounted) {
          setState({
            status: "error",
            avatars: [],
            error: error instanceof Error ? error.message : "No pudimos cargar tus avatares.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <PageShell maxWidth="1120px">
      <div className={styles.layout}>
        <PageHeader
          eyebrow="Interact"
          title="Llamadas privadas"
          description="Elegí un avatar propio para iniciar una conversación de prueba."
          actions={<Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>}
        />

        {state.status === "loading" ? (
          <LoadingState title="Cargando avatares" description="Estamos preparando tus opciones." />
        ) : state.status === "error" ? (
          <ErrorState title="No pudimos cargar Interact" description={state.error} />
        ) : state.avatars.length === 0 ? (
          <Card padding="lg" className={styles.avatarCard}>
            <div className={styles.avatarMeta}>
              <strong>Todavía no tenés avatares</strong>
              <span className="yuni-text-muted">Creá un avatar para probar una llamada privada.</span>
            </div>
            <Button onClick={() => router.push("/avatars/new")}>Crear avatar</Button>
          </Card>
        ) : (
          <div className={styles.avatarGrid}>
            {state.avatars.map((avatar) => (
              <Card key={avatar.id} padding="md" className={styles.avatarCard}>
                <div className={styles.avatarMeta}>
                  <Badge tone={avatar.status === "active" ? "success" : "neutral"}>{avatar.status}</Badge>
                  <strong>{avatar.name}</strong>
                  <span className="yuni-text-muted">{avatar.description || "Sin descripcion."}</span>
                  <span className="yuni-text-muted">Sync: {formatSyncStatus(avatar.providerSyncStatus)}</span>
                </div>
                <Button onClick={() => router.push(`/interact/${avatar.id}`)}>Abrir llamada</Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function formatSyncStatus(status: ApiAvatar["providerSyncStatus"]) {
  if (status === "synced") return "sincronizado";
  if (status === "failed") return "requiere revision";
  return "pendiente";
}
