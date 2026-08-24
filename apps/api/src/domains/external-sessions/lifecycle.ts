export const EXTERNAL_SESSION_FINALIZATION_GRACE_MS = 30_000;
export const EXTERNAL_SESSION_START_ERROR_MESSAGE = "External voice session start failed";
export const EXTERNAL_MAINTENANCE_BATCH_SIZE = 50;
export const EXTERNAL_MAINTENANCE_MAX_BATCHES = 20;
export const EXTERNAL_PROVIDER_STOP_CONCURRENCY = 5;
export const EXTERNAL_RECORD_CLEANUP_CONCURRENCY = 10;

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<void>
) {
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await operation(items[index]!);
      }
    })
  );
}
