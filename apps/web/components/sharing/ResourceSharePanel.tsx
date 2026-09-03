"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  DataList,
  Dialog,
  DropdownMenu,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  YuniIcon,
  useToast,
} from "@yuni/ui";
import type { ApiAccessGrantBase, ApiInteractionLimits, ApiShareLinkBase } from "../../lib/api/sharing-api";
import { ApiClientError } from "../../lib/api/http-client";
import type { SharingController } from "../../hooks/useResourceSharing";
import {
  canOpenPublicLink,
  getAccessGrantCreateError,
  getAccessGrantPresentation,
  emptyInteractionLimitsDraft,
  formatInteractionLimitsSummary,
  interactionLimitsToDraft,
  normalizeGrantEmail,
  parseInteractionLimitsDraft,
  toPublicSlug,
  type InteractionLimitsDraft,
  validateGrantEmail,
  validateShareLinkDraft,
} from "../../lib/avatar-sharing";
import { InteractionLimitsFields, type InteractionLimitErrors } from "./InteractionLimitsFields";
import styles from "./ResourceSharePanel.module.css";

type Confirmation =
  | { kind: "delete-link"; id: string; label: string }
  | { kind: "revoke-grant"; id: string; label: string };

type LimitsEditor = {
  kind: "link" | "grant";
  id: string;
  label: string;
  limits: ApiInteractionLimits;
};

export type ShareableSubject = {
  kind: "avatar" | "group";
  id: string;
  name: string;
  publicPrefix: "/a/" | "/g/";
  publiclyAvailable: boolean;
};

const emptyLimitErrors: InteractionLimitErrors = {
  sessionDuration: null,
  sessionDurationUnit: null,
  maxSessionsPer24Hours: null,
};

