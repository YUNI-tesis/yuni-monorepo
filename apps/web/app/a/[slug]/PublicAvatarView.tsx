"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PageShell,
  useToast,
} from "@yuni/ui";
import Link from "next/link";
import { YuniLogo } from "../../../components/brand/YuniLogo";
import { InteractCallControls } from "../../../components/interact/InteractCall";
import { useLiveAvatarSession } from "../../../hooks/useLiveAvatarSession";
import {
  confirmPublicSessionStarted,
  endPublicSession,
  failPublicSessionStart,
  getPublicSharedAvatar,
  identifyPublicVisitor,
  startPublicSession,
  type ApiPublicIdentity,
  type ApiPublicSessionStart,
  type ApiPublicSharedAvatar,
} from "../../../lib/api/sharing-api";
import { ApiClientError, toUserFacingApiError } from "../../../lib/api/http-client";
import { formatRetryAfter, requiresRenewedPublicConsent } from "../../../lib/avatar-sharing";
import { readSessionValue, removeSessionValue, storeSessionValue } from "../../../lib/browser-storage";
import styles from "./PublicAvatar.module.css";

type PublicAvatarState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ApiPublicSharedAvatar; error: null }
  | { status: "not-found" | "error"; data: null; error: string };

type StoredIdentity = ApiPublicIdentity;

