import type { ObjectStorage } from "./object-storage";
import { loadStorageConfig, type StorageConfig } from "./storage-config";
import { AzureBlobStorage } from "./azure-blob.storage";

let storageInstance: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (storageInstance) {
    return storageInstance;
  }

  const config = loadStorageConfig();

  switch (config.provider) {
    case "azure":
      storageInstance = new AzureBlobStorage(config);
      break;
    default:
      throw new Error(`Unsupported storage provider: ${config.provider}`);
  }

  return storageInstance;
}
