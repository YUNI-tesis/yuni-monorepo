import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconButton, YuniIcon } from "@yuni/ui";

describe("YUNI icon system", () => {
  it("renders Hugeicons through YuniIcon with currentColor defaults", () => {
    const html = renderToStaticMarkup(createElement(YuniIcon, { name: "add" }));

    expect(html).toContain("<svg");
    expect(html).toContain("currentColor");
  });

  it.each(["activity", "aiBrain", "chart", "document", "edit", "link", "mail", "pause", "share"] as const)(
    "renders the %s icon",
    (name) => {
      const html = renderToStaticMarkup(createElement(YuniIcon, { name }));

      expect(html).toContain("<svg");
      expect(html).toContain("currentColor");
    }
  );

  it("renders IconButton icons as nodes instead of pseudo-icon text", () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, {
        "aria-label": "Crear",
        icon: createElement(YuniIcon, { name: "add" }),
      })
    );

    expect(html).toContain("<svg");
    expect(html).not.toContain("&gt;+&lt;");
    expect(html).not.toContain(">+<");
  });
});
