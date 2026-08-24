import { describe, expect, it } from "vitest";
import { readSafeHttpUrl } from "./safe-url";

describe("readSafeHttpUrl", () => {
  it("accepts browser-safe HTTP URLs and rejects credentials or unsupported schemes", () => {
    expect(readSafeHttpUrl("https://cdn.example.com/avatar.png")).toBe("https://cdn.example.com/avatar.png");
    expect(readSafeHttpUrl("https://user:password@cdn.example.com/avatar.png")).toBeNull();
    expect(readSafeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(readSafeHttpUrl("not a url")).toBeNull();
  });
});
