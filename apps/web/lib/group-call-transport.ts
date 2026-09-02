import {
  confirmGroupParticipantStarted,
  endGroupVoiceSession,
  getGroupScribeToken,
  heartbeatGroupVoiceSession,
  interruptGroupVoiceSession,
  reportGroupParticipantFailure,
  reportGroupProviderEvent,
  retryGroupParticipant,
  startGroupVoiceSession,
  submitGroupTurn,
} from "./api/avatar-group-api";
import {
  confirmPublicGroupParticipantStarted,
  endPublicGroupSession,
  getPublicGroupScribeToken,
  heartbeatPublicGroupSession,
  interruptPublicGroupSession,
  reportPublicGroupParticipantFailure,
  reportPublicGroupProviderEvent,
  retryPublicGroupParticipant,
  startPublicGroupSession,
  submitPublicGroupTurn,
} from "./api/group-sharing-api";

export type GroupCallProviderEventInput = Parameters<typeof reportGroupProviderEvent>[1];
export type GroupCallParticipantFailureInput = Parameters<typeof reportGroupParticipantFailure>[2];

export type GroupCallTransport = {
  start: typeof startGroupVoiceSession;
  getScribeToken: typeof getGroupScribeToken;
  submitTurn: typeof submitGroupTurn;
  reportProviderEvent: typeof reportGroupProviderEvent;
  interrupt: typeof interruptGroupVoiceSession;
  reportParticipantFailure: typeof reportGroupParticipantFailure;
  confirmParticipantStarted: typeof confirmGroupParticipantStarted;
  retryParticipant: typeof retryGroupParticipant;
  heartbeat: typeof heartbeatGroupVoiceSession;
  end: typeof endGroupVoiceSession;
};

export const authenticatedGroupCallTransport: GroupCallTransport = {
  start: startGroupVoiceSession,
  getScribeToken: getGroupScribeToken,
  submitTurn: submitGroupTurn,
  reportProviderEvent: reportGroupProviderEvent,
  interrupt: interruptGroupVoiceSession,
  reportParticipantFailure: reportGroupParticipantFailure,
  confirmParticipantStarted: confirmGroupParticipantStarted,
  retryParticipant: retryGroupParticipant,
  heartbeat: heartbeatGroupVoiceSession,
  end: endGroupVoiceSession,
};

export function createPublicGroupCallTransport(input: {
  slug: string;
  identityToken: string;
}): GroupCallTransport {
  let sessionToken: string | null = null;

  function token() {
    if (!sessionToken) throw new Error("La sesión pública todavía no está disponible.");
    return sessionToken;
  }

  return {
    async start() {
      const started = await startPublicGroupSession(input.slug, input.identityToken);
      sessionToken = started.publicSession.token;
      return { voiceSession: started.voiceSession };
    },
    getScribeToken(sessionId) {
      return getPublicGroupScribeToken(sessionId, token());
    },
    submitTurn(sessionId, turn) {
      return submitPublicGroupTurn(sessionId, token(), turn);
    },
    reportProviderEvent(sessionId, event) {
      return reportPublicGroupProviderEvent(sessionId, token(), event);
    },
    interrupt(sessionId, reason, expected) {
      return interruptPublicGroupSession(sessionId, token(), reason, expected);
    },
    reportParticipantFailure(sessionId, avatarId, failure, options) {
      return reportPublicGroupParticipantFailure(sessionId, token(), avatarId, failure, options);
    },
    confirmParticipantStarted(sessionId, avatarId, participantAttemptId) {
      return confirmPublicGroupParticipantStarted(sessionId, token(), avatarId, participantAttemptId);
    },
    retryParticipant(sessionId, avatarId) {
      return retryPublicGroupParticipant(sessionId, token(), avatarId);
    },
    heartbeat(sessionId) {
      return heartbeatPublicGroupSession(sessionId, token());
    },
    async end(sessionId, reason) {
      return endPublicGroupSession(sessionId, token(), reason);
    },
  };
}
