/* global Buffer, URL */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import { inspectSandboxSessionToken } from "./runtime.mjs";

async function routeHandler(suffix, context) {
  const source = await fs.readFile(new URL("./full-app.mjs", import.meta.url), "utf8");
  const prefix = `  await page.route(baseUrl + "/api/group-voice-sessions/*/participants/*/${suffix}", `;
  const marker = source.indexOf(prefix);
  assert.ok(marker >= 0, `Missing ${suffix} route guard`);
  const start = marker + prefix.length;
  const end = source.indexOf("\n  });", start);
  assert.ok(end > start);
  return vm.runInNewContext(`(${source.slice(start, end)}\n  })`, context);
}

function fakeRoute(response, input = {}) {
  const calls = { fulfilled: [], continued: 0 };
  return {
    calls,
    request: () => ({ method: () => "POST", postDataJSON: () => input }),
    fetch: async () => response,
    fulfill: async (value) => calls.fulfilled.push(value),
    continue: async () => {
      calls.continued += 1;
    },
  };
}

for (const sandbox of [true, false]) {
  test(`replacement token guard ${sandbox ? "allows sandbox" : "denies non-sandbox"} without storing the token`, async () => {
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({
          exp: Date.now() / 1000 + 600,
          sid: "session-replacement",
          start_session_data: { is_sandbox: sandbox },
        })
      ).toString("base64url"),
      "signature-not-verified",
    ].join(".");
    const report = { replacements: [], errors: [] };
    const handler = await routeHandler("retry", { report, inspectSandboxSessionToken, startupFailure: null });
    const response = {
      json: async () => ({
        participant: {
          avatar: { id: "avatar-a", name: "Ada" },
          participantAttemptId: "attempt-new",
          sessionId: "session-replacement",
          sessionToken: token,
        },
      }),
    };
    const route = fakeRoute(response);
    await handler(route);
    assert.equal(route.calls.fulfilled.length, 1);
    if (sandbox) assert.equal(route.calls.fulfilled[0].response, response);
    else assert.equal(route.calls.fulfilled[0].status, 503);
    assert.equal(report.replacements[0].tokenGuard.passed, sandbox);
    assert.equal(report.replacements[0].tokenGuard.signatureVerified, false);
    assert.ok(!JSON.stringify(report).includes(token));
  });
}

for (const [status, isSandbox, allowed] of [
  [200, true, true],
  [200, false, false],
  [503, true, false],
]) {
  test(`replacement started ACK guard requires GET 200 and sandbox true (${status}/${isSandbox})`, async () => {
    const report = {
      replacements: [{ participantAttemptId: "attempt-new", providerSessionId: "session-new" }],
      errors: [],
    };
    const requested = [];
    const handler = await routeHandler("started", {
      report,
      startupFailure: null,
      process: { env: { LIVEAVATAR_API_KEY: "test-key-not-real" } },
      AbortSignal: { timeout: () => undefined },
      fetch: async (url) => {
        requested.push(url);
        return { status, json: async () => ({ data: { is_sandbox: isSandbox } }) };
      },
    });
    const route = fakeRoute(null, { participantAttemptId: "attempt-new" });
    await handler(route);
    assert.deepEqual(requested, ["https://api.liveavatar.com/v1/sessions/session-new"]);
    assert.equal(route.calls.continued, allowed ? 1 : 0);
    if (!allowed) assert.equal(route.calls.fulfilled[0].status, 503);
    assert.equal(report.replacements[0].postStartGuard.status, status);
    assert.equal(report.replacements[0].postStartGuard.isSandbox, isSandbox);
    assert.ok(!JSON.stringify(report).includes("test-key-not-real"));
  });
}

