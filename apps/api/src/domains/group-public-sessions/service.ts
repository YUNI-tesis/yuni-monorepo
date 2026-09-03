import {
  groupConsentScopeId,
  NotFoundError,
  type EndGroupVoiceSessionInput,
  type GroupProviderEventInput,
  type GroupVoiceParticipantFailureInput,
  type GroupVoiceParticipantStartedInput,
  type GroupVoiceTurnInput,
  type IdentifyPublicGroupLinkInput,
  type InterruptGroupVoiceSessionInput,
} from "@yuni/domain";
import { groupPublicSessionPrincipal, type createGroupSharingRepository } from "@yuni/db";
import { createLogger } from "@yuni/observability";
import type { Context } from "hono";
import { createAvatarGroupsService, type AvatarGroupsServiceDependencies } from "../avatar-groups/service";
import { groupInteractionAvailability, groupSharingEligibility } from "../group-sharing/availability";
import type { RateLimiter } from "../public-sessions/rate-limiter";
import type { DurableGroupRateLimiter } from "./durable-rate-limiter";
import type { PublicGroupTokenService } from "./tokens";

const logger = createLogger("@yuni/api:group-public-sessions");

type Repository = ReturnType<typeof createGroupSharingRepository>;

export class InvalidPublicGroupTokenError extends Error {}
export class PublicGroupRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Public group session rate limit reached");
  }
}
export class PublicGroupNotReadyError extends Error {}
export class PublicGroupConsentStaleError extends Error {}
export class GroupPublicSharingDisabledError extends Error {}

export type PublicGroupSessionsDependencies = {
  repository: Repository;
  avatarGroups: AvatarGroupsServiceDependencies;
  tokenService: PublicGroupTokenService;
  rateLimiter: RateLimiter;
  durableRateLimiter?: DurableGroupRateLimiter;
  enabled: () => boolean;
  resolveClientIp?: (context: Context) => string;
  rateLimits: {
    identifyIpLink: number;
    identifyEmailLink: number;
    startIpTarget: number;
    startParticipantTarget: number;
    startLink: number;
    startAvatar: number;
    runtimeSession: number;
    runtimeSessionIp: number;
    endSession: number;
    endSessionIp: number;
  };
};

