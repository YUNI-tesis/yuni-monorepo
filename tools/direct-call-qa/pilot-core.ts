import { createHash } from "node:crypto";
import { VoiceConfigSchema, type VoiceConfig } from "../../packages/domain/src/schemas/avatar-agent";

export type ConversationProfile = "standard" | "natural";

export type PilotOptions = {
  avatarId: string;
  apply: boolean;
  profile?: ConversationProfile;
  retryExpressive: boolean;
  output?: string;
};

export type PilotAvatar = {
  voiceConfig: unknown;
  providerAgentId: string | null;
  providerSyncStatus: string;
  providerVoiceState?: unknown;
  knowledgeBase: { contextDocumentId: string | null; fileDocumentIds: string[] };
};

export type PilotDependencies = {
  requestedModel(profile: ConversationProfile): string;
  findAvatar(avatarId: string): Promise<PilotAvatar | null>;
  countLiveSessions(avatarId: string): Promise<number>;
  inspectVoice(agentId: string, requestedModel: string, profile: ConversationProfile): Promise<unknown>;
  updateVoiceConfig(avatarId: string, config: VoiceConfig): Promise<void>;
  syncAgent(avatarId: string, options: { retryExpressive: boolean; verifyVoice: true }): Promise<void>;
  markFailed(avatarId: string): Promise<void>;
  runWithAvatarLock<T>(
    avatarId: string,
    operation: () => Promise<T>
  ): Promise<{ acquired: false } | { acquired: true; value: T }>;
  now?: () => Date;
};

type SafeVoiceState = {
  requestedModel: string;
  effectiveModel: string;
  expressiveMode: boolean | null;
  fallbackReason: string | null;
  verifiedAt: string | null;
  profile: ConversationProfile;
};

export type PilotReport = {
  version: 1;
  mode: "inspect" | "apply";
  avatarId: string;
  status: "inspected" | "applied" | "applied_with_fallback" | "blocked" | "failed";
  reason?: string;
  currentProfile?: ConversationProfile;
  targetProfile?: ConversationProfile;
  liveSessions?: number;
  providerLinked?: boolean;
  storedVoice?: SafeVoiceState | null;
  remoteVoice?: SafeVoiceState | null;
  retryExpressive: boolean;
  failureStateRecorded?: boolean;
  remoteState?: "verified" | "unknown";
  localKnowledgeBase?: {
    contextAttached: boolean;
    syncedFileCount: number;
    referenceFingerprint: string;
  };
  localKnowledgeBaseReferencesUnchanged?: boolean;
};

function knowledgeBaseSummary(avatar: PilotAvatar): NonNullable<PilotReport["localKnowledgeBase"]> {
  const files = [...new Set(avatar.knowledgeBase.fileDocumentIds)].sort();
  return {
    contextAttached: Boolean(avatar.knowledgeBase.contextDocumentId),
    syncedFileCount: files.length,
    referenceFingerprint: createHash("sha256")
      .update(JSON.stringify({ context: avatar.knowledgeBase.contextDocumentId, files }))
      .digest("hex"),
  };
}

export function parsePilotArgs(args: string[]): PilotOptions {
  const values = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (values.has(flag)) throw new Error("Duplicate option");
    if (flag === "--apply" || flag === "--retry-expressive") {
      values.set(flag, true);
    } else if (flag === "--avatar-id" || flag === "--profile" || flag === "--output") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("Missing option value");
      values.set(flag, value);
    } else {
      throw new Error("Unknown option");
    }
  }
  const avatarId = values.get("--avatar-id");
  if (typeof avatarId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(avatarId)) {
    throw new Error("An explicit valid --avatar-id is required");
  }
  const profile = values.get("--profile");
  if (profile !== undefined && profile !== "standard" && profile !== "natural") {
    throw new Error("--profile must be natural or standard");
  }
  const apply = values.has("--apply");
  const retryExpressive = values.has("--retry-expressive");
  if (apply && profile === undefined) throw new Error("--apply requires an explicit --profile");
  if (retryExpressive && !apply) throw new Error("--retry-expressive requires --apply");
  const output = values.get("--output");
  return {
    avatarId,
    apply,
    retryExpressive,
    ...(profile ? { profile } : {}),
    ...(typeof output === "string" ? { output } : {}),
  };
}

// Select only operational metadata. Provider bodies, prompts, voice labels, names,
// credentials and raw exception messages never enter a report.
export function safeVoiceState(value: unknown): SafeVoiceState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const modelPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/;
  if (
    typeof state.requestedModel !== "string" ||
    !modelPattern.test(state.requestedModel) ||
    typeof state.effectiveModel !== "string" ||
    !modelPattern.test(state.effectiveModel) ||
    (state.profile !== "standard" && state.profile !== "natural") ||
    (state.expressiveMode !== null && typeof state.expressiveMode !== "boolean")
  ) {
    return null;
  }
  const verifiedAt =
    typeof state.verifiedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(state.verifiedAt) &&
    Number.isFinite(Date.parse(state.verifiedAt))
      ? state.verifiedAt
      : null;
  const knownReasons = [
    "expressive_tts_not_allowed",
    "cached_fallback",
    "provider_model_differs",
    "voice_verification_failed",
    "expressive_mode_disabled",
    "expressive_mode_unverified",
    "expressive_mode_unexpected",
  ];
  return {
    requestedModel: state.requestedModel,
    effectiveModel: state.effectiveModel,
    expressiveMode: state.expressiveMode,
    fallbackReason:
      state.fallbackReason == null
        ? null
        : typeof state.fallbackReason === "string" && knownReasons.includes(state.fallbackReason)
          ? state.fallbackReason
          : "other",
    verifiedAt,
    profile: state.profile,
  };
}

