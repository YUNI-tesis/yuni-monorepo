"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorState, FormField, Input, LoadingState, PageShell } from "@yuni/ui";
import { YuniLogo } from "../../../components/brand/YuniLogo";
import { GroupInteractCall } from "../../../components/interact/GroupInteractCall";
import type { ApiAvatarGroup } from "../../../lib/api/avatar-group-api";
import {
  getPublicSharedGroup,
  identifyPublicGroupVisitor,
  type ApiPublicGroupIdentity,
  type ApiPublicSharedGroup,
} from "../../../lib/api/group-sharing-api";
import { ApiClientError, toUserFacingApiError } from "../../../lib/api/http-client";
import { formatInteractionLimitsSummary } from "../../../lib/avatar-sharing";
import { createPublicGroupCallTransport } from "../../../lib/group-call-transport";
import { readSessionValue, removeSessionValue, storeSessionValue } from "../../../lib/browser-storage";
import styles from "./PublicGroup.module.css";

type PublicGroupState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ApiPublicSharedGroup; error: null }
  | { status: "not-found"; data: null; error: string }
  | { status: "error"; data: null; error: string };

export function PublicGroupView({ slug }: { slug: string }) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<PublicGroupState>({ status: "loading", data: null, error: null });
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ApiPublicGroupIdentity | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    setState({ status: "loading", data: null, error: null });
    setCallOpen(false);
    setIdentity(null);
    getPublicSharedGroup(slug)
      .then((data) => {
        if (!mounted) return;
        setState({ status: "ready", data, error: null });
        const storedIdentity = readStoredIdentity(slug, data.consent);
        if (storedIdentity) {
          setEmail(storedIdentity.email);
          setConsent(true);
        } else {
          setEmail(readSessionValue(emailStorageKey(slug)) ?? "");
          setConsent(false);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setState({
          status: error instanceof ApiClientError && error.status === 404 ? "not-found" : "error",
          data: null,
          error:
            error instanceof ApiClientError && error.status === 404
              ? "Este link no existe o ya no está disponible."
              : toUserFacingApiError(error, "No pudimos cargar este grupo."),
        });
      });
    return () => {
      mounted = false;
    };
  }, [retryVersion, slug]);

  const publicGroup = useMemo(
    () => (state.status === "ready" ? toRuntimeGroup(slug, state.data) : null),
    [slug, state]
  );
  const transport = useMemo(
    () => (identity ? createPublicGroupCallTransport({ slug, identityToken: identity.token }) : null),
    [identity, slug]
  );

  const handleRuntimeStartError = useCallback(
    (error: unknown) => {
      if (!requiresFreshConsent(error)) return;
      clearStoredIdentity(slug);
      setIdentity(null);
      setCallOpen(false);
      setConsent(false);
      setFormError("El grupo cambió o tu identificación venció. Volvé a aceptar el aviso de privacidad.");
      setRetryVersion((version) => version + 1);
    },
    [slug]
  );

  async function continueToCall(data: ApiPublicSharedGroup) {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      setFormError("Ingresá un email válido para continuar.");
      return;
    }
    if (!consent) {
      setFormError("Tenés que aceptar el aviso de privacidad para iniciar la llamada.");
      return;
    }
    if (data.interactionAvailability.status !== "ready") return;

    setIsIdentifying(true);
    setFormError(null);
    try {
      let nextIdentity = readStoredIdentity(slug, data.consent);
      if (!nextIdentity || nextIdentity.email !== normalizedEmail) {
        const response = await identifyPublicGroupVisitor(slug, {
          email: normalizedEmail,
          scopeId: data.consent.scopeId,
          consentVersion: data.consent.version,
        });
        nextIdentity = response.identity;
        storeIdentity(slug, nextIdentity);
      }
      storeSessionValue(emailStorageKey(slug), normalizedEmail);
      setEmail(normalizedEmail);
      setIdentity(nextIdentity);
      setCallOpen(true);
    } catch (error) {
      setFormError(formatIdentifyError(error));
      if (requiresFreshConsent(error)) {
        clearStoredIdentity(slug);
        setConsent(false);
        setRetryVersion((version) => version + 1);
      }
    } finally {
      setIsIdentifying(false);
    }
  }

  if (callOpen && publicGroup && transport) {
    return (
      <PageShell maxWidth="calc(100vw - 32px)" className={styles.callPage}>
        <GroupInteractCall
          key={identity?.token}
          groupId={publicGroup.id}
          initialGroup={publicGroup}
          transport={transport}
          historyEnabled={false}
          privacyPrompt="handled"
          backLabel="Salir"
          eyebrow="Llamada pública"
          autoStart
          onBack={() => setCallOpen(false)}
          onStartError={handleRuntimeStartError}
        />
      </PageShell>
    );
  }

  return (
    <PageShell centered maxWidth="920px" className={styles.page}>
      <header>
        <Link className={styles.brand} href="/" aria-label="YUNI, volver a la landing">
          <YuniLogo className={styles.logo} aria-hidden="true" />
          <span>YUNI</span>
        </Link>
      </header>

      {state.status === "loading" ? (
        <Card padding="lg">
          <LoadingState
            title="Cargando grupo compartido"
            description="Comprobando que el link siga disponible."
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
      ) : (
        <PublicGroupIntroduction
          data={state.data}
          email={email}
          consent={consent}
          formError={formError}
          isIdentifying={isIdentifying}
          onEmailChange={(value) => {
            setEmail(value);
            setFormError(null);
          }}
          onConsentChange={(value) => {
            setConsent(value);
            setFormError(null);
          }}
          onContinue={() => void continueToCall(state.data)}
        />
      )}
    </PageShell>
  );
}