export function ResourceSharePanel({
  subject,
  sharing,
  channels = { links: true, grants: true },
}: {
  subject: ShareableSubject;
  sharing: SharingController;
  channels?: { links: boolean; grants: boolean };
}) {
  const toast = useToast();
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const limitsDialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [limitsEditor, setLimitsEditor] = useState<LimitsEditor | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<InteractionLimitsDraft>(emptyInteractionLimitsDraft);
  const [limitErrors, setLimitErrors] = useState<InteractionLimitErrors>(emptyLimitErrors);

  function requestConfirmation(nextConfirmation: Confirmation) {
    setConfirmation(nextConfirmation);
    confirmationDialog.current?.showModal();
  }

  async function confirmAction() {
    if (!confirmation) return;

    try {
      if (confirmation.kind === "delete-link") {
        await sharing.removeLink(confirmation.id);
        toast.success(`${confirmation.label} dejó de estar disponible.`, {
          title: "Link público eliminado",
          dedupeKey: `share-link:${confirmation.id}:deleted`,
        });
      } else {
        await sharing.setGrantStatus(confirmation.id, "revoked");
        toast.success(`Se revocó el acceso de ${confirmation.label}.`, {
          title: "Acceso revocado",
          dedupeKey: `access-grant:${confirmation.id}:revoked`,
        });
      }

      confirmationDialog.current?.close();
      setConfirmation(null);
    } catch (error) {
      toast.error(getActionError(error), {
        title:
          confirmation.kind === "delete-link"
            ? "No pudimos eliminar el link"
            : "No pudimos actualizar el acceso",
        dedupeKey: `sharing:${confirmation.kind}:${confirmation.id}:error`,
      });
    }
  }

  function openLimitsEditor(editor: LimitsEditor) {
    setLimitsEditor(editor);
    setLimitsDraft(interactionLimitsToDraft(editor.limits));
    setLimitErrors(emptyLimitErrors);
    limitsDialog.current?.showModal();
  }

  async function saveLimits() {
    if (!limitsEditor) return;
    const parsed = parseInteractionLimitsDraft(limitsDraft);
    setLimitErrors(parsed.errors);
    if (!parsed.isValid) return;

    try {
      if (limitsEditor.kind === "link") {
        await sharing.updateLinkLimits(limitsEditor.id, parsed.limits);
      } else {
        await sharing.updateGrantLimits(limitsEditor.id, parsed.limits);
      }
      limitsDialog.current?.close();
      toast.success(`Se actualizaron los límites de ${limitsEditor.label}.`, {
        title: "Límites actualizados",
        dedupeKey: `${limitsEditor.kind}:${limitsEditor.id}:limits:updated`,
      });
      setLimitsEditor(null);
    } catch (error) {
      toast.error(getActionError(error), {
        title: "No pudimos actualizar los límites",
        dedupeKey: `${limitsEditor.kind}:${limitsEditor.id}:limits:error`,
      });
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.privacyNotice}>
        <strong>Privacidad de los usos compartidos</strong>
        <p>
          El creador puede consultar en Actividad las conversaciones y transcripts asociados a cada
          participante que use este {subject.kind === "group" ? "grupo" : "avatar"}.
        </p>
      </aside>

      {channels.links ? (
        <ShareLinksSection
          subject={subject}
          sharing={sharing}
          onEditLimits={(link) =>
            openLimitsEditor({ kind: "link", id: link.id, label: link.name, limits: link.limits })
          }
          onDelete={(link) => requestConfirmation({ kind: "delete-link", id: link.id, label: link.name })}
        />
      ) : null}

      {channels.grants ? (
        <AccessGrantsSection
          subject={subject}
          sharing={sharing}
          onEditLimits={(grant) =>
            openLimitsEditor({
              kind: "grant",
              id: grant.id,
              label: grant.participantEmail,
              limits: grant.limits,
            })
          }
          onRevoke={(grant) =>
            requestConfirmation({
              kind: "revoke-grant",
              id: grant.id,
              label: grant.participantEmail,
            })
          }
        />
      ) : null}

      <Dialog
        ref={confirmationDialog}
        title={getConfirmationTitle(confirmation)}
        description={getConfirmationDescription(confirmation, subject.kind)}
        closeLabel="Cancelar"
        footer={
          <Button
            variant="danger"
            loading={Boolean(
              confirmation &&
              sharing.isMutating(
                confirmation.kind === "delete-link" ? `link:${confirmation.id}` : `grant:${confirmation.id}`
              )
            )}
            onClick={() => void confirmAction()}
          >
            {getConfirmationActionLabel(confirmation)}
          </Button>
        }
        onClose={() => {
          setConfirmation(null);
        }}
      />

      <Dialog
        ref={limitsDialog}
        className={styles.limitsDialog}
        title="Editar límites de uso"
        description={
          limitsEditor
            ? `Definí cuánto puede usar ${limitsEditor.label}. Los cambios se aplican a la próxima llamada.`
            : ""
        }
        closeLabel="Cancelar"
        footer={
          <Button
            loading={Boolean(limitsEditor && sharing.isMutating(`${limitsEditor.kind}:${limitsEditor.id}`))}
            onClick={() => void saveLimits()}
          >
            Guardar límites
          </Button>
        }
        onClose={() => {
          setLimitsEditor(null);
          setLimitErrors(emptyLimitErrors);
        }}
      >
        <InteractionLimitsFields
          idPrefix="edit-limits"
          draft={limitsDraft}
          errors={limitErrors}
          onChange={(field, value) => setLimitsDraft((current) => ({ ...current, [field]: value }))}
        />
      </Dialog>
    </div>
  );
}

