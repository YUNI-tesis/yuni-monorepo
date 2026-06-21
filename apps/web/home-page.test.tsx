import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./app/page";

describe("public home page", () => {
  it("links visitors to the private dashboard", () => {
    const html = renderToStaticMarkup(createElement(HomePage));

    expect(html).toContain("Ir a dashboard");
    expect(html).toContain("href=\"/dashboard\"");
  });
});
