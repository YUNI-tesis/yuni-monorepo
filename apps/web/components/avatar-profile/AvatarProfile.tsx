"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { Badge, Button, ErrorState, LoadingState, Tabs, YuniIcon } from "@yuni/ui";
import { useAvatarProfile } from "../../hooks/useAvatarProfile";
import { useLiveAvatarOptions } from "../../hooks/useLiveAvatarOptions";
import type { ApiAvatar } from "../../lib/api/avatar-api";
import type { ApiLiveAvatarOption } from "../../lib/api/live-avatar-api";
import { AvatarActivityTab } from "./AvatarActivityTab";
import { AvatarContextTab } from "./AvatarContextTab";
import { AvatarInfoTab } from "./AvatarInfoTab";
import { AvatarShareTab } from "./AvatarShareTab";
import {
  avatarProfileTabs,
  getAvatarHeaderState,
  getLiveAvatarSummary,
  resolveAvatarProfileTab,
} from "./formatters";
import styles from "./AvatarProfile.module.css";

type AvatarThumbnail = Pick<ApiLiveAvatarOption, "displayName" | "thumbnailUrl"> | null;

export function AvatarProfile({ avatarId }: { avatarId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const profile = useAvatarProfile(avatarId);
  const activeTab = resolveAvatarProfileTab(searchParams.get("tab"));
  const readyAvatar = profile.status === "ready" ? profile.avatar : null;
  const liveAvatar = readyAvatar ? getLiveAvatarSummary(readyAvatar) : null;
  const shouldResolveLiveAvatar = Boolean(liveAvatar?.avatarId && !liveAvatar.hasVisualSnapshot);
  const liveAvatarOptions = useLiveAvatarOptions({ enabled: shouldResolveLiveAvatar });

  if (profile.status === "loading") {
    return <LoadingState title="Cargando avatar" description="Estamos preparando el perfil." />;
  }

  if (profile.status === "not-found") {
    return (
      <ErrorState
        title="No encontramos este avatar"
        description={profile.error}
        action={
          <Button className={styles.notFoundAction} onClick={() => router.push("/avatars")}>
            Volver a Mis avatares
          </Button>
        }
      />
    );
  }

  if (profile.status === "error") {
    return <ErrorState title="No pudimos cargar el perfil" description={profile.error} />;
  }

  const avatar = profile.avatar;

  if (!avatar) {
    return null;
  }

  const resolvedLiveAvatar =
    liveAvatarOptions.options.find((option) => option.id === liveAvatar?.avatarId) ?? null;
  const selectedLiveAvatar = getSelectedLiveAvatar(
    liveAvatar ?? getLiveAvatarSummary(avatar),
    resolvedLiveAvatar
  );

  function onTabChange(value: string) {
    const tab = resolveAvatarProfileTab(value);
    const nextParams = new URLSearchParams(searchParams.toString());

    if (tab === "info") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", tab);
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className={styles.profile}>
      <AvatarProfileHeader
        avatar={avatar}
        visual={selectedLiveAvatar}
        onBack={() => router.push("/avatars")}
        onEdit={() => router.push(`/avatars/${avatar.id}/edit`)}
        onInteract={() => router.push(`/interact/${avatar.id}`)}
      />

      <section className={styles.tabsSurface} aria-label="Secciones del perfil">
        <Tabs
          aria-label="Secciones del perfil del avatar"
          value={activeTab}
          onValueChange={onTabChange}
          items={avatarProfileTabs.map((tab) => ({
            value: tab.value,
            label: tab.label,
            content:
              tab.value === "info" ? (
                <AvatarInfoTab avatar={avatar} />
              ) : tab.value === "contexto" ? (
                <AvatarContextTab
                  avatar={avatar}
                  onEditContext={() => router.push(`/avatars/${avatar.id}/edit`)}
                />
              ) : tab.value === "compartir" ? (
                <AvatarShareTab avatar={avatar} />
              ) : (
                <AvatarActivityTab avatarId={avatar.id} />
              ),
          }))}
        />
      </section>
    </div>
  );
}

export function AvatarProfileHeader({
  avatar,
  visual,
  onBack,
  onEdit,
  onInteract,
}: {
  avatar: ApiAvatar;
  visual: AvatarThumbnail;
  onBack: () => void;
  onEdit: () => void;
  onInteract: () => void;
}) {
  const headerState = getAvatarHeaderState(avatar);

  return (
    <section className={styles.hero} aria-labelledby="avatar-profile-title">
      <Button
        className={styles.backButton}
        variant="ghost"
        icon={<YuniIcon name="arrowLeft" />}
        onClick={onBack}
      >
        Mis avatares
      </Button>

      <div className={styles.profileHeader}>
        <AvatarThumbnail avatarName={avatar.name} visual={visual} />

        <div className={styles.identity}>
          <Badge tone={headerState.tone}>{headerState.label}</Badge>
          <h1 id="avatar-profile-title">{avatar.name}</h1>
          <p>{avatar.description || "Sin descripción."}</p>
        </div>

        <div className={styles.actions} aria-label="Acciones del avatar">
          <Button variant="secondary" icon={<YuniIcon name="edit" />} onClick={onEdit}>
            Editar
          </Button>
          <Button icon={<YuniIcon name="call" />} onClick={onInteract}>
            Interactuar
          </Button>
        </div>
      </div>
    </section>
  );
}

function getSelectedLiveAvatar(
  liveAvatar: ReturnType<typeof getLiveAvatarSummary>,
  resolvedLiveAvatar: ApiLiveAvatarOption | null
): AvatarThumbnail {
  if (liveAvatar.hasVisualSnapshot) {
    return {
      displayName: liveAvatar.selectedAvatar,
      thumbnailUrl: liveAvatar.thumbnailUrl,
    };
  }

  return resolvedLiveAvatar
    ? {
        displayName: resolvedLiveAvatar.displayName,
        thumbnailUrl: resolvedLiveAvatar.thumbnailUrl,
      }
    : null;
}

function AvatarThumbnail({ avatarName, visual }: { avatarName: string; visual: AvatarThumbnail }) {
  const initial = avatarName.trim().slice(0, 1).toUpperCase() || "A";
  const thumbnailUrl = visual?.thumbnailUrl ?? null;
  const visualName = visual?.displayName ?? avatarName;
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);

  if (thumbnailUrl && failedThumbnailUrl !== thumbnailUrl) {
    return (
      <div className={styles.avatarThumbnail}>
        <img
          className={styles.avatarImage}
          src={thumbnailUrl}
          alt={`Avatar visual de ${avatarName}: ${visualName}`}
          width={128}
          height={128}
          onError={() => setFailedThumbnailUrl(thumbnailUrl)}
        />
      </div>
    );
  }

  return (
    <div
      className={styles.avatarThumbnail}
      role="img"
      aria-label={`Avatar de ${avatarName} sin vista previa`}
    >
      <span className={styles.avatarMonogram} aria-hidden="true">
        {initial}
      </span>
    </div>
  );
}
