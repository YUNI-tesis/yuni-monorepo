import { describe, expect, it, vi } from "vitest";
import { createGroupInterruptionReuse } from "./group-interruption-reuse";

const terminal = (source = "provider-speech-one", eventId = "provider-terminal-one") => ({
  event_id: eventId,
  source_event_id: source,
});

const expectedEvidence = (source = "provider-speech-one", eventId = "provider-terminal-one") => ({
  type: "speak_ended",
  eventId,
  speechSourceEventId: source,
});

describe("group interruption connection reuse", () => {
  it("correlates a terminal to observed provider speech rather than the SDK command UUID", async () => {
    const reuse = createGroupInterruptionReuse();
    const commandUuid = "sdk-command-uuid";
    reuse.dispatch("turn-one");
    expect(reuse.start("turn-one", "provider-speech-one")).toBe(true);
    reuse.quarantine("turn-one", "human-cut-one");
    const evidence = reuse.evidence("turn-one", "human-cut-one");
    const resolved = vi.fn();
    void evidence!.then(resolved);

    reuse.end("turn-one", terminal(commandUuid));
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(reuse.readyEvidence).toBeNull();
    expect(reuse.release("turn-one", "human-cut-one")).toBe(false);

    reuse.end("turn-one", terminal());
    await expect(evidence).resolves.toEqual(expectedEvidence());
  });

  it("retains a terminal observed while the cancellation HTTP acknowledgement is still pending", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.quarantine("turn-one", "human-cut-one");
    // Cancellation has not returned yet, so no consumer is waiting for evidence.
    reuse.end("turn-one", terminal());

    await expect(reuse.evidence("turn-one", "human-cut-one")).resolves.toEqual(expectedEvidence());
    expect(reuse.blocked).toBe(true);
    expect(reuse.release("turn-one", "human-cut-one")).toBe(true);
    expect(reuse.blocked).toBe(true);
    expect(reuse.start("turn-two", "provider-speech-two")).toBe(true);
    expect(reuse.blocked).toBe(false);
  });

  it("can acknowledge preparation without fabricating a terminal when no command or speech was observed", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.quarantine("prepared-turn", "human-cut-one");

    await expect(reuse.evidence("prepared-turn", "human-cut-one")).resolves.toEqual({
      type: "not_dispatched",
    });
    expect(reuse.release("prepared-turn", "human-cut-one")).toBe(true);
    expect(reuse.blocked).toBe(true);
    expect(reuse.reused).toBe(true);
    expect(reuse.start("turn-two", undefined)).toBe(false);
    expect(reuse.start("turn-two", "provider-speech-two")).toBe(true);
  });

  it("keeps an attempted command quarantined even when sending it throws before returning an ID", async () => {
    const reuse = createGroupInterruptionReuse();
    const sendCommand = vi.fn(() => {
      throw new Error("command delivery outcome unknown");
    });
    reuse.dispatch("turn-one");
    expect(sendCommand).toThrow("command delivery outcome unknown");
    reuse.quarantine("turn-one", "human-cut-one");
    const resolved = vi.fn();
    void reuse.evidence("turn-one", "human-cut-one")!.then(resolved);

    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(reuse.readyEvidence).toBeNull();
    expect(reuse.release("turn-one", "human-cut-one")).toBe(false);
    expect(reuse.blocked).toBe(true);
  });

  it("does not claim not-dispatched when provider speech was observed without a recorded command", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.start("turn-one", "provider-speech-one");
    reuse.quarantine("turn-one", "human-cut-one");

    expect(reuse.readyEvidence).toBeNull();
    expect(reuse.release("turn-one", "human-cut-one")).toBe(false);
    reuse.end("turn-one", terminal());
    await expect(reuse.evidence("turn-one", "human-cut-one")).resolves.toEqual(expectedEvidence());
  });

  it("requires a known source and the interrupted turn before accepting an end", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.quarantine("turn-one", "human-cut-one");
    const resolved = vi.fn();
    void reuse.evidence("turn-one", "human-cut-one")!.then(resolved);

    reuse.end("another-turn", terminal());
    reuse.end("turn-one", terminal("unknown-source"));
    reuse.end("turn-one", { event_id: "missing-source" });
    reuse.end("turn-one", { event_id: "null-source", source_event_id: null });
    reuse.end("turn-one", { event_id: "", source_event_id: "provider-speech-one" });
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(reuse.readyEvidence).toBeNull();

    reuse.end("turn-one", terminal());
    await expect(reuse.evidence("turn-one", "human-cut-one")).resolves.toEqual(expectedEvidence());
  });

  it("keeps source-less speech unresolved instead of inventing a provider correlation", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", undefined);
    reuse.quarantine("turn-one", "human-cut-one");
    reuse.end("turn-one", terminal());

    const resolved = vi.fn();
    void reuse.evidence("turn-one", "human-cut-one")!.then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(reuse.readyEvidence).toBeNull();
    expect(reuse.release("turn-one", "human-cut-one")).toBe(false);
  });

  it("uses completed natural speech as evidence for a cut whose cancellation overtook the previous floor", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.end("turn-one", terminal());
    // Called only once the existing natural-completion barrier was consumed.
    reuse.complete("turn-one");
    reuse.quarantine("turn-one", "human-cut-one");

    await expect(reuse.evidence("turn-one", "human-cut-one")).resolves.toEqual(expectedEvidence());
    expect(reuse.release("turn-one", "human-cut-one")).toBe(true);
  });

  it("does not reuse an unconfirmed first end that preceded the cut", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.end("turn-one", terminal("provider-speech-one", "first-segment-end"));
    reuse.quarantine("turn-one", "human-cut-one");

    expect(reuse.readyEvidence).toBeNull();
    expect(reuse.release("turn-one", "human-cut-one")).toBe(false);
    reuse.end("turn-one", terminal("provider-speech-one", "interrupted-segment-end"));
    await expect(reuse.evidence("turn-one", "human-cut-one")).resolves.toEqual(
      expectedEvidence("provider-speech-one", "interrupted-segment-end")
    );
  });

  it("invalidates a previous segment terminal when its source continues before natural completion", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.end("turn-one", terminal("provider-speech-one", "first-segment-end"));
    reuse.start("turn-one", "provider-speech-one");
    reuse.complete("turn-one");
    reuse.quarantine("turn-one", "human-cut-one");

    expect(reuse.readyEvidence).toBeNull();
    reuse.end("turn-one", terminal("provider-speech-one", "continuation-end"));
    await expect(reuse.evidence("turn-one", "human-cut-one")).resolves.toEqual(
      expectedEvidence("provider-speech-one", "continuation-end")
    );
  });

  it("preserves the first correlated cut terminal across duplicate callbacks and cancellation retries", async () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.quarantine("turn-one", "human-cut-one");
    const waiting = reuse.evidence("turn-one", "human-cut-one");
    reuse.end("turn-one", terminal());
    reuse.quarantine("turn-one", "human-cut-one");
    reuse.end("turn-one", terminal("provider-speech-one", "duplicate-terminal-delivery"));

    expect(reuse.evidence("turn-one", "human-cut-one")).toBe(waiting);
    await expect(waiting).resolves.toEqual(expectedEvidence());
    expect(reuse.readyEvidence).toEqual(expectedEvidence());
    expect(reuse.evidence("turn-one", "another-human-cut")).toBeNull();
    expect(reuse.evidence("another-turn", "human-cut-one")).toBeNull();
    expect(reuse.release("turn-one", "another-human-cut")).toBe(false);
    expect(reuse.release("another-turn", "human-cut-one")).toBe(false);
    expect(reuse.release("turn-one", "human-cut-one")).toBe(true);
  });

  it("keeps new speech blocked until the exact cut is released, then rejects the old source", () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "provider-speech-one");
    reuse.quarantine("turn-one", "human-cut-one");
    reuse.end("turn-one", terminal());

    expect(reuse.start("turn-two", "provider-speech-two")).toBe(false);
    expect(reuse.release("turn-one", "human-cut-one")).toBe(true);
    expect(reuse.isRetired("provider-speech-one")).toBe(true);
    expect(reuse.start("turn-two", "provider-speech-one")).toBe(false);
    expect(reuse.start("turn-two", undefined)).toBe(false);
    expect(reuse.start("turn-two", null)).toBe(false);
    expect(reuse.blocked).toBe(true);
    expect(reuse.start("turn-two", "provider-speech-two")).toBe(true);
    expect(reuse.blocked).toBe(false);
  });

  it("retires every observed segment source belonging to the interrupted turn", () => {
    const reuse = createGroupInterruptionReuse();
    reuse.dispatch("turn-one");
    reuse.start("turn-one", "segment-one");
    reuse.end("turn-one", terminal("segment-one"));
    reuse.start("turn-one", "segment-two");
    reuse.quarantine("turn-one", "human-cut-one");
    reuse.end("turn-one", terminal("segment-two"));
    reuse.release("turn-one", "human-cut-one");

    expect(reuse.start("turn-two", "segment-one")).toBe(false);
    expect(reuse.start("turn-two", "segment-two")).toBe(false);
    expect(reuse.start("turn-two", "fresh-source")).toBe(true);
    expect(reuse.isRetired("fresh-source")).toBe(false);
  });

  it("supports consecutive interruptions on one connector without accepting terminals from retired speech", async () => {
    const reuse = createGroupInterruptionReuse();
    for (const [turn, cut, source] of [
      ["turn-one", "human-cut-one", "provider-speech-one"],
      ["turn-two", "human-cut-two", "provider-speech-two"],
    ] as const) {
      reuse.dispatch(turn);
      expect(reuse.start(turn, source)).toBe(true);
      reuse.quarantine(turn, cut);
      if (turn === "turn-two") {
        reuse.end(turn, terminal("provider-speech-one", "late-old-terminal"));
        expect(reuse.readyEvidence).toBeNull();
        expect(reuse.release("turn-one", "human-cut-one")).toBe(false);
      }
      reuse.end(turn, terminal(source, `terminal:${turn}`));
      await expect(reuse.evidence(turn, cut)).resolves.toEqual(expectedEvidence(source, `terminal:${turn}`));
      expect(reuse.release(turn, cut)).toBe(true);
      expect(reuse.start("next-turn", undefined)).toBe(false);
    }

    expect(reuse.isRetired("provider-speech-one")).toBe(true);
    expect(reuse.isRetired("provider-speech-two")).toBe(true);
    expect(reuse.reused).toBe(true);
    expect(reuse.start("turn-three", "provider-speech-three")).toBe(true);
    expect(reuse.start("turn-three", "provider-speech-one")).toBe(false);
  });
});
