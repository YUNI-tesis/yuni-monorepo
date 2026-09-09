/* global AudioContext, MediaStream, TextDecoder, TextEncoder, clearInterval, crypto, document, performance, setInterval, setTimeout, window */
import * as SDK from "@heygen/liveavatar-web-sdk";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const instances = new Map();
const startedAt = performance.now();
const now = () => Math.round(performance.now() - startedAt);
const report = { events: [], commands: [], turns: [], media: [], sdkExports: Object.keys(SDK) };
let maxUnmutedElements = 0;
const safeEvent = (name, avatar, payload = {}) => {
  const data = payload.data ?? {};
  const conversationId = data.conversation_initiation_metadata_event?.conversation_id ?? data.conversation_id;
  const item = {
    atMs: now(),
    name,
    avatar,
    eventId: payload.event_id ?? null,
    sourceEventId: payload.source_event_id ?? null,
    providerType: payload.elevenlabs_event_type ?? data.type ?? null,
    conversationId: conversationId ?? null,
    textLength: typeof payload.text === "string" ? payload.text.length : undefined,
    responseLength: data.agent_response_event?.agent_response?.length,
    correctionLength: data.agent_response_correction_event?.corrected_agent_response?.length,
  };
  report.events.push(item);
  return item;
};

window.probeStart = async (participants, options) => {
  for (const participant of participants) {
    const Session = options.variant === "official" ? SDK.ElevenLabsAgentSession : SDK.LiveAvatarSession;
    if (!Session) throw new Error("Requested public SDK class is absent");
    const config = options.voiceChat === "muted" ? { voiceChat: { defaultMuted: true } } : {};
    const session = new Session(participant.sessionToken, config);
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.width = "300px";
    video.dataset.avatar = participant.name;
    document.body.appendChild(video);
    const instance = { ...participant, session, video, samples: [], context: null, interval: null };
    instances.set(participant.name, instance);
    for (const name of [
      ...new Set([...Object.values(SDK.SessionEvent), ...Object.values(SDK.AgentEventsEnum)]),
    ]) {
      session.on(name, (payload) => safeEvent(name, participant.name, payload));
    }
    for (const eventName of ["playing", "waiting", "stalled", "error"]) {
      video.addEventListener(eventName, () =>
        report.media.push({ atMs: now(), avatar: participant.name, eventName })
      );
    }
    session.on(SDK.SessionEvent.SESSION_STREAM_READY, () => {
      session.attach(video);
      video.muted = true;
      video.play().catch((error) =>
        report.media.push({
          atMs: now(),
          avatar: participant.name,
          eventName: "play_failed",
          errorName: error.name,
        })
      );
      try {
        const track = session._remoteAudioTrack?.mediaStreamTrack;
        if (!track) throw new Error("Remote audio track unavailable");
        const context = new AudioContext();
        const source = context.createMediaStreamSource(new MediaStream([track]));
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(context.destination);
        context.resume();
        instance.context = context;
        const values = new Float32Array(analyser.fftSize);
        instance.interval = setInterval(() => {
          maxUnmutedElements = Math.max(
            maxUnmutedElements,
            [...instances.values()].filter(({ video }) => !video.muted).length
          );
          analyser.getFloatTimeDomainData(values);
          const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
          instance.samples.push({
            atMs: now(),
            rms,
            muted: video.muted,
            paused: video.paused,
            readyState: video.readyState,
          });
          if (instance.samples.length > 2400) instance.samples.shift();
        }, 50);
      } catch (error) {
        report.media.push({
          atMs: now(),
          avatar: participant.name,
          eventName: "analysis_unavailable",
          errorName: error.name,
        });
      }
    });
  }
  await Promise.all(
    [...instances.values()].map(async ({ session, name }) => {
      await session.start();
      // Subscribe to raw LiveKit messages for protocol visibility; content is never recorded.
      session.room?.on("dataReceived", (bytes, _participant, _kind, topic) => {
        if (topic !== "agent-response") return;
        try {
          const event = JSON.parse(new TextDecoder().decode(bytes));
          safeEvent("raw:" + event.event_type, name, event);
        } catch {
          /* Optional diagnostics must not stop the probe. */
        }
      });
      safeEvent("probe:connected", name, { event_id: session.sessionId });
    })
  );
  // Let the startup greeting finish before submitting any test utterance.
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const allReady = [...instances.values()].every(
      ({ name, video }) =>
        video.srcObject &&
        report.events.some(
          (event) => event.avatar === name && event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_ENDED
        )
    );
    if (allReady) break;
    await sleep(100);
  }
  await sleep(400);
  return [...instances.values()].map(({ name, session, video }) => ({
    name,
    sessionId: session.sessionId,
    state: session.state,
    mode: session.mode,
    mediaReady: Boolean(video.srcObject),
    localTrackCount: session.room?.localParticipant?.trackPublications?.size ?? null,
  }));
};

