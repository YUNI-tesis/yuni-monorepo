import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type ProviderTokenProtector = {
  encrypt(token: string): string;
  decrypt(ciphertext: string): string;
};

export function createProviderTokenProtector(secret: string): ProviderTokenProtector {
  const key = createHash("sha256").update(secret).digest();

  return {
    encrypt(token) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        encrypted.toString("base64url"),
      ].join(".");
    },
    decrypt(ciphertext) {
      const [version, encodedIv, encodedTag, encodedValue] = ciphertext.split(".");
      if (version !== "v1" || !encodedIv || !encodedTag || !encodedValue) {
        throw new Error("Invalid encrypted provider token");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
