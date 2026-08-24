import { JSDOM } from "jsdom";
import React from "react";
import { ToastProvider } from "@yuni/ui";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarShareTab } from "./components/avatar-profile/AvatarShareTab";

const sharingMocks = vi.hoisted(() => ({
  links: [] as unknown[],
  grants: [] as unknown[],
  createLink: vi.fn(),
  setLinkEnabled: vi.fn(),
  updateLinkLimits: vi.fn(),
  removeLink: vi.fn(),
  createGrant: vi.fn(),
  setGrantStatus: vi.fn(),
  updateGrantLimits: vi.fn(),
  removeGrant: vi.fn(),
  retryLinks: vi.fn(),
  retryGrants: vi.fn(),
  isMutating: vi.fn(() => false),
}));

vi.mock("./hooks/useAvatarSharing", () => ({
  useAvatarSharing: () => ({
    links: { status: "ready", data: sharingMocks.links, error: null },
    grants: { status: "ready", data: sharingMocks.grants, error: null },
    createLink: sharingMocks.createLink,
    setLinkEnabled: sharingMocks.setLinkEnabled,
    updateLinkLimits: sharingMocks.updateLinkLimits,
    removeLink: sharingMocks.removeLink,
    createGrant: sharingMocks.createGrant,
    setGrantStatus: sharingMocks.setGrantStatus,
    updateGrantLimits: sharingMocks.updateGrantLimits,
    removeGrant: sharingMocks.removeGrant,
    retryLinks: sharingMocks.retryLinks,
    retryGrants: sharingMocks.retryGrants,
    isMutating: sharingMocks.isMutating,
  }),
}));

const limits = { maxSessionDurationSeconds: null, maxSessionsPer24Hours: null };
const link = {
  id: "link-1",
  avatarAgentId: "avatar-1",
  slug: "ada-publica",
  name: "Ada pública",
  isEnabled: true,
  publicUrl: "https://yuni.test/a/ada-publica",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  lastUsedAt: null,
  limits,
};
const grant = {
  id: "grant-1",
  avatarAgentId: "avatar-1",
  participantEmail: "participant@yuni.test",
  participantUserId: null,
  state: "linked",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  revokedAt: null,
  limits,
};
const avatar = { id: "avatar-1", name: "Ada", status: "active" };

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

describe("sharing and limits toast feedback", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("HTMLDialogElement", dom.window.HTMLDialogElement);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("PointerEvent", dom.window.MouseEvent);
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    });
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    ({ cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react"));
  });

  beforeEach(() => {
    sharingMocks.links = [];
    sharingMocks.grants = [];
    sharingMocks.createLink.mockReset();
    sharingMocks.setLinkEnabled.mockReset();
    sharingMocks.updateLinkLimits.mockReset();
    sharingMocks.removeLink.mockReset();
    sharingMocks.createGrant.mockReset();
    sharingMocks.setGrantStatus.mockReset();
    sharingMocks.updateGrantLimits.mockReset();
    sharingMocks.removeGrant.mockReset();
    sharingMocks.retryLinks.mockReset();
    sharingMocks.retryGrants.mockReset();
    sharingMocks.isMutating.mockReset();
    sharingMocks.isMutating.mockReturnValue(false);
    sharingMocks.createLink.mockResolvedValue({});
    sharingMocks.updateLinkLimits.mockResolvedValue({});
    sharingMocks.createGrant.mockResolvedValue({});
    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(async () => {
    cleanup();
    await new Promise<void>((resolve) => setImmediate(resolve));
    vi.restoreAllMocks();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("announces link creation", async () => {
    render(
      <ToastProvider>
        <AvatarShareTab avatar={avatar as never} />
      </ToastProvider>
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Crear link público" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Crear link" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Link público creado"));
    expect(sharingMocks.createLink).toHaveBeenCalledWith({
      name: "Ada",
      slug: "ada",
      isEnabled: true,
      limits,
    });
  });

  it("reports a clipboard failure", async () => {
    sharingMocks.links = [link];
    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Permiso denegado")) },
    });
    render(
      <ToastProvider>
        <AvatarShareTab avatar={avatar as never} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Acciones para Ada pública" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copiar link" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No pudimos copiar el link"));
  });

  it("opens a public link without reporting a false popup failure", () => {
    sharingMocks.links = [link];
    const destination = {
      href: "",
      target: "",
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const popup = {
      opener: dom.window,
      close: vi.fn(),
      document: {
        createElement: vi.fn(() => destination),
        body: { append: vi.fn() },
      },
    };
    const openSpy = vi.spyOn(dom.window, "open").mockReturnValue(popup as unknown as Window);
    render(
      <ToastProvider>
        <AvatarShareTab avatar={avatar as never} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Acciones para Ada pública" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir link" }));

    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    expect(popup.opener).toBeNull();
    expect(popup.document.createElement).toHaveBeenCalledWith("a");
    expect(destination).toMatchObject({ href: link.publicUrl, target: "_self", rel: "noreferrer" });
    expect(popup.document.body.append).toHaveBeenCalledWith(destination);
    expect(destination.click).toHaveBeenCalledOnce();
    expect(destination.remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports when the browser actually blocks a public link", async () => {
    sharingMocks.links = [link];
    vi.spyOn(dom.window, "open").mockReturnValue(null);
    render(
      <ToastProvider>
        <AvatarShareTab avatar={avatar as never} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Acciones para Ada pública" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir link" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("El navegador bloqueó el link")
    );
  });

  it("announces an update to interaction limits", async () => {
    sharingMocks.links = [link];
    render(
      <ToastProvider>
        <AvatarShareTab avatar={avatar as never} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Acciones para Ada pública" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar límites" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar límites" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Límites actualizados"));
    expect(sharingMocks.updateLinkLimits).toHaveBeenCalledWith("link-1", limits);
  });

  it("keeps access creation recoverable after a general failure", async () => {
    sharingMocks.grants = [grant];
    sharingMocks.createGrant.mockRejectedValue(new Error("Servicio no disponible"));
    render(
      <ToastProvider>
        <AvatarShareTab avatar={avatar as never} />
      </ToastProvider>
    );

    fireEvent.change(screen.getByLabelText("Email del participante"), {
      target: { value: "new-participant@yuni.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Dar acceso" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No pudimos agregar el acceso")
    );
    expect(screen.getByRole("dialog", { name: "Configurar acceso" }).hasAttribute("open")).toBe(true);
  });
});