export async function runPilot(options: PilotOptions, dependencies: PilotDependencies): Promise<PilotReport> {
  const base: PilotReport = {
    version: 1,
    mode: options.apply ? "apply" : "inspect",
    avatarId: options.avatarId,
    status: "failed",
    retryExpressive: options.retryExpressive,
  };
  if (options.apply && !options.profile) return { ...base, reason: "profile_required" };
  if (!options.apply && options.retryExpressive) return { ...base, reason: "apply_required" };

  async function run(): Promise<PilotReport> {
    const avatar = await dependencies.findAvatar(options.avatarId);
    if (!avatar) return { ...base, status: "blocked", reason: "avatar_not_found" };
    const parsed = VoiceConfigSchema.safeParse(avatar.voiceConfig);
    if (!parsed.success) return { ...base, status: "blocked", reason: "invalid_voice_config" };
    const currentProfile = parsed.data.conversationProfile ?? "standard";
    const targetProfile = options.profile ?? currentProfile;
    const liveSessions = await dependencies.countLiveSessions(options.avatarId);
    const summary: PilotReport = {
      ...base,
      currentProfile,
      targetProfile,
      liveSessions,
      providerLinked: Boolean(avatar.providerAgentId),
      storedVoice: safeVoiceState(avatar.providerVoiceState),
      localKnowledgeBase: knowledgeBaseSummary(avatar),
    };

    if (!options.apply) {
      if (!avatar.providerAgentId) {
        return { ...summary, status: "inspected", remoteVoice: null };
      }
      try {
        const remoteVoice = safeVoiceState(
          await dependencies.inspectVoice(
            avatar.providerAgentId,
            dependencies.requestedModel(currentProfile),
            currentProfile
          )
        );
        if (!remoteVoice?.verifiedAt) throw new Error("Invalid voice inspection");
        return { ...summary, status: "inspected", remoteVoice, remoteState: "verified" };
      } catch {
        return { ...summary, reason: "voice_inspection_failed", remoteState: "unknown" };
      }
    }

    if (liveSessions > 0) {
      return { ...summary, status: "blocked", reason: "active_or_connecting_sessions" };
    }
    const nextVoiceConfig = VoiceConfigSchema.parse({
      ...parsed.data,
      conversationProfile: targetProfile,
    });
    const startedAt = (dependencies.now ?? (() => new Date()))().getTime();
    let localProfileSaved = false;
    try {
      await dependencies.updateVoiceConfig(options.avatarId, nextVoiceConfig);
      localProfileSaved = true;
      await dependencies.syncAgent(options.avatarId, {
        retryExpressive: options.retryExpressive,
        verifyVoice: true,
      });
      const updated = await dependencies.findAvatar(options.avatarId);
      const remoteVoice = safeVoiceState(updated?.providerVoiceState);
      if (
        updated?.providerSyncStatus !== "synced" ||
        knowledgeBaseSummary(updated).referenceFingerprint !==
          summary.localKnowledgeBase!.referenceFingerprint ||
        !remoteVoice?.verifiedAt ||
        remoteVoice.profile !== targetProfile ||
        remoteVoice.requestedModel !== dependencies.requestedModel(targetProfile) ||
        Date.parse(remoteVoice.verifiedAt) < startedAt
      ) {
        throw new Error("Fresh provider verification was not persisted");
      }
      return {
        ...summary,
        status:
          remoteVoice.requestedModel === remoteVoice.effectiveModel ? "applied" : "applied_with_fallback",
        currentProfile: targetProfile,
        remoteVoice,
        remoteState: "verified",
        localKnowledgeBaseReferencesUnchanged: true,
      };
    } catch {
      // A failed request can already have changed the provider. Keep the desired
      // local profile, record failure and require an explicit verified retry or
      // standard-profile rollback; never claim the old remote state was restored.
      let failureStateRecorded = false;
      try {
        await dependencies.markFailed(options.avatarId);
        failureStateRecorded = true;
      } catch {
        // Preserve the uncertain outcome even when the database is unavailable.
      }
      const failedSummary = { ...summary };
      delete failedSummary.currentProfile;
      return {
        ...failedSummary,
        ...(localProfileSaved ? { currentProfile: targetProfile } : {}),
        reason: "sync_or_verification_failed",
        failureStateRecorded,
        remoteState: "unknown",
      };
    }
  }

  try {
    if (!options.apply) return await run();
    const locked = await dependencies.runWithAvatarLock(options.avatarId, run);
    return locked.acquired
      ? locked.value
      : { ...base, status: "blocked", reason: "avatar_provider_lock_busy" };
  } catch {
    return { ...base, reason: "pilot_operation_failed", remoteState: "unknown" };
  }
}
