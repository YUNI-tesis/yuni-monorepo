"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorState, LoadingState, PageShell } from "@yuni/ui";
import { YuniLogo } from "../../../components/brand/YuniLogo";
import { getPublicSharedAvatar, type ApiPublicSharedAvatar } from "../../../lib/api/sharing-api";
import { ApiClientError } from "../../../lib/api/http-client";
import styles from "./PublicAvatar.module.css";

type PublicAvatarState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ApiPublicSharedAvatar; error: null }
  | { status: "not-found" | "error"; data: null; error: string };

export function PublicAvatarView({ slug }: { slug: string }) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PublicAvatarState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    setState({ status: "loading", data: null, error: null });

    getPublicSharedAvatar(slug)
      .then((data) => {
        if (isMounted) setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (!isMounted) return;

        if (error instanceof ApiClientError && error.status === 404) {
          setState({
            status: "not-found",
            data: null,
            error: "Este link no existe o ya no está disponible.",
          });
          return;
        }

        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "No pudimos cargar este avatar.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [retryVersion, slug]);

  return (
    <PageShell centered maxWidth="820px" className={styles.page}>
      <header className={styles.brand}>
        <YuniLogo className={styles.logo} aria-hidden="true" />
        <span>YUNI</span>
      </header>

      <Card padding="lg" className={styles.card}>
        {state.status === "loading" ? (
          <LoadingState
            title="Cargando avatar compartido"
            description="Estamos comprobando que el link siga disponible."
          />
        ) : state.status === "not-found" ? (
          <ErrorState title="Link no disponible" description={state.error} />
        ) : state.status === "error" ? (
          <ErrorState
            title="No pudimos abrir el link"
            description={state.error}
            action={<Button onClick={() => setRetryVersion((current) => current + 1)}>Reintentar</Button>}
          />
        ) : state.status === "ready" ? (
          <article className={styles.content}>
            <div className={styles.visual}>
              {state.data.avatar.thumbnailUrl ? (
                <img src={state.data.avatar.thumbnailUrl} alt="" />
              ) : (
                <YuniLogo aria-hidden="true" />
              )}
            </div>
            <p className="yuni-eyebrow">{state.data.shareLink.name}</p>
            <h1>{state.data.avatar.name}</h1>
            <p className={styles.description}>
              {state.data.avatar.description || "Este avatar no tiene una descripción pública."}
            </p>
            <aside className={styles.comingSoon}>
              <strong>Vista pública informativa</strong>
              <p>
                Las conversaciones todavía no están habilitadas desde links públicos. El creador compartió
                esta vista para que conozcas el avatar.
              </p>
            </aside>
          </article>
        ) : null}
      </Card>
    </PageShell>
  );
}
