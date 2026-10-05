/* global AbortSignal, AudioContext, Buffer, MediaStream, TextDecoder, URL, console, document, fetch, performance, process, setInterval, setTimeout, window */
// Only Scribe's websocket is replaced. The actual application and provider remain intact.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { assessFullAppEvidence } from "./acoustic-evidence.mjs";
import {
  arg,
  assertLocalUrl,
  assertSandbox,
  browserOptions,
  checkConversation,
  deadline,
  loadBrowser,
  inspectSandboxSessionToken,
  outputDirectory,
  repo,
  run,
  safeError,
} from "./runtime.mjs";

function assessInterruptionReuse(report) {
  const input = report.bargeIn;
  const media = report.media;
  const origin = Date.parse(media.wallStartedAt);
  const toMs = (event, request = false) =>
    Date.parse((request ? event.requestObservedAt : event.responseObservedAt) ?? event.at) - origin;
  const originalSessions = report.initialProviderSessions ?? report.providerSessions ?? [];
  const cuts = report.api.filter(
    (event) => event.path.endsWith("/interrupt") && event.input?.reason === "user"
  );
  const cancelled = cuts.find((event) => event.status === 200 && event.interruption?.status === "cancelled");
  const interruptionId = cancelled?.interruption?.sourceEventId;
  const affected = cancelled?.interruption?.affectedParticipants ?? [];
  const submits = report.api.filter((event) => event.path.endsWith("/turns") && event.method === "POST");
  const commands = media.commands.filter(
    (event) => event.commandType === "user_message" && event.atMs >= report.injection.browserAtMs
  );
  const nextCommand = commands[1];
  const ready = report.api.filter(
    (event) =>
      event.path.endsWith("/interruption-ready") &&
      event.status === 200 &&
      event.applied === true &&
      event.input?.interruptionSourceEventId === interruptionId
  );
  const resolutions = affected.map((participant) => {
    const original = originalSessions.find((item) => item.avatarId === participant.avatarId);
    const ack = ready.find(
      (event) =>
        event.participantAvatarId === participant.avatarId &&
        event.input.participantAttemptId === participant.participantAttemptId &&
        event.input.interruptedTurnId === participant.interruptedTurnId
    );
    const evidence = ack?.input.evidence;
    const terminal =
      evidence?.type === "speak_ended" &&
      media.providerEvents.find(
        (event) =>
          event.eventType === "avatar.speak_ended" &&
          event.eventId === evidence.eventId &&
          event.sourceEventId === evidence.speechSourceEventId &&
          (participant.avatarId !== input.ownerAvatarId ||
            event.sourceEventId === input.ownerSpeechSourceEventId) &&
          event.sessionId === original?.providerSessionId &&
          event.atMs <= toMs(ack, true)
      );
    const sourceStart =
      terminal &&
      media.providerEvents.find(
        (event) =>
          event.eventType === "avatar.speak_started" &&
          event.sourceEventId === evidence.speechSourceEventId &&
          event.sessionId === original?.providerSessionId &&
          event.atMs <= terminal.atMs
      );
    return {
      avatarId: participant.avatarId,
      participantAttemptId: participant.participantAttemptId,
      interruptedTurnId: participant.interruptedTurnId,
      providerSessionId: original?.providerSessionId ?? null,
      evidenceType: evidence?.type ?? null,
      speechSourceEventId: evidence?.speechSourceEventId ?? null,
      sameAttempt: Boolean(original && original.participantAttemptId === participant.participantAttemptId),
      readyBeforeNextCommand: Boolean(
        ack && nextCommand && ack.floorIsEmpty && ack.phase === "listening" && toMs(ack) <= nextCommand.atMs
      ),
      correlatedTerminal: Boolean(sourceStart && terminal),
      notDispatchedObserved: Boolean(
        ack &&
        evidence?.type === "not_dispatched" &&
        participant.avatarId !== input.ownerAvatarId &&
        !commands.some(
          (command) => command.sessionId === original?.providerSessionId && command.atMs < toMs(ack)
        )
      ),
    };
  });
  const targetSession = originalSessions.find((item) => item.avatarId === input.targetAvatarId);
  const retiredSources = new Set(resolutions.map((item) => item.speechSourceEventId).filter(Boolean));
  const nextStart = media.providerEvents.find(
    (event) =>
      nextCommand &&
      event.atMs >= nextCommand.atMs &&
      event.sessionId === targetSession?.providerSessionId &&
      event.eventType === "avatar.speak_started" &&
      event.sourceEventId &&
      !retiredSources.has(event.sourceEventId)
  );
  const energetic = (sample) => sample.rms > 0.001;
  const audible = (sample) => !sample.muted && !sample.paused && sample.volume > 0;
  const targetSamples = media.samples.filter(
    (sample) => nextCommand && sample.name === input.targetName && sample.atMs >= nextCommand.atMs
  );
  const targetAudio = targetSamples.filter(
    (sample) => nextStart && sample.atMs >= nextStart.atMs && energetic(sample) && audible(sample)
  );
  const targetBlocked = targetSamples.filter(
    (sample) => nextStart && sample.atMs >= nextStart.atMs && energetic(sample) && !audible(sample)
  );
  const earlyAudio = targetSamples.filter(
    (sample) => (!nextStart || sample.atMs < nextStart.atMs) && energetic(sample) && audible(sample)
  );
  const firstMute = media.samples.find(
    (sample) => sample.name === input.ownerName && sample.atMs >= input.partialBrowserAtMs && sample.muted
  );
  const gateLatencyMs = firstMute ? firstMute.atMs - input.partialBrowserAtMs : null;
  const lateEvents = media.providerEvents.filter(
    (event) =>
      nextCommand &&
      event.atMs >= nextCommand.atMs &&
      event.sessionId === input.ownerProviderSessionId &&
      (retiredSources.has(event.sourceEventId) ||
        ["interruption", "agent_response_correction"].includes(event.providerType))
  );
  const lateEvidence = lateEvents.filter((event) =>
    ["interruption", "agent_response_correction"].includes(event.providerType)
  );
  const lateAttributionSafe = lateEvidence.every((event) => {
    const deliveries = report.api.filter(
      (delivery) =>
        delivery.path.endsWith("/provider-events") &&
        delivery.input?.sourceEventId === `${event.providerType}:${input.ownerAvatarId}:${event.eventId}`
    );
    return deliveries.every((delivery) => delivery.input.turnId === input.oldTurnId);
  });
  const trackContinuity = originalSessions.every((participant) => {
    const before = media.samples.findLast(
      (sample) => sample.name === participant.name && sample.atMs < input.partialBrowserAtMs
    );
    const after = media.samples.filter(
      (sample) => nextCommand && sample.name === participant.name && sample.atMs >= nextCommand.atMs
    );
    return Boolean(
      before?.audioTrackId &&
      after.length &&
      after.every((sample) => sample.audioTrackId === before.audioTrackId)
    );
  });
  return {
    outcome: "inconclusive",
    experimental: true,
    reason: "experimental_oracle_requires_review_and_physical_qa",
    gateLatencyMs,
    checks: {
      commandObserverAvailable: media.commandObserverAvailable === true,
      oneInterruptionId: Boolean(
        interruptionId &&
        new Set(cuts.map((event) => event.input.sourceEventId)).size === 1 &&
        cuts.every((event) => event.input.sourceEventId === interruptionId)
      ),
      exactlyTwoHumanSubmits: submits.length === 2,
      exactlyTwoUserCommands: commands.length === 2,
      commandsUseOriginalConnectors:
        commands[0]?.sessionId === input.ownerProviderSessionId &&
        nextCommand?.sessionId === targetSession?.providerSessionId,
      everyAffectedAttemptReused:
        resolutions.length > 0 &&
        resolutions.every((item) => item.sameAttempt && item.readyBeforeNextCommand),
      correlatedInterruptionTerminal:
        resolutions.find((item) => item.avatarId === input.ownerAvatarId)?.correlatedTerminal === true,
      everyAffectedAttemptResolvedSafely:
        resolutions.length > 0 &&
        resolutions.every((item) => item.correlatedTerminal || item.notDispatchedObserved),
      noReplacements:
        report.replacements.length === 0 && !report.api.some((event) => event.path.endsWith("/retry")),
      noSessionStops:
        !media.commands.some((event) => event.eventType === "session.stop") &&
        !media.providerEvents.some((event) => event.eventType === "session.stopped"),
      sameAudioTracks: trackContinuity,
      noConnectingTilesAfterInterruption: !media.samples.some(
        (sample) => sample.atMs >= input.partialBrowserAtMs && sample.status === "connecting"
      ),
      oldRoundCancelled:
        report.roundState.find((round) => round.id === input.oldRoundId)?.status === "cancelled",
      atMostOneAudible: media.maxUnmutedElements <= 1,
      gateWithin200Ms: gateLatencyMs !== null && gateLatencyMs <= 200,
      selectedRequestedTarget: input.actualTargetAvatarId === input.targetAvatarId,
      freshResponseSource: Boolean(nextStart),
      freshResponseTerminal: Boolean(
        nextStart &&
        media.providerEvents.some(
          (event) =>
            event.eventType === "avatar.speak_ended" &&
            event.sessionId === nextStart.sessionId &&
            event.sourceEventId === nextStart.sourceEventId &&
            event.atMs >= nextStart.atMs
        )
      ),
      nextResponseHasAudio: targetAudio.length > 0,
      noAudiblePcmBeforeFreshSource: earlyAudio.length === 0,
      noBlockedNewResponsePcm: targetBlocked.length === 0,
      observedLateEvidenceKeepsOldTurn: lateAttributionSafe,
    },
    resolutions,
    commandCount: commands.length,
    nextResponseAudibleSamples: targetAudio.length,
    nextResponseBlockedSamples: targetBlocked.length,
    audibleSamplesBeforeFreshSource: earlyAudio.length,
    lateProviderEvents: lateEvents.length,
    lateEvidenceEvents: lateEvidence.length,
    lateEventGuardCoverage: lateEvents.length ? "observed_requires_review" : "not_observed",
    caveats: [
      "Fake microphone and injected Scribe events; not physical interruption/echo QA",
      "Gate latency includes Playwright/socket and 20 ms sampling uncertainty",
      "Provider sources attribute events, not individual PCM samples or exact audible words",
      "Interrupted buffered audio may intentionally remain muted before the fresh response source",
      "No observed late events does not validate their guards; synthetic lifecycle regressions remain required",
    ],
  };
}

