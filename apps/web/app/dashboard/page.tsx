"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@yuni/ui";
import { ApiClientError, ApiUser, getMe, logout } from "../../lib/api-client";

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
    <main className="shell">
      <section className="panel dashboard-panel">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>YUNI</h1>
          <p>Base privada lista para administrar avatares.</p>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {user ? (
          <div className="session-card">
            <p className="eyebrow">Sesion actual</p>
            <strong>{user.name ?? user.email}</strong>
            <span>{user.email}</span>
          </div>
        ) : (
          <p>Cargando sesion...</p>
        )}
        <Button onClick={onLogout}>Cerrar sesion</Button>
      </section>
    </main>
  );
}