window.probeTurn = async (avatar, text, variant, waitMs = 20000) => {
  const instance = instances.get(avatar);
  const { session, video } = instance;
  for (const other of instances.values()) if (other.name !== avatar) other.video.muted = true;
  video.muted = false;
  try {
    await video.play();
  } catch (error) {
    report.media.push({ atMs: now(), avatar, eventName: "play_failed", errorName: error.name });
    video.muted = true;
    return { avatar, playFailed: true };
  }
  const context =
    "Prueba técnica controlada de entrega de mensajes y audio. Seguí exactamente el próximo pedido, sin saludar ni explicar la prueba.";
  const encode = (type, data, eventId) =>
    new TextEncoder().encode(
      JSON.stringify({
        event_type: "elevenlabs_agent_command",
        elevenlabs_event_type: type,
        data,
        ...(eventId ? { event_id: eventId } : {}),
      })
    );
  if (variant === "official") session.sendContextualUpdate(context);
  else
    await session.room.localParticipant.publishData(encode("contextual_update", { text: context }), {
      reliable: true,
      topic: "agent-control",
    });
  await sleep(100);
  const startMs = now();
  let eventId = null;
  if (variant === "official") eventId = session.sendUserMessage(text);
  else {
    if (variant === "uuid") eventId = crypto.randomUUID();
    if (variant === "custom") eventId = "group-turn:provider-probe:" + crypto.randomUUID();
    await session.room.localParticipant.publishData(encode("user_message", { text }, eventId), {
      reliable: true,
      topic: "agent-control",
    });
  }
  report.commands.push({ avatar, variant, startMs, eventId, textLength: text.length });
  const deadline = performance.now() + waitMs;
  let firstStart = null,
    end = null;
  while (performance.now() < deadline) {
    const events = report.events.filter((event) => event.avatar === avatar && event.atMs >= startMs);
    firstStart = events.find((event) => event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_STARTED);
    end =
      firstStart &&
      events.find(
        (event) => event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_ENDED && event.atMs >= firstStart.atMs
      );
    if (end) break;
    await sleep(50);
  }
  // Probe-only observation window, not a product floor/drain policy.
  if (end) await sleep(1000);
  const endMs = now();
  const samples = instance.samples.filter((sample) => sample.atMs >= startMs && sample.atMs <= endMs);
  const audible = samples.filter((sample) => sample.rms > 0.001 && !sample.muted && !sample.paused);
  const result = {
    avatar,
    variant,
    eventId,
    startMs,
    endMs,
    firstSpeakStartMs: firstStart ? firstStart.atMs - startMs : null,
    speakEndedMs: end ? end.atMs - startMs : null,
    audioSampleCount: samples.length,
    nonSilentUnmutedSamples: audible.length,
    audioApproxMs: audible.length * 50,
    peakRms: samples.length ? Math.max(...samples.map((sample) => sample.rms)) : 0,
    timedOut: !firstStart,
    completed: Boolean(end),
  };
  report.turns.push(result);
  video.muted = true;
  return result;
};

window.probeReport = () => ({
  ...report,
  conversations: report.events
    .filter((event) => event.conversationId)
    .map(({ avatar, conversationId }) => ({ avatar, conversationId })),
  maxUnmutedElements,
  samples: [...instances.values()].map(({ name, samples }) => ({ name, samples })),
});

window.probeStop = async () => {
  await Promise.all(
    [...instances.values()].map(async ({ session, video, interval, context }) => {
      video.muted = true;
      if (interval) clearInterval(interval);
      await context?.close();
      try {
        await session.stop();
      } catch {
        /* Optional diagnostics must not stop the probe. */
      }
    })
  );
};
