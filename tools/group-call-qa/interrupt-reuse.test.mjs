/* global URL */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

async function harness({ terminal = "ended", stop = false, energy = true, secondSource = "speech-2" } = {}) {
  const source = await fs.readFile(new URL("./browser.js", import.meta.url), "utf8");
  const start = source.indexOf("window.probeInterruptReuse = ");
  const end = source.indexOf("window.probeReport", start);
  assert.ok(start >= 0 && end > start);
  const events = [];
  const report = { events, commands: [] };
  const samples = [];
  const video = {
    muted: true,
    paused: false,
    play: async () => {},
    srcObject: { getTracks: () => [{ id: "track-one" }] },
  };
  let time = 0;
  let cut = Infinity;
  let commands = 0;
  let interrupts = 0;
  let stops = 0;
  const scheduled = [];
  const schedule = (delay, name, sourceEventId = null, providerType = null) =>
    scheduled.push({ atMs: time + delay, avatar: "Bruno", name, sourceEventId, providerType });
  const session = {
    sessionId: "session-one",
    sendContextualUpdate: () => {},
    sendUserMessage: () => {
      assert.equal(video.muted, false, "gate opens before public command");
      commands += 1;
      schedule(100, "started", commands === 2 ? secondSource : "speech-1");
      if (commands === 2) schedule(350, "ended", secondSource);
      return `command-${commands}`;
    },
    interrupt: () => {
      assert.equal(video.muted, true, "native interruption happens after muting");
      interrupts += 1;
      cut = time;
      if (terminal)
        schedule(
          50,
          terminal,
          terminal === "ended" ? "speech-1" : null,
          terminal === "provider" ? "interruption" : null
        );
      if (stop) schedule(100, "stopped");
    },
    stop: () => {
      stops += 1;
    },
  };
  const context = {
    window: {},
    report,
    instances: new Map([["Bruno", { session, video, samples }]]),
    SDK: {
      AgentEventsEnum: {
        AVATAR_SPEAK_STARTED: "started",
        AVATAR_SPEAK_ENDED: "ended",
        SESSION_STOPPED: "stopped",
      },
      SessionEvent: { SESSION_DISCONNECTED: "disconnected" },
    },
    now: () => time,
    performance: { now: () => time },
    sleep: async (ms) => {
      const until = time + ms;
      while (time < until) {
        time += Math.min(10, until - time);
        for (const event of scheduled.filter((item) => item.atMs <= time && !events.includes(item)))
          events.push(event);
        if (time % 50 === 0)
          samples.push({
            atMs: time,
            rms: energy && (time < cut + 200 || commands === 2) ? 0.01 : 0,
            muted: video.muted,
            paused: false,
          });
      }
    },
  };
  vm.runInNewContext(source.slice(start, end), context);
  const result = await context.window.probeInterruptReuse(
    "Bruno",
    "synthetic first request",
    "synthetic second request"
  );
  return { result, report, video, commands, interrupts, stops };
}

test("native reuse keeps the SDK session and tracks, reports residual PCM and separate source IDs", async () => {
  const state = await harness();
  assert.equal(state.commands, 2);
  assert.equal(state.interrupts, 1);
  assert.equal(state.stops, 0);
  assert.equal(state.result.sameSessionId, true);
  assert.equal(state.result.sameTrackIds, true);
  assert.equal(state.result.terminalMatchesOldSpeechSource, true);
  assert.notEqual(state.result.firstCommandId, state.result.firstSpeechStart.sourceEventId);
  assert.ok(state.result.postTerminalMutedPcmSamples > 0);
  assert.ok(state.result.pcmBeforeSecondStart > 0);
  assert.equal(state.result.secondResponseObserved, true);
  assert.equal(state.result.outcome, "inconclusive");
  assert.equal(state.video.muted, true);
  assert.ok(!JSON.stringify(state.report).includes("synthetic"));
});

