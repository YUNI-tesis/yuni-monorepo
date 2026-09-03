import { JSDOM } from "jsdom";
import React, { useEffect } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useGroupCallHistory } from "./components/interact/use-group-call-history";
import type { ApiGroupConversationSummary } from "./lib/api/avatar-group-api";

const mocks = vi.hoisted(() => ({
  listGroupConversations: vi.fn(),
  getGroupConversation: vi.fn(),
}));

vi.mock("./lib/api/avatar-group-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib/api/avatar-group-api")>();
  return {
    ...original,
    listGroupConversations: mocks.listGroupConversations,
    getGroupConversation: mocks.getGroupConversation,
  };
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

function conversation(id: string, groupId: string): ApiGroupConversationSummary {
  return {
    id,
    title: "Consulta",
    groupId,
    groupName: `Grupo ${groupId}`,
    participants: [],
    messageCount: 1,
    status: "ended",
    lastMessageAt: "2026-09-01T12:00:00.000Z",
    createdAt: "2026-09-01T12:00:00.000Z",
  };
}

function HistoryProbe({ groupId }: { groupId: string }) {
  const history = useGroupCallHistory(groupId);
  useEffect(() => {
    void history.loadHistory();
  }, [history.loadHistory]);
  return (
    <output>
      {history.historyState.summariesStatus}:{history.historyState.summaries.map(({ id }) => id).join(",")}
    </output>
  );
}

describe("group call history request lifecycle", () => {
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
    mocks.listGroupConversations.mockReset();
    mocks.getGroupConversation.mockReset();
  });

  afterEach(() => cleanup());

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it("ignores an obsolete history response after navigating to another group", async () => {
    const first = deferred<{ conversations: ApiGroupConversationSummary[] }>();
    const second = deferred<{ conversations: ApiGroupConversationSummary[] }>();
    mocks.listGroupConversations
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const view = render(<HistoryProbe groupId="group-1" />);
    view.rerender(<HistoryProbe groupId="group-2" />);

    await act(async () => {
      second.resolve({ conversations: [conversation("conversation-2", "group-2")] });
      await second.promise;
    });
    await waitFor(() => expect(screen.getByText("ready:conversation-2")).toBeTruthy());

    await act(async () => {
      first.resolve({ conversations: [conversation("conversation-1", "group-1")] });
      await first.promise;
    });
    expect(screen.queryByText("ready:conversation-1")).toBeNull();
    expect(screen.getByText("ready:conversation-2")).toBeTruthy();
  });
});
