// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () =>
    function ThreadsStub() {
      return null;
    },
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");

  return {
    default: ({
      children,
      href,
      prefetch: _prefetch,
      ...props
    }: React.ComponentProps<"a"> & { prefetch?: boolean }) =>
      createElement("a", { ...props, href }, children),
  };
});

vi.mock("motion/react", async () => {
  const { createElement, forwardRef } = await import("react");
  const components = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const existing = components.get(tag);
        if (existing) return existing;

        const Component = forwardRef<HTMLElement, Record<string, unknown>>(
          (
            {
              children,
              initial: _initial,
              animate: _animate,
              whileInView: _whileInView,
              viewport: _viewport,
              transition: _transition,
              style: _style,
              drag: _drag,
              dragConstraints: _dragConstraints,
              dragElastic: _dragElastic,
              dragMomentum: _dragMomentum,
              dragSnapToOrigin: _dragSnapToOrigin,
              whileHover: _whileHover,
              whileTap: _whileTap,
              whileDrag: _whileDrag,
              onDrag: _onDrag,
              onDragStart: _onDragStart,
              onDragEnd: _onDragEnd,
              ...props
            },
            ref
          ) => createElement(tag, { ...props, ref }, children as React.ReactNode)
        );

        components.set(tag, Component);
        return Component;
      },
    }
  );

  return {
    motion,
    useReducedMotion: () => true,
    useScroll: () => ({ scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: () => 0,
  };
});

import { LandingExperience } from "./components/landing/LandingExperience";

const THEME_STORAGE_KEY = "yuni:landing-theme";

function getLandingRoot(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>("[data-theme]");
  expect(root).toBeTruthy();
  return root as HTMLElement;
}

describe("landing theme selector", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders in dark mode with an accessible light-mode control", () => {
    const { container } = render(<LandingExperience />);
    const themeToggle = screen.getByRole("button", { name: "Modo claro" });

    expect(getLandingRoot(container).dataset.theme).toBe("dark");
    expect(themeToggle.getAttribute("aria-pressed")).toBe("false");
    expect(themeToggle.getAttribute("title")).toBe("Activar modo claro");
  });

  it("switches to light mode and restores the persisted choice", async () => {
    const firstRender = render(<LandingExperience />);
    const themeToggle = screen.getByRole("button", { name: "Modo claro" });

    fireEvent.click(themeToggle);

    expect(getLandingRoot(firstRender.container).dataset.theme).toBe("light");
    expect(themeToggle.getAttribute("aria-pressed")).toBe("true");
    expect(themeToggle.getAttribute("title")).toBe("Activar modo oscuro");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    firstRender.unmount();

    const restoredRender = render(<LandingExperience />);

    await waitFor(() => expect(getLandingRoot(restoredRender.container).dataset.theme).toBe("light"));
    expect(screen.getByRole("button", { name: "Modo claro" }).getAttribute("aria-pressed")).toBe("true");
  });
});
