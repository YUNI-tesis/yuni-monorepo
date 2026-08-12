"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, ErrorState, FormField, Input, LoadingState, PageShell } from "@yuni/ui";
import { YuniLogo } from "../../../components/brand/YuniLogo";
import { InteractCallControls } from "../../../components/interact/InteractCall";
import { useLiveAvatarSession } from "../../../hooks/useLiveAvatarSession";
import {
  confirmPublicSessionStarted,
  endPublicSession,
  getPublicSharedAvatar,
  identifyPublicVisitor,
  startPublicSession,
  type ApiPublicIdentity,
  type ApiPublicSessionStart,
  type ApiPublicSharedAvatar,
} from "../../../lib/api/sharing-api";
import { ApiClientError } from "../../../lib/api/http-client";
import { requiresRenewedPublicConsent } from "../../../lib/avatar-sharing";
import styles from "./PublicAvatar.module.css";

type PublicAvatarState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ApiPublicSharedAvatar; error: null }
  | { status: "not-found" | "error"; data: null; error: string };

type StoredIdentity = ApiPublicIdentity;

export function PublicAvatarView({ slug }: { slug: string }) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PublicAvatarState>({ status: "loading", data: null, error: null });
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentRestoredFromIdentity, setConsentRestoredFromIdentity] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const currentSession = useRef<ApiPublicSessionStart["publicSession"] | null>(null);

  const startTransport = useCallback(async () => {
    let identity = readStoredIdentity(slug);
    if (!identity || identity.email !== normalizeEmail(email)) {
      const response = await identifyPublicVisitor(slug, email);
      identity = response.identity;
      storeIdentity(slug, identity);
    }
    try {
      const started = await startPublicSession(slug, identity.token);
      currentSession.current = started.publicSession;
      setHasStarted(true);
      setLimitReached(false);
      return { voiceSession: started.voiceSession };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        clearStoredIdentity(slug);
        setConsent(false);
        setHasStarted(false);
        setFormError("Tu identificación venció. Volvé a aceptar el aviso de privacidad para continuar.");
      }
      throw error;
    }
  }, [email, slug]);

  const endTransport = useCallback(
    async (_realtimeSessionId: string, transcript: Parameters<typeof endPublicSession>[2]) => {
      const session = currentSession.current;
      if (!session) return;
      await endPublicSession(session.id, session.token, transcript, {
        maxMessages: session.maxTranscriptMessages,
      });
    },
    []
  );

  const endTransportOnUnload = useCallback(
    (_realtimeSessionId: string, transcript: Parameters<typeof endPublicSession>[2]) => {
      const session = currentSession.current;
      if (!session) return;
      void endPublicSession(session.id, session.token, transcript, {
        keepalive: true,
        maxMessages: session.maxTranscriptMessages,
      }).catch(() => undefined);
    },
    []
  );

  const call = useLiveAvatarSession(slug, {
    startSession: startTransport,
    onStarted: async () => {
      const session = currentSession.current;
      if (!session) throw new Error("No pudimos confirmar el inicio de la llamada.");
      await confirmPublicSessionStarted(session.id, session.token);
    },
    endSession: endTransport,
    endSessionOnUnload: endTransportOnUnload,
    formatStartError: formatPublicSessionStartError,
  });

  useEffect(() => {
    let isMounted = true;
    setState({ status: "loading", data: null, error: null });
    getPublicSharedAvatar(slug)
      .then((data) => isMounted && setState({ status: "ready", data, error: null }))
      .catch((error) => {
        if (!isMounted) return;
        setState({
          status: error instanceof ApiClientError && error.status === 404 ? "not-found" : "error",
          data: null,
          error:
            error instanceof ApiClientError && error.status === 404
              ? "Este link no existe o ya no está disponible."
              : error instanceof Error
                ? error.message
                : "No pudimos cargar este avatar.",
        });
      });
    const stored = readStoredIdentity(slug);
    if (stored) {
      setEmail(stored.email);
      setConsent(true);
      setConsentRestoredFromIdentity(true);
    } else {
      setEmail(readStoredEmail(slug));
      setConsent(false);
      setConsentRestoredFromIdentity(false);
    }
    return () => {
      isMounted = false;
    };
  }, [retryVersion, slug]);

  useEffect(() => {
    if (call.status !== "active" || !currentSession.current) return;
    const remaining = new Date(currentSession.current.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setLimitReached(true);
      void call.end();
      return;
    }
    const timer = window.setTimeout(() => {
      setLimitReached(true);
      void call.end();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [call.end, call.status]);

  function requestStart() {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setFormError("Ingresá un email válido para continuar.");
      return;
    }
    if (!consent) {
      setFormError("Tenés que aceptar el aviso de privacidad para iniciar la llamada.");
      return;
    }
    if (
      requiresRenewedPublicConsent(
        hasStarted,
        consentRestoredFromIdentity,
        Boolean(readStoredIdentity(slug))
      )
    ) {
      setHasStarted(false);
      setConsent(false);
      setConsentRestoredFromIdentity(false);
      setFormError("Tu identificación venció. Volvé a aceptar el aviso de privacidad para continuar.");
      return;
    }
    sessionStorage.setItem(emailStorageKey(slug), normalized);
    setEmail(normalized);
    setFormError(null);
    void call.start();
  }

  return (
    <PageShell centered maxWidth={hasStarted ? "calc(100vw - 32px)" : "820px"} className={styles.page}>
      {!hasStarted ? (
        <header className={styles.brand}>
          <YuniLogo className={styles.logo} aria-hidden="true" />
          <span>YUNI</span>
        </header>
      ) : null}

      {state.status === "loading" ? (
        <Card padding="lg">
          <LoadingState
            title="Cargando avatar compartido"
            description="Estamos comprobando que el link siga disponible."
          />
        </Card>
      ) : state.status === "not-found" ? (
        <Card padding="lg">
          <ErrorState title="Link no disponible" description={state.error} />
        </Card>
      ) : state.status === "error" ? (
        <Card padding="lg">
          <ErrorState
            title="No pudimos abrir el link"
            description={state.error}
            action={<Button onClick={() => setRetryVersion((value) => value + 1)}>Reintentar</Button>}
          />
        </Card>
      ) : state.status === "ready" ? (
        hasStarted ? (
          <PublicCallExperience
            avatar={state.data}
            call={call}
            limitReached={limitReached}
            onStart={requestStart}
          />
        ) : (
          <PublicIntroduction
            data={state.data}
            email={email}
            consent={consent}
            formError={formError ?? call.error}
            isStarting={call.status === "starting"}
            onEmailChange={(value) => {
              setEmail(value);
              setFormError(null);
            }}
            onConsentChange={(value) => {
              setConsent(value);
              setConsentRestoredFromIdentity(false);
              setFormError(null);
            }}
            onStart={requestStart}
          />
        )
      ) : null}
    </PageShell>
  );
}

function PublicIntroduction(props: {
  data: ApiPublicSharedAvatar;
  email: string;
  consent: boolean;
  formError: string | null;
  isStarting: boolean;
  onEmailChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onStart: () => void;
}) {
  const voiceReady = props.data.capabilities.voice === "ready";
  return (
    <Card padding="lg" className={styles.card}>
      <article className={styles.content}>
        <PublicAvatarVisual data={props.data} />
        <p className="yuni-eyebrow">{props.data.shareLink.name}</p>
        <h1>{props.data.avatar.name}</h1>
        <p className={styles.description}>
          {props.data.avatar.description || "Este avatar no tiene una descripción pública."}
        </p>
        {voiceReady ? (
          <div className={styles.identification}>
            <FormField label="Tu email" htmlFor="public-participant-email">
              <Input
                id="public-participant-email"
                type="email"
                autoComplete="email"
                value={props.email}
                onChange={(event) => props.onEmailChange(event.currentTarget.value)}
                placeholder="persona@example.com"
              />
            </FormField>
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={props.consent}
                onChange={(event) => props.onConsentChange(event.currentTarget.checked)}
              />
              <span>
                La llamada y su transcripción se guardarán. El creador del avatar podrá consultar esta
                información en Actividad.
              </span>
            </label>
            {props.formError ? (
              <p className={styles.inlineError} role="alert">
                {formatPublicError(props.formError)}
              </p>
            ) : null}
            <Button loading={props.isStarting} onClick={props.onStart}>
              Iniciar llamada
            </Button>
          </div>
        ) : (
          <aside className={styles.unavailable}>
            <strong>Llamadas no disponibles</strong>
            <p>Este avatar todavía no está listo para conversar.</p>
          </aside>
        )}
      </article>
    </Card>
  );
}

function PublicCallExperience({
  avatar,
  call,
  limitReached,
  onStart,
}: {
  avatar: ApiPublicSharedAvatar;
  call: ReturnType<typeof useLiveAvatarSession>;
  limitReached: boolean;
  onStart: () => void;
}) {
  const inCall = call.status === "active" || call.status === "starting" || call.status === "ending";
  const canStart = call.status === "ended" || call.status === "error";
  const needsEndRetry = call.status === "error" && Boolean(call.voiceSession);
  return (
    <div className={styles.callLayout}>
      <header className={styles.callHeader}>
        <div className={styles.callBrand}>
          <YuniLogo aria-hidden="true" />
          <span>YUNI</span>
        </div>
        <div className={styles.callTitle}>
          <p className="yuni-eyebrow">Llamada pública</p>
          <h1>{avatar.avatar.name}</h1>
          {avatar.avatar.description ? <p>{avatar.avatar.description}</p> : null}
        </div>
        <Badge tone={call.status === "active" ? "success" : "neutral"}>{formatCallStatus(call.status)}</Badge>
      </header>
      <section className={styles.stage} aria-label={`Llamada con ${avatar.avatar.name}`}>
        <video ref={call.attachMediaElement} autoPlay playsInline />
        {call.status !== "active" ? (
          <div className={styles.placeholder}>
            <PublicAvatarVisual data={avatar} />
            <strong>
              {call.status === "starting"
                ? "Conectando"
                : call.status === "ending"
                  ? "Guardando la llamada"
                  : "Llamada finalizada"}
            </strong>
            {limitReached ? (
              <span>La llamada alcanzó el tiempo máximo.</span>
            ) : call.status === "starting" || call.status === "ending" ? (
              <span>Estamos preparando la experiencia.</span>
            ) : null}
          </div>
        ) : null}
        <div className={styles.callDock}>
          {call.error ? (
            <p className={styles.inlineError} role="alert">
              {formatPublicError(call.error)}
            </p>
          ) : null}
          {inCall ? (
            <InteractCallControls
              status={call.status}
              isMuted={call.isMuted}
              canStart={false}
              isInCall
              onStart={onStart}
              onToggleMute={call.toggleMute}
              onEnd={call.end}
            />
          ) : needsEndRetry ? (
            <Button onClick={() => void call.end()}>Reintentar guardado</Button>
          ) : canStart ? (
            <Button onClick={onStart}>Volver a llamar</Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PublicAvatarVisual({ data }: { data: ApiPublicSharedAvatar }) {
  return (
    <div className={styles.visual}>
      {data.avatar.thumbnailUrl ? (
        <img src={data.avatar.thumbnailUrl} alt="" />
      ) : (
        <YuniLogo aria-hidden="true" />
      )}
    </div>
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function identityStorageKey(slug: string) {
  return `yuni:public-identity:${slug}`;
}
function emailStorageKey(slug: string) {
  return `yuni:public-email:${slug}`;
}
function readStoredEmail(slug: string) {
  return typeof window === "undefined" ? "" : (sessionStorage.getItem(emailStorageKey(slug)) ?? "");
}
function storeIdentity(slug: string, identity: StoredIdentity) {
  sessionStorage.setItem(identityStorageKey(slug), JSON.stringify(identity));
}
function clearStoredIdentity(slug: string) {
  sessionStorage.removeItem(identityStorageKey(slug));
}
function readStoredIdentity(slug: string): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem(identityStorageKey(slug)) ?? "null"
    ) as StoredIdentity | null;
    if (!value || new Date(value.expiresAt).getTime() <= Date.now()) {
      clearStoredIdentity(slug);
      return null;
    }
    return value;
  } catch {
    clearStoredIdentity(slug);
    return null;
  }
}
function formatPublicSessionStartError(error: unknown, fallback: (error: unknown) => string) {
  if (error instanceof ApiClientError) {
    if (error.status === 404) return "El link o el avatar ya no está disponible.";
    if (error.status === 429)
      return "Hay demasiadas llamadas en este momento. Esperá unos minutos e intentá nuevamente.";
    if (error.status === 502 || error.status === 503)
      return "No pudimos conectar la llamada en este momento. Intentá nuevamente en unos minutos.";
  }
  return fallback(error);
}
function formatPublicError(message: string) {
  if (/limit|límite/i.test(message))
    return "Hay demasiadas llamadas en este momento. Esperá unos minutos e intentá nuevamente.";
  if (/not found|no disponible|resource/i.test(message)) return "El link o el avatar ya no está disponible.";
  return message;
}
function formatCallStatus(status: ReturnType<typeof useLiveAvatarSession>["status"]) {
  if (status === "active") return "En llamada";
  if (status === "starting") return "Conectando";
  if (status === "ending") return "Finalizando";
  if (status === "ended") return "Finalizada";
  if (status === "error") return "Error";
  return "Lista";
}
