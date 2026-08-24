import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@yuni/ui";
import LoginPage from "./app/auth/login/page";
import RegisterPage from "./app/auth/register/page";

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("./lib/api/auth-api", () => ({
  login: authMocks.login,
  register: authMocks.register,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: authMocks.push, refresh: authMocks.refresh }),
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children }: { href: string; children: React.ReactNode }) =>
      createElement("a", { href }, children),
  };
});

let dom: JSDOM;
let cleanup: typeof import("@testing-library/react").cleanup;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

describe("authentication toast feedback", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("self", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("HTMLFormElement", dom.window.HTMLFormElement);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("FormData", dom.window.FormData);
    ({ cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react"));
  });

  beforeEach(() => {
    authMocks.login.mockReset();
    authMocks.register.mockReset();
    authMocks.push.mockReset();
    authMocks.refresh.mockReset();
  });

  afterEach(() => cleanup());

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("announces a successful login before navigating", async () => {
    authMocks.login.mockResolvedValue({});
    render(
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@yuni.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Sesión iniciada"));
    expect(authMocks.push).toHaveBeenCalledWith("/dashboard");
    expect(authMocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the login form available after an operational failure", async () => {
    authMocks.login.mockRejectedValue(new Error("El email o la contraseña no coinciden."));
    render(
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@yuni.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No pudimos iniciar sesión"));
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(authMocks.push).not.toHaveBeenCalled();
  });

  it("announces account creation and redirects to the private app", async () => {
    authMocks.register.mockResolvedValue({});
    render(
      <ToastProvider>
        <RegisterPage />
      </ToastProvider>
    );

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Yuni Tester" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@yuni.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Cuenta creada"));
    expect(authMocks.register).toHaveBeenCalledWith({
      name: "Yuni Tester",
      email: "new@yuni.test",
      password: "password123",
    });
    expect(authMocks.push).toHaveBeenCalledWith("/dashboard");
  });
});
