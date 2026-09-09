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

const groupId = arg("group-id");
if (!groupId || !/^[a-zA-Z0-9_-]{1,128}$/.test(groupId)) throw new Error("A valid --group-id is required");
const baseUrl = assertLocalUrl(arg("app-url", "http://localhost:3000"));
if (process.env.API_INTERNAL_URL) assertLocalUrl(process.env.API_INTERNAL_URL);
const temp = await outputDirectory();
let text = arg("text");
const responseLength = arg("response", "short");
const layout = arg("layout", "desktop");
if (!["short", "long"].includes(responseLength)) throw new Error("--response must be short or long");
if (!["desktop", "mobile"].includes(layout)) throw new Error("--layout must be desktop or mobile");
const report = {
  createdAt: new Date().toISOString(),
  kind: "full-app-real-provider-fake-scribe",
  run,
  groupId,
  responseLength,
  layout,
  api: [],
  errors: [],
  providerChecks: [],
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
    (responseLength === "short"
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
      const entry = {
        atMs: Math.round(performance.now() - observations.startedAt),
        eventType: event.event_type,
        eventId: event.event_id ?? null,
        sourceEventId: event.source_event_id ?? null,
        sessionId: event.session_id ?? sessionByChannel.get(channel) ?? null,
        commandType: event.elevenlabs_event_type ?? null,
        providerType: event.elevenlabs_event_type ?? event.data?.type ?? null,
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
        event.roundId = body.round?.id;
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
  report.acousticEvidence = assessFullAppEvidence(report);
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
        report.roster.map((participant) =>
          checkConversation({ participant, createdAt: report.createdAt, expectedUserText: null })
        )
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
