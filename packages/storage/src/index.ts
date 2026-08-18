import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireS3Config, type S3Config } from "@yuni/config";

export type PresignedUpload = {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export type StoredObjectMetadata = {
  sizeBytes: number;
  contentType?: string;
  etag?: string;
};

export interface ObjectStorage {
  readonly name: string;
  createPresignedUpload(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload>;
  head(key: string): Promise<StoredObjectMetadata | null>;
  download(key: string, maxBytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super("Stored object exceeds the allowed size");
    this.name = "ObjectTooLargeError";
  }
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Stored object was not found");
    this.name = "ObjectNotFoundError";
  }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly name = "s3";
  readonly #client: S3Client;
  readonly #config: S3Config;

  constructor(config: S3Config = requireS3Config(), client?: S3Client) {
    this.#config = config;
    this.#client =
      client ??
      new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: config.forcePathStyle,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      });
  }

  async createPresignedUpload(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    const expiresIn = input.expiresInSeconds ?? this.#config.presignTtlSeconds;
    const command = new PutObjectCommand({
      Bucket: this.#config.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.#client, command, { expiresIn });

    return {
      uploadUrl,
      headers: { "content-type": input.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#config.bucket, Key: key })
      );
      return {
        sizeBytes: result.ContentLength ?? 0,
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(result.ETag ? { etag: result.ETag } : {}),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async download(key: string, maxBytes: number): Promise<Uint8Array> {
    const metadata = await this.head(key);
    if (!metadata) throw new ObjectNotFoundError();
    if (metadata.sizeBytes > maxBytes) throw new ObjectTooLargeError();

    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.#config.bucket, Key: key }));
    if (!result.Body) throw new ObjectNotFoundError();
    const bytes = await result.Body.transformToByteArray();
    if (bytes.byteLength > maxBytes) throw new ObjectTooLargeError();
    return bytes;
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#config.bucket, Key: key }));
  }
}

type MemoryObject = { bytes: Uint8Array; contentType: string; etag: string };

export class InMemoryObjectStorage implements ObjectStorage {
  readonly name = "memory";
  readonly #objects = new Map<string, MemoryObject>();
  readonly #presignTtlSeconds: number;

  constructor(presignTtlSeconds = 900) {
    this.#presignTtlSeconds = presignTtlSeconds;
  }

  async createPresignedUpload(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    const expiresIn = input.expiresInSeconds ?? this.#presignTtlSeconds;
    return {
      uploadUrl: `memory://upload/${encodeURIComponent(input.key)}`,
      headers: { "content-type": input.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  put(key: string, bytes: Uint8Array, contentType: string, etag = `memory-${bytes.byteLength}`) {
    this.#objects.set(key, { bytes, contentType, etag });
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    const object = this.#objects.get(key);
    if (!object) return null;
    return {
      sizeBytes: object.bytes.byteLength,
      contentType: object.contentType,
      etag: object.etag,
    };
  }

  async download(key: string, maxBytes: number): Promise<Uint8Array> {
    const object = this.#objects.get(key);
    if (!object) throw new ObjectNotFoundError();
    if (object.bytes.byteLength > maxBytes) throw new ObjectTooLargeError();
    return object.bytes;
  }

  async delete(key: string): Promise<void> {
    this.#objects.delete(key);
  }
}
