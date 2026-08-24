import { JSDOM } from "jsdom";
import React from "react";
import { ToastProvider } from "@yuni/ui";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupsHub } from "./components/groups/GroupsHub";

const groupMocks = vi.hoisted(() => ({
  listAvatarGroups: vi.fn(),
  createAvatarGroup: vi.fn(),
  updateAvatarGroup: vi.fn(),
  deleteAvatarGroup: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: groupMocks.push }),
}));

vi.mock("./hooks/useAvatarList", () => ({
  useAvatarList: () => ({
    status: "ready",
    error: null,
    avatars: [
      {
        id: "avatar-1",
        name: "Ada",
        status: "active",
        interactionAvailability: "ready",
        access: { type: "owner" },
      },
      {
        id: "avatar-2",
        name: "Turing",
        status: "active",
        interactionAvailability: "ready",
        access: { type: "owner" },
      },
    ],
  }),
}));

vi.mock("./lib/api/avatar-group-api", () => ({
  listAvatarGroups: groupMocks.listAvatarGroups,
  createAvatarGroup: groupMocks.createAvatarGroup,
  updateAvatarGroup: groupMocks.updateAvatarGroup,
  deleteAvatarGroup: groupMocks.deleteAvatarGroup,
}));

const group = {
  id: "group-1",
  name: "Consejo",
  members: [
    {
      id: "avatar-1",
      name: "Ada",
      description: "",
      thumbnailUrl: null,
      accessType: "owner",
      position: 0,
      available: true,
    },
    {
      id: "avatar-2",
      name: "Turing",
      description: "",
      thumbnailUrl: null,
      accessType: "owner",
      position: 1,
      available: true,
    },
  ],
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

describe("group toast feedback", () => {
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
    for (const mock of Object.values(groupMocks)) mock.mockReset();
    groupMocks.listAvatarGroups.mockResolvedValue({ groups: [] });
    groupMocks.deleteAvatarGroup.mockResolvedValue({ ok: true });
    vi.spyOn(dom.window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("announces a newly created group", async () => {
    groupMocks.createAvatarGroup.mockResolvedValue({ group });
    render(
      <ToastProvider>
        <GroupsHub />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Todavía no tenés grupos")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Crear grupo" })[0]!);
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Consejo" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Ada/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Turing/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Crear grupo" }).at(-1)!);

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Grupo creado"));
    expect(groupMocks.createAvatarGroup).toHaveBeenCalledWith({
      name: "Consejo",
      avatarIds: ["avatar-1", "avatar-2"],
    });
  });

  it("keeps the group dialog open after a failed edit", async () => {
    groupMocks.listAvatarGroups.mockResolvedValue({ groups: [group] });
    groupMocks.updateAvatarGroup.mockRejectedValue(new Error("No se pudo guardar."));
    render(
      <ToastProvider>
        <GroupsHub />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Consejo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Más acciones para Consejo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Consejo editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No pudimos actualizar el grupo")
    );
    expect(screen.getByRole("dialog", { name: "Editar grupo" }).hasAttribute("open")).toBe(true);
  });

  it("announces a confirmed group deletion", async () => {
    groupMocks.listAvatarGroups.mockResolvedValue({ groups: [group] });
    render(
      <ToastProvider>
        <GroupsHub />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText("Consejo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Más acciones para Consejo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Grupo eliminado"));
    expect(groupMocks.deleteAvatarGroup).toHaveBeenCalledWith("group-1");
    expect(screen.queryByText("Consejo")).toBeNull();
  });
});
