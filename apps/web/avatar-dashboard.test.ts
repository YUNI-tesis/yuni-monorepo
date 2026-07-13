import { describe, expect, it } from "vitest";
import {
  avatarListFilters,
  filterAvatarsByOwnership,
  formatAvatarStatusLabel,
  formatProviderSyncLabel,
  getAvatarDashboardSummary,
  getRecentAvatars,
} from "./lib/avatar-dashboard";
import type { ApiAvatar } from "./lib/api/avatar-api";

function createAvatar(overrides: Partial<ApiAvatar>): ApiAvatar {
  return {
    id: "avatar-1",
    name: "Avatar",
    description: "",
    instructions: "",
    context: "",
    voiceConfig: {},
    liveAvatarConfig: {},
    agentProvider: "elevenlabs_agents",
    providerAgentId: null,
    providerSyncStatus: "not_synced",
    providerSyncError: null,
    providerSyncedAt: null,
    providerSyncFingerprint: null,
    status: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("avatar dashboard helpers", () => {
  it("summarizes avatar counts for dashboard metrics", () => {
    const avatars = [
      createAvatar({ id: "active-synced", providerSyncStatus: "synced", status: "active" }),
      createAvatar({ id: "draft-pending", providerSyncStatus: "not_synced", status: "draft" }),
      createAvatar({ id: "active-failed", providerSyncStatus: "failed", status: "active" }),
    ];

    expect(getAvatarDashboardSummary(avatars)).toEqual({
      total: 3,
      active: 2,
      needsSync: 1,
      failedSync: 1,
    });
  });

  it("sorts recent avatars by updatedAt descending", () => {
    const avatars = [
      createAvatar({ id: "older", updatedAt: "2026-06-01T00:00:00.000Z" }),
      createAvatar({ id: "newer", updatedAt: "2026-06-03T00:00:00.000Z" }),
      createAvatar({ id: "middle", updatedAt: "2026-06-02T00:00:00.000Z" }),
    ];

    expect(getRecentAvatars(avatars, 2).map((avatar) => avatar.id)).toEqual(["newer", "middle"]);
  });

  it("formats user-facing status labels", () => {
    expect(formatAvatarStatusLabel("active")).toBe("Activo");
    expect(formatAvatarStatusLabel("draft")).toBe("Borrador");
    expect(formatAvatarStatusLabel("disabled")).toBe("Desactivado");
    expect(formatProviderSyncLabel("synced")).toBe("Sincronizado");
    expect(formatProviderSyncLabel("failed")).toBe("Requiere revision");
    expect(formatProviderSyncLabel("not_synced")).toBe("Pendiente");
  });

  it("filters the current avatar list for owned and future shared views", () => {
    const avatars = [createAvatar({ id: "avatar-1" }), createAvatar({ id: "avatar-2" })];

    expect(filterAvatarsByOwnership(avatars, "all").map((avatar) => avatar.id)).toEqual(["avatar-1", "avatar-2"]);
    expect(filterAvatarsByOwnership(avatars, "owned").map((avatar) => avatar.id)).toEqual(["avatar-1", "avatar-2"]);
    expect(filterAvatarsByOwnership(avatars, "shared")).toEqual([]);
  });

  it("exposes the Mis avatares filter labels", () => {
    expect(avatarListFilters.map((filter) => filter.label)).toEqual(["Todos", "Propios", "Compartidos conmigo"]);
  });
});
