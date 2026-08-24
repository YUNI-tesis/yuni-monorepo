import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./index";

describe("observability redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts sensitive keys and values recursively without case sensitivity", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createLogger("test").error("Failed for Person@Example.com", {
      Authorization: "Bearer private-token",
      nested: {
        participantEMAIL: "person@example.com",
        detail: "apiKey=super-secret",
        stackPath: "file:///repo/node_modules/.pnpm/@vitest+runner@3.2.4/index.js",
      },
    });

    const output = String(write.mock.calls[0]?.[0]);
    expect(output).not.toContain("private-token");
    expect(output).not.toContain("person@example.com");
    expect(output).not.toContain("Person@Example.com");
    expect(output).not.toContain("super-secret");
    expect(output).toContain("[redacted]");
    expect(output).toContain("@vitest+runner@3.2.4/index.js");
  });
});
