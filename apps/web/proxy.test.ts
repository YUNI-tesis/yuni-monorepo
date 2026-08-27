import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function createRequest(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${pathname}`, cookie ? { headers: { cookie } } : undefined);
}

describe("web auth proxy", () => {
  it.each(["/", "/a/demo-link"])("does not protect the public route %s", (pathname) => {
    const response = proxy(createRequest(pathname));

    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/dashboard",
    "/avatars",
    "/avatars/new",
    "/avatars/avatar-1",
    "/groups",
    "/groups/group-1",
    "/interact",
    "/interact/avatar-1",
  ])("redirects anonymous users away from %s", (pathname) => {
    const response = proxy(createRequest(pathname));

    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/login");
  });

  it.each([
    "/dashboard",
    "/avatars",
    "/avatars/new",
    "/avatars/avatar-1",
    "/groups",
    "/groups/group-1",
    "/interact",
    "/interact/avatar-1",
  ])("allows %s when a session cookie exists", (pathname) => {
    const response = proxy(createRequest(pathname, "yuni_session=token"));

    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/auth/login", "/auth/register"])(
    "keeps %s reachable when a stale session cookie exists",
    (pathname) => {
      const response = proxy(createRequest(pathname, "yuni_session=stale-token"));

      expect(response.headers.get("location")).toBeNull();
    }
  );
});
