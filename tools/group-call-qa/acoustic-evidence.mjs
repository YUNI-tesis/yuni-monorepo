const RMS_THRESHOLD = 0.001;
const after = (event) => event.responseObservedAt ?? event.at;

/** Timing evidence only: neither provider text nor RMS proves word intelligibility. */
export function assessFullAppEvidence(report) {
  const media = report.media;
  const roster = report.roster ?? [];
  const origin = Date.parse(media?.wallStartedAt ?? "");
  const inputAt = report.injection?.browserAtMs ?? Date.parse(report.injection?.at ?? "") - origin;
  if (!media || !Number.isFinite(origin) || !Number.isFinite(inputAt) || !roster.length) {
    return { outcome: "inconclusive", reason: "missing_timeline_or_roster" };
  }
  const toMs = (event) => Date.parse(after(event)) - origin;
  const api = [...(report.api ?? [])].sort((a, b) => toMs(a) - toMs(b));
  const samples = media.samples ?? [];
  const commands = media.commands ?? [];
  const rawEvents = media.providerEvents ?? [];
  const observations = [];
  let unattributedNonSilentSamples = 0;
  let ignoredPreResponseSamples = 0;
  let failed = media.maxUnmutedElements > 1;
  let inconclusive = !media.commandObserverAvailable;
  for (const participant of roster) {
    const session = report.providerSessions?.find((item) => item.avatarId === participant.avatarId);
    const userCommands = commands.filter(
      (event) =>
        event.commandType === "user_message" &&
        event.sessionId === session?.providerSessionId &&
        event.atMs >= inputAt
    );
    const turns = [
      ...new Set(
        api
          .filter(
            (event) =>
              event.input?.avatarId === participant.avatarId && event.input?.turnId && toMs(event) >= inputAt
          )
          .map((event) => event.input.turnId)
      ),
    ];
    const generated = api.filter(
      (event) =>
        event.input?.avatarId === participant.avatarId &&
        event.input?.turnId &&
        ["agent_response", "speak_started"].includes(event.input.type) &&
        toMs(event) >= inputAt
    );
    const matchingProviderEvents = rawEvents.filter(
      (event) =>
        event.atMs >= inputAt &&
        event.sessionId === session?.providerSessionId &&
        userCommands.some((command) => command.eventId === event.sourceEventId) &&
        (event.eventType === "avatar.speak_started" || event.providerType === "agent_response")
    );
    // Correlated raw events are closest to generation. Legacy reports fall back to the
    // API request/response observation, explicitly not a provider timestamp.
    const candidates = matchingProviderEvents.length
      ? matchingProviderEvents.map((event) => event.atMs)
      : generated.map(
          (event) =>
            event.requestBrowserAtMs ??
            (event.requestObservedAt ? Date.parse(event.requestObservedAt) - origin : toMs(event))
        );
    const lowerBound = candidates.length ? Math.min(...candidates) : null;
    const relevant = samples.filter((sample) => sample.name === participant.name && sample.atMs >= inputAt);
    const energy = relevant.filter((sample) => sample.rms > RMS_THRESHOLD);
    const responseEnergy = lowerBound === null ? [] : energy.filter((sample) => sample.atMs >= lowerBound);
    const preResponse = lowerBound === null ? energy : energy.filter((sample) => sample.atMs < lowerBound);
    ignoredPreResponseSamples += preResponse.length;
    // A command can race a buffered startup greeting. Energy after input but before
    // response-generation evidence is never credited as a successfully heard answer.
    if (preResponse.some((sample) => !sample.muted && !sample.paused)) {
      unattributedNonSilentSamples += preResponse.filter((sample) => !sample.muted && !sample.paused).length;
      inconclusive = true;
    }
    const blocked = responseEnergy.filter((sample) => sample.muted || sample.volume === 0 || sample.paused);
    const audible = responseEnergy.filter((sample) => !sample.muted && sample.volume !== 0 && !sample.paused);
    const suppressions = api.filter(
      (event) =>
        event.directive?.action === "suppress" &&
        event.directive.avatarId === participant.avatarId &&
        lowerBound !== null &&
        toMs(event) >= lowerBound
    );
    const interruptions = commands.filter(
      (event) =>
        event.eventType === "avatar.interrupt" &&
        event.sessionId === session?.providerSessionId &&
        lowerBound !== null &&
        event.atMs >= lowerBound
    );
    const completed = turns.some((turnId) =>
      api.some(
        (event) =>
          event.input?.turnId === turnId && event.input?.type === "speak_ended" && event.status === 200
      )
    );
    const itemFailed =
      blocked.length > 0 || suppressions.length > 0 || interruptions.length > 0 || userCommands.length > 1;
    failed ||= itemFailed;
    inconclusive ||= userCommands.length !== 1 || lowerBound === null || !relevant.length || !completed;
    if (lowerBound !== null && relevant.length && !audible.length) failed = true;
    observations.push({
      name: participant.name,
      avatarId: participant.avatarId,
      responseWindowStartMs: lowerBound,
      attribution: matchingProviderEvents.length ? "provider_source_event_id" : "api_turn_observation",
      userMessageCount: userCommands.length,
      turnCount: turns.length,
      completed,
      responseAudibleSamples: audible.length,
      responseBlockedSamples: blocked.length,
      firstResponseBlockedAtMs: blocked[0]?.atMs ?? null,
      ignoredPreResponseSamples: preResponse.length,
      continuationSuppressions: suppressions.length,
      providerInterruptCommands: interruptions.length,
    });
  }
  const submitTurnCount = api.filter(
    (event) => event.path?.endsWith("/turns") && toMs(event) >= inputAt
  ).length;
  const unattributedInterrupts = commands.filter(
    (event) => event.eventType === "avatar.interrupt" && !event.sessionId && event.atMs >= inputAt
  ).length;
  failed ||= submitTurnCount > 1;
  inconclusive ||= submitTurnCount !== 1 || unattributedInterrupts > 0;
  return {
    outcome: failed ? "failed" : inconclusive ? "inconclusive" : "passed",
    clock: "browser_performance_ms; API fallback is request/response observation, not provider time",
    rmsThreshold: RMS_THRESHOLD,
    maxUnmutedElements: media.maxUnmutedElements,
    submitTurnCount,
    unattributedInterrupts,
    unattributedNonSilentSamples,
    ignoredPreResponseSamples,
    participants: observations,
  };
}
