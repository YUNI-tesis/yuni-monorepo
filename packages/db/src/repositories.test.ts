import { describe, expect, it } from "vitest";
import { prisma } from "./client";
import { createMessageRepository } from "./repositories/message-repository";

describe("@yuni/db repository contracts", () => {
  it("does not expose update or delete flows for messages", () => {
    const messageRepository = createMessageRepository(prisma);

    expect("append" in messageRepository).toBe(true);
    expect("listByConversation" in messageRepository).toBe(true);
    expect("update" in messageRepository).toBe(false);
    expect("delete" in messageRepository).toBe(false);
  });
});

describe.skip("repository integration tests", () => {
  it("requires a dedicated PostgreSQL test database before running ownership and slug scenarios", () => {
    expect(true).toBe(true);
  });
});