function PublicGroupIntroduction(props: {
  data: ApiPublicSharedGroup;
  email: string;
  consent: boolean;
  formError: string | null;
  isIdentifying: boolean;
  onEmailChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onContinue: () => void;
}) {
  const ready = props.data.interactionAvailability.status === "ready";
  return (
    <Card padding="lg" className={styles.card}>
      <article className={styles.content}>
        <GroupMosaic members={props.data.group.members} name={props.data.group.name} />
        <p className="yuni-eyebrow">Grupo compartido · {props.data.shareLink.name}</p>
        <h1>{props.data.group.name}</h1>
        <p className={styles.description}>
          Conversá con el grupo completo. Cada integrante participa con su identidad y contexto propios.
        </p>
        <p className={styles.limits}>
          Límites de uso: {formatPublicGroupLimits(props.data.shareLink.limits)}
        </p>

        <ol className={styles.roster} aria-label="Integrantes del grupo">
          {[...props.data.group.members]
            .sort((left, right) => left.position - right.position)
            .map((member) => (
              <li key={member.id}>
                <span className={styles.memberAvatar} aria-hidden="true">
                  {member.thumbnailUrl ? <img src={member.thumbnailUrl} alt="" /> : initials(member.name)}
                </span>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.description || "Integrante del grupo"}</small>
                </span>
              </li>
            ))}
        </ol>

        {ready ? (
          <div className={styles.identification}>
            <FormField label="Tu email" htmlFor="public-group-participant-email">
              <Input
                id="public-group-participant-email"
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
                La llamada y su transcripción se guardarán. El creador del grupo podrá consultar esta
                información en Actividad. Si cambia algún integrante, te pediremos aceptar nuevamente.
              </span>
            </label>
            {props.formError ? (
              <p className={styles.inlineError} role="alert">
                {props.formError}
              </p>
            ) : null}
            <Button loading={props.isIdentifying} onClick={props.onContinue}>
              Iniciar llamada
            </Button>
          </div>
        ) : (
          <aside className={styles.unavailable}>
            <Badge tone="warning">Grupo no disponible</Badge>
            <strong>No se puede iniciar una llamada ahora</strong>
            <p>{availabilityMessage(props.data.interactionAvailability)}</p>
          </aside>
        )}
      </article>
    </Card>
  );
}

