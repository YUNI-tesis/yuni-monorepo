"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ErrorState, LoadingState, PageHeader, PageShell } from "@yuni/ui";
import { getMe, logout, type ApiUser } from "../../lib/api/auth-api";
import { ApiClientError } from "../../lib/api/http-client";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then(({ user: currentUser }) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch((caughtError) => {
        if (caughtError instanceof ApiClientError && caughtError.status === 401) {
          router.push("/auth/login");
          return;
        }

        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "No pudimos cargar la sesion.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function onLogout() {
    await logout();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <PageShell maxWidth="900px">
      <PageHeader
        eyebrow="Dashboard"
        title="YUNI"
        description="Base privada lista para administrar avatares."
        actions={<Button onClick={onLogout}>Cerrar sesion</Button>}
      />
      <div className="yuni-stack">
        {error ? <ErrorState description={error} /> : null}
        {user ? (
          <Card className="yuni-stack" padding="md">
            <p className="yuni-eyebrow">Sesion actual</p>
            <strong>{user.name ?? user.email}</strong>
            <span className="yuni-text-muted">{user.email}</span>
          </Card>
        ) : (
          <LoadingState title="Cargando sesion" description="Estamos verificando tus datos." />
        )}
      </div>
    </PageShell>
  );
}