async function interruptionOracle() {
  const source = await fs.readFile(new URL("./full-app.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function assessInterruptionReuse(report) {");
  const end = source.indexOf('\nconst groupId = arg("group-id");', start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`(${source.slice(start, end)})`);
}

function reuseFixture(target = "same") {
  const time = (milliseconds) =>
    new Date(Date.parse("2026-09-13T00:00:00.000Z") + milliseconds).toISOString();
  const avatar = target === "same" ? "a" : "b";
  const name = target === "same" ? "Ada" : "Bea";
  const api = (suffix, atMs, data) => ({
    path: `/api/group-voice-sessions/group-session/${suffix}`,
    method: "POST",
    status: 200,
    at: time(atMs),
    requestObservedAt: time(atMs - 10),
    responseObservedAt: time(atMs),
    ...data,
  });
  const event = (type, atMs, eventId, sourceEventId, sessionId = "session-a") => ({
    eventType: type,
    atMs,
    eventId,
    sourceEventId,
    sessionId,
  });
  const sample = (sampleName, atMs, rms, muted = false) => ({
    name: sampleName,
    atMs,
    rms,
    muted,
    paused: false,
    volume: 1,
    status: "active",
    audioTrackId: `${sampleName}-track`,
  });
  return {
    bargeTarget: target,
    bargeIn: {
      oldRoundId: "old-round",
      oldTurnId: "old-turn",
      newTurnId: "new-turn",
      ownerAvatarId: "a",
      ownerName: "Ada",
      ownerProviderSessionId: "session-a",
      ownerSpeechSourceEventId: "old-speech",
      targetAvatarId: avatar,
      targetName: name,
      actualTargetAvatarId: avatar,
      partialBrowserAtMs: 100,
    },
    injection: { browserAtMs: 10 },
    replacements: [],
    providerSessions: [
      { avatarId: "a", name: "Ada", participantAttemptId: "attempt-a", providerSessionId: "session-a" },
      { avatarId: "b", name: "Bea", participantAttemptId: "attempt-b", providerSessionId: "session-b" },
    ],
    roundState: [{ id: "old-round", status: "cancelled" }],
    api: [
      api("turns", 15, {}),
      api("interrupt", 130, {
        input: { reason: "user", sourceEventId: "cut-1" },
        interruption: {
          status: "cancelled",
          sourceEventId: "cut-1",
          affectedParticipants: [
            { avatarId: "a", participantAttemptId: "attempt-a", interruptedTurnId: "old-turn" },
          ],
        },
      }),
      api("participants/a/interruption-ready", 180, {
        applied: true,
        floorIsEmpty: true,
        phase: "listening",
        participantAvatarId: "a",
        input: {
          interruptionSourceEventId: "cut-1",
          participantAttemptId: "attempt-a",
          interruptedTurnId: "old-turn",
          evidence: { type: "speak_ended", eventId: "old-end", speechSourceEventId: "old-speech" },
        },
      }),
      api("turns", 190, {}),
    ],
    media: {
      wallStartedAt: time(0),
      commandObserverAvailable: true,
      maxUnmutedElements: 1,
      commands: [
        { atMs: 20, commandType: "user_message", sessionId: "session-a", eventId: "command-1" },
        { atMs: 200, commandType: "user_message", sessionId: `session-${avatar}`, eventId: "command-2" },
      ],
      providerEvents: [
        event("avatar.speak_started", 50, "old-start", "old-speech"),
        event("avatar.speak_ended", 150, "old-end", "old-speech"),
        event("avatar.speak_started", 220, "new-start", "new-speech", `session-${avatar}`),
        event("avatar.speak_ended", 300, "new-end", "new-speech", `session-${avatar}`),
      ],
      samples: [
        sample("Ada", 80, 0.01),
        sample("Bea", 80, 0, true),
        sample("Ada", 120, 0.01, true),
        sample("Ada", 210, 0, true),
        sample("Bea", 210, 0, true),
        sample(name, 240, 0.01),
      ],
    },
  };
}

for (const target of ["same", "other"]) {
  test(`native ${target}-avatar route requires the original connector and remains experimental`, async () => {
    const result = (await interruptionOracle())(reuseFixture(target));
    assert.ok(Object.values(result.checks).every(Boolean), JSON.stringify(result.checks));
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.experimental, true);
    assert.equal(result.commandCount, 2);
    assert.equal(result.nextResponseAudibleSamples, 1);
    assert.equal(result.lateEventGuardCoverage, "not_observed");
  });
}

test("replacement, track changes and connecting tiles fail the native reuse checks", async () => {
  const fixture = reuseFixture();
  fixture.replacements.push({ avatarId: "a", providerSessionId: "replacement-session" });
  fixture.media.commands[1].sessionId = "replacement-session";
  fixture.media.samples.at(-1).audioTrackId = "replacement-track";
  fixture.media.samples.at(-1).status = "connecting";
  const result = (await interruptionOracle())(fixture);
  for (const name of [
    "noReplacements",
    "sameAudioTracks",
    "commandsUseOriginalConnectors",
    "noConnectingTilesAfterInterruption",
  ])
    assert.equal(result.checks[name], false, name);
});

