import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarListFilterControls } from "./components/avatar-list/AvatarListView";
import { deleteAvatar } from "./lib/api/avatar-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avatar list filters", () => {
  it("renders all Mis avatares filters with pressed state", () => {
    const html = renderToStaticMarkup(
      createElement(AvatarListFilterControls, {
        activeFilter: "shared",
        onFilterChange: vi.fn(),
      })
    );

    expect(html).toContain("Todos");
    expect(html).toContain("Propios");
    expect(html).toContain("Compartidos conmigo");
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("avatar list API", () => {
  it("deletes an avatar through the authenticated API route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteAvatar("avatar-1")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/avatars/avatar-1",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
      })
    );
  });
});
