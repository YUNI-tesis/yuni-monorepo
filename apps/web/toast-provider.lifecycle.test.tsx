import { JSDOM } from "jsdom";
import React, { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@yuni/ui";

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;

function ToastHarness({
  onEvicted = () => undefined,
  onActionDismissed = () => undefined,
  onIdDismissed = () => undefined,
}: {
  onEvicted?: () => void;
  onActionDismissed?: () => void;
  onIdDismissed?: () => void;
}) {
  const toast = useToast();
  const [page, setPage] = useState("origen");

  return (
    <div>
      <span>{page}</span>
      <button onClick={() => toast.success("Cambios guardados", { title: "Listo" })}>Éxito</button>
      <button
        onClick={() =>
          toast.error("Intentá nuevamente.", {
            title: "No pudimos guardar",
            dedupeKey: "save-error",
          })
        }
      >
        Error
      </button>
      <button
        onClick={() => {
          toast.success("Avatar creado", { title: "Avatar creado" });
          setPage("destino");
        }}
      >
        Navegar
      </button>
      <button
        onClick={() => {
          toast.info("Primero", { dedupeKey: "one", onDismiss: onEvicted });
          toast.info("Segundo", { dedupeKey: "two" });
          toast.info("Tercero", { dedupeKey: "three" });
          toast.info("Cuarto", { dedupeKey: "four" });
        }}
      >
        Apilar
      </button>
      <button
        onClick={() =>
          toast.warning("Revisá la configuración antes de continuar.", {
            title: "Acción requerida",
            action: <button>Resolver</button>,
            onDismiss: onActionDismissed,
          })
        }
      >
        Con acción
      </button>
      <button
        onClick={() => toast.info("Contenido original", { id: "fixed-toast", onDismiss: onIdDismissed })}
      >
        ID original
      </button>
      <button onClick={() => toast.info("Contenido actualizado", { id: "fixed-toast" })}>
        ID actualizado
      </button>
    </div>
  );
}

describe("global toast provider", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("FocusEvent", dom.window.FocusEvent);
    ({ act, cleanup, fireEvent, render, screen } = await import("@testing-library/react"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("deduplicates repeated errors and exposes assertive accessibility semantics", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    fireEvent.click(screen.getByRole("button", { name: "Error" }));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
    expect(screen.getByText("No pudimos guardar")).toBeTruthy();
  });

  it("restarts the timer when a notification is deduplicated", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    act(() => vi.advanceTimersByTime(7_000));
    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    act(() => vi.advanceTimersByTime(7_999));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restarts the timer when a notification is replaced by id", () => {
    vi.useFakeTimers();
    const onIdDismissed = vi.fn();
    render(
      <ToastProvider>
        <ToastHarness onIdDismissed={onIdDismissed} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "ID original" }));
    act(() => vi.advanceTimersByTime(4_000));
    fireEvent.click(screen.getByRole("button", { name: "ID actualizado" }));

    expect(screen.queryByText("Contenido original")).toBeNull();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByText("Contenido actualizado")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Contenido actualizado")).toBeNull();
    expect(onIdDismissed).toHaveBeenCalledOnce();
  });

  it("keeps a success visible when the page content changes", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Navegar" }));

    expect(screen.getByText("destino")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Avatar creado");
  });

  it("caps the stack at three and dismisses the oldest notification", () => {
    const onEvicted = vi.fn();
    render(
      <ToastProvider>
        <ToastHarness onEvicted={onEvicted} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Apilar" }));

    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.queryByText("Primero")).toBeNull();
    expect(screen.getByText("Cuarto")).toBeTruthy();
    expect(onEvicted).toHaveBeenCalledOnce();
  });

  it("auto-dismisses successes after five seconds and pauses while hovered", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Éxito" }));
    const notification = screen.getByRole("status");

    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.mouseEnter(notification);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("status")).toBeTruthy();

    fireEvent.mouseLeave(notification);
    act(() => vi.advanceTimersByTime(1_999));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps errors visible for eight seconds", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    act(() => vi.advanceTimersByTime(7_999));
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps notifications with actions until they are manually dismissed", () => {
    vi.useFakeTimers();
    const onActionDismissed = vi.fn();
    render(
      <ToastProvider>
        <ToastHarness onActionDismissed={onActionDismissed} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Con acción" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("button", { name: "Resolver" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar notificación" }));
    expect(screen.queryByText("Acción requerida")).toBeNull();
    expect(onActionDismissed).toHaveBeenCalledOnce();
  });

  it("reopens the popover after a native dialog enters the top layer", async () => {
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    Object.defineProperty(dom.window.HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: showPopover,
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: hidePopover,
    });

    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Éxito" }));
    await act(async () => Promise.resolve());
    const callsBeforeDialog = showPopover.mock.calls.length;

    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    dialog.setAttribute("open", "");
    await act(async () => Promise.resolve());

    expect(showPopover.mock.calls.length).toBeGreaterThan(callsBeforeDialog);
    dialog.remove();
    delete (dom.window.HTMLElement.prototype as { showPopover?: () => void }).showPopover;
    delete (dom.window.HTMLElement.prototype as { hidePopover?: () => void }).hidePopover;
  });
});
