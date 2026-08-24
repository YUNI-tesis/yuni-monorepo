import { JSDOM } from "jsdom";
import React from "react";
import { ToastProvider } from "@yuni/ui";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAvatarContext } from "./hooks/useAvatarContext";

const contextMocks = vi.hoisted(() => ({
  getAvatarContext: vi.fn(),
  updateAvatarContext: vi.fn(),
  uploadAvatarDocument: vi.fn(),
  deleteDocument: vi.fn(),
  retryDocument: vi.fn(),
}));

vi.mock("./lib/api/avatar-api", () => ({
  getAvatarContext: contextMocks.getAvatarContext,
  updateAvatarContext: contextMocks.updateAvatarContext,
  uploadAvatarDocument: contextMocks.uploadAvatarDocument,
  deleteDocument: contextMocks.deleteDocument,
  retryDocument: contextMocks.retryDocument,
}));

const readyContext = {
  text: "Contexto inicial",
  status: "ready",
  hasPreviousUsableVersion: false,
  updatedAt: "2026-08-24T00:00:00.000Z",
  documents: [{ id: "document-1", fileName: "fuente.pdf", status: "ready" }],
};

function ContextHarness() {
  const context = useAvatarContext("avatar-1");

  return (
    <div>
      <span>{context.loading ? "Cargando" : "Listo"}</span>
      <span data-testid="uploads">
        {context.uploads.map((upload) => `${upload.fileName}:${upload.status}`).join("|")}
      </span>
      <button onClick={() => void context.saveText()}>Guardar contexto</button>
      <button
        onClick={() =>
          void context.upload([
            new File(["uno"], "uno.pdf", { type: "application/pdf" }),
            new File(["dos"], "dos.pdf", { type: "application/pdf" }),
          ])
        }
      >
        Subir documentos
      </button>
      <button onClick={() => void context.remove("document-1", "fuente.pdf")}>Eliminar documento</button>
      <button onClick={() => void context.retry("document-1", "fuente.pdf")}>Reintentar documento</button>
    </div>
  );
}

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

describe("context and document toast feedback", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("File", dom.window.File);
    ({ cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react"));
  });

  beforeEach(() => {
    for (const mock of Object.values(contextMocks)) mock.mockReset();
    contextMocks.getAvatarContext.mockResolvedValue({ context: readyContext });
    contextMocks.updateAvatarContext.mockResolvedValue({ context: readyContext });
    contextMocks.deleteDocument.mockResolvedValue({});
    contextMocks.retryDocument.mockResolvedValue({});
  });

  afterEach(() => cleanup());

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("announces a saved text context", async () => {
    render(
      <ToastProvider>
        <ContextHarness />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Listo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Guardar contexto" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Contexto guardado"));
  });

  it("summarizes a mixed batch while retaining each file result", async () => {
    contextMocks.uploadAvatarDocument
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Archivo dañado"));
    render(
      <ToastProvider>
        <ContextHarness />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Listo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Subir documentos" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Algunos documentos no se subieron")
    );
    expect(screen.getByTestId("uploads").textContent).toContain("uno.pdf:confirmed");
    expect(screen.getByTestId("uploads").textContent).toContain("dos.pdf:failed");
  });

  it("reports delete failures without removing the contextual document", async () => {
    contextMocks.deleteDocument.mockRejectedValue(new Error("No se pudo eliminar."));
    render(
      <ToastProvider>
        <ContextHarness />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Listo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar documento" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No pudimos eliminar el documento")
    );
    expect(contextMocks.getAvatarContext).toHaveBeenCalledOnce();
  });

  it("announces a confirmed processing retry", async () => {
    render(
      <ToastProvider>
        <ContextHarness />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Listo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Reintentar documento" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Procesamiento reintentado")
    );
    expect(contextMocks.getAvatarContext).toHaveBeenCalledTimes(2);
  });
});
