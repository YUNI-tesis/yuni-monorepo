import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupCard } from "./components/groups/GroupCard";
import type { ApiAvatarGroup } from "./lib/api/avatar-group-api";

const group: ApiAvatarGroup = {
  id: "group-1",
  name: "Equipo docente",
  createdAt: "2026-08-18T10:00:00.000Z",
  updatedAt: "2026-08-18T11:00:00.000Z",
  access: {
    type: "owner",
    canEdit: true,
    canDelete: true,
    canShare: false,
    canInteract: true,
    limits: null,
    consent: null,
  },
  interactionAvailability: { status: "ready", readyMembers: 2, totalMembers: 2 },
  sharingEligibility: { status: "blocked", reason: "contains_non_owned_members" },
  sharingChannels: { account: true, public: true },
  activityEnabled: true,
  membershipVersion: 1,
  hasActiveSharingChannels: false,
  members: [
    {
      id: "avatar-1",
      name: "Juana Balance",
      description: "Contabilidad",
      thumbnailUrl: "https://cdn.yuni.test/juana.webp",
      viewerAccess: "owned",
      accessType: "owner",
      position: 0,
      available: true,
    },
    {
      id: "avatar-2",
      name: "Juan Gutiérrez",
      description: "Inversiones",
      thumbnailUrl: null,
      viewerAccess: "direct_grant",
      accessType: "shared",
      position: 1,
      available: true,
    },
  ],
};

describe("GroupCard", () => {
  it("uses the catalog card language with a participant mosaic", () => {
    const html = renderToStaticMarkup(
      createElement(GroupCard, {
        group,
        onNavigate: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      })
    );

    expect(html).toContain('href="/groups/group-1"');
    expect(html).toContain("Listo para interactuar");
    expect(html).toContain("Interactuar");
    expect(html).toContain("2 participantes");
    expect(html).toContain("Solo se pueden compartir grupos formados por avatares propios");
    expect(html).toContain("Juana Balance · Juan Gutiérrez");
    expect(html).toContain('data-count="2"');
    expect(html).toContain('aria-label="Más acciones para Equipo docente"');
    expect(html).not.toContain("data-mobile-layout");
  });

  it("does not advertise Activity when the analytics capability is disabled", () => {
    const html = renderToStaticMarkup(
      createElement(GroupCard, {
        group: { ...group, activityEnabled: false },
        onNavigate: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      })
    );

    expect(html).not.toContain("Ver actividad");
  });
});
