import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readMigration = (name: string) =>
  readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url));

describe("applied group interruption migration history", () => {
  it.each([
    [
      "20260824120000_user_preemptible_group_call_floor",
      "a601d57144fbf734075d7a2483397d4583f7c7f1edc47017756a65c6b4508e67",
    ],
    [
      "20260912120000_group_human_interruption_context",
      "402d1926050acab5f317d01ce2a5732c92f379a37fef92b2c20e6c75fc1639c7",
    ],
  ])("preserves the exact applied SQL for %s", (name, checksum) => {
    // Applied files are immutable: schema extensions need another migration.
    expect(createHash("sha256").update(readMigration(name!)).digest("hex")).toBe(checksum);
  });

  it("keeps the historical table in the schema without exposing it to the v2 client", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const legacyModel = schema.match(/model LegacyGroupVoiceInterruptionEvent \{([^}]+)\}/)?.[1];
    const activeModel = schema.match(/model GroupVoiceInterruptionEvent \{([^}]+)\}/)?.[1];
    expect(legacyModel).toContain('@@map("GroupVoiceInterruptionEvent")');
    expect(legacyModel).toContain("@@ignore");
    expect(activeModel).toContain('@@map("GroupVoiceHumanInterruptionReceipt")');
    expect(activeModel).not.toContain("@@ignore");
  });
});
