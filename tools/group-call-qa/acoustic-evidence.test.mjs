/* global URL */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { assessFullAppEvidence } from "./acoustic-evidence.mjs";

const origin = Date.parse("2026-09-09T00:00:00.000Z");
const at = (ms) => new Date(origin + ms).toISOString();

function quietCompletion() {
  const report = {
    injection: { at: at(1000), browserAtMs: 1000 },
    roster: [
      { name: "QA A", avatarId: "a" },
      { name: "QA B", avatarId: "b" },
    ],
    providerSessions: [
      { avatarId: "a", providerSessionId: "session-a" },
      { avatarId: "b", providerSessionId: "session-b" },
    ],
    api: [{ at: at(1010), path: "/api/group-voice-sessions/qa/turns", status: 200 }],
    media: {
      wallStartedAt: at(0),
      maxUnmutedElements: 1,
      commandObserverAvailable: true,
      commands: [],
      providerEvents: [],
      samples: [],
    },
  };
  for (const [index, participant] of report.roster.entries()) {
    const start = 1100 + index * 1000;
    const sessionId = `session-${participant.avatarId}`;
    const eventId = `command-${participant.avatarId}`;
    report.media.commands.push({ atMs: start - 50, sessionId, eventId, commandType: "user_message" });
    report.media.providerEvents.push({
      atMs: start,
      sessionId,
      sourceEventId: eventId,
      eventType: "avatar.speak_started",
    });
    for (const [offset, type] of [
      [0, "agent_response"],
      [50, "speak_started"],
      [450, "speak_ended"],
    ]) {
      report.api.push({
        at: at(start + offset),
        responseObservedAt: at(start + offset),
        path: "/api/group-voice-sessions/qa/provider-events",
        status: 200,
        input: { avatarId: participant.avatarId, turnId: `turn-${index}`, type },
      });
    }
    report.media.samples.push(
      { atMs: start + 100, name: participant.name, rms: 0.2, muted: false, volume: 1, paused: false },
      { atMs: start + 400, name: participant.name, rms: 0, muted: true, volume: 1, paused: false }
    );
  }
  return report;
}

test("replays the prior real trace without crediting the five early greeting/rogue samples", async () => {
  const trace = JSON.parse(
    await fs.readFile(new URL("./fixtures/legacy-tail-cut.json", import.meta.url), "utf8")
  );
  const result = assessFullAppEvidence(trace);
  assert.equal(result.outcome, "failed");
  assert.equal(result.ignoredPreResponseSamples, 5);
  assert.equal(result.unattributedNonSilentSamples, 5);
  assert.deepEqual(
    result.participants.map((item) => item.responseBlockedSamples),
    [3, 5, 7]
  );
  assert.deepEqual(
    result.participants.map((item) => item.continuationSuppressions),
    [1, 1, 1]
  );
  assert.ok(result.participants.every((item) => item.attribution === "api_turn_observation"));
});

test("quiet completion passes with one message per participant and silence before mute", () => {
  const result = assessFullAppEvidence(quietCompletion());
  assert.equal(result.outcome, "passed");
  assert.equal(result.participants.length, 2);
  assert.ok(
    result.participants.every((item) => item.responseBlockedSamples === 0 && item.userMessageCount === 1)
  );
});

test("muted startup is not mislabeled as a cut response", () => {
  const report = quietCompletion();
  report.media.samples.push({ atMs: 1020, name: "QA A", rms: 0.2, muted: true, paused: false });
  report.api.push({
    at: at(1030),
    path: "/provider-events",
    status: 200,
    input: { avatarId: "a", turnId: null, type: "speak_started" },
    directive: { action: "suppress", avatarId: "a" },
  });
  const result = assessFullAppEvidence(report);
  assert.equal(result.outcome, "passed");
  assert.equal(result.ignoredPreResponseSamples, 1);
  assert.equal(result.participants[0].continuationSuppressions, 0);
});

