"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  YuniIcon,
  useToast,
} from "@yuni/ui";
import { useAvatarList } from "../../hooks/useAvatarList";
import type { ApiAvatarSummary } from "../../lib/api/avatar-api";
import {
  createAvatarGroup,
  deleteAvatarGroup,
  listAvatarGroups,
  updateAvatarGroup,
  type ApiAvatarGroup,
} from "../../lib/api/avatar-group-api";
import catalogStyles from "../catalog/CatalogGrid.module.css";
import { GroupCard } from "./GroupCard";
import styles from "./GroupsHub.module.css";

type LoadStatus = "loading" | "ready" | "error";

export function GroupsHub() {
  const router = useRouter();
  const toast = useToast();
  const avatarList = useAvatarList();
  const groupDialog = useRef<HTMLDialogElement>(null);
  const [groups, setGroups] = useState<ApiAvatarGroup[]>([]);
  const [groupStatus, setGroupStatus] = useState<LoadStatus>("loading");
  const [pageError, setPageError] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<ApiAvatarGroup | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadGroups() {
    setGroupStatus("loading");
    try {
      const response = await listAvatarGroups();
      setGroups(response.groups);
      setPageError(null);
      setGroupStatus("ready");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "No pudimos cargar tus grupos.");
      setGroupStatus("error");
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  const eligibleAvatars =
    avatarList.status === "ready"
      ? avatarList.avatars.filter(
          (avatar) => avatar.status === "active" && avatar.interactionAvailability === "ready"
        )
      : [];

  function openCreate() {
    setEditingGroup(null);
    setName("");
    setSelected([]);
    groupDialog.current?.showModal();
  }

  function openEdit(group: ApiAvatarGroup) {
    setEditingGroup(group);
    setName(group.name);
    setSelected(group.members.map((member) => member.id));
    groupDialog.current?.showModal();
  }

  function toggleAvatar(avatarId: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? current.length < 3
          ? [...current, avatarId]
          : current
        : current.filter((id) => id !== avatarId)
    );
  }

  async function saveGroup() {
    if (!name.trim() || selected.length < 2 || selected.length > 3 || saving) return;
    setSaving(true);
    try {
      const { group } = editingGroup
        ? await updateAvatarGroup(editingGroup.id, { name: name.trim(), avatarIds: selected })
        : await createAvatarGroup({ name: name.trim(), avatarIds: selected });
      setGroups((current) =>
        editingGroup ? current.map((item) => (item.id === group.id ? group : item)) : [group, ...current]
      );
      groupDialog.current?.close();
      toast.success(`${group.name} quedó listo para interactuar.`, {
        title: editingGroup ? "Grupo actualizado" : "Grupo creado",
        dedupeKey: `group:${group.id}:saved`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Intentá nuevamente.", {
        title: editingGroup ? "No pudimos actualizar el grupo" : "No pudimos crear el grupo",
        dedupeKey: editingGroup ? `group:${editingGroup.id}:save:error` : "group:create:error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(group: ApiAvatarGroup) {
    if (!window.confirm(`¿Eliminar el grupo “${group.name}”? El historial guardado se conservará.`)) {
      return;
    }
    try {
      await deleteAvatarGroup(group.id);
      setGroups((current) => current.filter((item) => item.id !== group.id));
      toast.success(`${group.name} fue eliminado.`, {
        title: "Grupo eliminado",
        dedupeKey: `group:${group.id}:deleted`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Intentá nuevamente.", {
        title: "No pudimos eliminar el grupo",
        dedupeKey: `group:${group.id}:delete:error`,
      });
    }
  }

  return (
    <div className={catalogStyles.layout}>
      <div className={styles.mobileHeader}>
        <PageHeader
          eyebrow="Mis grupos"
          title="Mis grupos"
          description="Administrá grupos de dos o tres avatares y conversá con todos en una misma llamada."
          actions={
            <Button icon={<YuniIcon name="add" />} onClick={openCreate}>
              Crear grupo
            </Button>
          }
        />
      </div>

      {groupStatus === "loading" ? (
        <LoadingState title="Cargando grupos" description="Estamos preparando tu lista." />
      ) : groupStatus === "error" ? (
        <ErrorState
          title="No pudimos cargar Mis grupos"
          description={pageError ?? "Intentá nuevamente."}
          action={<Button onClick={() => void loadGroups()}>Reintentar</Button>}
        />
      ) : groups.length === 0 ? (
        <Card padding="lg" className={catalogStyles.emptyCard}>
          <EmptyState
            title="Todavía no tenés grupos"
            description="Creá un grupo con dos o tres avatares para iniciar una conversación coordinada."
            action={
              <Button icon={<YuniIcon name="add" />} onClick={openCreate}>
                Crear grupo
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={catalogStyles.grid}>
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onNavigate={(href) => router.push(href)}
              onEdit={() => openEdit(group)}
              onDelete={() => void removeGroup(group)}
            />
          ))}
        </div>
      )}

      <Dialog
        ref={groupDialog}
        title={editingGroup ? "Editar grupo" : "Crear grupo"}
        description="Elegí dos o tres avatares. El orden seleccionado define su posición en la llamada."
        footer={
          <Button
            loading={saving}
            disabled={!name.trim() || selected.length < 2 || selected.length > 3}
            onClick={() => void saveGroup()}
          >
            {editingGroup ? "Guardar cambios" : "Crear grupo"}
          </Button>
        }
      >
        <div className={styles.groupForm}>
          <label htmlFor="group-name">
            <span>Nombre del grupo</span>
            <Input
              id="group-name"
              value={name}
              maxLength={80}
              placeholder="Ej. Consejo de producto"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Participantes</legend>
            <div className={styles.selectorSummary}>
              <p className={styles.formHint}>Elegí dos o tres avatares</p>
              <span className={styles.selectionCount} aria-live="polite">
                {selected.length} de 3
              </span>
            </div>
            {avatarList.status === "loading" ? (
              <p className="yuni-text-muted">Cargando avatares disponibles…</p>
            ) : avatarList.status === "error" ? (
              <p className={styles.inlineError} role="alert">
                {avatarList.error}
              </p>
            ) : eligibleAvatars.length === 0 ? (
              <div className={styles.noAvatars}>
                <p>No hay avatares activos listos para agregar.</p>
                <Button variant="secondary" onClick={() => router.push("/avatars/new")}>
                  Crear avatar
                </Button>
              </div>
            ) : (
              <div className={styles.avatarOptions}>
                {eligibleAvatars.map((avatar) => {
                  const selectionIndex = selected.indexOf(avatar.id);
                  const isSelected = selectionIndex >= 0;

                  return (
                    <AvatarSelectionOption
                      key={avatar.id}
                      avatar={avatar}
                      selectionOrder={isSelected ? selectionIndex + 1 : null}
                      disabled={!isSelected && selected.length >= 3}
                      onToggle={(checked) => toggleAvatar(avatar.id, checked)}
                    />
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>
      </Dialog>
    </div>
  );
}

function AvatarSelectionOption({
  avatar,
  selectionOrder,
  disabled,
  onToggle,
}: {
  avatar: Pick<ApiAvatarSummary, "id" | "name" | "thumbnailUrl" | "access">;
  selectionOrder: number | null;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const showThumbnail = Boolean(avatar.thumbnailUrl && failedThumbnailUrl !== avatar.thumbnailUrl);

  return (
    <label className={styles.avatarOption} data-selected={selectionOrder !== null} data-disabled={disabled}>
      <input
        className={styles.avatarOptionInput}
        type="checkbox"
        checked={selectionOrder !== null}
        disabled={disabled}
        onChange={(event) => onToggle(event.target.checked)}
      />

      <span className={styles.optionArtwork} aria-hidden="true">
        {showThumbnail && avatar.thumbnailUrl ? (
          <img src={avatar.thumbnailUrl} alt="" onError={() => setFailedThumbnailUrl(avatar.thumbnailUrl)} />
        ) : (
          <span>{initials(avatar.name)}</span>
        )}
      </span>

      <span className={styles.avatarOptionCopy}>
        <strong>{avatar.name}</strong>
        <small>{avatar.access.type === "shared" ? "Compartido conmigo" : "Propio"}</small>
      </span>

      <span className={styles.selectionMark} aria-hidden="true">
        {selectionOrder ?? ""}
      </span>
    </label>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("es");
  return (parts[0]?.slice(0, 2) || "AV").toLocaleUpperCase("es");
}
