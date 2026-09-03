import { describe, expect, it, vi } from "vitest";
import {
  countActiveExternalSessionsForAvatar,
  countActiveExternalSessionsForParticipant,
  lockExternalParticipant,
} from "./repositories/external-session-capacity";

describe("external session capacity", () => {
  it("uses one normalized advisory lock identity for every external channel", async () => {
    const queryRaw = vi.fn(async (_query: unknown) => []);

    await expect(
      lockExternalParticipant({ $queryRaw: queryRaw } as never, "  Person@Example.COM ")
    ).resolves.toBe("person@example.com");

    const query = queryRaw.mock.calls[0]?.[0] as unknown as { values: unknown[] };
    expect(query.values).toEqual(["external-participant:person@example.com"]);
  });

  it("counts individual and group sessions once across public and account targets", async () => {
    const realtimeCount = vi.fn(async () => 2);
    const groupCount = vi.fn(async () => 1);
    const transaction = {
      realtimeSession: { count: realtimeCount },
      groupVoiceSession: { count: groupCount },
    };

    await expect(
      countActiveExternalSessionsForParticipant(transaction as never, " Person@Example.COM ")
    ).resolves.toBe(3);

    expect(realtimeCount).toHaveBeenCalledWith({
      where: {
        status: { in: ["connecting", "active"] },
        groupVoiceParticipant: { is: null },
        OR: [
          { publicSession: { is: { participantEmail: "person@example.com" } } },
          { accessGrant: { is: { participantEmail: "person@example.com" } } },
        ],
      },
    });
    expect(groupCount).toHaveBeenCalledWith({
      where: {
        status: { in: ["connecting", "active"] },
        OR: [
          { groupPublicSession: { is: { participantEmail: "person@example.com" } } },
          { groupAccessGrant: { is: { participantEmail: "person@example.com" } } },
        ],
      },
    });
  });

  it("counts individual and group occupancy for a locked avatar", async () => {
    const realtimeCount = vi.fn(async () => 4);
    const groupParticipantCount = vi.fn(async () => 3);
    const transaction = {
      realtimeSession: { count: realtimeCount },
      groupVoiceParticipant: { count: groupParticipantCount },
    };

    await expect(countActiveExternalSessionsForAvatar(transaction as never, "avatar-1")).resolves.toBe(7);

    expect(realtimeCount).toHaveBeenCalledWith({
      where: {
        avatarAgentId: "avatar-1",
        status: { in: ["connecting", "active"] },
        groupVoiceParticipant: { is: null },
        OR: [{ publicSessionId: { not: null } }, { accessGrantId: { not: null } }],
      },
    });
    expect(groupParticipantCount).toHaveBeenCalledWith({
      where: {
        avatarAgentId: "avatar-1",
        status: { in: ["connecting", "active"] },
        groupVoiceSession: {
          status: { in: ["connecting", "active"] },
          OR: [{ groupAccessGrantId: { not: null } }, { groupPublicSessionId: { not: null } }],
        },
      },
    });
  });
});