function GroupMosaic({ members, name }: { members: ApiPublicSharedGroup["group"]["members"]; name: string }) {
  return (
    <div className={styles.mosaic} data-count={members.length} role="img" aria-label={`Grupo ${name}`}>
      {[...members]
        .sort((left, right) => left.position - right.position)
        .map((member) => (
          <span key={member.id}>
            {member.thumbnailUrl ? <img src={member.thumbnailUrl} alt="" /> : initials(member.name)}
          </span>
        ))}
    </div>
  );
}

function toRuntimeGroup(slug: string, data: ApiPublicSharedGroup): ApiAvatarGroup {
  return {
    id: `public:${slug}`,
    name: data.group.name,
    members: data.group.members.map((member) => ({
      ...member,
      viewerAccess: "group_grant",
      accessType: "shared",
    })),
    access: {
      type: "shared",
      canEdit: false,
      canDelete: false,
      canShare: false,
      canInteract: data.interactionAvailability.status === "ready",
      limits: data.shareLink.limits,
      consent: data.consent,
    },
    interactionAvailability: data.interactionAvailability,
    sharingEligibility: { status: "eligible" },
    sharingChannels: { account: false, public: false },
    activityEnabled: false,
    membershipVersion: Number.parseInt(data.consent.version, 10) || 1,
    hasActiveSharingChannels: true,
    createdAt: "",
    updatedAt: "",
  };
}

function identityStorageKey(slug: string) {
  return `yuni:public-group-identity:${slug}`;
}
function emailStorageKey(slug: string) {
  return `yuni:public-group-email:${slug}`;
}
function storeIdentity(slug: string, identity: ApiPublicGroupIdentity) {
  storeSessionValue(identityStorageKey(slug), JSON.stringify(identity));
}
function clearStoredIdentity(slug: string) {
  removeSessionValue(identityStorageKey(slug));
}
function readStoredIdentity(
  slug: string,
  consent: ApiPublicSharedGroup["consent"]
): ApiPublicGroupIdentity | null {
  try {
    const identity = JSON.parse(
      readSessionValue(identityStorageKey(slug)) ?? "null"
    ) as ApiPublicGroupIdentity | null;
    if (
      !identity ||
      new Date(identity.expiresAt).getTime() <= Date.now() ||
      identity.scopeId !== consent.scopeId ||
      identity.consentVersion !== consent.version
    ) {
      clearStoredIdentity(slug);
      return null;
    }
    return identity;
  } catch {
    clearStoredIdentity(slug);
    return null;
  }
}

function requiresFreshConsent(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 || /CONSENT|IDENTITY|PUBLIC_TOKEN/i.test(error.reason ?? ""))
  );
}
function formatIdentifyError(error: unknown) {
  if (requiresFreshConsent(error)) {
    return "El grupo cambió o tu identificación venció. Volvé a aceptar el aviso de privacidad.";
  }
  if (error instanceof ApiClientError && error.status === 404) return "Este link ya no está disponible.";
  return toUserFacingApiError(error, "No pudimos validar tu acceso. Intentá nuevamente.");
}
function availabilityMessage(availability: ApiPublicSharedGroup["interactionAvailability"]) {
  if (availability.status === "ready") return "El grupo está listo.";
  if (availability.reason === "preparing") return "Algunos avatares todavía se están preparando.";
  if (availability.reason === "inactive_member") return "Uno o más integrantes están inactivos.";
  if (availability.reason === "invalid_roster") return "La composición actual del grupo no es válida.";
  return "El proveedor de conversación no está disponible. Intentá más tarde.";
}
function formatPublicGroupLimits(limits: ApiPublicSharedGroup["shareLink"]["limits"]) {
  return formatInteractionLimitsSummary({
    ...limits,
    maxSessionDurationSeconds: limits.maxSessionDurationSeconds ?? 60 * 60,
  });
}
function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
