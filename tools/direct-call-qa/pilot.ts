import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLocalEnv } from "../../packages/config/src/load-env";
import { parsePilotArgs, runPilot } from "./pilot-core";

const usage = `Usage:
  pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID [--profile natural|standard]
  pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --apply --profile natural|standard [--retry-expressive]

Default: read-only local inspection and remote voice GET. --profile previews the target.
--apply updates only this avatar and synchronizes through the knowledge-base worker.
--profile standard is the explicit rollback path. Neither path processes the job queue.
--output FILE also writes the safe JSON report to a new file (never overwrites).
Run while no one is starting calls for the target avatar.
`;

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    process.stdout.write(usage);
    return;
  }
  let options;
  try {
    options = parsePilotArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(`Invalid pilot arguments.\n${usage}`);
    process.exitCode = 1;
    return;
  }

  loadLocalEnv();
  // Configuration is evaluated on import. It must see the local environment.
  const [
    { prisma, createJobRepository },
    { elevenLabsConfig },
    { ElevenLabsAgentProvider, resolveElevenLabsAgentTtsModel },
    workerModule,
  ] = await Promise.all([
    import("../../packages/db/src/index"),
    import("../../packages/config/src/index"),
    import("../../packages/voice/src/index"),
    import("../../apps/worker/src/knowledge-base-worker"),
  ]);
  try {
    const provider = new ElevenLabsAgentProvider();
    const jobs = createJobRepository(prisma);
    const worker = workerModule.createKnowledgeBaseWorker({
      db: prisma,
      provider,
      workerId: "direct-call-pilot",
    });
    const report = await runPilot(options, {
      requestedModel: (profile) => resolveElevenLabsAgentTtsModel(elevenLabsConfig.agentTtsModel, profile),
      async findAvatar(avatarId) {
        const avatar = await prisma.avatarAgent.findUnique({
          where: { id: avatarId },
          select: {
            voiceConfig: true,
            providerAgentId: true,
            providerSyncStatus: true,
            providerVoiceState: true,
            providerContextDocumentId: true,
            providerContextSyncStatus: true,
            documents: {
              where: { deletedAt: null },
              select: { providerSync: { select: { status: true, providerDocumentId: true } } },
            },
          },
        });
        return avatar
          ? {
              ...avatar,
              knowledgeBase: {
                contextDocumentId:
                  avatar.providerContextSyncStatus === "synced" ? avatar.providerContextDocumentId : null,
                fileDocumentIds: avatar.documents.flatMap((document) =>
                  document.providerSync?.status === "synced" && document.providerSync.providerDocumentId
                    ? [document.providerSync.providerDocumentId]
                    : []
                ),
              },
            }
          : null;
      },
      countLiveSessions: (avatarId) =>
        prisma.realtimeSession.count({
          where: { avatarAgentId: avatarId, status: { in: ["connecting", "active"] } },
        }),
      inspectVoice: (agentId, requestedModel, profile) =>
        provider.inspectAgentVoice(agentId, requestedModel, profile),
      async updateVoiceConfig(avatarId, voiceConfig) {
        await prisma.avatarAgent.update({
          where: { id: avatarId },
          data: { voiceConfig, providerSyncStatus: "syncing", providerSyncError: null },
        });
      },
      syncAgent: (avatarId, syncOptions) => worker.syncAgent(avatarId, syncOptions),
      async markFailed(avatarId) {
        await prisma.avatarAgent.update({
          where: { id: avatarId },
          data: {
            providerSyncStatus: "failed",
            providerSyncError: "Direct-call pilot synchronization or voice verification failed",
          },
        });
      },
      runWithAvatarLock: (avatarId, operation) => jobs.runWithAvatarLock(avatarId, operation),
    });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    process.stdout.write(json);
    if (report.status === "failed" || report.status === "blocked") process.exitCode = 1;
    if (options.output) {
      try {
        await writeFile(resolve(options.output), json, { encoding: "utf8", flag: "wx", mode: 0o600 });
      } catch {
        process.stderr.write("Could not create the report file; the operation result is above.\n");
        process.exitCode = 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.stderr.write(
    "Pilot failed. Check configuration and database availability; no remote outcome is assumed.\n"
  );
  process.exitCode = 1;
});
