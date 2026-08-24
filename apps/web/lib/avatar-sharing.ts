import type { ApiAccessGrantState, ApiInteractionLimits, ApiShareLink } from "./api/sharing-api";
import { ApiClientError } from "./api/http-client";

const publicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InteractionLimitsDraft = {
  sessionDuration: string;
  sessionDurationUnit: "seconds" | "minutes";
  maxSessionsPer24Hours: string;
};

export const emptyInteractionLimitsDraft: InteractionLimitsDraft = {
  sessionDuration: "",
  sessionDurationUnit: "minutes",
  maxSessionsPer24Hours: "",
};

export function interactionLimitsToDraft(limits: ApiInteractionLimits): InteractionLimitsDraft {
  const duration = limits.maxSessionDurationSeconds;
  const useMinutes = duration !== null && duration % 60 === 0;
  return {
    sessionDuration: duration === null ? "" : String(useMinutes ? duration / 60 : duration),
    sessionDurationUnit: useMinutes || duration === null ? "minutes" : "seconds",
    maxSessionsPer24Hours: limits.maxSessionsPer24Hours?.toString() ?? "",
  };
}

export function parseInteractionLimitsDraft(draft: InteractionLimitsDraft) {
  const parsedDuration = parseOptionalInteger(draft.sessionDuration);
  const durationSeconds =
    parsedDuration === null
      ? null
      : draft.sessionDurationUnit === "minutes"
        ? parsedDuration * 60
        : parsedDuration;
  const limits: ApiInteractionLimits = {
    maxSessionDurationSeconds: durationSeconds,
    maxSessionsPer24Hours: parseOptionalInteger(draft.maxSessionsPer24Hours),
  };
  const errors = {
    sessionDuration: validateOptionalLimit(
      draft.sessionDuration,
      parsedDuration,
      draft.sessionDurationUnit === "seconds" ? 3600 : 60,
      draft.sessionDurationUnit === "seconds" ? 10 : 1
    ),
    sessionDurationUnit: null,
    maxSessionsPer24Hours: validateOptionalLimit(
      draft.maxSessionsPer24Hours,
      limits.maxSessionsPer24Hours,
      100
    ),
  };

  return { limits, errors, isValid: Object.values(errors).every((error) => error === null) };
}

export function formatInteractionLimitsSummary(limits: ApiInteractionLimits | null) {
  if (!limits) return "Ilimitado";
  const parts = [
    limits.maxSessionDurationSeconds === null
      ? null
      : `${formatDuration(limits.maxSessionDurationSeconds)} por llamada`,
    limits.maxSessionsPer24Hours === null ? null : `${limits.maxSessionsPer24Hours} llamadas cada 24 h`,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : "Ilimitado";
}

export function hasConfiguredInteractionLimits(limits: ApiInteractionLimits | null) {
  return Boolean(
    limits && (limits.maxSessionDurationSeconds !== null || limits.maxSessionsPer24Hours !== null)
  );
}

export function formatRetryAfter(seconds?: number) {
  if (!seconds || seconds <= 0) return "unos minutos";
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "segundo" : "segundos"}`;
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  }
  const hours = Math.ceil(seconds / 3600);
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}

function parseOptionalInteger(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function validateOptionalLimit(value: string, parsed: number | null, max: number, min = 1) {
  if (value.trim() === "") return null;
  return parsed !== null && Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? null
    : `Ingresá un número entero entre ${min} y ${max}.`;
}

function formatDuration(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60} ${seconds === 60 ? "minuto" : "min"}` : `${seconds} s`;
}

export function toPublicSlug(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  if (normalized.length >= 3) {
    return normalized;
  }

  return normalized ? `${normalized}-avatar` : "avatar";
}

export function validateShareLinkDraft(name: string, slug: string) {
  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();

  return {
    name:
      trimmedName.length === 0
        ? "Escribí un nombre para reconocer el link."
        : trimmedName.length > 120
          ? "El nombre puede tener hasta 120 caracteres."
          : null,
    slug:
      trimmedSlug.length < 3 || trimmedSlug.length > 80 || !publicSlugPattern.test(trimmedSlug)
        ? "Usá entre 3 y 80 caracteres: minúsculas, números y guiones."
        : null,
  };
}

export function normalizeGrantEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateGrantEmail(value: string) {
  const email = normalizeGrantEmail(value);
  return emailPattern.test(email) ? null : "Ingresá un email válido.";
}

export function getAccessGrantCreateError(error: unknown) {
  if (error instanceof ApiClientError && error.reason === "SELF_ACCESS_GRANT") {
    return "No necesitás darte acceso: ya sos el propietario de este avatar.";
  }

  if (error instanceof ApiClientError && error.status === 409) {
    return "Ese email ya tiene un acceso para este avatar.";
  }

  return error instanceof Error ? error.message : "No pudimos completar la acción.";
}

export function getAccessGrantPresentation(state: ApiAccessGrantState) {
  if (state === "linked") {
    return { label: "Cuenta vinculada", tone: "success" as const };
  }

  if (state === "revoked") {
    return { label: "Acceso revocado", tone: "danger" as const };
  }

  return { label: "Cuenta pendiente", tone: "warning" as const };
}

export function canOpenPublicLink(link: Pick<ApiShareLink, "isEnabled">, avatarStatus: string) {
  return link.isEnabled && avatarStatus === "active";
}

export function requiresRenewedPublicConsent(
  hasStarted: boolean,
  consentRestoredFromIdentity: boolean,
  hasValidIdentity: boolean
) {
  return (hasStarted || consentRestoredFromIdentity) && !hasValidIdentity;
}