function ShareLinksSection({
  subject,
  sharing,
  onEditLimits,
  onDelete,
}: {
  subject: ShareableSubject;
  sharing: SharingController;
  onEditLimits: (link: ApiShareLinkBase) => void;
  onDelete: (link: ApiShareLinkBase) => void;
}) {
  const toast = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState(subject.name);
  const [slug, setSlug] = useState(() => toPublicSlug(subject.name, subject.kind));
  const [slugWasEdited, setSlugWasEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    name: null as string | null,
    slug: null as string | null,
  });
  const [limitsDraft, setLimitsDraft] = useState<InteractionLimitsDraft>(emptyInteractionLimitsDraft);
  const [limitErrors, setLimitErrors] = useState<InteractionLimitErrors>(emptyLimitErrors);

  function openForm() {
    setName(subject.name);
    setSlug(toPublicSlug(subject.name, subject.kind));
    setSlugWasEdited(false);
    setFieldErrors({ name: null, slug: null });
    setLimitsDraft(emptyInteractionLimitsDraft);
    setLimitErrors(emptyLimitErrors);
    setIsFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateShareLinkDraft(name, slug);
    const parsedLimits = parseInteractionLimitsDraft(limitsDraft);
    setFieldErrors(errors);
    setLimitErrors(parsedLimits.errors);
    if (errors.name || errors.slug || !parsedLimits.isValid) return;

    try {
      await sharing.createLink({
        name: name.trim(),
        slug: slug.trim(),
        isEnabled: true,
        limits: parsedLimits.limits,
      });
      setIsFormOpen(false);
      toast.success(`${name.trim()} ya se puede compartir.`, {
        title: "Link público creado",
        dedupeKey: `share-link:${slug.trim()}:created`,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setFieldErrors((current) => ({ ...current, slug: "Ese slug ya está en uso. Elegí otro." }));
        return;
      }
      toast.error(getActionError(error), {
        title: "No pudimos crear el link",
        dedupeKey: "share-link:create:error",
      });
    }
  }

  async function copyLink(link: ApiShareLinkBase) {
    try {
      await navigator.clipboard.writeText(link.publicUrl);
      toast.success(`${link.name} quedó en el portapapeles.`, {
        title: "Link copiado",
        dedupeKey: `share-link:${link.id}:copied`,
      });
    } catch {
      toast.error("Copialo manualmente desde la URL.", {
        title: "No pudimos copiar el link",
        dedupeKey: `share-link:${link.id}:copy:error`,
      });
    }
  }

  async function toggleLink(link: ApiShareLinkBase, isEnabled: boolean) {
    try {
      await sharing.setLinkEnabled(link, isEnabled);
      toast.success(isEnabled ? `${link.name} quedó activo.` : `${link.name} quedó desactivado.`, {
        title: isEnabled ? "Link activado" : "Link desactivado",
        dedupeKey: `share-link:${link.id}:availability`,
      });
    } catch (error) {
      toast.error(getActionError(error), {
        title: "No pudimos actualizar el link",
        dedupeKey: `share-link:${link.id}:availability:error`,
      });
    }
  }

  function openLink(link: ApiShareLinkBase) {
    let opened: Window | null = null;
    try {
      opened = window.open("", "_blank");
    } catch {
      opened = null;
    }
    if (!opened) {
      toast.error("Permití las ventanas emergentes e intentá nuevamente.", {
        title: "El navegador bloqueó el link",
        dedupeKey: `share-link:${link.id}:open:error`,
      });
      return;
    }

    try {
      opened.opener = null;
      const destination = opened.document.createElement("a");
      destination.href = link.publicUrl;
      destination.target = "_self";
      destination.rel = "noreferrer";
      opened.document.body.append(destination);
      destination.click();
      destination.remove();
    } catch {
      try {
        opened.close();
      } catch {
        // The browser already disposed the empty popup.
      }
      toast.error("Intentá nuevamente o copiá la URL manualmente.", {
        title: "No pudimos abrir el link",
        dedupeKey: `share-link:${link.id}:open:error`,
      });
    }
  }

  return (
    <Card padding="md" className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <p className="yuni-eyebrow">Links públicos</p>
          <h2 className={styles.sectionTitle}>Compartir mediante una URL</h2>
          <p className={styles.sectionDescription}>
            Prepará links públicos, copialos y decidí cuándo están disponibles.
          </p>
        </div>
        {!isFormOpen ? <Button onClick={openForm}>Crear link público</Button> : null}
      </div>

      {isFormOpen ? (
        <form className={styles.createForm} onSubmit={(event) => void submit(event)}>
          <FormField label="Nombre del link" htmlFor="share-link-name" error={fieldErrors.name}>
            <Input
              id="share-link-name"
              value={name}
              maxLength={120}
              invalid={Boolean(fieldErrors.name)}
              onChange={(event) => {
                const nextName = event.target.value;
                setName(nextName);
                if (!slugWasEdited) setSlug(toPublicSlug(nextName, subject.kind));
              }}
            />
          </FormField>
          <FormField
            label="URL pública"
            htmlFor="share-link-slug"
            error={fieldErrors.slug}
            hint="Podés editarla ahora; después de crear el link el slug queda fijo."
          >
            <div className={styles.slugField}>
              <span>{subject.publicPrefix}</span>
              <Input
                id="share-link-slug"
                value={slug}
                maxLength={80}
                invalid={Boolean(fieldErrors.slug)}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase());
                  setSlugWasEdited(true);
                }}
              />
            </div>
          </FormField>
          <InteractionLimitsFields
            idPrefix="create-link-limits"
            draft={limitsDraft}
            errors={limitErrors}
            onChange={(field, value) => setLimitsDraft((current) => ({ ...current, [field]: value }))}
          />
          <div className={styles.formActions}>
            <Button type="submit" loading={sharing.isMutating("link:create")}>
              Crear link
            </Button>
            <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {!subject.publiclyAvailable ? (
        <p className={styles.availabilityNote}>
          Podés preparar, abrir y copiar links ahora. La página pública permitirá iniciar llamadas cuando el
          {subject.kind === "group" ? " grupo tenga todos sus avatares listos" : " avatar esté activo"}.
        </p>
      ) : null}

      {sharing.links.status === "loading" && sharing.links.data.length === 0 ? (
        <LoadingState title="Cargando links" description="Buscando links públicos." />
      ) : sharing.links.status === "error" && sharing.links.data.length === 0 ? (
        <ErrorState
          title="No pudimos cargar los links"
          description={sharing.links.error}
          action={
            <Button variant="secondary" onClick={() => void sharing.retryLinks()}>
              Reintentar
            </Button>
          }
        />
      ) : sharing.links.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay links públicos"
          description={`Creá uno para compartir una vista pública segura del ${
            subject.kind === "group" ? "grupo" : "avatar"
          }.`}
          action={!isFormOpen ? <Button onClick={openForm}>Crear link público</Button> : undefined}
        />
      ) : (
        <DataList
          ariaLabel="Links públicos"
          items={sharing.links.data}
          getRowKey={(link) => link.id}
          columns={[
            {
              key: "name",
              header: "Nombre",
              width: "28%",
              minWidth: "180px",
              render: (link) => (
                <div className={styles.itemSummary}>
                  <strong>{link.name}</strong>
                  <small>{formatInteractionLimitsSummary(link.limits)}</small>
                </div>
              ),
            },
            {
              key: "link",
              header: "Link",
              width: "52%",
              minWidth: "260px",
              render: (link) => <span className={styles.linkCell}>{link.publicUrl}</span>,
            },
            {
              key: "status",
              header: "Estado",
              align: "center",
              width: "130px",
              minWidth: "130px",
              render: (link) => (
                <Badge tone={link.isEnabled ? "success" : "neutral"}>
                  {link.isEnabled ? "Activo" : "Desactivado"}
                </Badge>
              ),
            },
            {
              key: "actions",
              header: "Acciones",
              align: "end",
              width: "90px",
              minWidth: "90px",
              render: (link) => (
                <div className={styles.actionMenu}>
                  <DropdownMenu
                    compact
                    label={`Acciones para ${link.name}`}
                    disabled={sharing.isMutating(`link:${link.id}`)}
                    triggerContent={<MoreIcon />}
                    items={[
                      {
                        label: "Copiar link",
                        icon: <CopyIcon />,
                        onSelect: () => void copyLink(link),
                      },
                      {
                        label: "Abrir link",
                        icon: <OpenIcon />,
                        disabled: !canOpenPublicLink(
                          link,
                          subject.kind === "group" ? true : subject.publiclyAvailable
                        ),
                        onSelect: () => openLink(link),
                      },
                      {
                        label: "Editar límites",
                        icon: <YuniIcon name="clock" />,
                        onSelect: () => onEditLimits(link),
                      },
                      {
                        label: link.isEnabled ? "Desactivar" : "Activar",
                        icon: link.isEnabled ? <DisableIcon /> : <EnableIcon />,
                        onSelect: () => void toggleLink(link, !link.isEnabled),
                      },
                      {
                        label: "Eliminar",
                        icon: <TrashIcon />,
                        tone: "danger",
                        onSelect: () => onDelete(link),
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

function AccessGrantsSection({
  subject,
  sharing,
  onEditLimits,
  onRevoke,
}: {
  subject: ShareableSubject;
  sharing: SharingController;
  onEditLimits: (grant: ApiAccessGrantBase) => void;
  onRevoke: (grant: ApiAccessGrantBase) => void;
}) {
  const toast = useToast();
  const createGrantDialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [createLimitsDraft, setCreateLimitsDraft] =
    useState<InteractionLimitsDraft>(emptyInteractionLimitsDraft);
  const [createLimitErrors, setCreateLimitErrors] = useState<InteractionLimitErrors>(emptyLimitErrors);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateGrantEmail(email);
    setEmailError(validationError);

    if (validationError) return;

    setEmail(normalizeGrantEmail(email));
    setCreateLimitsDraft(emptyInteractionLimitsDraft);
    setCreateLimitErrors(emptyLimitErrors);
    createGrantDialog.current?.showModal();
  }

  async function confirmCreateGrant() {
    const parsedLimits = parseInteractionLimitsDraft(createLimitsDraft);
    setCreateLimitErrors(parsedLimits.errors);
    if (!parsedLimits.isValid) return;

    try {
      await sharing.createGrant(normalizeGrantEmail(email), parsedLimits.limits);
      createGrantDialog.current?.close();
      toast.success(
        `${normalizeGrantEmail(email)} ya tiene acceso al ${subject.kind === "group" ? "grupo" : "avatar"}.`,
        {
          title: "Acceso agregado",
          dedupeKey: `access-grant:${normalizeGrantEmail(email)}:created`,
        }
      );
      setEmail("");
    } catch (error) {
      if (error instanceof ApiClientError && (error.reason === "SELF_ACCESS_GRANT" || error.status === 409)) {
        createGrantDialog.current?.close();
        setEmailError(getAccessGrantCreateError(error, subject.kind));
        return;
      }
      toast.error(getAccessGrantCreateError(error, subject.kind), {
        title: "No pudimos agregar el acceso",
        dedupeKey: `access-grant:${normalizeGrantEmail(email)}:create:error`,
      });
    }
  }

  async function reactivate(grant: ApiAccessGrantBase) {
    try {
      await sharing.setGrantStatus(grant.id, "active");
      toast.success(`Se reactivó el acceso de ${grant.participantEmail}.`, {
        title: "Acceso reactivado",
        dedupeKey: `access-grant:${grant.id}:reactivated`,
      });
    } catch (error) {
      toast.error(getActionError(error), {
        title: "No pudimos reactivar el acceso",
        dedupeKey: `access-grant:${grant.id}:reactivate:error`,
      });
    }
  }

  return (
    <Card padding="md" className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <p className="yuni-eyebrow">Personas con acceso</p>
          <h2 className={styles.sectionTitle}>Compartir con una cuenta</h2>
          <p className={styles.sectionDescription}>
            Si el email todavía no tiene cuenta, el acceso se vinculará al registrarse o iniciar sesión.
          </p>
        </div>
      </div>

      <form className={styles.grantForm} onSubmit={(event) => void submit(event)}>
        <FormField label="Email del participante" htmlFor="access-grant-email" error={emailError}>
          <Input
            id="access-grant-email"
            type="email"
            value={email}
            placeholder="participante@ejemplo.com"
            autoComplete="email"
            invalid={Boolean(emailError)}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            onBlur={() => {
              if (email) setEmail(normalizeGrantEmail(email));
            }}
          />
        </FormField>
        <Button type="submit">Continuar</Button>
      </form>

      <Dialog
        ref={createGrantDialog}
        className={styles.limitsDialog}
        title="Configurar acceso"
        description={`Definí cuánto puede usar ${normalizeGrantEmail(email)}. Los campos vacíos quedan ilimitados.`}
        closeLabel="Cancelar"
        footer={
          <Button loading={sharing.isMutating("grant:create")} onClick={() => void confirmCreateGrant()}>
            Dar acceso
          </Button>
        }
        onClose={() => {
          setCreateLimitErrors(emptyLimitErrors);
        }}
      >
        <InteractionLimitsFields
          idPrefix="create-grant-limits"
          draft={createLimitsDraft}
          errors={createLimitErrors}
          onChange={(field, value) => setCreateLimitsDraft((current) => ({ ...current, [field]: value }))}
        />
      </Dialog>

      {sharing.grants.status === "loading" && sharing.grants.data.length === 0 ? (
        <LoadingState title="Cargando accesos" description="Buscando personas con acceso." />
      ) : sharing.grants.status === "error" && sharing.grants.data.length === 0 ? (
        <ErrorState
          title="No pudimos cargar los accesos"
          description={sharing.grants.error}
          action={
            <Button variant="secondary" onClick={() => void sharing.retryGrants()}>
              Reintentar
            </Button>
          }
        />
      ) : sharing.grants.data.length === 0 ? (
        <EmptyState
          title={`Todavía no compartiste este ${subject.kind === "group" ? "grupo" : "avatar"} con cuentas`}
          description="Agregá un email para preparar o habilitar su acceso."
        />
      ) : (
        <DataList
          ariaLabel="Personas con acceso"
          items={sharing.grants.data}
          getRowKey={(grant) => grant.id}
          columns={[
            {
              key: "participant",
              header: "Participante",
              width: "auto",
              minWidth: "280px",
              render: (grant) => (
                <div className={styles.itemSummary}>
                  <strong>{grant.participantEmail}</strong>
                  <small>{formatInteractionLimitsSummary(grant.limits)}</small>
                </div>
              ),
            },
            {
              key: "status",
              header: "Estado",
              align: "center",
              width: "180px",
              minWidth: "180px",
              render: (grant) => {
                const presentation = getAccessGrantPresentation(grant.state);
                return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
              },
            },
            {
              key: "actions",
              header: "Acciones",
              align: "end",
              width: "90px",
              minWidth: "90px",
              render: (grant) => (
                <div className={styles.actionMenu}>
                  <DropdownMenu
                    compact
                    label={`Acciones para ${grant.participantEmail}`}
                    disabled={sharing.isMutating(`grant:${grant.id}`)}
                    triggerContent={<MoreIcon />}
                    items={[
                      {
                        label: "Editar límites",
                        icon: <YuniIcon name="clock" />,
                        onSelect: () => onEditLimits(grant),
                      },
                      grant.state === "revoked"
                        ? {
                            label: "Reactivar acceso",
                            icon: <EnableIcon />,
                            onSelect: () => void reactivate(grant),
                          }
                        : {
                            label: "Revocar acceso",
                            icon: <DisableIcon />,
                            onSelect: () => onRevoke(grant),
                          },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

function getActionError(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar la acción.";
}

function getConfirmationTitle(confirmation: Confirmation | null) {
  if (confirmation?.kind === "delete-link") return "Eliminar link público";
  return "Revocar acceso";
}

function getConfirmationDescription(
  confirmation: Confirmation | null,
  subject: ShareableSubject["kind"] = "avatar"
) {
  if (!confirmation) return "";
  if (confirmation.kind === "delete-link") {
    return `El link “${confirmation.label}” dejará de existir definitivamente.`;
  }
  return `${confirmation.label} dejará de ver este ${subject === "group" ? "grupo" : "avatar"} inmediatamente. Podrás reactivar el acceso después.`;
}

function getConfirmationActionLabel(confirmation: Confirmation | null) {
  return confirmation?.kind === "delete-link" ? "Eliminar" : "Revocar";
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="m19 5-9 9" />
      <path d="M18 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

function EnableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function DisableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A9.3 9.3 0 0 1 12 6c6 0 9.5 6 9.5 6a15.8 15.8 0 0 1-2.1 2.8" />
      <path d="M6.2 6.3A16.4 16.4 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.2-.6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m6 7 1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}
