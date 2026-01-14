import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from "@azure/storage-blob";
import type {
  ObjectStorage,
  PresignedUploadUrl,
  PresignedDownloadUrl,
} from "./object-storage";
import type { StorageConfig } from "./storage-config";

export class AzureBlobStorage implements ObjectStorage {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private accountName: string;
  private accountKey: string;

  constructor(config: StorageConfig) {
    if (config.provider !== "azure") {
      throw new Error("AzureBlobStorage requires azure provider config");
    }

    this.accountName = config.azure.accountName;
    this.accountKey = config.azure.accountKey;
    this.containerName = config.azure.containerName;

    const credential = new StorageSharedKeyCredential(
      this.accountName,
      this.accountKey
    );
    this.blobServiceClient = new BlobServiceClient(
      `https://${this.accountName}.blob.core.windows.net`,
      credential
    );
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadUrl> {
    const expiresInSeconds = params.expiresInSeconds || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    const blobClient = containerClient.getBlobClient(params.key);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: params.key,
        permissions: BlobSASPermissions.parse("cw"), // create + write
        startsOn: new Date(),
        expiresOn: expiresAt,
        contentType: params.contentType,
      },
      new StorageSharedKeyCredential(this.accountName, this.accountKey)
    );

    const url = `${blobClient.url}?${sasToken.toString()}`;

    return {
      url,
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": params.contentType,
      },
      expiresAt,
    };
  }

  async getPresignedDownloadUrl(params: {
    key: string;
    expiresInSeconds?: number;
    forceDownloadFilename?: string;
  }): Promise<PresignedDownloadUrl> {
    const expiresInSeconds = params.expiresInSeconds || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    const blobClient = containerClient.getBlobClient(params.key);

    const sasOptions: any = {
      containerName: this.containerName,
      blobName: params.key,
      permissions: BlobSASPermissions.parse("r"), // read
      startsOn: new Date(),
      expiresOn: expiresAt,
    };

    if (params.forceDownloadFilename) {
      sasOptions.contentDisposition = `attachment; filename="${params.forceDownloadFilename}"`;
    }

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      new StorageSharedKeyCredential(this.accountName, this.accountKey)
    );

    const url = `${blobClient.url}?${sasToken.toString()}`;

    return {
      url,
      expiresAt,
    };
  }

  async deleteObject(params: { key: string }): Promise<void> {
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    const blobClient = containerClient.getBlobClient(params.key);
    await blobClient.deleteIfExists();
  }

  async exists(params: { key: string }): Promise<boolean> {
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    const blobClient = containerClient.getBlobClient(params.key);
    return await blobClient.exists();
  }

  /**
   * Get a blob client for server-side operations (e.g., downloading for ingestion)
   */
  async downloadBlob(key: string): Promise<Buffer> {
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    const blobClient = containerClient.getBlobClient(key);
    const downloadResponse = await blobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Failed to download blob: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
}
