import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function createRequest(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${pathname}`, cookie ? { headers: { cookie } } : undefined);
}

describe("web auth proxy", () => {
  it("redirects anonymous users away from private routes", () => {
    const response = proxy(createRequest("/dashboard"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/login");
  });

  it("allows private routes when a session cookie exists", () => {
    const response = proxy(createRequest("/dashboard", "yuni_session=token"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects authenticated users away from auth routes", () => {
    const response = proxy(createRequest("/auth/login", "yuni_session=token"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });
});
