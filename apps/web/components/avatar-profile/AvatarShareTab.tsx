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
} from "@yuni/ui";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import type { ApiAccessGrant, ApiInteractionLimits, ApiShareLink } from "../../lib/api/sharing-api";
import { ApiClientError } from "../../lib/api/http-client";
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
import { useAvatarSharing } from "../../hooks/useAvatarSharing";
import { InteractionLimitsFields, type InteractionLimitErrors } from "./InteractionLimitsFields";
import styles from "./AvatarShareTab.module.css";

type Confirmation =
  | { kind: "delete-link"; id: string; label: string }
  | { kind: "revoke-grant"; id: string; label: string }
  | { kind: "delete-grant"; id: string; label: string };

type LimitsEditor = {
  kind: "link" | "grant";
  id: string;
  label: string;
  limits: ApiInteractionLimits;
};

const emptyLimitErrors: InteractionLimitErrors = {
  sessionDuration: null,
  sessionDurationUnit: null,
  maxSessionsPer24Hours: null,
};

export function AvatarShareTab({ avatar }: { avatar: ApiAvatar }) {
  const sharing = useAvatarSharing(avatar.id);
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const limitsDialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [limitsEditor, setLimitsEditor] = useState<LimitsEditor | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<InteractionLimitsDraft>(emptyInteractionLimitsDraft);
  const [limitErrors, setLimitErrors] = useState<InteractionLimitErrors>(emptyLimitErrors);

  function requestConfirmation(nextConfirmation: Confirmation) {
    setConfirmation(nextConfirmation);
    setDialogError(null);
    confirmationDialog.current?.showModal();
  }

  async function confirmAction() {
    if (!confirmation) return;

    setDialogError(null);

    try {
      if (confirmation.kind === "delete-link") {
        await sharing.removeLink(confirmation.id);
        setFeedback("El link público fue eliminado.");
      } else if (confirmation.kind === "revoke-grant") {
        await sharing.setGrantStatus(confirmation.id, "revoked");
        setFeedback(`Se revocó el acceso de ${confirmation.label}.`);
      } else {
        const outcome = await sharing.removeGrant(confirmation.id);
        setFeedback(
          outcome === "deleted"
            ? `Se eliminó definitivamente el acceso de ${confirmation.label}.`
            : `Se revocó el acceso de ${confirmation.label} para conservar su historial.`
        );
      }

      confirmationDialog.current?.close();
      setConfirmation(null);
    } catch (error) {
      setDialogError(getActionError(error));
    }
  }

  function openLimitsEditor(editor: LimitsEditor) {
    setLimitsEditor(editor);
    setLimitsDraft(interactionLimitsToDraft(editor.limits));
    setLimitErrors(emptyLimitErrors);
    setDialogError(null);
    limitsDialog.current?.showModal();
  }

  async function saveLimits() {
    if (!limitsEditor) return;
    const parsed = parseInteractionLimitsDraft(limitsDraft);
    setLimitErrors(parsed.errors);
    setDialogError(null);
    if (!parsed.isValid) return;

    try {
      if (limitsEditor.kind === "link") {
        await sharing.updateLinkLimits(limitsEditor.id, parsed.limits);
      } else {
        await sharing.updateGrantLimits(limitsEditor.id, parsed.limits);
      }
      limitsDialog.current?.close();
      setFeedback(`Se actualizaron los límites de ${limitsEditor.label}.`);
      setLimitsEditor(null);
    } catch (error) {
      setDialogError(getActionError(error));
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.privacyNotice}>
        <strong>Privacidad de los usos compartidos</strong>
        <p>
          El creador puede consultar en Actividad las conversaciones y transcripts asociados a cada
          participante.
        </p>
      </aside>

      <ShareLinksSection
        avatar={avatar}
        sharing={sharing}
        onFeedback={setFeedback}
        onEditLimits={(link) =>
          openLimitsEditor({ kind: "link", id: link.id, label: link.name, limits: link.limits })
        }
        onDelete={(link) => requestConfirmation({ kind: "delete-link", id: link.id, label: link.name })}
      />

      <AccessGrantsSection
        sharing={sharing}
        onFeedback={setFeedback}
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
        onDelete={(grant) =>
          requestConfirmation({
            kind: "delete-grant",
            id: grant.id,
            label: grant.participantEmail,
          })
        }
      />

      <p className={styles.feedback} aria-live="polite">
        {feedback}
      </p>

      <Dialog
        ref={confirmationDialog}
        title={getConfirmationTitle(confirmation)}
        description={getConfirmationDescription(confirmation)}
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
          setDialogError(null);
        }}
      >
        {dialogError ? (
          <p className={styles.formError} role="alert">
            {dialogError}
          </p>
        ) : null}
      </Dialog>

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
          setDialogError(null);
          setLimitErrors(emptyLimitErrors);
        }}
      >
        <InteractionLimitsFields
          idPrefix="edit-limits"
          draft={limitsDraft}
          errors={limitErrors}
          onChange={(field, value) => setLimitsDraft((current) => ({ ...current, [field]: value }))}
        />
        {dialogError ? (
          <p className={styles.formError} role="alert">
            {dialogError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

function ShareLinksSection({
  avatar,
  sharing,
  onFeedback,
  onEditLimits,
  onDelete,
}: {
  avatar: ApiAvatar;
  sharing: ReturnType<typeof useAvatarSharing>;
  onFeedback: (message: string) => void;
  onEditLimits: (link: ApiShareLink) => void;
  onDelete: (link: ApiShareLink) => void;
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState(avatar.name);
  const [slug, setSlug] = useState(() => toPublicSlug(avatar.name));
  const [slugWasEdited, setSlugWasEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({
    name: null as string | null,
    slug: null as string | null,
  });
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<InteractionLimitsDraft>(emptyInteractionLimitsDraft);
  const [limitErrors, setLimitErrors] = useState<InteractionLimitErrors>(emptyLimitErrors);

  function openForm() {
    setName(avatar.name);
    setSlug(toPublicSlug(avatar.name));
    setSlugWasEdited(false);
    setFieldErrors({ name: null, slug: null });
    setFormError(null);
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
    setFormError(null);

    if (errors.name || errors.slug || !parsedLimits.isValid) return;

    try {
      await sharing.createLink({
        name: name.trim(),
        slug: slug.trim(),
        isEnabled: true,
        limits: parsedLimits.limits,
      });
      setIsFormOpen(false);
      onFeedback("El link público fue creado.");
    } catch (error) {
      setFormError(
        error instanceof ApiClientError && error.status === 409
          ? "Ese slug ya está en uso. Elegí otro."
          : getActionError(error)
      );
    }
  }

  async function copyLink(link: ApiShareLink) {
    try {
      await navigator.clipboard.writeText(link.publicUrl);
      setCopyStatus(`Link copiado: ${link.name}.`);
    } catch {
      setCopyStatus("No pudimos copiar el link. Copialo manualmente desde la URL.");
    }
  }

  async function toggleLink(link: ApiShareLink, isEnabled: boolean) {
    try {
      await sharing.setLinkEnabled(link, isEnabled);
      onFeedback(isEnabled ? "El link quedó activo." : "El link quedó desactivado.");
    } catch (error) {
      onFeedback(getActionError(error));
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
                if (!slugWasEdited) setSlug(toPublicSlug(nextName));
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
              <span>/a/</span>
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
          {formError ? (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {avatar.status !== "active" ? (
        <p className={styles.availabilityNote}>
          Podés preparar y copiar links ahora. La página pública estará disponible cuando el avatar esté
          activo.
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
          description="Creá uno para compartir una vista pública segura del avatar."
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
                        disabled: !canOpenPublicLink(link, avatar.status),
                        onSelect: () => window.open(link.publicUrl, "_blank", "noopener,noreferrer"),
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

      <p className={styles.feedback} aria-live="polite">
        {copyStatus}
      </p>
    </Card>
  );
}

function AccessGrantsSection({
  sharing,
  onFeedback,
  onEditLimits,
  onRevoke,
  onDelete,
}: {
  sharing: ReturnType<typeof useAvatarSharing>;
  onFeedback: (message: string) => void;
  onEditLimits: (grant: ApiAccessGrant) => void;
  onRevoke: (grant: ApiAccessGrant) => void;
  onDelete: (grant: ApiAccessGrant) => void;
}) {
  const createGrantDialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [createLimitsDraft, setCreateLimitsDraft] =
    useState<InteractionLimitsDraft>(emptyInteractionLimitsDraft);
  const [createLimitErrors, setCreateLimitErrors] = useState<InteractionLimitErrors>(emptyLimitErrors);
  const [createDialogError, setCreateDialogError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateGrantEmail(email);
    setEmailError(validationError);

    if (validationError) return;

    setEmail(normalizeGrantEmail(email));
    setCreateLimitsDraft(emptyInteractionLimitsDraft);
    setCreateLimitErrors(emptyLimitErrors);
    setCreateDialogError(null);
    createGrantDialog.current?.showModal();
  }

  async function confirmCreateGrant() {
    const parsedLimits = parseInteractionLimitsDraft(createLimitsDraft);
    setCreateLimitErrors(parsedLimits.errors);
    setCreateDialogError(null);
    if (!parsedLimits.isValid) return;

    try {
      await sharing.createGrant(normalizeGrantEmail(email), parsedLimits.limits);
      createGrantDialog.current?.close();
      setEmail("");
      onFeedback("El acceso fue agregado.");
    } catch (error) {
      setCreateDialogError(getAccessGrantCreateError(error));
    }
  }

  async function reactivate(grant: ApiAccessGrant) {
    try {
      await sharing.setGrantStatus(grant.id, "active");
      onFeedback(`Se reactivó el acceso de ${grant.participantEmail}.`);
    } catch (error) {
      onFeedback(getActionError(error));
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
            onChange={(event) => setEmail(event.target.value)}
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
          setCreateDialogError(null);
          setCreateLimitErrors(emptyLimitErrors);
        }}
      >
        <InteractionLimitsFields
          idPrefix="create-grant-limits"
          draft={createLimitsDraft}
          errors={createLimitErrors}
          onChange={(field, value) => setCreateLimitsDraft((current) => ({ ...current, [field]: value }))}
        />
        {createDialogError ? (
          <p className={styles.formError} role="alert">
            {createDialogError}
          </p>
        ) : null}
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
          title="Todavía no compartiste este avatar con cuentas"
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
                      {
                        label: "Eliminar",
                        icon: <TrashIcon />,
                        tone: "danger",
                        onSelect: () => onDelete(grant),
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
  if (confirmation?.kind === "revoke-grant") return "Revocar acceso";
  return "Eliminar acceso";
}

function getConfirmationDescription(confirmation: Confirmation | null) {
  if (!confirmation) return "";
  if (confirmation.kind === "delete-link") {
    return `El link “${confirmation.label}” dejará de existir definitivamente.`;
  }
  if (confirmation.kind === "revoke-grant") {
    return `${confirmation.label} dejará de ver este avatar inmediatamente. Podrás reactivar el acceso después.`;
  }
  return `El acceso de ${confirmation.label} se eliminará definitivamente si no tiene actividad. Si ya tiene historial, se revocará para conservar la trazabilidad.`;
}

function getConfirmationActionLabel(confirmation: Confirmation | null) {
  return confirmation?.kind === "revoke-grant" ? "Revocar" : "Eliminar";
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