export function createPublicGroupSessionsService(dependencies: PublicGroupSessionsDependencies) {
  const groups = createAvatarGroupsService(dependencies.avatarGroups);

  async function requireLink(slug: string) {
    const link = await dependencies.repository.resolveEnabledShareLink(slug);
    if (!link?.avatarGroup) throw new NotFoundError("Public group not found");
    if (groupSharingEligibility(link.avatarGroup).status !== "eligible") {
      throw new NotFoundError("Public group not found");
    }
    return { link, group: link.avatarGroup };
  }

  async function principalForRuntime(
    voiceSessionId: string,
    token: string,
    ip: string,
    kind: "command" | "end"
  ) {
    const access = await dependencies.tokenService.verifySessionToken(token);
    if (!access || access.voiceSessionId !== voiceSessionId) {
      throw new InvalidPublicGroupTokenError();
    }
    const isEnd = kind === "end";
    await enforceRateLimit(dependencies.rateLimiter, dependencies.durableRateLimiter, [
      rateRule(
        isEnd ? "group-public-runtime-end-session" : "group-public-runtime-session",
        [voiceSessionId],
        isEnd ? dependencies.rateLimits.endSession : dependencies.rateLimits.runtimeSession,
        1
      ),
      rateRule(
        isEnd ? "group-public-runtime-end-session-ip" : "group-public-runtime-session-ip",
        [voiceSessionId, ip],
        isEnd ? dependencies.rateLimits.endSessionIp : dependencies.rateLimits.runtimeSessionIp,
        1
      ),
    ]);
    return groupPublicSessionPrincipal(access.groupPublicSessionId);
  }

  return {
    async identify(slug: string, input: IdentifyPublicGroupLinkInput, ip: string) {
      if (!dependencies.enabled()) throw new GroupPublicSharingDisabledError();
      const { link, group } = await requireLink(slug);
      await enforceRateLimit(dependencies.rateLimiter, dependencies.durableRateLimiter, [
        rateRule("group-public-identify-ip-link", [ip, link.id], dependencies.rateLimits.identifyIpLink, 15),
        rateRule(
          "group-public-identify-email-link",
          [input.email, link.id],
          dependencies.rateLimits.identifyEmailLink,
          15
        ),
      ]);
      const consentedAt = new Date();
      const scopeId = groupConsentScopeId("share-link", link.id);
      const consentVersion = String(group.membershipVersion);
      if (input.consentVersion !== consentVersion || input.scopeId !== scopeId) {
        throw new PublicGroupConsentStaleError();
      }
      const identity = await dependencies.tokenService.createIdentityToken({
        slug: link.slug,
        email: input.email,
        consentedAt: consentedAt.toISOString(),
        scopeId,
        consentVersion,
      });
      return {
        email: input.email,
        token: identity.token,
        expiresAt: identity.expiresAt.toISOString(),
        scopeId,
        consentVersion,
      };
    },

    async start(slug: string, identityToken: string, ip: string) {
      if (!dependencies.enabled()) throw new GroupPublicSharingDisabledError();
      const identity = await dependencies.tokenService.verifyIdentityToken(identityToken);
      if (!identity || identity.slug !== slug) throw new InvalidPublicGroupTokenError();
      const { link, group } = await requireLink(slug);
      await enforceRateLimit(dependencies.rateLimiter, dependencies.durableRateLimiter, [
        rateRule("group-public-start-ip-target", [ip, link.id], dependencies.rateLimits.startIpTarget, 60),
        rateRule(
          "group-public-start-participant-target",
          [identity.email, link.id],
          dependencies.rateLimits.startParticipantTarget,
          60
        ),
        rateRule("group-public-start-link", [link.id], dependencies.rateLimits.startLink, 60),
        ...group.members.map((member) =>
          rateRule("external-start-avatar", [member.avatarAgentId], dependencies.rateLimits.startAvatar, 60)
        ),
      ]);
      const expectedScope = groupConsentScopeId("share-link", link.id);
      if (identity.scopeId !== expectedScope || identity.consentVersion !== String(group.membershipVersion)) {
        throw new PublicGroupConsentStaleError();
      }
      const availability = groupInteractionAvailability(group);
      if (availability.status !== "ready") throw new PublicGroupNotReadyError();
      logger.info("group sharing start requested", {
        groupId: group.id,
        targetKind: "public_link",
      });
      const reserved = await groups.startPublic({
        shareLinkId: link.id,
        groupId: group.id,
        participantEmail: identity.email,
        consentedAt: new Date(identity.consentedAt),
        consentScopeId: identity.scopeId,
        consentVersion: group.membershipVersion,
      });
      let access;
      try {
        access = await dependencies.tokenService.createSessionToken(
          reserved.voiceSession.id,
          { groupPublicSessionId: reserved.publicSession.id },
          Math.max(60, Math.ceil((reserved.publicSession.expiresAt!.getTime() - Date.now()) / 1000)) + 300
        );
      } catch (error) {
        await groups
          .end(groupPublicSessionPrincipal(reserved.publicSession.id), reserved.voiceSession.id, {
            reason: "no_participants",
          })
          .catch(() => undefined);
        throw error;
      }
      logger.info("group sharing start reserved", {
        groupId: group.id,
        targetKind: "public_link",
        voiceSessionId: reserved.voiceSession.id,
      });
      return {
        publicSession: {
          id: reserved.publicSession.id,
          token: access.token,
          expiresAt: reserved.publicSession.expiresAt!.toISOString(),
        },
        voiceSession: reserved.voiceSession,
      };
    },

    async scribeToken(id: string, token: string, ip: string) {
      return groups.scribeToken(await principalForRuntime(id, token, ip, "command"), id);
    },
    async turn(id: string, token: string, ip: string, input: GroupVoiceTurnInput) {
      return groups.turn(await principalForRuntime(id, token, ip, "command"), id, input);
    },
    async providerEvent(id: string, token: string, ip: string, input: GroupProviderEventInput) {
      return groups.providerEvent(await principalForRuntime(id, token, ip, "command"), id, input);
    },
    async interrupt(id: string, token: string, ip: string, input: InterruptGroupVoiceSessionInput) {
      return groups.interrupt(await principalForRuntime(id, token, ip, "command"), id, input);
    },
    async retry(id: string, token: string, ip: string, avatarId: string) {
      return groups.retry(await principalForRuntime(id, token, ip, "command"), id, avatarId);
    },
    async confirmParticipantStarted(
      id: string,
      token: string,
      ip: string,
      avatarId: string,
      input: GroupVoiceParticipantStartedInput
    ) {
      return groups.confirmParticipantStarted(
        await principalForRuntime(id, token, ip, "command"),
        id,
        avatarId,
        input
      );
    },
    async participantFailure(
      id: string,
      token: string,
      ip: string,
      avatarId: string,
      input: GroupVoiceParticipantFailureInput
    ) {
      return groups.participantFailure(
        await principalForRuntime(id, token, ip, "command"),
        id,
        avatarId,
        input
      );
    },
    async heartbeat(id: string, token: string, ip: string) {
      return groups.heartbeat(await principalForRuntime(id, token, ip, "command"), id);
    },
    async end(id: string, token: string, ip: string, input: EndGroupVoiceSessionInput) {
      return groups.end(await principalForRuntime(id, token, ip, "end"), id, input);
    },
  };
}

function rateRule(namespace: string, identifiers: string[], limit: number, windowMinutes: number) {
  return { namespace, identifiers, limit, windowMs: windowMinutes * 60_000 };
}

async function enforceRateLimit(
  rateLimiter: RateLimiter,
  durableRateLimiter: DurableGroupRateLimiter | undefined,
  rules: Parameters<RateLimiter["consume"]>[0]
) {
  if (durableRateLimiter) {
    // PostgreSQL is the sole production authority and fails closed. The local
    // limiter is intentionally a fallback only, so a rejection never consumes
    // counters in a second layer with a different clock or window.
    const durableResult = await durableRateLimiter.consume(rules);
    if (!durableResult.allowed) {
      throw new PublicGroupRateLimitedError(durableResult.retryAfterSeconds);
    }
    return;
  }

  const fastResult = rateLimiter.consume(rules);
  if (!fastResult.allowed) throw new PublicGroupRateLimitedError(fastResult.retryAfterSeconds);
}
