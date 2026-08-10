import {
  NotFoundError,
  OwnershipError,
  SelfAccessGrantError,
  type CreateAccessGrantInput,
  type UpdateAccessGrantInput,
} from "@yuni/domain";
import type { AccessGrantRecord, AccessGrantsRepository } from "./access-grant-repository";

export type AccessGrantDto = {
  id: string;
  avatarAgentId: string;
  participantEmail: string;
  participantUserId: string | null;
  state: "pending" | "linked" | "revoked";
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export class DuplicateAccessGrantError extends Error {
  constructor() {
    super("Access grant already exists");
    this.name = "DuplicateAccessGrantError";
  }
}

export type AccessGrantsServiceDependencies = {
  repository: AccessGrantsRepository;
};

export function createAccessGrantsService({ repository }: AccessGrantsServiceDependencies) {
  return {
    async createAccessGrant(
      ownerId: string,
      avatarId: string,
      input: CreateAccessGrantInput
    ): Promise<AccessGrantDto> {
      try {
        return toAccessGrantDto(await repository.create(ownerId, avatarId, input));
      } catch (error) {
        throw normalizeAccessGrantError(error);
      }
    },

    async listAccessGrants(ownerId: string, avatarId: string): Promise<AccessGrantDto[]> {
      try {
        return (await repository.listForAvatar(ownerId, avatarId)).map(toAccessGrantDto);
      } catch (error) {
        throw normalizeAccessGrantError(error);
      }
    },

    async updateAccessGrant(
      ownerId: string,
      avatarId: string,
      accessGrantId: string,
      input: UpdateAccessGrantInput
    ): Promise<AccessGrantDto> {
      try {
        return toAccessGrantDto(
          await repository.updateForAvatar(ownerId, avatarId, accessGrantId, input.status)
        );
      } catch (error) {
        throw normalizeAccessGrantError(error);
      }
    },

    async deleteAccessGrant(ownerId: string, avatarId: string, accessGrantId: string) {
      try {
        const result = await repository.deleteForAvatar(ownerId, avatarId, accessGrantId);
        return { outcome: result.outcome };
      } catch (error) {
        throw normalizeAccessGrantError(error);
      }
    },
  };
}

function toAccessGrantDto(record: AccessGrantRecord): AccessGrantDto {
  return {
    id: record.id,
    avatarAgentId: record.avatarAgentId,
    participantEmail: record.participantEmail,
    participantUserId: record.participantUserId,
    state: record.status === "revoked" ? "revoked" : record.participantUserId ? "linked" : "pending",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
  };
}

function normalizeAccessGrantError(error: unknown): Error {
  if (error instanceof OwnershipError) {
    return new NotFoundError("Access grant not found");
  }

  if (isUniqueConstraintError(error)) {
    return new DuplicateAccessGrantError();
  }

  if (error instanceof SelfAccessGrantError) {
    return error;
  }

  return error instanceof Error ? error : new Error("Unknown access grant error");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
