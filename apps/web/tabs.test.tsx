import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tabs } from "@yuni/ui";

const items = [
  { value: "info", label: "Informacion", content: "Informacion del avatar" },
  { value: "contexto", label: "Contexto", content: "Contexto preparado" },
];

describe("Tabs", () => {
  it("renders controlled tabs with accessible tab and panel state", () => {
    const html = renderToStaticMarkup(
      createElement(Tabs, {
        "aria-label": "Secciones del perfil",
        items,
        value: "contexto",
      })
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Secciones del perfil"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Contexto preparado");
  });
});