export function PublicAvatarView({ slug }: { slug: string }) {
  const toast = useToast();
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PublicAvatarState>({ status: "loading", data: null, error: null });
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentRestoredFromIdentity, setConsentRestoredFromIdentity] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const currentSession = useRef<ApiPublicSessionStart["publicSession"] | null>(null);
  const callToastIdRef = useRef<string | null>(null);

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
      return { voiceSession: started.voiceSession };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        clearStoredIdentity(slug);
        setConsent(false);
        setConsentRestoredFromIdentity(false);
        setHasStarted(false);
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

  const failStartTransport = useCallback(async () => {
    const session = currentSession.current;
    if (!session) return;
    await failPublicSessionStart(session.id, session.token);
  }, []);

  const failStartTransportOnUnload = useCallback(() => {
    const session = currentSession.current;
    if (!session) return;
    void failPublicSessionStart(session.id, session.token, { keepalive: true }).catch(() => undefined);
  }, []);

  const call = useLiveAvatarSession(slug, {
    startSession: startTransport,
    onStarted: async () => {
      const session = currentSession.current;
      if (!session) throw new Error("No pudimos confirmar el inicio de la llamada.");
      await confirmPublicSessionStarted(session.id, session.token);
    },
    failStart: failStartTransport,
    failStartOnUnload: failStartTransportOnUnload,
    endSession: endTransport,
    endSessionOnUnload: endTransportOnUnload,
    formatStartError: formatPublicSessionStartError,
  });

  useEffect(() => {
    if (!call.error) {
      if (callToastIdRef.current) toast.dismiss(callToastIdRef.current);
      callToastIdRef.current = null;
      return;
    }

    const message = formatPublicError(call.error);
    const isLimit = isPublicLimitMessage(call.error);
    callToastIdRef.current = toast.show({
      tone: isLimit ? "warning" : "danger",
      title: isLimit
        ? "Límite de llamada alcanzado"
        : call.hasPendingEnd
          ? "No pudimos guardar la llamada"
          : "Hubo un problema con la llamada",
      message,
      dedupeKey: `public-call:${slug}:error`,
      announcement: "assertive",
      onDismiss: call.dismissError,
    });
  }, [call.dismissError, call.error, call.hasPendingEnd, slug, toast]);

  useEffect(() => {
    if (!call.endedByLimit || call.status !== "ended") return;
    toast.warning("La conversación finalizó y se guardó correctamente.", {
      title: "Se alcanzó el límite de duración",
      dedupeKey: `public-call:${slug}:duration-limit`,
      announcement: "assertive",
    });
  }, [call.endedByLimit, call.status, slug, toast]);

  useEffect(
    () => () => {
      if (callToastIdRef.current) toast.dismiss(callToastIdRef.current);
    },
    [toast]
  );

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
              : toUserFacingApiError(error, "No pudimos cargar este avatar."),
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
      requiresRenewedPublicConsent(hasStarted, consentRestoredFromIdentity, Boolean(readStoredIdentity(slug)))
    ) {
      setHasStarted(false);
      setConsent(false);
      setConsentRestoredFromIdentity(false);
      setFormError("Tu identificación venció. Volvé a aceptar el aviso de privacidad para continuar.");
      return;
    }
    storeSessionValue(emailStorageKey(slug), normalized);
    setEmail(normalized);
    setFormError(null);
    void call.start();
  }

  return (
    <PageShell centered maxWidth={hasStarted ? "calc(100vw - 32px)" : "820px"} className={styles.page}>
      {!hasStarted ? (
        <header>
          <Link className={styles.brand} href="/" aria-label="YUNI, volver a la landing">
            <YuniLogo className={styles.logo} aria-hidden="true" />
            <span>YUNI</span>
          </Link>
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
          <PublicCallExperience avatar={state.data} call={call} onStart={requestStart} />
        ) : (
          <PublicIntroduction
            data={state.data}
            email={email}
            consent={consent}
            formError={formError}
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
  onStart,
}: {
  avatar: ApiPublicSharedAvatar;
  call: ReturnType<typeof useLiveAvatarSession>;
  onStart: () => void;
}) {
  const inCall = call.status === "active" || call.status === "starting" || call.status === "ending";
  const canStart =
    !call.hasPendingEnd && (call.status === "idle" || call.status === "ended" || call.status === "error");

  return (
    <div className={styles.callLayout}>
      <header className={styles.callHeader}>
        <Link className={styles.callBrand} href="/" aria-label="YUNI, volver a la landing">
          <YuniLogo aria-hidden="true" />
          <span>YUNI</span>
        </Link>
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
            {call.endedByLimit ? (
              <span>La llamada terminó al alcanzar la duración disponible.</span>
            ) : call.status === "starting" || call.status === "ending" ? (
              <span>Estamos preparando la experiencia.</span>
            ) : null}
          </div>
        ) : null}
        <div className={styles.callDock}>
          {call.remainingSeconds !== null ? (
            <p className={styles.countdown} role="timer">
              {call.remainingSeconds <= 60 ? "Queda un minuto o menos · " : "Tiempo disponible · "}
              {formatPublicCountdown(call.remainingSeconds)}
            </p>
          ) : null}
          <span className={styles.srOnly} role="status" aria-live="polite">
            {call.remainingSeconds !== null && call.remainingSeconds <= 60
              ? "Queda un minuto o menos de llamada."
              : ""}
          </span>
          {inCall ? (
            <InteractCallControls
              status={call.status}
              isMuted={call.isMuted}
              canStart={false}
              onStart={onStart}
              onToggleMute={call.toggleMute}
              onInterrupt={call.interrupt}
              onEnd={call.end}
            />
          ) : call.hasPendingEnd ? (
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
  return readSessionValue(emailStorageKey(slug)) ?? "";
}
function storeIdentity(slug: string, identity: StoredIdentity) {
  storeSessionValue(identityStorageKey(slug), JSON.stringify(identity));
}
function clearStoredIdentity(slug: string) {
  removeSessionValue(identityStorageKey(slug));
}
function readStoredIdentity(slug: string): StoredIdentity | null {
  try {
    const value = JSON.parse(readSessionValue(identityStorageKey(slug)) ?? "null") as StoredIdentity | null;
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
export function formatPublicSessionStartError(error: unknown, fallback: (error: unknown) => string) {
  if (error instanceof ApiClientError) {
    if (error.status === 401)
      return "Tu identificación venció. Volvé a aceptar el aviso de privacidad para continuar.";
    if (error.status === 404) return "El link o el avatar ya no está disponible.";
    const retry = formatRetryAfter(error.retryAfterSeconds);
    if (error.reason === "SHARE_SESSION_COUNT_LIMIT")
      return "Ya alcanzaste la cantidad de llamadas permitidas.";
    if (error.reason === "PLATFORM_RATE_LIMIT")
      return `Se hicieron demasiados intentos. Volvé a intentar en ${retry}.`;
    if (error.reason === "EXTERNAL_SESSION_CAPACITY")
      return `El avatar alcanzó su capacidad de llamadas. Volvé a intentar en ${retry}.`;
    if (error.reason === "ACTIVE_SESSION_EXISTS")
      return "Ya tenés una llamada activa con este link. Finalizala antes de iniciar otra.";
    if (error.status === 429)
      return `No se puede iniciar otra llamada todavía. Volvé a intentar en ${retry}.`;
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

function isPublicLimitMessage(message: string) {
  return /límite|limit|llamadas permitidas|capacidad de llamadas|demasiados intentos|llamada activa/i.test(
    message
  );
}
function formatCallStatus(status: ReturnType<typeof useLiveAvatarSession>["status"]) {
  if (status === "active") return "En llamada";
  if (status === "starting") return "Conectando";
  if (status === "ending") return "Finalizando";
  if (status === "ended") return "Finalizada";
  if (status === "error") return "Error";
  return "Lista";
}

export function formatPublicCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
