"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button, ErrorState, LoadingState, useToast } from "@yuni/ui";
import { YuniLogo } from "../brand/YuniLogo";
import { getMe, logout, type ApiUser } from "../../lib/api/auth-api";
import { isSessionExpirationError, replaceBrowserLocation } from "../../lib/api/http-client";
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

export function getUserInitials(user: Pick<ApiUser, "name" | "email">) {
  const nameParts = user.name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (nameParts.length > 1) {
    return `${nameParts[0]?.[0] ?? ""}${nameParts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("es");
  }

  if (nameParts.length === 1) {
    return nameParts[0]!.slice(0, 2).toLocaleUpperCase("es");
  }

  const emailParts = (user.email.split("@")[0] ?? "").split(/[._\-\s]+/).filter(Boolean);

  if (emailParts.length > 1) {
    return `${emailParts[0]?.[0] ?? ""}${emailParts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("es");
  }

  return (emailParts[0]?.slice(0, 2) || "U").toLocaleUpperCase("es");
}

export function PrivateAreaLayout({
  children,
  maxWidth,
  contentClassName,
  variant = "standard",
}: PrivateAreaLayoutProps) {
  const pathname = usePathname();
  const toast = useToast();
  const contentStyle = {
    "--yuni-private-page-width": maxWidth ?? "1280px",
  } as CSSProperties;
  const [session, setSession] = useState<SessionState>({
    status: "loading",
    user: null,
    error: null,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuId = useId();
  const sessionRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then(({ user }) => {
        if (isMounted) {
          setSession({ status: "ready", user, error: null });
        }
      })
      .catch((error) => {
        if (isSessionExpirationError(error)) {
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
  }, [sessionAttempt]);

  useEffect(() => {
    setIsProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!sessionRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        profileButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isProfileMenuOpen]);

  async function onLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setIsProfileMenuOpen(false);

    try {
      await logout();
      toast.success("Cerraste tu sesión de forma segura.", {
        title: "Sesión cerrada",
        dedupeKey: "auth:logout:success",
      });
      replaceBrowserLocation("/auth/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Intentá nuevamente.", {
        title: "No pudimos cerrar la sesión",
        dedupeKey: "auth:logout:error",
      });
      setIsLoggingOut(false);
    }
  }

  function retrySession() {
    setSession({ status: "loading", user: null, error: null });
    setSessionAttempt((current) => current + 1);
  }

  const privateContent =
    session.status === "ready" ? (
      children
    ) : session.status === "error" ? (
      <ErrorState
        title="No pudimos validar tu sesión"
        description={session.error}
        action={<Button onClick={retrySession}>Reintentar</Button>}
      />
    ) : (
      <LoadingState title="Validando sesión" description="Estamos verificando tu acceso." />
    );

  return (
    <div className={`${styles.layout} ${variant === "focus" ? styles.layoutFocus : ""}`}>
      <a className={styles.skipLink} href="#private-page-content">
        Saltar al contenido
      </a>

      {variant === "standard" ? (
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link className={styles.brandLink} href="/" aria-label="YUNI, volver a la landing">
              <YuniLogo className={styles.logo} aria-hidden="true" focusable="false" />
              <span className={styles.brandText}>YUNI</span>
            </Link>

            <PrivateNavigation pathname={pathname} />

            <div className={styles.session} ref={sessionRef}>
              {session.status === "ready" ? (
                <>
                  <button
                    ref={profileButtonRef}
                    className={styles.profileTrigger}
                    type="button"
                    aria-label={`Abrir menú de perfil de ${session.user.name ?? session.user.email}`}
                    aria-expanded={isProfileMenuOpen}
                    aria-controls={profileMenuId}
                    aria-haspopup="menu"
                    onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                  >
                    <span className={styles.avatar} aria-hidden="true">
                      {getUserInitials(session.user)}
                    </span>
                    <span className={styles.userBlock}>
                      <span className={styles.userName}>{session.user.name ?? session.user.email}</span>
                      <span className={styles.userEmail}>{session.user.email}</span>
                    </span>
                    <svg
                      className={`${styles.chevron} ${isProfileMenuOpen ? styles.chevronOpen : ""}`}
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </button>

                  {isProfileMenuOpen ? (
                    <div className={styles.profileMenu} id={profileMenuId} role="menu">
                      <button
                        className={styles.logout}
                        type="button"
                        role="menuitem"
                        onClick={onLogout}
                        disabled={isLoggingOut}
                      >
                        <svg className={styles.logoutIcon} viewBox="0 0 20 20" aria-hidden="true">
                          <path d="M8 3H4.75A1.75 1.75 0 0 0 3 4.75v10.5C3 16.22 3.78 17 4.75 17H8" />
                          <path d="M13 6.5 16.5 10 13 13.5M7 10h9" />
                        </svg>
                        {isLoggingOut ? "Saliendo..." : "Cerrar sesión"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : session.status === "error" ? (
                <p className={styles.sessionError}>{session.error}</p>
              ) : (
                <p className={styles.sessionMeta}>Verificando sesión...</p>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main
        id="private-page-content"
        className={`${styles.content} ${variant === "focus" ? styles.contentFocus : ""} ${contentClassName ?? ""}`}
        style={contentStyle}
      >
        {privateContent}
      </main>
    </div>
  );
}