test("missing interruption terminal prevents another command and leaves the media muted", async () => {
  const state = await harness({ terminal: null });
  assert.equal(state.commands, 1);
  assert.equal(state.interrupts, 1);
  assert.equal(state.stops, 0);
  assert.equal(state.result.reason, "no_terminal_within_2000ms_no_reuse_attempted");
  assert.equal(state.video.muted, true);
});

test("an uncorrelated provider terminal is recorded as unknown, not as command correlation", async () => {
  const state = await harness({ terminal: "provider" });
  assert.equal(state.commands, 2);
  assert.equal(state.result.terminalMatchesOldSpeechSource, null);
  assert.equal(state.result.outcome, "inconclusive");
});

test("disconnect during terminal observation prevents reuse", async () => {
  const state = await harness({ stop: true });
  assert.equal(state.commands, 1);
  assert.equal(state.result.reason, "session_changed_or_stopped_during_terminal_observation");
  assert.equal(state.video.muted, true);
});

test("no measurable first response never triggers a blind interrupt or reuse", async () => {
  const state = await harness({ energy: false });
  assert.equal(state.commands, 1);
  assert.equal(state.interrupts, 0);
  assert.equal(state.result.reason, "first_start_or_500ms_audible_pcm_missing");
  assert.equal(state.video.muted, true);
});

for (const secondSource of ["speech-1", null]) {
  test(`late/uncorrelated speech cannot count as a verified new response (${secondSource})`, async () => {
    const state = await harness({ secondSource });
    assert.equal(state.commands, 2);
    assert.ok(state.result.secondAudibleSamples > 0);
    assert.equal(state.result.secondResponseObserved, false);
    assert.equal(state.result.secondSpeechSourceIsNew, secondSource ? false : null);
    assert.equal(state.result.outcome, "inconclusive");
  });
}

test("archived native reuse trace preserves late correction and same-source continuation without claiming acceptance", async () => {
  const trace = JSON.parse(
    await fs.readFile(
      new URL("../../docs/thesis/evidence/2026-09-12-native-interrupt-reuse-trace.json", import.meta.url),
      "utf8"
    )
  );
  const result = trace.interruptReuse;
  assert.match(trace.originalReportSha256, /^[a-f0-9]{64}$/);
  assert.equal(trace.outcome, "inconclusive");
  assert.equal(trace.experimental, true);
  assert.equal(trace.exactlyTwoProviderMessagesReceived, true);
  assert.equal(trace.tokenGuard.passed, true);
  assert.equal(trace.postStartGuard.isSandbox, true);
  assert.equal(trace.cleanup[0].status, 200);
  assert.equal(result.commandsSent, 2);
  assert.equal(result.sameSessionId, true);
  assert.equal(result.sameTrackIds, true);
  assert.equal(result.terminalDelayMs, 909);
  assert.equal(result.postTerminalMutedPcmSamples, 0);
  assert.equal(result.secondAudibleSamples, 12);
  const correction = trace.events.find((event) => event.providerType === "agent_response_correction");
  assert.ok(correction.atMs > result.secondCommandAtMs);
  assert.equal(correction.sourceEventId, null);
  const continuation = trace.events.find(
    (event) => event.name === "avatar.speak_started" && event.atMs > result.secondSpeechEnd.atMs
  );
  assert.equal(continuation.atMs - result.secondSpeechEnd.atMs, 645);
  assert.equal(continuation.sourceEventId, result.secondSpeechStart.sourceEventId);
  assert.ok(
    !trace.events.some((event) => event.name.startsWith("raw:") || event.providerType === "vad_score")
  );
  assert.ok(!JSON.stringify(trace).includes('"sessionToken"'));
  assert.ok(!JSON.stringify(trace).includes('"text"'));
  const audio = trace.energySamples[0].values.filter(
    ([atMs, rms, muted]) => atMs >= result.secondSpeechStart.atMs && rms > 0.001 && !muted
  );
  assert.equal(audio.length, 12);
  assert.ok(audio.some(([atMs]) => atMs >= continuation.atMs));
});
