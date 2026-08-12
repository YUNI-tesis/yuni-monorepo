import type { ApiAccessGrantState, ApiShareLink } from "./api/sharing-api";
import { ApiClientError } from "./api/http-client";

const publicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
