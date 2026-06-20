import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YuniLogo } from "./components/brand/YuniLogo";
import { PrivateNavigation } from "./components/app-layout/PrivateNavigation";
import { getActivePrivateNavItem, getPrivatePageMaxWidth, isPrivatePathname } from "./components/app-layout/navigation";

describe("private app navigation", () => {
  it.each([
    ["/dashboard", "dashboard"],
    ["/avatars", "avatars"],
    ["/avatars/avatar-1", "avatars"],
    ["/avatars/avatar-1/edit", "avatars"],
    ["/avatars/new", "create-avatar"],
    ["/interact", "interact"],
    ["/interact/avatar-1", "interact"],
  ])("marks %s as %s", (pathname, expectedId) => {
    expect(getActivePrivateNavItem(pathname)?.id).toBe(expectedId);
  });

  it("renders visible navigation labels and current page state", () => {
    const html = renderToStaticMarkup(createElement(PrivateNavigation, { pathname: "/avatars/new" }));

    expect(html).toContain("Dashboard");
    expect(html).toContain("Avatares");
    expect(html).toContain("Crear avatar");
    expect(html).toContain("Interact");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("href=\"/avatars/new\"");
  });

  it("identifies private routes for the persistent app chrome", () => {
    expect(isPrivatePathname("/dashboard")).toBe(true);
    expect(isPrivatePathname("/avatars/avatar-1/edit")).toBe(true);
    expect(isPrivatePathname("/interact/avatar-1")).toBe(true);
    expect(isPrivatePathname("/auth/login")).toBe(false);
    expect(isPrivatePathname("/design-system")).toBe(false);
  });

  it.each([
    ["/dashboard", "1280px"],
    ["/avatars", "1280px"],
    ["/avatars/new", "1180px"],
    ["/avatars/avatar-1", "1280px"],
    ["/avatars/avatar-1/edit", "1180px"],
    ["/interact", "1280px"],
    ["/interact/avatar-1", "1440px"],
  ])("uses %s max width for %s", (pathname, maxWidth) => {
    expect(getPrivatePageMaxWidth(pathname)).toBe(maxWidth);
  });

  it("renders the YUNI logo component", () => {
    const html = renderToStaticMarkup(createElement(YuniLogo, { "aria-hidden": true }));

    expect(html).toContain("viewBox=\"0 0 95 81\"");
    expect(html).toContain("<ellipse");
  });
});
