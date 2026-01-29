import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  ObjectStorage,
  PresignedUploadUrl,
  PresignedDownloadUrl,
} from "./object-storage";
import type { StorageConfig } from "./storage-config";

export class S3Storage implements ObjectStorage {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(config: StorageConfig) {
    if (config.provider !== "s3") {
      throw new Error("S3Storage requires s3 provider config");
    }

    this.bucketName = config.s3.bucketName;
    
    this.s3Client = new S3Client({
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadUrl> {
    const expiresInSeconds = params.expiresInSeconds || 3600; // Default 1 hour

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: params.key,
      ContentType: params.contentType,
    });

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      url,
      method: "PUT",
      headers: {
        "Content-Type": params.contentType,
      },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async getPresignedDownloadUrl(params: {
    key: string;
    expiresInSeconds?: number;
    forceDownloadFilename?: string;
  }): Promise<PresignedDownloadUrl> {
    const expiresInSeconds = params.expiresInSeconds || 3600; // Default 1 hour

    const commandParams: any = {
      Bucket: this.bucketName,
      Key: params.key,
    };

    if (params.forceDownloadFilename) {
      commandParams.ResponseContentDisposition = `attachment; filename="${params.forceDownloadFilename}"`;
    }

    const command = new GetObjectCommand(commandParams);

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async deleteObject(params: { key: string }): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: params.key,
    });

    await this.s3Client.send(command);
  }

  async exists(params: { key: string }): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: params.key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Download a blob from S3 for server-side operations (e.g., ingestion)
   */
  async downloadBlob(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`Failed to download blob: ${key}`);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
}
