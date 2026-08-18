import { describe, expect, it } from "vitest";
import { InMemoryObjectStorage, ObjectNotFoundError, ObjectTooLargeError } from "./index";

describe("@yuni/storage", () => {
  it("presigns uploads with a bounded expiration without exposing unrelated keys", async () => {
    const storage = new InMemoryObjectStorage(60);
    const before = Date.now();
    const result = await storage.createPresignedUpload({
      key: "avatars/avatar-1/documents/document-1/guide.pdf",
      contentType: "application/pdf",
    });
    expect(result.uploadUrl).toContain(encodeURIComponent("avatars/avatar-1/documents/document-1/guide.pdf"));
    expect(result.headers).toEqual({ "content-type": "application/pdf" });
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 59_000);
    expect(JSON.stringify(result)).not.toContain("another-document");
  });

  it("supports HEAD, bounded downloads and idempotent deletion", async () => {
    const storage = new InMemoryObjectStorage();
    storage.put("document", new Uint8Array([1, 2, 3]), "text/plain", "etag-1");
    await expect(storage.head("document")).resolves.toEqual({
      sizeBytes: 3,
      contentType: "text/plain",
      etag: "etag-1",
    });
    await expect(storage.download("document", 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(storage.download("document", 2)).rejects.toBeInstanceOf(ObjectTooLargeError);
    await storage.delete("document");
    await storage.delete("document");
    await expect(storage.download("document", 3)).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
});