const groupId = arg("group-id");
if (!groupId || !/^[a-zA-Z0-9_-]{1,128}$/.test(groupId)) throw new Error("A valid --group-id is required");
const baseUrl = assertLocalUrl(arg("app-url", "http://localhost:3000"));
if (process.env.API_INTERNAL_URL) assertLocalUrl(process.env.API_INTERNAL_URL);
const temp = await outputDirectory();
let text = arg("text");
const scenario = arg("scenario", "normal");
const bargeTarget = arg("barge-target", "other");
const responseLength = arg("response", scenario === "barge-in" ? "long" : "short");
const layout = arg("layout", "desktop");
if (!["normal", "barge-in"].includes(scenario)) throw new Error("--scenario must be normal or barge-in");
if (!["same", "other"].includes(bargeTarget)) throw new Error("--barge-target must be same or other");
if (!["short", "long"].includes(responseLength)) throw new Error("--response must be short or long");
if (!["desktop", "mobile"].includes(layout)) throw new Error("--layout must be desktop or mobile");
const report = {
  createdAt: new Date().toISOString(),
  kind: "full-app-real-provider-fake-scribe",
  run,
  groupId,
  scenario,
  ...(scenario === "barge-in" ? { bargeTarget, oracleStatus: "experimental-not-accepted" } : {}),
  responseLength,
  layout,
  api: [],
  errors: [],
  providerChecks: [],
  replacements: [],
};
const sql = (query) =>
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "yuni", "-d", "yuni_dev", "-tA", "-c", query],
    { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
let browser, page, context, sessionId, token;
let running = true;
let startupFailure = null;
const responseTasks = [];
const requestObservations = new WeakMap();
const scribeSockets = [];
const snapshotTts = async (roster) =>
  Promise.all(
    roster.map(async ({ name, agentId }) => {
      if (!process.env.ELEVENLABS_API_KEY)
        return { name, agentId, error: "Missing key for read-only TTS snapshot" };
      try {
        const response = await fetch("https://api.elevenlabs.io/v1/convai/agents/" + agentId, {
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return { name, agentId, status: response.status };
        const body = await response.json();
        const tts = body.conversation_config?.tts ?? {};
        const selected = Object.fromEntries(
          [
            "model_id",
            "voice_id",
            "agent_output_audio_format",
            "optimize_streaming_latency",
            "stability",
            "speed",
            "similarity_boost",
          ].map((key) => [key, tts[key] ?? null])
        );
        return {
          name,
          agentId,
          profile: selected,
          sha256: createHash("sha256").update(JSON.stringify(selected)).digest("hex"),
        };
      } catch (error) {
        return { name, agentId, errorName: error.name };
      }
    })
  );
try {
  if (!run) {
    console.log(
      JSON.stringify({
        run: false,
        ready: true,
        scope: "Requires --run; default makes no API requests or sessions",
        groupId,
      })
    );
    process.exit(0);
  }
  assertSandbox();
  if (!process.env.LIVEAVATAR_API_KEY || !process.env.ELEVENLABS_API_KEY)
    throw new Error("Provider API keys required for sandbox guards and read-only checks");
  const chromium = loadBrowser();
  // Read-only lookup. Nothing is printed or persisted from the user's auth data.
  const owner = JSON.parse(
    sql(
      `SELECT json_build_object('id', u.id, 'email', u.email, 'name', u.name) FROM "User" u JOIN "AvatarGroup" g ON g."ownerId"=u.id WHERE g.id='${groupId}';`
    )
  );
  const roster = JSON.parse(
    sql(
      `SELECT json_agg(json_build_object('name', a.name, 'avatarId', a.id, 'agentId', a."groupProviderAgentId", 'syncStatus', a."groupProviderSyncStatus")) FROM "AvatarGroupMember" gm JOIN "AvatarAgent" a ON a.id=gm."avatarAgentId" WHERE gm."avatarGroupId"='${groupId}';`
    )
  );
  if (!Array.isArray(roster) || roster.length < 2 || roster.length > 3)
    throw new Error("The QA group must contain two or three participants");
  if (roster.some((item) => !item.agentId))
    throw new Error("Every participant needs a synchronized group Agent");
  text ??=
    roster.map((item) => item.name).join(", ") +
    (scenario === "barge-in"
      ? ", respondan todos por turno. Cada uno explique cinco recomendaciones de su especialidad con ejemplos concretos. Empiecen directamente con la explicación."
      : responseLength === "short"
        ? ", respondan todos por turno. Cada uno diga únicamente la palabra azul."
        : ", respondan todos por turno. Cada uno explique una recomendación concreta de su especialidad en dos oraciones breves de unas veinte palabras en total.");
  report.roster = roster;
  report.ttsBefore = await snapshotTts(roster);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      type: "user_session",
      email: owner.email,
      name: owner.name,
      sub: owner.id,
      iat: now,
      exp: now + 600,
    })
  ).toString("base64url");
  token =
    header +
    "." +
    payload +
    "." +
    createHmac("sha256", process.env.AUTH_SECRET ?? "dev-change-me")
      .update(header + "." + payload)
      .digest("base64url");
  browser = await chromium.launch(browserOptions());
  context = await browser.newContext({
    permissions: ["microphone"],
    ...(layout === "mobile"
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { viewport: { width: 1440, height: 1000 } }),
  });
  await context.addCookies([
    {
      name: "yuni_session",
      value: token,
      url: baseUrl,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: now + 600,
    },
  ]);
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ type: "pageerror", name: error.name }));
  // Pre-start GET cannot see an unstarted provider session. Inspect allowlisted
  // claims from our authenticated loopback API, then confirm via GET after start.
  // This intentionally does not claim cryptographic JWT signature verification.
  await page.route(baseUrl + "/api/avatar-groups/" + groupId + "/voice-sessions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    if (!body?.voiceSession) return route.fulfill({ response });
    sessionId = body.voiceSession.id;
    report.sessionId = sessionId;
    report.providerSessions = body.voiceSession.participants.map((participant) => ({
      avatarId: participant.avatar.id,
      name: participant.avatar.name,
      providerSessionId: participant.sessionId,
      participantAttemptId: participant.participantAttemptId,
    }));
    report.initialProviderSessions ??= report.providerSessions.map((participant) => ({ ...participant }));
    const guardParticipants = [];
    console.log(
      JSON.stringify({
        stage: "sandbox_guard_start",
        sessionId,
        participantCount: body.voiceSession.participants.length,
      })
    );
    let allSandbox = true;
    for (const participant of body.voiceSession.participants) {
      const observation = {
        avatarId: participant.avatar.id,
        sessionId: participant.sessionId ?? null,
        observedAt: new Date().toISOString(),
        status: null,
        isSandbox: null,
        errorName: null,
      };
      guardParticipants.push(observation);
      if (!participant.sessionToken) {
        observation.errorName = "NoSessionToken";
        continue;
      }
      if (!participant.sessionId) {
        observation.errorName = "MissingSessionId";
        allSandbox = false;
        continue;
      }
      const claims = inspectSandboxSessionToken(participant.sessionToken, participant.sessionId);
      observation.claims = claims;
      observation.isSandbox = claims.isSandbox;
      if (!claims.passed) allSandbox = false;
      console.log(JSON.stringify({ stage: "sandbox_guard_participant", ...observation }));
    }
    report.sandboxGuard = { passed: allSandbox, participants: guardParticipants };
    console.log(JSON.stringify({ stage: "sandbox_guard_result", sessionId, passed: allSandbox }));
    if (!allSandbox) {
      startupFailure = "SandboxMetadataUnconfirmed";
      report.errors.push({ type: "sandbox_guard_denied" });
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "QA_SANDBOX_REQUIRED", message: "QA requires verified sandbox provider sessions" },
        }),
      });
    }
    await route.fulfill({ response });
  });

  // Replacement sessions have the same safety boundary as initial sessions:
  // inspect the token before the SDK receives it and verify sandbox metadata
  // after SDK start, before the app receives its participant-started ACK.
  await page.route(baseUrl + "/api/group-voice-sessions/*/participants/*/retry", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    if (!body?.participant) return route.fulfill({ response });
    const participant = body.participant;
    const claims = inspectSandboxSessionToken(participant.sessionToken, participant.sessionId);
    const observation = {
      avatarId: participant.avatar?.id ?? null,
      name: participant.avatar?.name ?? null,
      providerSessionId: participant.sessionId ?? null,
      participantAttemptId: participant.participantAttemptId ?? null,
      observedAt: new Date().toISOString(),
      tokenGuard: claims,
      postStartGuard: null,
    };
    report.replacements.push(observation);
    if (!claims.passed || !observation.participantAttemptId) {
      startupFailure = "ReplacementSandboxMetadataUnconfirmed";
      report.errors.push({ type: "replacement_sandbox_guard_denied" });
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "QA_SANDBOX_REQUIRED", message: "QA requires a verified sandbox replacement" },
        }),
      });
    }
    return route.fulfill({ response });
  });
  await page.route(baseUrl + "/api/group-voice-sessions/*/participants/*/started", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    let input;
    try {
      input = route.request().postDataJSON();
    } catch {
      return route.continue();
    }
    const replacement = report.replacements.find(
      (item) => item.participantAttemptId === input?.participantAttemptId
    );
    if (!replacement) return route.continue();
    const observation = { observedAt: new Date().toISOString(), status: null, isSandbox: null };
    try {
      const response = await fetch(
        "https://api.liveavatar.com/v1/sessions/" + encodeURIComponent(replacement.providerSessionId),
        {
          headers: { "X-API-KEY": process.env.LIVEAVATAR_API_KEY },
          signal: AbortSignal.timeout(6000),
        }
      );
      observation.status = response.status;
      const body = await response.json();
      observation.isSandbox = (body.data ?? body).is_sandbox === true;
    } catch (error) {
      observation.errorName = error.name;
    }
    replacement.postStartGuard = observation;
    if (observation.status !== 200 || observation.isSandbox !== true) {
      startupFailure = "ReplacementPostStartSandboxUnconfirmed";
      report.errors.push({ type: "replacement_post_start_sandbox_guard_denied" });
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "QA_SANDBOX_REQUIRED", message: "QA replacement sandbox was not confirmed" },
        }),
      });
    }
    return route.continue();
  });

  await page.routeWebSocket(/\/v1\/speech-to-text\/realtime(?:\?|$)/, (socket) => {
    scribeSockets.push(socket);
    socket.onMessage(() => {}); // SDK microphone is fake; no audio reaches a transcriber.
    setTimeout(() => {
      try {
        socket.send(
          JSON.stringify({ message_type: "session_started", session_id: "qa-scribe-" + scribeSockets.length })
        );
      } catch {
        /* Diagnostic failure must not change the running call. */
      }
    }, 50);
  });
  await page.addInitScript(() => {
    const meters = new Map();
    const observations = {
      startedAt: performance.now(),
      wallStartedAt: new Date().toISOString(),
      maxUnmutedElements: 0,
      participants: {},
      mediaEvents: [],
      samples: [],
      commands: [],
      providerEvents: [],
      commandObserverAvailable: false,
      sampleIntervalMs: 20,
    };
    window.__yuniQAMedia = observations;
    // LiveKit wraps JSON in a protobuf DataPacket. Inspect just the bounded JSON
    // object; never persist the packet or its text. All native calls are untouched.
    const decodeControl = (packet) => {
      try {
        const text =
          typeof packet === "string"
            ? packet
            : packet instanceof ArrayBuffer || ArrayBuffer.isView(packet)
              ? new TextDecoder().decode(packet)
              : "";
        if (!text || text.length > 262144) return null;
        for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
          let depth = 0,
            quoted = false,
            escaped = false;
          for (let index = start; index < text.length; index++) {
            const char = text[index];
            if (quoted) {
              if (escaped) escaped = false;
              else if (char === "\\") escaped = true;
              else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === "{") depth++;
            else if (char === "}" && --depth === 0) {
              const value = JSON.parse(text.slice(start, index + 1));
              if (typeof value.event_type === "string") return value;
              break;
            }
          }
        }
      } catch {
        /* Unrecognized packet formats make evidence inconclusive, never break WebRTC. */
      }
      return null;
    };
    const sessionByChannel = new WeakMap();
    const seenChannels = new WeakSet();
    const record = (packet, channel, direction) => {
      const event = decodeControl(packet);
      if (!event) return;
      if (event.session_id) sessionByChannel.set(channel, event.session_id);
      const conversationId =
        event.data?.conversation_initiation_metadata_event?.conversation_id ?? event.data?.conversation_id;
      const entry = {
        atMs: Math.round(performance.now() - observations.startedAt),
        eventType: event.event_type,
        eventId: event.event_id ?? null,
        sourceEventId: event.source_event_id ?? null,
        sessionId: event.session_id ?? sessionByChannel.get(channel) ?? null,
        commandType: event.elevenlabs_event_type ?? null,
        providerType: event.elevenlabs_event_type ?? event.data?.type ?? null,
        conversationId:
          typeof conversationId === "string" && /^conv_[a-zA-Z0-9_-]{1,128}$/.test(conversationId)
            ? conversationId
            : null,
      };
      (direction === "out" ? observations.commands : observations.providerEvents).push(entry);
    };
    const watch = (channel) => {
      if (seenChannels.has(channel)) return;
      seenChannels.add(channel);
      channel.addEventListener("message", (event) => record(event.data, channel, "in"));
    };
    if (window.RTCDataChannel && window.RTCPeerConnection) {
      const send = window.RTCDataChannel.prototype.send;
      window.RTCDataChannel.prototype.send = function (packet) {
        try {
          record(packet, this, "out");
        } catch {
          /* Observation only. */
        }
        return send.call(this, packet);
      };
      const createDataChannel = window.RTCPeerConnection.prototype.createDataChannel;
      window.RTCPeerConnection.prototype.createDataChannel = function (...options) {
        const channel = createDataChannel.apply(this, options);
        watch(channel);
        return channel;
      };
      const observedPeers = new WeakSet();
      const setRemoteDescription = window.RTCPeerConnection.prototype.setRemoteDescription;
      window.RTCPeerConnection.prototype.setRemoteDescription = function (...options) {
        if (!observedPeers.has(this)) {
          observedPeers.add(this);
          this.addEventListener("datachannel", (event) => watch(event.channel));
        }
        return setRemoteDescription.apply(this, options);
      };
      observations.commandObserverAvailable = true;
    }
    setInterval(() => {
      const videos = [...document.querySelectorAll("video")];
      observations.maxUnmutedElements = Math.max(
        observations.maxUnmutedElements,
        videos.filter((video) => !video.muted && video.srcObject).length
      );
      for (const video of videos) {
        const track = video.srcObject?.getAudioTracks?.()[0];
        if (!track) continue;
        const name = video.closest("[data-status]")?.querySelector("strong")?.textContent ?? "unknown";
        if (!meters.has(track.id)) {
          try {
            const context = new AudioContext();
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            const source = context.createMediaStreamSource(new MediaStream([track]));
            const gain = context.createGain();
            gain.gain.value = 0;
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(context.destination);
            context.resume();
            meters.set(track.id, { context, analyser, values: new Float32Array(analyser.fftSize) });
            for (const event of ["playing", "waiting", "stalled", "error"])
              video.addEventListener(event, () =>
                observations.mediaEvents.push({
                  atMs: Math.round(performance.now() - observations.startedAt),
                  name,
                  event,
                })
              );
          } catch {
            /* Diagnostic failure must not change the running call. */
          }
        }
        const meter = meters.get(track.id);
        if (!meter) continue;
        meter.analyser.getFloatTimeDomainData(meter.values);
        const rms = Math.sqrt(
          meter.values.reduce((total, item) => total + item * item, 0) / meter.values.length
        );
        const tile = video.closest("[data-status]");
        observations.samples.push({
          atMs: Math.round(performance.now() - observations.startedAt),
          name,
          audioTrackId: track.id,
          rms,
          muted: video.muted,
          volume: video.volume,
          paused: video.paused,
          readyState: video.readyState,
          speaking: tile?.dataset.speaking,
          turnOwner: tile?.dataset.turnOwner,
          status: tile?.dataset.status,
        });
        if (observations.samples.length > 18000)
          observations.samples.splice(0, observations.samples.length - 18000);
        const stats = (observations.participants[name] ??= {
          samples: 0,
          nonSilentUnmutedSamples: 0,
          peakRms: 0,
          firstAudioAtMs: null,
          lastAudioAtMs: null,
          unmutedSamples: 0,
        });
        stats.samples++;
        stats.peakRms = Math.max(stats.peakRms, rms);
        if (!video.muted) stats.unmutedSamples++;
        if (!video.muted && !video.paused && rms > 0.001) {
          stats.nonSilentUnmutedSamples++;
          const atMs = Math.round(performance.now() - observations.startedAt);
          stats.firstAudioAtMs ??= atMs;
          stats.lastAudioAtMs = atMs;
        }
      }
    }, 20);
  });
  page.on("request", (request) => requestObservations.set(request, new Date().toISOString()));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith("/api/")) return;
    const task = (async () => {
      const request = response.request();
      const event = {
        at: new Date().toISOString(),
        requestObservedAt: requestObservations.get(request),
        responseObservedAt: new Date().toISOString(),
        timestampMeaning: "Playwright network observation, not provider event time",
        path: pathname,
        participantAvatarId: pathname.match(/\/participants\/([^/]+)\//)?.[1],
        status: response.status(),
        method: request.method(),
      };
      let requestBody;
      try {
        requestBody = request.postDataJSON();
      } catch {
        /* Diagnostic failure must not change the running call. */
      }
      if (requestBody) {
        event.input = {
          type: requestBody.type,
          turnId: requestBody.turnId,
          avatarId: requestBody.avatarId,
          sourceEventId: requestBody.sourceEventId,
          contentLength: requestBody.content?.length,
          reason: requestBody.reason,
          trigger: requestBody.trigger,
          expectedTurnId: requestBody.expectedTurnId,
          expectedAvatarId: requestBody.expectedAvatarId,
          interruptionSourceEventId: requestBody.interruptionSourceEventId,
          participantAttemptId: requestBody.participantAttemptId,
          interruptedTurnId: requestBody.interruptedTurnId,
          evidence: requestBody.evidence
            ? {
                type: requestBody.evidence.type,
                eventId: requestBody.evidence.eventId,
                speechSourceEventId: requestBody.evidence.speechSourceEventId,
              }
            : undefined,
          generatedTextLength: requestBody.generatedText?.length,
        };
      }
      try {
        const body = await response.json();
        if (body.voiceSession) {
          sessionId = body.voiceSession.id;
          report.sessionId = sessionId;
          report.providerSessions = body.voiceSession.participants.map((item) => ({
            avatarId: item.avatar.id,
            name: item.avatar.name,
            providerSessionId: item.sessionId,
            participantAttemptId: item.participantAttemptId,
          }));
        }
        event.phase = body.phase;
        event.applied = body.applied;
        event.floorIsEmpty = body.floor === null;
        event.roundId = body.round?.id;
        event.interruption = body.interruption
          ? {
              sourceEventId: body.interruption.sourceEventId,
              status: body.interruption.status,
              turnId: body.interruption.turnId,
              avatarIds: body.interruption.avatarIds,
              affectedParticipants: body.interruption.affectedParticipants?.map((participant) => ({
                avatarId: participant.avatarId,
                participantAttemptId: participant.participantAttemptId,
                interruptedTurnId: participant.interruptedTurnId,
              })),
            }
          : undefined;
        event.directive = body.directive
          ? {
              action: body.directive.action,
              avatarId: body.directive.avatarId,
              turnId: body.directive.turnId,
              reason: body.directive.reason,
            }
          : undefined;
        event.error = body.error ? { code: body.error.code, reason: body.error.reason } : undefined;
      } catch {
        /* Diagnostic failure must not change the running call. */
      }
      report.api.push(event);
    })();
    responseTasks.push(task);
  });
  await page.goto(baseUrl + "/groups/" + groupId, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Iniciar llamada", exact: true }).waitFor({ timeout: 20000 });
  console.log(JSON.stringify({ stage: "ui_start", groupId, layout, responseLength }));
  await page.getByRole("button", { name: "Iniciar llamada", exact: true }).click();
  // Owner groups normally need no disclosure; if present follow the actual UI confirmation.
  const modal = page.getByRole("dialog");
  if (await modal.isVisible().catch(() => false))
    await modal.getByRole("button", { name: "Iniciar llamada", exact: true }).click();
  await deadline(
    (async () => {
      while (running && !scribeSockets.length) {
        if (startupFailure) {
          const error = new Error("Startup verification failed");
          error.name = startupFailure;
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await page.getByText("Tu turno", { exact: true }).waitFor({ timeout: 15000 });
    })(),
    45000,
    "Full roster startup"
  );
  const postStartParticipants = await Promise.all(
    report.providerSessions.map(async (participant) => {
      const observation = {
        avatarId: participant.avatarId,
        sessionId: participant.providerSessionId,
        observedAt: new Date().toISOString(),
        status: null,
        isSandbox: null,
        errorName: null,
      };
      try {
        const response = await fetch(
          "https://api.liveavatar.com/v1/sessions/" + encodeURIComponent(participant.providerSessionId),
          {
            headers: { "X-API-KEY": process.env.LIVEAVATAR_API_KEY },
            signal: AbortSignal.timeout(6000),
          }
        );
        observation.status = response.status;
        const body = await response.json();
        const metadata = body.data ?? body;
        observation.isSandbox = typeof metadata.is_sandbox === "boolean" ? metadata.is_sandbox : null;
      } catch (error) {
        observation.errorName = error.name;
      }
      console.log(JSON.stringify({ stage: "sandbox_post_start_participant", ...observation }));
      return observation;
    })
  );
  report.postStartSandboxGuard = {
    passed: postStartParticipants.every((item) => item.status === 200 && item.isSandbox === true),
    participants: postStartParticipants,
  };
  if (!report.postStartSandboxGuard.passed) {
    const error = new Error("Started session sandbox could not be confirmed");
    error.name = "PostStartSandboxUnconfirmed";
    throw error; // finally ends only this run's session; no Scribe input is injected.
  }
  // No direct API turn injection: the real Scribe SDK dispatches this to the real component listener.
  report.injection = {
    at: new Date().toISOString(),
    kind: "scribe_committed_transcript",
    contentLength: text.length,
    browserAtMs: await page.evaluate(() => Math.round(performance.now() - window.__yuniQAMedia.startedAt)),
  };
  scribeSockets.at(-1).send(JSON.stringify({ message_type: "committed_transcript", text }));
  console.log(JSON.stringify({ stage: "injected", sessionId, contentLength: text.length }));
  if (scenario === "barge-in") {
    await deadline(
      (async () => {
        while (running && !report.bargeIn) {
          if (startupFailure)
            throw Object.assign(new Error("Sandbox verification failed"), { name: startupFailure });
          const firstRoute = report.api.find(
            (event) =>
              event.path.endsWith("/turns") && event.status === 200 && event.directive?.action === "speak"
          );
          const owner = roster.find((item) => item.avatarId === firstRoute?.directive.avatarId);
          const ownerSession = report.providerSessions.find((item) => item.avatarId === owner?.avatarId);
          if (owner && ownerSession) {
            const observed = await page.evaluate(() => window.__yuniQAMedia);
            const started = observed.providerEvents.findLast(
              (event) =>
                event.eventType === "avatar.speak_started" &&
                event.sessionId === ownerSession.providerSessionId &&
                event.atMs >= report.injection.browserAtMs
            );
            const playing = observed.samples.at(-1)?.atMs ?? 0;
            const recentAudio = observed.samples.findLast(
              (sample) =>
                sample.name === owner.name &&
                sample.atMs >= playing - 150 &&
                sample.atMs >= report.injection.browserAtMs &&
                sample.rms > 0.001 &&
                !sample.muted &&
                !sample.paused &&
                sample.turnOwner === "true"
            );
            if (started?.sourceEventId && recentAudio) {
              const target =
                bargeTarget === "same" ? owner : roster.find((item) => item.avatarId !== owner.avatarId);
              const committed = `pará, ${target.name} decí únicamente la palabra azul`;
              report.bargeIn = {
                oldRoundId: firstRoute.roundId,
                oldTurnId: firstRoute.directive.turnId,
                ownerAvatarId: owner.avatarId,
                ownerName: owner.name,
                ownerProviderSessionId: ownerSession.providerSessionId,
                ownerSpeechSourceEventId: started.sourceEventId,
                targetAvatarId: target.avatarId,
                targetName: target.name,
                firstAudibleSampleAtMs: recentAudio.atMs,
                partialAt: new Date().toISOString(),
                partialBrowserAtMs: await page.evaluate(() =>
                  Math.round(performance.now() - window.__yuniQAMedia.startedAt)
                ),
                partialLength: 4,
                committedLength: committed.length,
              };
              scribeSockets.at(-1).send(JSON.stringify({ message_type: "partial_transcript", text: "pará" }));
              await new Promise((resolve) => setTimeout(resolve, 100));
              report.bargeIn.committedAt = new Date().toISOString();
              scribeSockets
                .at(-1)
                .send(JSON.stringify({ message_type: "committed_transcript", text: committed }));
              console.log(JSON.stringify({ stage: "barge_injected", sessionId, ...report.bargeIn }));
            }
          }
          if (!report.bargeIn) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        while (running) {
          if (startupFailure)
            throw Object.assign(new Error("Replacement verification failed"), { name: startupFailure });
          const cancelled = report.api.some(
            (event) =>
              event.path.endsWith("/interrupt") &&
              event.status === 200 &&
              event.interruption?.status === "cancelled"
          );
          const newRoute = report.api.find(
            (event) =>
              event.path.endsWith("/turns") &&
              event.status === 200 &&
              event.roundId &&
              event.roundId !== report.bargeIn.oldRoundId &&
              event.at >= report.bargeIn.committedAt
          );
          const ended =
            newRoute &&
            report.api.some(
              (event) =>
                event.path.endsWith("/provider-events") &&
                event.status === 200 &&
                event.input?.type === "speak_ended" &&
                event.input.turnId === newRoute.directive?.turnId &&
                event.phase === "listening"
            );
          if (cancelled && ended) {
            report.bargeIn.newRoundId = newRoute.roundId;
            report.bargeIn.newTurnId = newRoute.directive?.turnId;
            report.bargeIn.actualTargetAvatarId = newRoute.directive?.avatarId;
            return;
          }
          if (report.api.some((event) => event.path.endsWith("/failure") && event.at >= report.injection.at))
            throw new Error("Participant failure during interruption scenario");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      })(),
      45000,
      "Human interruption and next response"
    );
  } else
    await deadline(
      (async () => {
        while (running) {
          const ended = report.api.filter(
            (event) =>
              event.path.endsWith("/provider-events") &&
              event.input?.type === "speak_ended" &&
              event.status === 200 &&
              event.at >= report.injection.at
          );
          const unique = new Set(ended.map((event) => event.input.avatarId));
          if (
            unique.size >= roster.length &&
            report.api.some((event) => event.phase === "listening" && event.at >= report.injection.at)
          )
            return;
          if (report.api.some((event) => event.path.endsWith("/failure") && event.at >= report.injection.at))
            throw new Error("Participant failure during full-app round");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      })(),
      45000,
      "Complete roster round"
    );
  await page.waitForTimeout(1000);
  report.media = await page.evaluate(() => window.__yuniQAMedia);
  report.roundPassed = true;
  if (scenario === "barge-in") {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error("Unexpected QA session ID");
    report.roundState = JSON.parse(
      sql(
        `SELECT COALESCE(json_agg(json_build_object('id', r.id, 'status', r.status, 'sourceEventId', r."sourceEventId", 'turns', (SELECT json_agg(json_build_object('id', t.id, 'avatarId', t."avatarAgentId", 'status', t.status, 'responseLength', length(t."responseText")) ORDER BY t.position) FROM "GroupPlannedTurn" t WHERE t."roundId"=r.id)) ORDER BY r."createdAt"), '[]'::json) FROM "GroupVoiceRound" r WHERE r."groupVoiceSessionId"='${sessionId}';`
      )
    );
    report.interruptionEvidence = assessInterruptionReuse(report);
    report.acousticEvidence = report.interruptionEvidence;
  } else report.acousticEvidence = assessFullAppEvidence(report);
  report.acousticCheck = report.acousticEvidence.outcome;
  await page.getByRole("button", { name: "Finalizar llamada", exact: true }).click();
  await page.waitForTimeout(1000);
  console.log(
    JSON.stringify({
      stage: "round",
      sessionId,
      backendRoundPassed: true,
      acousticCheck: report.acousticCheck,
      acousticEvidence: report.acousticEvidence,
      maxUnmutedElements: report.media.maxUnmutedElements,
      mediaParticipants: report.media.participants,
    })
  );
} catch (error) {
  report.error = safeError(error, "full-app");
  console.error(JSON.stringify({ stage: "error", ...report.error }));
  process.exitCode = 1;
} finally {
  running = false;
  if (page) {
    try {
      report.media ??= await page.evaluate(() => window.__yuniQAMedia);
    } catch {
      /* Diagnostic failure must not change the running call. */
    }
  }
  if (sessionId && token) {
    try {
      const response = await fetch(baseUrl + "/api/group-voice-sessions/" + sessionId + "/end", {
        method: "POST",
        headers: { Cookie: "yuni_session=" + token, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "user" }),
        signal: AbortSignal.timeout(10000),
      });
      report.cleanup = { status: response.status };
    } catch (error) {
      report.cleanup = { errorName: error.name };
    }
  }
  await browser?.close();
  await Promise.allSettled(responseTasks);
  if (report.roster) {
    report.ttsAfter = await snapshotTts(report.roster);
    if (sessionId && report.sandboxGuard?.passed === true)
      report.providerChecks = await Promise.all(
        report.roster.map(async (participant) => {
          const expectedUserMessages =
            scenario === "barge-in"
              ? Number(participant.avatarId === report.bargeIn?.ownerAvatarId) +
                Number(participant.avatarId === report.bargeIn?.targetAvatarId)
              : 1;
          if (scenario === "barge-in" && expectedUserMessages === 0)
            return {
              name: participant.name,
              outcome: "skipped",
              reason: "not_expected_to_complete_in_interruption_scenario",
            };
          const selectedSession =
            scenario === "barge-in"
              ? (report.replacements.findLast((item) => item.avatarId === participant.avatarId) ??
                report.providerSessions.find((item) => item.avatarId === participant.avatarId))
              : null;
          const conversationId =
            selectedSession &&
            report.media?.providerEvents.findLast(
              (event) => event.sessionId === selectedSession.providerSessionId && event.conversationId
            )?.conversationId;
          const observation = await checkConversation({
            participant,
            createdAt: report.createdAt,
            expectedUserText: null,
            ...(conversationId ? { conversationId } : {}),
          });
          if (scenario !== "barge-in") return observation;
          const exactUserMessageCount = observation.userMessages === expectedUserMessages;
          return {
            ...observation,
            expectedUserMessages,
            exactUserMessageCount,
            outcome:
              observation.outcome === "passed" && !exactUserMessageCount ? "failed" : observation.outcome,
          };
        })
      );
  }
  report.outcome = report.error
    ? "failed"
    : !report.roundPassed ||
        report.acousticCheck === "inconclusive" ||
        report.providerChecks.some((check) => check.outcome === "inconclusive")
      ? "inconclusive"
      : report.acousticCheck === "passed" &&
          report.providerChecks.every((check) => check.outcome === "passed")
        ? "passed"
        : "failed";
  if (run && report.outcome !== "passed") process.exitCode = 1;
  const reportPath = path.join(temp, "full-app-report-" + Date.now() + ".json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ stage: "report", path: reportPath }));
}
