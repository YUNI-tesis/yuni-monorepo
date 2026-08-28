import { JSDOM } from "jsdom";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCreatorDashboardSummary, ApiDashboardDays } from "./lib/api/dashboard-api";
import { useCreatorDashboard } from "./hooks/useCreatorDashboard";

const mocks = vi.hoisted(() => ({
  getCreatorDashboardSummary: vi.fn(),
}));

vi.mock("./lib/api/dashboard-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib/api/dashboard-api")>();
  return { ...original, getCreatorDashboardSummary: mocks.getCreatorDashboardSummary };
});

let dom: JSDOM;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let waitFor: typeof import("@testing-library/react").waitFor;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function summary(days: ApiDashboardDays) {
  return { period: { days } } as ApiCreatorDashboardSummary;
}

function DashboardProbe({ days }: { days: ApiDashboardDays }) {
  const state = useCreatorDashboard(days);
  return <output>{state.status === "ready" ? state.data.period.days : state.status}</output>;
}

describe("creator dashboard request lifecycle", () => {
  beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("React", React);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);

    ({ act, cleanup, render, screen, waitFor } = await import("@testing-library/react"));
  });

  beforeEach(() => {
    mocks.getCreatorDashboardSummary.mockReset();
  });

  afterEach(() => cleanup());

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("ignores an obsolete response after the period changes", async () => {
    const first = deferred<ApiCreatorDashboardSummary>();
    const second = deferred<ApiCreatorDashboardSummary>();
    mocks.getCreatorDashboardSummary
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const view = render(<DashboardProbe days={30} />);
    view.rerender(<DashboardProbe days={7} />);
    expect(screen.getByText("loading")).toBeTruthy();

    await act(async () => {
      second.resolve(summary(7));
      await second.promise;
    });
    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());

    await act(async () => {
      first.resolve(summary(30));
      await first.promise;
    });
    expect(screen.queryByText("30")).toBeNull();
    expect(screen.getByText("7")).toBeTruthy();
  });
});
