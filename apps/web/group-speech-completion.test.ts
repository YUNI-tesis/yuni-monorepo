import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGroupSpeechCompletionBarrier,
  type GroupSpeechCompletionCandidate,
} from "./components/interact/group-speech-completion";

describe("group speech completion barrier", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("waits one second by default and lets a candidate be consumed exactly once", () => {
    const barrier = createGroupSpeechCompletionBarrier();
    const ready = vi.fn();
    expect(barrier.start("start-1")).toBe(true);
    expect(barrier.end("end-1", ready)).toBe(true);
    vi.advanceTimersByTime(999);
    expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ready).toHaveBeenCalledTimes(1);
    const candidate = ready.mock.calls[0]![0] as GroupSpeechCompletionCandidate;
    expect(candidate.isCurrent()).toBe(true);
    expect(candidate.consume()).toBe(true);
    expect(candidate.isCurrent()).toBe(false);
    expect(candidate.consume()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    barrier.dispose();
  });

  it("invalidates an end at 408 ms when speech continues 646 ms later", () => {
    const barrier = createGroupSpeechCompletionBarrier();
    const ready = vi.fn();
    barrier.start("start-1");
    vi.advanceTimersByTime(408);
    barrier.end("end-1", ready);
    vi.advanceTimersByTime(646);
    expect(barrier.start("continuation-1")).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(ready).not.toHaveBeenCalled();
    barrier.end("final-end", ready);
    vi.advanceTimersByTime(1_000);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready.mock.calls[0]![0].consume()).toBe(true);
    barrier.dispose();
  });

  it("invalidates an already-enqueued candidate when a continuation arrives", () => {
    const barrier = createGroupSpeechCompletionBarrier({ settleMs: 100 });
    const queuedWork: Array<() => boolean> = [];
    const ready = vi.fn((candidate: GroupSpeechCompletionCandidate) => {
      queuedWork.push(() => candidate.consume());
    });
    barrier.end("end-1", ready);
    vi.advanceTimersByTime(100);
    expect(queuedWork).toHaveLength(1);
    barrier.start("continued-after-timer");
    expect(queuedWork[0]!()).toBe(false);
    barrier.end("end-2", ready);
    vi.advanceTimersByTime(100);
    expect(queuedWork[1]!()).toBe(true);
    barrier.dispose();
  });

  it("replaces an obsolete enqueued candidate with the latest distinct end", () => {
    const barrier = createGroupSpeechCompletionBarrier({ settleMs: 20 });
    const ready = vi.fn();
    barrier.end("end-1", ready);
    vi.advanceTimersByTime(20);
    const obsolete = ready.mock.calls[0]![0] as GroupSpeechCompletionCandidate;
    barrier.end("end-2", ready);
    expect(obsolete.isCurrent()).toBe(false);
    expect(obsolete.consume()).toBe(false);
    vi.advanceTimersByTime(20);
    expect(ready.mock.calls[1]![0].consume()).toBe(true);
    barrier.dispose();
  });

  it("does not reset the timer or invalidate the candidate for duplicate deliveries", () => {
    const barrier = createGroupSpeechCompletionBarrier({ settleMs: 100 });
    const ready = vi.fn();
    barrier.start("start-1");
    barrier.end("end-1", ready);
    vi.advanceTimersByTime(80);
    expect(barrier.start("start-1")).toBe(false);
    expect(barrier.end("end-1", ready)).toBe(false);
    vi.advanceTimersByTime(20);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready.mock.calls[0]![0].consume()).toBe(true);
    expect(barrier.end("end-1", ready)).toBe(false);
    barrier.dispose();
  });

  it("keeps event types distinct even if the provider uses the same ID", () => {
    const barrier = createGroupSpeechCompletionBarrier({ settleMs: 1 });
    const ready = vi.fn();
    expect(barrier.start("provider-id")).toBe(true);
    expect(barrier.end("provider-id", ready)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(ready).toHaveBeenCalledTimes(1);
    barrier.dispose();
  });

  it("cancel clears pending timers and preserves deduplication", () => {
    const barrier = createGroupSpeechCompletionBarrier({ settleMs: 10 });
    const ready = vi.fn();
    barrier.start("start-1");
    barrier.end("end-1", ready);
    barrier.cancel();
    expect(vi.getTimerCount()).toBe(0);
    expect(barrier.start("start-1")).toBe(false);
    expect(barrier.end("end-1", ready)).toBe(false);
    vi.advanceTimersByTime(10);
    expect(ready).not.toHaveBeenCalled();
    barrier.end("end-2", ready);
    vi.advanceTimersByTime(10);
    const candidate = ready.mock.calls[0]![0] as GroupSpeechCompletionCandidate;
    barrier.cancel();
    expect(candidate.consume()).toBe(false);
    barrier.dispose();
  });

  it("dispose invalidates queued work and rejects further deliveries", () => {
    const barrier = createGroupSpeechCompletionBarrier({ settleMs: 0 });
    const ready = vi.fn();
    barrier.end("end-1", ready);
    vi.advanceTimersByTime(0);
    const candidate = ready.mock.calls[0]![0] as GroupSpeechCompletionCandidate;
    barrier.dispose();
    barrier.dispose();
    expect(candidate.isCurrent()).toBe(false);
    expect(candidate.consume()).toBe(false);
    expect(barrier.start("new-start")).toBe(false);
    expect(barrier.end("new-end", ready)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispose clears a timer that has not fired", () => {
    const barrier = createGroupSpeechCompletionBarrier();
    const ready = vi.fn();
    barrier.end("end-1", ready);
    barrier.dispose();
    vi.advanceTimersByTime(2_000);
    expect(ready).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds deduplication to the most recent 128 typed event IDs", () => {
    const barrier = createGroupSpeechCompletionBarrier();
    for (let index = 0; index < 128; index += 1) expect(barrier.start(`start-${index}`)).toBe(true);
    expect(barrier.start("start-0")).toBe(false);
    expect(barrier.start("start-128")).toBe(true);
    expect(barrier.start("start-1")).toBe(false);
    expect(barrier.start("start-0")).toBe(true);
    barrier.dispose();
  });

  it("isolates lifecycle identities when an old barrier is disposed", () => {
    const oldBarrier = createGroupSpeechCompletionBarrier({ settleMs: 10 });
    const oldReady = vi.fn();
    oldBarrier.end("same-provider-id", oldReady);
    oldBarrier.dispose();
    const newBarrier = createGroupSpeechCompletionBarrier({ settleMs: 10 });
    const newReady = vi.fn();
    expect(newBarrier.end("same-provider-id", newReady)).toBe(true);
    vi.advanceTimersByTime(10);
    expect(oldReady).not.toHaveBeenCalled();
    expect(newReady).toHaveBeenCalledTimes(1);
    newBarrier.dispose();
  });

  it.each([-1, NaN, Infinity, 2_147_483_648])("rejects invalid settle duration %s", (settleMs) => {
    expect(() => createGroupSpeechCompletionBarrier({ settleMs })).toThrow(RangeError);
  });
});
