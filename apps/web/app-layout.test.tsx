import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YuniLogo } from "./components/brand/YuniLogo";
import { getUserInitials } from "./components/app-layout/PrivateAreaLayout";
import { PrivateNavigation } from "./components/app-layout/PrivateNavigation";
import {
  getActivePrivateNavItem,
  getPrivatePageLayoutVariant,
  getPrivatePageMaxWidth,
  isPrivatePathname,
} from "./components/app-layout/navigation";

describe("private app navigation", () => {
  it.each([
    ["/dashboard", "dashboard"],
    ["/avatars", "avatars"],
    ["/avatars/new", "avatars"],
    ["/avatars/avatar-1", "avatars"],
    ["/avatars/avatar-1/edit", "avatars"],
    ["/groups", "groups"],
    ["/groups/group-1", "groups"],
  ])("marks %s as %s", (pathname, expectedId) => {
    expect(getActivePrivateNavItem(pathname)?.id).toBe(expectedId);
  });

  it("does not mark Interact as a primary navigation section", () => {
    expect(getActivePrivateNavItem("/interact")).toBeNull();
    expect(getActivePrivateNavItem("/interact/avatar-1")).toBeNull();
  });

  it("renders visible navigation labels and current page state", () => {
    const html = renderToStaticMarkup(createElement(PrivateNavigation, { pathname: "/avatars/new" }));

    expect(html).toContain("Dashboard");
    expect(html).toContain("Mis avatares");
    expect(html).toContain("Grupos");
    expect(html).not.toContain("Crear avatar");
    expect(html).not.toContain("Interact");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/avatars"');
  });

  it("identifies private routes for the persistent app chrome", () => {
    expect(isPrivatePathname("/")).toBe(false);
    expect(isPrivatePathname("/dashboard")).toBe(true);
    expect(isPrivatePathname("/avatars/avatar-1/edit")).toBe(true);
    expect(isPrivatePathname("/groups")).toBe(true);
    expect(isPrivatePathname("/groups/group-1")).toBe(true);
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
    ["/groups", "1280px"],
    ["/groups/group-1", "1440px"],
    ["/interact", "1280px"],
    ["/interact/avatar-1", "1440px"],
  ])("uses %s max width for %s", (pathname, maxWidth) => {
    expect(getPrivatePageMaxWidth(pathname)).toBe(maxWidth);
  });

  it.each([
    ["/dashboard", "standard"],
    ["/avatars/avatar-1", "standard"],
    ["/groups", "standard"],
    ["/groups/group-1", "focus"],
    ["/interact", "standard"],
    ["/interact/avatar-1", "focus"],
  ])("uses %s layout variant for %s", (pathname, variant) => {
    expect(getPrivatePageLayoutVariant(pathname)).toBe(variant);
  });

  it("renders the YUNI logo component", () => {
    const html = renderToStaticMarkup(createElement(YuniLogo, { "aria-hidden": true }));

    expect(html).toContain('viewBox="0 0 95 81"');
    expect(html).toContain("<ellipse");
  });

  it.each([
    [{ name: "Diagnostico Maipú", email: "d.maipu@example.com" }, "DM"],
    [{ name: "Santiago", email: "santiago@example.com" }, "SA"],
    [{ name: null, email: "d.maipu@example.com" }, "DM"],
    [{ name: null, email: "usuario@example.com" }, "US"],
  ])("builds user initials from the available profile data", (user, expectedInitials) => {
    expect(getUserInitials(user)).toBe(expectedInitials);
  });
});
