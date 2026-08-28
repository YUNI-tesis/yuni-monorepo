// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@yuni/ui";
import React, { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "./lib/api/http-client";

const { getMeMock, logoutMock, replaceBrowserLocationMock } = vi.hoisted(() => ({
  getMeMock: vi.fn(),
  logoutMock: vi.fn(),
  replaceBrowserLocationMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/avatars/new",
}));

vi.mock("./lib/api/auth-api", () => ({
  getMe: getMeMock,
  logout: logoutMock,
}));

vi.mock("./lib/api/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api/http-client")>()),
  replaceBrowserLocation: replaceBrowserLocationMock,
}));

import { PrivateAreaLayout } from "./components/app-layout/PrivateAreaLayout";

const sessionUser = {
  id: "user-1",
  email: "demo@yuni.local",
  name: "Demo",
  imageUrl: null,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

function renderPrivateLayout(children: ReactNode) {
  return render(
    <ToastProvider>
      <PrivateAreaLayout>{children}</PrivateAreaLayout>
    </ToastProvider>
  );
}

describe("PrivateAreaLayout session gate", () => {
  beforeEach(() => {
    getMeMock.mockReset();
    logoutMock.mockReset();
    replaceBrowserLocationMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not mount private children before /me succeeds", async () => {
    let resolveSession!: (value: { user: typeof sessionUser }) => void;
    getMeMock.mockReturnValue(
      new Promise<{ user: typeof sessionUser }>((resolve) => {
        resolveSession = resolve;
      })
    );
    const onPrivateMount = vi.fn();

    function PrivateChild() {
      useEffect(() => {
        onPrivateMount();
      }, []);

      return <div>Contenido privado</div>;
    }

    renderPrivateLayout(<PrivateChild />);

    expect(screen.getByText("Validando sesión")).toBeTruthy();
    expect(screen.queryByText("Contenido privado")).toBeNull();
    expect(onPrivateMount).not.toHaveBeenCalled();

    resolveSession({ user: sessionUser });

    expect(await screen.findByText("Contenido privado")).toBeTruthy();
    await waitFor(() => expect(onPrivateMount).toHaveBeenCalledTimes(1));
  });

  it("offers a retry for a non-authentication failure", async () => {
    getMeMock
      .mockRejectedValueOnce(new ApiClientError("API temporalmente no disponible", 503))
      .mockResolvedValueOnce({ user: sessionUser });

    renderPrivateLayout(<div>Contenido recuperado</div>);

    expect(await screen.findByText("No pudimos validar tu sesión")).toBeTruthy();
    expect(screen.queryByText("Contenido recuperado")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Contenido recuperado")).toBeTruthy();
  });

  it("validates /me again after the private layout is remounted", async () => {
    getMeMock.mockResolvedValueOnce({
      user: { ...sessionUser, id: "user-a", name: "Usuario A" },
    });

    const firstRender = renderPrivateLayout(<div>Primera sesión</div>);

    expect(await screen.findByText("Usuario A")).toBeTruthy();
    firstRender.unmount();

    getMeMock.mockResolvedValueOnce({
      user: { ...sessionUser, id: "user-b", name: "Usuario B" },
    });

    renderPrivateLayout(<div>Segunda sesión</div>);

    expect(await screen.findByText("Usuario B")).toBeTruthy();
    expect(screen.queryByText("Usuario A")).toBeNull();
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });

  it("hard reloads the app after logout succeeds", async () => {
    getMeMock.mockResolvedValue({ user: sessionUser });
    logoutMock.mockResolvedValue(undefined);

    renderPrivateLayout(<div>Contenido privado</div>);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir menú de perfil de Demo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    await waitFor(() => expect(replaceBrowserLocationMock).toHaveBeenCalledWith("/auth/login"));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("stays on the private page when logout fails", async () => {
    getMeMock.mockResolvedValue({ user: sessionUser });
    logoutMock.mockRejectedValue(new Error("No hay conexión"));

    renderPrivateLayout(<div>Contenido privado</div>);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir menú de perfil de Demo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    expect(await screen.findByText("No pudimos cerrar la sesión")).toBeTruthy();
    expect(replaceBrowserLocationMock).not.toHaveBeenCalled();
  });
});
