"use client";

import type { ApiAvatar } from "../../lib/api/avatar-api";
import { useAvatarSharing } from "../../hooks/useAvatarSharing";
import { ResourceSharePanel } from "../sharing/ResourceSharePanel";

export function AvatarShareTab({ avatar }: { avatar: ApiAvatar }) {
  const sharing = useAvatarSharing(avatar.id);

  return (
    <ResourceSharePanel
      subject={{
        kind: "avatar",
        id: avatar.id,
        name: avatar.name,
        publicPrefix: "/a/",
        publiclyAvailable: avatar.status === "active",
      }}
      sharing={sharing}
    />
  );
}
