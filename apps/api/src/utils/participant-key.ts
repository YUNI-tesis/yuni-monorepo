import { createHash } from "node:crypto";

export function createParticipantKey(email: string) {
  return `p_${createHash("sha256").update(email.trim().toLowerCase()).digest("base64url")}`;
}
