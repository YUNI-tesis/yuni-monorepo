import { Children, createElement, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ToastPresentation } from "./Toast";

describe("Toast", () => {
  it("renders a reusable dismissible warning notification", () => {
    const toast = ToastPresentation({
      tone: "warning",
      title: "Límite alcanzado",
      children: "Ya alcanzaste la cantidad de llamadas permitidas.",
      onDismiss: () => undefined,
    });
    const dismissButton = Children.toArray(toast.props.children).find(
      (child) => isValidElement(child) && child.type === "button"
    );

    expect(toast.props.role).toBe("status");
    expect(toast.props["aria-live"]).toBe("polite");
    expect(isValidElement<{ "aria-label": string }>(dismissButton)).toBe(true);
    expect(
      isValidElement<{ "aria-label": string }>(dismissButton) ? dismissButton.props["aria-label"] : null
    ).toBe("Cerrar notificación");
    expect(readText(toast)).toContain("Límite alcanzado");
    expect(readText(toast)).toContain("Ya alcanzaste la cantidad de llamadas permitidas.");
  });

  it("supports assertive danger notifications, custom actions and hidden icons", () => {
    const toast = ToastPresentation({
      tone: "danger",
      icon: null,
      action: createElement("button", null, "Reintentar"),
      children: "No pudimos guardar los cambios.",
    });

    expect(toast.props.role).toBe("alert");
    expect(toast.props["aria-live"]).toBe("assertive");
    expect(readText(toast)).toContain("Reintentar");
    expect(readText(toast)).toContain("No pudimos guardar los cambios.");
  });
});

function readText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(readText).join(" ");
  }

  return isValidElement<{ children?: ReactNode }>(node) ? readText(node.props.children) : "";
}
