export type InterruptionReadyEvidence =
  | { type: "speak_ended"; eventId: string; speechSourceEventId: string }
  | { type: "not_dispatched" };

// One lifetime per connector. Command UUIDs are deliberately not used to match
// speech: the provider's speech source is independent of the SDK command ID.
export function createGroupInterruptionReuse() {
  const dispatched = new Set<string>();
  const sources = new Map<string, string>();
  const retired = new Set<string>();
  const completed = new Map<string, InterruptionReadyEvidence>();
  let terminal: { turnId: string; evidence: InterruptionReadyEvidence } | null = null;
  let pending: {
    turnId: string;
    sourceEventId: string;
    evidence: InterruptionReadyEvidence | null;
    promise: Promise<InterruptionReadyEvidence>;
    resolve: (evidence: InterruptionReadyEvidence) => void;
  } | null = null;
  let awaitingFreshSource = false;
  let hasReused = false;

  return {
    get blocked() {
      return Boolean(pending) || awaitingFreshSource;
    },
    get reused() {
      return hasReused;
    },
    dispatch(turnId: string) {
      dispatched.add(turnId);
    },
    isRetired(source: string | null | undefined) {
      return Boolean(source && retired.has(source));
    },
    matchesTurn(turnId: string, source: string | null | undefined) {
      return Boolean(source && !retired.has(source) && sources.get(source) === turnId);
    },
    start(turnId: string, source: string | null | undefined) {
      if (pending || (source && retired.has(source))) return false;
      if (awaitingFreshSource && !source) return false;
      if (source) sources.set(source, turnId);
      awaitingFreshSource = false;
      terminal = null;
      return true;
    },
    end(turnId: string, event: { event_id: string; source_event_id?: string | null }) {
      const source = event.source_event_id;
      if (!source || !event.event_id || sources.get(source) !== turnId) return;
      terminal = {
        turnId,
        evidence: { type: "speak_ended", eventId: event.event_id, speechSourceEventId: source },
      };
      if (pending?.turnId === turnId && !pending.evidence) {
        pending.evidence = terminal.evidence;
        pending.resolve(terminal.evidence);
      }
    },
    complete(turnId: string) {
      if (terminal?.turnId === turnId) completed.set(turnId, terminal.evidence);
    },
    quarantine(turnId: string, sourceEventId: string) {
      if (pending?.turnId === turnId && pending.sourceEventId === sourceEventId) return;
      let resolve!: (evidence: InterruptionReadyEvidence) => void;
      const promise = new Promise<InterruptionReadyEvidence>((done) => {
        resolve = done;
      });
      const hasSource = [...sources.values()].includes(turnId);
      const evidence =
        completed.get(turnId) ??
        (!dispatched.has(turnId) && !hasSource ? { type: "not_dispatched" as const } : null);
      pending = { turnId, sourceEventId, evidence, promise, resolve };
      if (evidence) resolve(evidence);
    },
    get readyEvidence() {
      return pending?.evidence ?? null;
    },
    evidence(turnId: string, sourceEventId: string) {
      return pending?.turnId === turnId && pending.sourceEventId === sourceEventId ? pending.promise : null;
    },
    release(turnId: string, sourceEventId: string) {
      if (pending?.turnId !== turnId || pending.sourceEventId !== sourceEventId || !pending.evidence)
        return false;
      for (const [source, sourceTurn] of sources) {
        if (sourceTurn === turnId) retired.add(source);
      }
      hasReused = true;
      awaitingFreshSource = true;
      pending = null;
      return true;
    },
  };
}
