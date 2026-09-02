import { describe, expect, it, vi } from "vitest";
import { createAvatarGroupActivityRepository } from "./repositories/avatar-group-activity-repository";

describe("avatar group Activity participant identity", () => {
  it("keeps public activity whose declared email matches the owner email", async () => {
    const occurredAt = new Date("2030-01-01T00:00:00.000Z");
    const repository = createAvatarGroupActivityRepository({
      avatarGroup: {
        findFirst: vi.fn(async () => ({ id: "group-1", name: "Consejo", deletedAt: null })),
      },
      groupAccessGrant: { findMany: vi.fn(async () => []) },
      conversation: {
        groupBy: vi.fn(async () => [
          {
            participantEmail: "owner@example.com",
            visibility: "public",
            _count: { id: 1 },
            _max: { createdAt: occurredAt, lastMessageAt: occurredAt },
          },
        ]),
      },
      groupPublicSession: {
        findMany: vi.fn(async () => [
          {
            participantEmail: "owner@example.com",
            participantUser: { name: "Nombre declarado" },
          },
        ]),
      },
    } as never);

    const result = await repository.listParticipants("owner-1", "group-1");

    expect(result.participants).toEqual([
      expect.objectContaining({
        participantEmail: "owner@example.com",
        participantName: "Nombre declarado",
        origins: ["public_link"],
        totalConversations: 1,
      }),
    ]);
  });
});
