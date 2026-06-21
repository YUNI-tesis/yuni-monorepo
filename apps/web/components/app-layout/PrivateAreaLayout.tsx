"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { YuniLogo } from "../brand/YuniLogo";
import { getMe, logout, type ApiUser } from "../../lib/api/auth-api";
import { ApiClientError } from "../../lib/api/http-client";
import { PrivateNavigation } from "./PrivateNavigation";
import type { PrivatePageLayoutVariant } from "./navigation";
import styles from "./PrivateAreaLayout.module.css";

export type PrivateAreaLayoutProps = {
  children: ReactNode;
  maxWidth?: string;
  contentClassName?: string;
  variant?: PrivatePageLayoutVariant;
};

type SessionState =
  | { status: "loading"; user: null; error: null }
  | { status: "ready"; user: ApiUser; error: null }
  | { status: "error"; user: null; error: string };

let cachedSessionUser: ApiUser | null = null;
let sessionUserRequest: Promise<ApiUser> | null = null;

function loadSessionUser() {
  if (cachedSessionUser) {
    return Promise.resolve(cachedSessionUser);
  }

  sessionUserRequest ??= getMe()
    .then(({ user }) => {
      cachedSessionUser = user;
      return user;
    })
    .finally(() => {
      sessionUserRequest = null;
    });

  return sessionUserRequest;
}

function clearSessionUserCache() {
  cachedSessionUser = null;
  sessionUserRequest = null;
}

export function PrivateAreaLayout({
  children,
  maxWidth,
  contentClassName,
  variant = "standard",
}: PrivateAreaLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const contentStyle = {
    "--yuni-private-page-width": maxWidth ?? "1280px",
  } as CSSProperties;
  const [session, setSession] = useState<SessionState>(() =>
    cachedSessionUser
      ? { status: "ready", user: cachedSessionUser, error: null }
      : {
          status: "loading",
          user: null,
          error: null,
        }
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    loadSessionUser()
      .then((user) => {
        if (isMounted) {
          setSession({ status: "ready", user, error: null });
        }
      })
      .catch((error) => {
        if (error instanceof ApiClientError && error.status === 401) {
          clearSessionUserCache();
          router.push("/auth/login");
          return;
        }

        if (isMounted) {
          setSession({
            status: "error",
            user: null,
            error: error instanceof Error ? error.message : "No pudimos cargar la sesion.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function onLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      clearSessionUserCache();
      await logout();
      router.push("/auth/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className={`${styles.layout} ${variant === "focus" ? styles.layoutFocus : ""}`}>
      <a className={styles.skipLink} href="#private-page-content">
        Saltar al contenido
      </a>

      {variant === "standard" ? (
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link className={styles.brandLink} href="/dashboard" aria-label="Ir al dashboard de YUNI">
              <YuniLogo className={styles.logo} aria-hidden="true" focusable="false" />
              <span className={styles.brandText}>YUNI</span>
            </Link>

            <PrivateNavigation pathname={pathname} />

            <div className={styles.session}>
              <div className={styles.userBlock}>
                {session.status === "ready" ? (
                  <>
                    <span className={styles.userName}>{session.user.name ?? session.user.email}</span>
                    <span className={styles.userEmail}>{session.user.email}</span>
                  </>
                ) : session.status === "error" ? (
                  <p className={styles.sessionError}>{session.error}</p>
                ) : (
                  <p className={styles.sessionMeta}>Verificando sesion...</p>
                )}
              </div>
              <button className={styles.logout} type="button" onClick={onLogout} disabled={isLoggingOut}>
                {isLoggingOut ? "Saliendo..." : "Cerrar sesion"}
              </button>
            </div>
          </div>
        </header>
      ) : null}

      <main
        id="private-page-content"
        className={`${styles.content} ${variant === "focus" ? styles.contentFocus : ""} ${contentClassName ?? ""}`}
        style={contentStyle}
      >
        {children}
      </main>
    </div>
  );
}