test("an audible greeting/rogue packet after input is inconclusive rather than proof the answer played", () => {
  const report = quietCompletion();
  report.media.samples.push({ atMs: 1020, name: "QA A", rms: 0.2, muted: false, paused: false });
  const result = assessFullAppEvidence(report);
  assert.equal(result.outcome, "inconclusive");
  assert.equal(result.unattributedNonSilentSamples, 1);
});

test("muted or zero-volume PCM in the response epoch fails", () => {
  for (const blocked of [
    { muted: true, volume: 1 },
    { muted: false, volume: 0 },
    { muted: false, volume: 1, paused: true },
  ]) {
    const report = quietCompletion();
    report.media.samples.push({ atMs: 1510, name: "QA A", rms: 0.2, paused: false, ...blocked });
    assert.equal(assessFullAppEvidence(report).outcome, "failed");
  }
});

test("duplicate user messages and duplicate orchestration submits fail", () => {
  const duplicateCommand = quietCompletion();
  duplicateCommand.media.commands.push({ ...duplicateCommand.media.commands[0], eventId: "extra-command" });
  assert.equal(assessFullAppEvidence(duplicateCommand).outcome, "failed");
  const duplicateSubmit = quietCompletion();
  duplicateSubmit.api.push({ ...duplicateSubmit.api[0], at: at(1020) });
  assert.equal(assessFullAppEvidence(duplicateSubmit).outcome, "failed");
});

test("continuations require neither suppression nor another provider interrupt", () => {
  const report = quietCompletion();
  report.media.providerEvents.push({ ...report.media.providerEvents[0], atMs: 1700 });
  assert.equal(assessFullAppEvidence(report).outcome, "passed");
  report.api.push({
    at: at(1720),
    path: "/provider-events",
    status: 200,
    input: { avatarId: "a", turnId: null, type: "speak_started" },
    directive: { action: "suppress", avatarId: "a" },
  });
  assert.equal(assessFullAppEvidence(report).outcome, "failed");
  report.api.pop();
  report.media.commands.push({ atMs: 1720, eventType: "avatar.interrupt", sessionId: "session-a" });
  assert.equal(assessFullAppEvidence(report).outcome, "failed");
});

test("missing command instrumentation cannot yield acceptance", () => {
  const report = quietCompletion();
  report.media.commands = [];
  report.media.commandObserverAvailable = false;
  assert.equal(assessFullAppEvidence(report).outcome, "inconclusive");
});

test("overlapping audible owners fail even when individual response windows pass", () => {
  const report = quietCompletion();
  report.media.maxUnmutedElements = 2;
  assert.equal(assessFullAppEvidence(report).outcome, "failed");
});

test("API fallback names its clock as observation, not provider event time", () => {
  const report = quietCompletion();
  report.media.providerEvents = [];
  const result = assessFullAppEvidence(report);
  assert.equal(result.outcome, "passed");
  assert.ok(result.participants.every((item) => item.attribution === "api_turn_observation"));
  assert.match(result.clock, /not provider time/);
});

test("replays the archived completion trials without promoting the unfinished long round", async () => {
  const archive = JSON.parse(
    await fs.readFile(
      new URL("../../docs/thesis/evidence/2026-09-09-group-speech-completion-traces.json", import.meta.url),
      "utf8"
    )
  );
  const outcomes = [];
  for (const report of archive.reports) {
    report.media.samples = report.media.sampleTuples.map(([atMs, index, rms, muted, paused, volume]) => ({
      atMs,
      name: report.media.sampleNames[index],
      rms,
      muted: Boolean(muted),
      paused: Boolean(paused),
      ...(volume === null ? {} : { volume }),
    }));
    const actual = assessFullAppEvidence(report);
    if (report.acousticEvidence) assert.deepEqual(actual, report.acousticEvidence);
    outcomes.push(actual.outcome);
  }
  assert.deepEqual(outcomes, ["passed", "inconclusive", "passed", "passed"]);
  assert.equal(archive.reports[1].outcome, "failed");
});
