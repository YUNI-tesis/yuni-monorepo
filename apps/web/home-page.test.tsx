import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./app/page";

describe("public home page", () => {
  it("renders the thesis narrative and links visitors to the demo", () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain("La IA deja de");
    expect(html).toContain("Se convierte en presencia");
    expect(html).toContain("Conversar no alcanza");
    expect(html).toContain("De una idea");
    expect(html).toContain("Una experiencia humana");
    expect(html).toContain("<span>Creá.</span>");
    expect(html).toContain("<span>Comprendé.</span>");
    expect(html).toContain("Lucas");
    expect(html).toContain("Santiago");
    expect(html).toContain('href="#experiencia"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('data-draggable="true"');
  });
});
