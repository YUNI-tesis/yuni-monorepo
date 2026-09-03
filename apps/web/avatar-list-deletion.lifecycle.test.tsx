import { JSDOM } from "jsdom";
import React from "react";
import { ToastProvider } from "@yuni/ui";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarListView } from "./components/avatar-list/AvatarListView";
import type { ApiAvatarSummary } from "./lib/api/avatar-api";

const avatarMocks = vi.hoisted(() => ({
  deleteAvatar: vi.fn(),
  invalidateAvatarListCache: vi.fn(),
  push: vi.fn(),
}));

const avatarState = vi.hoisted(() => ({
  avatars: [] as ApiAvatarSummary[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: avatarMocks.push }),
}));

vi.mock("./hooks/useAvatarList", () => ({
  useAvatarList: () => ({ status: "ready", avatars: avatarState.avatars, error: null }),
  invalidateAvatarListCache: avatarMocks.invalidateAvatarListCache,
}));

vi.mock("./lib/api/avatar-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib/api/avatar-api")>();
  return { ...original, deleteAvatar: avatarMocks.deleteAvatar };
});

const ownedAvatar: ApiAvatarSummary = {
  id: "avatar-owned",
  name: "Ada",
  description: "Asistente propia",
  status: "active",
  providerSyncStatus: "synced",
  thumbnailUrl: null,
  interactionAvailability: "ready",
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
  access: {
    type: "owner",
    canEdit: true,
    canShare: true,
    canInteract: true,
  },
};

const sharedAvatar: ApiAvatarSummary = {
  ...ownedAvatar,
  id: "avatar-shared",
  name: "Grace",
  description: "Asistente compartida",
  access: {
    type: "shared",
    canEdit: false,
    canShare: false,
    canInteract: true,
  },
};

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

describe("avatar list deletion", () => {
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
    for (const mock of Object.values(avatarMocks)) mock.mockReset();
    avatarState.avatars = [ownedAvatar, sharedAvatar];
    avatarMocks.deleteAvatar.mockResolvedValue({ ok: true });
    vi.spyOn(dom.window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  function openOwnedAvatarDeletion() {
    fireEvent.click(screen.getByRole("button", { name: "Más acciones para Ada" }));
    const menuItem = screen.getByRole("menuitem", { name: "Eliminar" });
    expect(menuItem.className).toContain("yuni-dropdown__item--danger");
    fireEvent.click(menuItem);
    return screen.getByRole("dialog", { name: "Eliminar avatar" }) as HTMLDialogElement;
  }

  it("deletes an owned avatar only after confirmation and updates the list", async () => {
    let resolveDeletion: ((value: { ok: true }) => void) | undefined;
    avatarMocks.deleteAvatar.mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveDeletion = resolve;
        })
    );
    render(
      <ToastProvider>
        <AvatarListView />
      </ToastProvider>
    );

    const dialog = openOwnedAvatarDeletion();
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("El avatar “Ada” se eliminará definitivamente");
    expect(dialog.textContent).toContain("El historial guardado se conservará.");
    expect(avatarMocks.deleteAvatar).not.toHaveBeenCalled();
    expect(dom.window.confirm).not.toHaveBeenCalled();

    const deleteButton = screen.getByRole("button", { name: "Eliminar" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(avatarMocks.deleteAvatar).toHaveBeenCalledOnce();
    expect(avatarMocks.deleteAvatar).toHaveBeenCalledWith("avatar-owned");
    expect(deleteButton).toHaveProperty("disabled", true);

    resolveDeletion?.({ ok: true });

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Avatar eliminado"));
    expect(avatarMocks.invalidateAvatarListCache).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.getByText("Grace")).toBeTruthy();
  });

  it("does not expose deletion for shared avatars and leaves data unchanged when cancelled", () => {
    render(
      <ToastProvider>
        <AvatarListView />
      </ToastProvider>
    );

    expect(screen.queryByRole("button", { name: "Más acciones para Grace" })).toBeNull();
    const dialog = openOwnedAvatarDeletion();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    dialog.close();
    fireEvent(dialog, new dom.window.Event("close"));

    expect(avatarMocks.deleteAvatar).not.toHaveBeenCalled();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("Grace")).toBeTruthy();
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("keeps the dialog and avatar available after a deletion failure", async () => {
    avatarState.avatars = [ownedAvatar];
    avatarMocks.deleteAvatar.mockRejectedValue(new Error("No se pudo eliminar."));
    render(
      <ToastProvider>
        <AvatarListView />
      </ToastProvider>
    );

    const dialog = openOwnedAvatarDeletion();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No pudimos eliminar el avatar")
    );
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveProperty("disabled", false);
    expect(avatarMocks.invalidateAvatarListCache).not.toHaveBeenCalled();
  });

  it("shows the empty state after deleting the last visible avatar", async () => {
    avatarState.avatars = [ownedAvatar];
    render(
      <ToastProvider>
        <AvatarListView />
      </ToastProvider>
    );

    openOwnedAvatarDeletion();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.getByText("Todavia no tenes avatares")).toBeTruthy());
  });
});
