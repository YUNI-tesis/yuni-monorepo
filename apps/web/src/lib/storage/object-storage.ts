/**
 * Provider-agnostic object storage interface
 */

export interface PresignedUploadUrl {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PresignedDownloadUrl {
  url: string;
  expiresAt: Date;
}

export interface ObjectStorage {
  /**
   * Generate a presigned URL for uploading an object
   */
  getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadUrl>;

  /**
   * Generate a presigned URL for downloading an object
   */
  getPresignedDownloadUrl(params: {
    key: string;
    expiresInSeconds?: number;
    forceDownloadFilename?: string;
  }): Promise<PresignedDownloadUrl>;

  /**
   * Delete an object from storage
   */
  deleteObject(params: { key: string }): Promise<void>;

  /**
   * Check if an object exists in storage
   */
  exists(params: { key: string }): Promise<boolean>;
}
