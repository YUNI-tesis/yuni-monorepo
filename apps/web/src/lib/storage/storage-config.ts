import { z } from "zod";

const StorageConfigSchema = z.object({
  provider: z.enum(["azure"]),
  azure: z.object({
    accountName: z.string().min(1),
    accountKey: z.string().min(1),
    containerName: z.string().min(1),
    publicBaseUrl: z.string().url().optional(),
  }),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export function loadStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || "azure") as "azure";

  if (provider !== "azure") {
    throw new Error(`Unsupported storage provider: ${provider}`);
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!accountName || !accountKey || !containerName) {
    throw new Error(
      "Missing required Azure Storage environment variables: AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_CONTAINER_NAME"
    );
  }

  const publicBaseUrl =
    process.env.AZURE_STORAGE_PUBLIC_BASE_URL ||
    `https://${accountName}.blob.core.windows.net`;

  return StorageConfigSchema.parse({
    provider,
    azure: {
      accountName,
      accountKey,
      containerName,
      publicBaseUrl,
    },
  });
}
