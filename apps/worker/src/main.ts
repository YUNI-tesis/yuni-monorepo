import { hostname } from "node:os";
import { LiveAvatarProvider, createProviderTokenProtector } from "@yuni/avatars";
import { authConfig, hasS3Config, serverConfig } from "@yuni/config";
import { prisma } from "@yuni/db";
import { createLogger } from "@yuni/observability";
import { S3ObjectStorage } from "@yuni/storage";
import { ElevenLabsAgentProvider } from "@yuni/voice";
import { createKnowledgeBaseWorker } from "./knowledge-base-worker";

const logger = createLogger("@yuni/worker");

export async function startWorker() {
  const storage = hasS3Config() ? new S3ObjectStorage() : undefined;
  if (!storage) {
    logger.warn("S3 is not configured; storage-backed jobs will remain queued");
  }
  const worker = createKnowledgeBaseWorker({
    db: prisma,
    ...(storage ? { storage } : {}),
    provider: new ElevenLabsAgentProvider(),
    liveAvatarProvider: new LiveAvatarProvider(),
    providerTokenProtector: createProviderTokenProtector(authConfig.secret),
    workerId: `${hostname()}:${process.pid}`,
  });
  let stopped = false;
  const recoverStalled = async () => {
    const lockedBefore = new Date(Date.now() - 5 * 60 * 1000);
    const result = await worker.recoverStalled(lockedBefore);
    if (result.count > 0) logger.warn(`requeued ${result.count} stalled knowledge base jobs`);
  };
  await recoverStalled();
  const recoveryTimer = setInterval(() => {
    void recoverStalled().catch((error) => {
      logger.error("Failed to recover stalled jobs", {
        error: error instanceof Error ? error.message : "Unknown worker error",
      });
    });
  }, 60_000);
  const runners = Array.from({ length: serverConfig.workerConcurrency }, async () => {
    while (!stopped) {
      const handled = await worker.runOnce().catch((error) => {
        logger.error("Worker iteration failed", {
          error: error instanceof Error ? error.message : "Unknown worker error",
        });
        return false;
      });
      if (!handled) await new Promise((resolve) => setTimeout(resolve, 750));
    }
  });
  logger.info(`ready with concurrency ${serverConfig.workerConcurrency}`);
  return () => {
    stopped = true;
    clearInterval(recoveryTimer);
    void Promise.all(runners).then(() => prisma.$disconnect());
  };
}
