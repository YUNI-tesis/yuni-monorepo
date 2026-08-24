import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AvatarListFilterControls } from "./components/avatar-list/AvatarListView";

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
