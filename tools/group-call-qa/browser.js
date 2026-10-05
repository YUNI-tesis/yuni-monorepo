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

// Isolated contract experiment only. A terminal and the observation window are
// evidence to inspect, not a guarantee that buffered audio has drained safely.
window.probeInterruptReuse = async (avatar, firstText, secondText) => {
  const instance = instances.get(avatar);
  const { session, video } = instance;
  const originalSessionId = session.sessionId;
  const trackIds = () => video.srcObject?.getTracks?.().map((track) => track.id) ?? [];
  const originalTrackIds = trackIds();
  const result = {
    avatar,
    scenario: "interrupt-reuse",
    outcome: "inconclusive",
    reason: "experimental_contract_probe_not_general_acceptance",
    sessionId: originalSessionId,
    originalTrackIds,
    firstTextLength: firstText.length,
    secondTextLength: secondText.length,
    observationAfterTerminalMs: 300,
    commandsSent: 0,
  };
  report.interruptReuse = result;
  const silence = () => {
    for (const other of instances.values()) other.video.muted = true;
  };
  const stoppedSince = (atMs) =>
    report.events.filter(
      (event) =>
        event.avatar === avatar &&
        event.atMs >= atMs &&
        [SDK.AgentEventsEnum.SESSION_STOPPED, SDK.SessionEvent.SESSION_DISCONNECTED].includes(event.name)
    );
  silence();
  if (!originalTrackIds.length || typeof session.sendUserMessage !== "function") {
    result.reason = "media_or_public_api_unavailable";
    return result;
  }
  try {
    await video.play();
    session.sendContextualUpdate(
      "Ensayo técnico. Respondé directamente al pedido sin saludar. Si cambia el pedido, descartá lo pendiente y seguí sólo la instrucción nueva."
    );
    video.muted = false;
    result.firstCommandAtMs = now();
    result.firstCommandId = session.sendUserMessage(firstText);
    result.commandsSent = 1;
    report.commands.push({
      avatar,
      variant: "official",
      startMs: result.firstCommandAtMs,
      eventId: result.firstCommandId,
      textLength: firstText.length,
      sessionId: originalSessionId,
    });
    let firstStart;
    const firstDeadline = performance.now() + 30000;
    while (performance.now() < firstDeadline) {
      firstStart = report.events.find(
        (event) =>
          event.avatar === avatar &&
          event.atMs >= result.firstCommandAtMs &&
          event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_STARTED
      );
      const audible = instance.samples.filter(
        (sample) =>
          sample.atMs >= (firstStart?.atMs ?? Infinity) &&
          sample.rms > 0.001 &&
          !sample.muted &&
          !sample.paused
      );
      if (firstStart && audible.length * 50 > 500) {
        result.firstAudibleSamples = audible.length;
        break;
      }
      if (stoppedSince(result.firstCommandAtMs).length) break;
      await sleep(50);
    }
    if (!firstStart || !result.firstAudibleSamples) {
      result.reason = "first_start_or_500ms_audible_pcm_missing";
      return result;
    }
    result.firstSpeechStart = firstStart;
    result.oldSpeechSourceIds = [
      ...new Set(
        report.events
          .filter(
            (event) => event.avatar === avatar && event.atMs >= result.firstCommandAtMs && event.sourceEventId
          )
          .map((event) => event.sourceEventId)
      ),
    ];
    silence();
    result.cutAtMs = now();
    session.interrupt();
    const terminalDeadline = performance.now() + 2000;
    let terminal;
    while (performance.now() < terminalDeadline) {
      terminal = report.events.find(
        (event) =>
          event.avatar === avatar &&
          event.atMs >= result.cutAtMs &&
          (event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_ENDED || event.providerType === "interruption")
      );
      if (terminal || stoppedSince(result.cutAtMs).length) break;
      await sleep(20);
    }
    if (!terminal || stoppedSince(result.cutAtMs).length) {
      result.reason = terminal ? "session_stopped_after_cut" : "no_terminal_within_2000ms_no_reuse_attempted";
      result.sessionStops = stoppedSince(result.firstCommandAtMs);
      return result;
    }
    result.terminal = terminal;
    result.terminalDelayMs = terminal.atMs - result.cutAtMs;
    result.terminalMatchesOldSpeechSource =
      terminal.sourceEventId && result.oldSpeechSourceIds.length
        ? result.oldSpeechSourceIds.includes(terminal.sourceEventId)
        : null;
    await sleep(result.observationAfterTerminalMs);
    result.postTerminalMutedPcmSamples = instance.samples.filter(
      (sample) => sample.atMs >= terminal.atMs && sample.rms > 0.001 && sample.muted
    ).length;
    if (stoppedSince(result.cutAtMs).length || session.sessionId !== originalSessionId) {
      result.reason = "session_changed_or_stopped_during_terminal_observation";
      return result;
    }
    session.sendContextualUpdate(
      "La respuesta anterior fue interrumpida. No la retomes ni la completes. Atendé únicamente el próximo pedido breve."
    );
    await video.play();
    // The same public SDK instance and media element are reused; no stop/start.
    video.muted = false;
    result.secondCommandAtMs = now();
    result.secondCommandId = session.sendUserMessage(secondText);
    result.commandsSent = 2;
    report.commands.push({
      avatar,
      variant: "official",
      startMs: result.secondCommandAtMs,
      eventId: result.secondCommandId,
      textLength: secondText.length,
      sessionId: session.sessionId,
    });
    const secondDeadline = performance.now() + 20000;
    let secondStart, secondEnd;
    while (performance.now() < secondDeadline) {
      const events = report.events.filter(
        (event) => event.avatar === avatar && event.atMs >= result.secondCommandAtMs
      );
      secondStart = events.find((event) => event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_STARTED);
      secondEnd =
        secondStart &&
        events.find(
          (event) => event.name === SDK.AgentEventsEnum.AVATAR_SPEAK_ENDED && event.atMs >= secondStart.atMs
        );
      if (secondEnd || stoppedSince(result.secondCommandAtMs).length) break;
      await sleep(50);
    }
    if (secondEnd) await sleep(1000);
    result.secondSpeechStart = secondStart ?? null;
    result.secondSpeechEnd = secondEnd ?? null;
    result.speechEventsAfterReuse = report.events.filter(
      (event) =>
        event.avatar === avatar &&
        event.atMs >= result.secondCommandAtMs &&
        [SDK.AgentEventsEnum.AVATAR_SPEAK_STARTED, SDK.AgentEventsEnum.AVATAR_SPEAK_ENDED].includes(
          event.name
        )
    );
    result.providerInterruptionEventsAfterReuse = report.events.filter(
      (event) =>
        event.avatar === avatar &&
        event.atMs >= result.secondCommandAtMs &&
        !event.name.startsWith("raw:") &&
        ["interruption", "agent_response_correction"].includes(event.providerType)
    );
    result.secondAudibleSamples = instance.samples.filter(
      (sample) =>
        sample.atMs >= (secondStart?.atMs ?? Infinity) &&
        sample.rms > 0.001 &&
        !sample.muted &&
        !sample.paused
    ).length;
    result.pcmBeforeSecondStart = instance.samples.filter(
      (sample) =>
        sample.atMs >= result.secondCommandAtMs &&
        sample.atMs < (secondStart?.atMs ?? Infinity) &&
        sample.rms > 0.001 &&
        !sample.muted
    ).length;
    const postCutPcm = instance.samples.filter(
      (sample) =>
        sample.atMs >= result.cutAtMs && sample.atMs < result.secondCommandAtMs && sample.rms > 0.001
    );
    result.lastMutedPcmAfterCutAtMs = postCutPcm.at(-1)?.atMs ?? null;
    const secondPcm = instance.samples.filter(
      (sample) => sample.atMs >= (secondStart?.atMs ?? Infinity) && sample.rms > 0.001 && !sample.muted
    );
    result.secondFirstPcmAtMs = secondPcm[0]?.atMs ?? null;
    result.secondLastPcmAtMs = secondPcm.at(-1)?.atMs ?? null;
    result.oldSourceEventsAfterReuse = report.events.filter(
      (event) =>
        event.avatar === avatar &&
        event.atMs >= result.secondCommandAtMs &&
        event.sourceEventId &&
        result.oldSpeechSourceIds.includes(event.sourceEventId)
    );
    result.sessionStops = stoppedSince(result.firstCommandAtMs);
    result.sameSessionId = session.sessionId === originalSessionId;
    result.finalTrackIds = trackIds();
    result.sameTrackIds = JSON.stringify(result.finalTrackIds) === JSON.stringify(originalTrackIds);
    result.secondSpeechSourceIsNew =
      secondStart?.sourceEventId && result.oldSpeechSourceIds.length
        ? !result.oldSpeechSourceIds.includes(secondStart.sourceEventId)
        : null;
    result.secondTerminalMatchesSecondStart =
      secondStart?.sourceEventId && secondEnd?.sourceEventId
        ? secondStart.sourceEventId === secondEnd.sourceEventId
        : null;
    result.secondResponseObserved = Boolean(
      secondStart &&
      secondEnd &&
      result.secondAudibleSamples > 0 &&
      result.secondSpeechSourceIsNew === true &&
      result.secondTerminalMatchesSecondStart === true
    );
    return result;
  } catch (error) {
    result.errorName = error.name;
    result.reason = "native_reuse_probe_error";
    return result;
  } finally {
    silence();
    result.finishedAtMs = now();
  }
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
