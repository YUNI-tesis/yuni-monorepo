import type { ObjectStorage } from "./object-storage";
import { loadStorageConfig } from "./storage-config";
import { S3Storage } from "./s3.storage";

let storageInstance: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (storageInstance) {
    return storageInstance;
  }

  const config = loadStorageConfig();

  switch (config.provider) {
    case "s3":
      storageInstance = new S3Storage(config);
      break;
    default:
      throw new Error(`Unsupported storage provider: ${config.provider}`);
  }

  return storageInstance;
}