test("a ready ACK must match the affected attempt and precede the new command", async () => {
  const assess = await interruptionOracle();
  for (const mutate of [
    (ready) => {
      ready.applied = false;
    },
    (ready) => {
      ready.input.participantAttemptId = "stale-attempt";
    },
    (ready) => {
      ready.input.interruptedTurnId = "stale-turn";
    },
    (ready) => {
      ready.responseObservedAt = "2026-09-13T00:00:00.250Z";
    },
  ]) {
    const fixture = reuseFixture();
    mutate(fixture.api[2]);
    assert.equal(assess(fixture).checks.everyAffectedAttemptReused, false);
  }
});

test("the terminal source must belong to actual old speech, not the command UUID", async () => {
  const fixture = reuseFixture();
  fixture.api[2].input.evidence.speechSourceEventId = "command-1";
  const result = (await interruptionOracle())(fixture);
  assert.equal(result.checks.correlatedInterruptionTerminal, false);
  assert.equal(result.checks.everyAffectedAttemptResolvedSafely, false);
});

test("a terminal from a prior greeting cannot confirm interruption of the observed response", async () => {
  const fixture = reuseFixture();
  fixture.bargeIn.ownerSpeechSourceEventId = "response-at-interruption";
  assert.equal((await interruptionOracle())(fixture).checks.correlatedInterruptionTerminal, false);
});

test("a second prepared participant can confirm no dispatch while the audible owner requires a terminal", async () => {
  const fixture = reuseFixture("other");
  fixture.api[1].interruption.affectedParticipants.push({
    avatarId: "b",
    participantAttemptId: "attempt-b",
    interruptedTurnId: "prepared-turn",
  });
  fixture.api.push({
    ...fixture.api[2],
    participantAvatarId: "b",
    input: {
      interruptionSourceEventId: "cut-1",
      participantAttemptId: "attempt-b",
      interruptedTurnId: "prepared-turn",
      evidence: { type: "not_dispatched" },
    },
  });
  const assess = await interruptionOracle();
  assert.ok(Object.values(assess(fixture).checks).every(Boolean));
  fixture.api[2].input.evidence = { type: "not_dispatched" };
  assert.equal(assess(fixture).checks.correlatedInterruptionTerminal, false);
});

test("fresh source is required before enabled PCM and blocked new-response PCM still fails", async () => {
  const fixture = reuseFixture();
  fixture.media.samples[3].rms = 0.01;
  fixture.media.samples[3].muted = false;
  fixture.media.samples.at(-1).muted = true;
  const result = (await interruptionOracle())(fixture);
  assert.equal(result.checks.noAudiblePcmBeforeFreshSource, false);
  assert.equal(result.checks.noBlockedNewResponsePcm, false);
  assert.equal(result.checks.nextResponseHasAudio, false);
});

test("a source from the interrupted speech cannot qualify as the new response", async () => {
  const fixture = reuseFixture();
  fixture.media.providerEvents[2].sourceEventId = "old-speech";
  const result = (await interruptionOracle())(fixture);
  assert.equal(result.checks.freshResponseSource, false);
  assert.equal(result.checks.nextResponseHasAudio, false);
});

test("a late correction can be dropped or preserve its old turn, but cannot update the new turn", async () => {
  const fixture = reuseFixture();
  fixture.media.providerEvents.push({
    atMs: 250,
    eventId: "late-correction",
    sessionId: "session-a",
    eventType: "elevenlabs_agent_event",
    providerType: "agent_response_correction",
    sourceEventId: null,
  });
  const assess = await interruptionOracle();
  assert.equal(assess(fixture).checks.observedLateEvidenceKeepsOldTurn, true);
  assert.equal(assess(fixture).lateEventGuardCoverage, "observed_requires_review");
  fixture.api.push({
    path: "/api/group-voice-sessions/group-session/provider-events",
    input: {
      sourceEventId: "agent_response_correction:a:late-correction",
      turnId: "old-turn",
    },
  });
  assert.equal(assess(fixture).checks.observedLateEvidenceKeepsOldTurn, true);
  fixture.api.at(-1).input.turnId = "new-turn";
  assert.equal(assess(fixture).checks.observedLateEvidenceKeepsOldTurn, false);
});

test("duplicate commands and submits still fail their exact-count checks", async () => {
  const fixture = reuseFixture();
  fixture.media.commands.push({ ...fixture.media.commands[1], atMs: 310 });
  fixture.api.push({ ...fixture.api.at(-1) });
  const result = (await interruptionOracle())(fixture);
  assert.equal(result.checks.exactlyTwoUserCommands, false);
  assert.equal(result.checks.exactlyTwoHumanSubmits, false);
});
