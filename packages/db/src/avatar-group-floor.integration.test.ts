import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAvatarGroupRepository } from "./repositories/avatar-group-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const db = testDatabaseUrl ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }) : null;
const createdUserIds: string[] = [];

integration("group floor repository integration", () => {
  beforeAll(async () => {
    await db?.$connect();
  });

  afterEach(async () => {
    if (!db) return;
    const ids = createdUserIds.splice(0);
    if (ids.length > 0) {
      await db.job.deleteMany({ where: { ownerId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("allows only one of two concurrent human messages to start a round", async () => {
    const fixture = await createFixture("concurrent", 2);

    const results = await Promise.all([
      fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
        sourceEventId: "scribe:concurrent:a",
        content: "Primera pregunta",
      }),
      fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
        sourceEventId: "scribe:concurrent:b",
        content: "Segunda pregunta",
      }),
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual(["busy", "created"]);
    await expect(
      db!.groupVoiceRound.count({ where: { groupVoiceSessionId: fixture.sessionId } })
    ).resolves.toBe(1);
  });

  it("persists rogue speech without changing the valid owner", async () => {
    const fixture = await createFixture("rogue", 2);
    const queued = await createQueuedRound(fixture, [fixture.avatarIds[0]!]);

    const result = await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "rogue:start:1",
      turnId: null,
      avatarId: fixture.avatarIds[1]!,
      type: "speak_started",
    });
    const session = await db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } });

    expect(result.kind).toBe("unauthorized");
    expect(session).toMatchObject({
      orchestrationPhase: "queued",
      floorOwnerAvatarId: fixture.avatarIds[0],
      floorTurnId: queued.turn.id,
    });
    await expect(
      db!.groupVoiceProviderEvent.count({
        where: { groupVoiceSessionId: fixture.sessionId, sourceEventId: "rogue:start:1" },
      })
    ).resolves.toBe(1);
  });

  it("does not expire a lease that speak_started already renewed", async () => {
    const fixture = await createFixture("renew", 2);
    const queued = await createQueuedRound(fixture, [fixture.avatarIds[0]!], 1_000);
    const previousExpiry = queued.leaseExpiresAt;

    const started = await fixture.repository.recordProviderEvent(
      fixture.userId,
      fixture.sessionId,
      {
        sourceEventId: "authorized:start:1",
        turnId: queued.turn.id,
        avatarId: fixture.avatarIds[0]!,
        type: "speak_started",
      },
      75_000
    );
    const expired = await fixture.repository.expireFloor(
      fixture.sessionId,
      new Date(previousExpiry.getTime() + 1)
    );
    const session = await db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } });

    expect(started.kind).toBe("accepted");
    expect(expired).toBe(false);
    expect(session).toMatchObject({
      orchestrationPhase: "speaking",
      floorTurnId: queued.turn.id,
    });
  });

  it("rolls back planned turns when the floor claim is lost", async () => {
    const fixture = await createFixture("rollback", 2);
    const beginning = await fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
      sourceEventId: "scribe:rollback:1",
      content: "Pregunta",
    });
    expect(beginning.kind).toBe("created");
    if (beginning.kind !== "created") throw new Error("Expected a newly-created round");
    await db!.groupVoiceSession.update({
      where: { id: fixture.sessionId },
      data: { orchestrationPhase: "listening" },
    });

    const queued = await fixture.repository.queueRound(fixture.sessionId, beginning.round.id, {
      intent: "normal",
      routingPlan: { strategy: "deterministic" },
      turns: [
        {
          avatarAgentId: fixture.avatarIds[0]!,
          position: 0,
          instructionText: "Respondé una vez.",
        },
      ],
    });
    const [round, turnCount] = await Promise.all([
      db!.groupVoiceRound.findUnique({ where: { id: beginning.round.id } }),
      db!.groupPlannedTurn.count({ where: { roundId: beginning.round.id } }),
    ]);

    expect(queued).toBeNull();
    expect(round?.status).toBe("deliberating");
    expect(turnCount).toBe(0);
  });

  it("serializes stale deliberation recovery against queueing without a lock-order deadlock", async () => {
    const fixture = await createFixture("recover-queue-race", 2);
    const beginning = await fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
      sourceEventId: "scribe:recover-queue-race",
      content: "Pregunta en deliberación",
    });
    expect(beginning.kind).toBe("created");
    if (beginning.kind !== "created") throw new Error("Expected a newly-created round");
    const cutoff = new Date(Date.now() - 15_000);
    await db!.groupVoiceRound.update({
      where: { id: beginning.round.id },
      data: { updatedAt: new Date(cutoff.getTime() - 1_000) },
    });

    const [queuedResult, recoveredResult] = await Promise.allSettled([
      fixture.repository.queueRound(fixture.sessionId, beginning.round.id, {
        intent: "normal",
        routingPlan: { strategy: "deterministic" },
        turns: [
          {
            avatarAgentId: fixture.avatarIds[0]!,
            position: 0,
            instructionText: "Respondé una vez.",
          },
        ],
      }),
      fixture.repository.recoverStaleDeliberatingRounds(cutoff),
    ]);
    if (queuedResult.status === "rejected") throw queuedResult.reason;
    if (recoveredResult.status === "rejected") throw recoveredResult.reason;
    const [session, round, turnCount] = await Promise.all([
      db!.groupVoiceSession.findUniqueOrThrow({ where: { id: fixture.sessionId } }),
      db!.groupVoiceRound.findUniqueOrThrow({ where: { id: beginning.round.id } }),
      db!.groupPlannedTurn.count({ where: { roundId: beginning.round.id } }),
    ]);

    if (queuedResult.value) {
      expect(recoveredResult.value).toBe(0);
      expect(session).toMatchObject({ orchestrationPhase: "queued" });
      expect(round.status).toBe("queued");
      expect(turnCount).toBe(1);
    } else {
      expect(recoveredResult.value).toBe(1);
      expect(session).toMatchObject({ orchestrationPhase: "listening", floorTurnId: null });
      expect(round.status).toBe("failed");
      expect(turnCount).toBe(0);
    }
  });

  it("applies a late correction after session end without restoring the floor", async () => {
    const fixture = await createFixture("late-correction", 2);
    const queued = await createQueuedRound(fixture, [fixture.avatarIds[0]!]);
    await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "late:start:1",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "speak_started",
    });
    await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "late:end:1",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "speak_ended",
      content: "Respuesta original",
    });
    const beforeCorrection = await db!.conversation.findUniqueOrThrow({
      where: { id: fixture.conversationId },
      select: { lastMessageAt: true },
    });
    await fixture.repository.endSession(fixture.userId, fixture.sessionId);

    const correction = await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "late:correction:1",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "agent_response_correction",
      content: "Respuesta corregida",
    });
    await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "late:original-response:1",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "agent_response",
      content: "Respuesta original tardía",
    });
    const [session, conversation, message] = await Promise.all([
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.conversation.findUnique({ where: { id: fixture.conversationId } }),
      db!.message.findUnique({
        where: {
          conversationId_sourceEventId: {
            conversationId: fixture.conversationId,
            sourceEventId: `group-turn:${queued.turn.id}`,
          },
        },
      }),
    ]);

    expect(correction.kind).toBe("late_updated");
    expect(message?.content).toBe("Respuesta corregida");
    expect(session?.rollingSummary).toContain("Respuesta corregida");
    expect(session?.rollingSummary).not.toContain("Respuesta original");
    expect(conversation?.lastMessageAt).toEqual(beforeCorrection.lastMessageAt);
    expect(session).toMatchObject({
      status: "ended",
      orchestrationPhase: "ended",
      floorOwnerAvatarId: null,
      floorTurnId: null,
      floorLeaseExpiresAt: null,
    });
  });

  it("rejects the first delivery from a superseded participant attempt", async () => {
    const fixture = await createFixture("stale-attempt", 2);
    const oldAttemptId = fixture.participantAttemptIds[0]!;
    const firstFloor = await createQueuedRound(fixture, [fixture.avatarIds[0]!]);
    await fixture.repository.failParticipant(fixture.userId, fixture.sessionId, fixture.avatarIds[0]!, {
      sourceEventId: "stale-attempt:initial-failure",
      participantAttemptId: oldAttemptId,
      reason: "session_stopped",
      expectedTurnId: firstFloor.turn.id,
    });
    const retry = await fixture.repository.beginParticipantRetry(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!
    );
    expect(retry?.realtimeSessionId).toBeTruthy();
    await fixture.repository.activateParticipantConnection(
      retry!.id,
      retry!.realtimeSessionId!,
      "provider-retry",
      "ciphertext-retry"
    );
    const currentFloor = await createQueuedRound(fixture, [fixture.avatarIds[0]!]);

    const stale = await fixture.repository.failParticipant(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!,
      {
        sourceEventId: "stale-attempt:first-delivery",
        participantAttemptId: oldAttemptId,
        reason: "stream_error",
        expectedTurnId: firstFloor.turn.id,
      }
    );
    const [participant, session] = await Promise.all([
      db!.groupVoiceParticipant.findUnique({ where: { id: retry!.id } }),
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
    ]);

    expect(stale.kind).toBe("stale");
    expect(participant).toMatchObject({
      status: "active",
      realtimeSessionId: retry!.realtimeSessionId,
    });
    expect(session).toMatchObject({
      orchestrationPhase: "queued",
      floorOwnerAvatarId: fixture.avatarIds[0],
      floorTurnId: currentFloor.turn.id,
    });
  });

  it("does not substitute another avatar when an explicitly named speaker is unavailable", async () => {
    const fixture = await createFixture("named-unavailable", 2);
    await fixture.repository.failParticipant(fixture.userId, fixture.sessionId, fixture.avatarIds[0]!, {
      sourceEventId: "named-unavailable:failure",
      participantAttemptId: fixture.participantAttemptIds[0]!,
      reason: "stream_error",
    });
    const beginning = await fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
      sourceEventId: "named-unavailable:question",
      content: "Avatar 1, respondé vos",
    });
    if (beginning.kind !== "created") throw new Error("Expected a newly-created round");

    const queued = await fixture.repository.queueRound(fixture.sessionId, beginning.round.id, {
      intent: "named",
      routingPlan: { strategy: "explicit_name" },
      turns: [
        {
          avatarAgentId: fixture.avatarIds[0]!,
          position: 0,
          instructionText: "Respondé la mención.",
        },
      ],
      fallbackTurns: [
        {
          avatarAgentId: fixture.avatarIds[1]!,
          position: 0,
          instructionText: "Respondé como sustituto.",
        },
      ],
    });
    const [session, round, turnCount] = await Promise.all([
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.groupVoiceRound.findUnique({ where: { id: beginning.round.id } }),
      db!.groupPlannedTurn.count({ where: { roundId: beginning.round.id } }),
    ]);

    expect(queued).toBeNull();
    expect(turnCount).toBe(0);
    expect(round?.routingPlan).toMatchObject({
      speakerIds: [],
      fallbackReason: "participant_degraded_during_deliberation",
    });
    expect(session).toMatchObject({ orchestrationPhase: "listening", floorTurnId: null });
  });

  it("replaces a normal-round speaker that degrades during deliberation", async () => {
    const fixture = await createFixture("normal-degraded-during-planner", 3);
    const beginning = await fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
      sourceEventId: "normal-degraded-during-planner:question",
      content: "Pregunta para el mejor experto",
    });
    if (beginning.kind !== "created") throw new Error("Expected a newly-created round");
    await fixture.repository.failParticipant(fixture.userId, fixture.sessionId, fixture.avatarIds[0]!, {
      sourceEventId: "normal-degraded-during-planner:failure",
      participantAttemptId: fixture.participantAttemptIds[0]!,
      reason: "stream_error",
    });

    const queued = await fixture.repository.queueRound(fixture.sessionId, beginning.round.id, {
      intent: "normal",
      routingPlan: {
        version: 1,
        strategy: "semantic",
        speakerIds: [fixture.avatarIds[0]],
      },
      turns: [
        {
          avatarAgentId: fixture.avatarIds[0]!,
          position: 0,
          instructionText: "Respondé como experto principal.",
        },
      ],
      fallbackTurns: fixture.avatarIds.slice(1).map((avatarAgentId, position) => ({
        avatarAgentId,
        position,
        instructionText: "Respondé como siguiente experto disponible.",
      })),
    });
    const [round, turns] = await Promise.all([
      db!.groupVoiceRound.findUnique({ where: { id: beginning.round.id } }),
      db!.groupPlannedTurn.findMany({
        where: { roundId: beginning.round.id },
        orderBy: { position: "asc" },
      }),
    ]);

    expect(queued?.turn.avatarAgentId).toBe(fixture.avatarIds[1]);
    expect(turns.map(({ avatarAgentId }) => avatarAgentId)).toEqual([fixture.avatarIds[1]]);
    expect(round?.routingPlan).toMatchObject({
      strategy: "fallback",
      speakerIds: [fixture.avatarIds[1]],
      fallbackReason: "participant_degraded_during_deliberation",
    });
  });

  it("advances after a participant failure and treats its redelivery as a no-op", async () => {
    const fixture = await createFixture("participant-failure", 2);
    const queued = await createQueuedRound(fixture, fixture.avatarIds);
    const failure = {
      sourceEventId: "participant:failure:1",
      participantAttemptId: fixture.participantAttemptIds[0]!,
      reason: "stream_error",
      expectedTurnId: queued.turn.id,
    };

    const first = await fixture.repository.failParticipant(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!,
      failure
    );
    const duplicate = await fixture.repository.failParticipant(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!,
      failure
    );
    const [session, turns, providerFailureEvents, failureReceipts] = await Promise.all([
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.groupPlannedTurn.findMany({
        where: { roundId: queued.turn.roundId },
        orderBy: { position: "asc" },
      }),
      db!.groupVoiceProviderEvent.count({
        where: {
          groupVoiceSessionId: fixture.sessionId,
          sourceEventId: failure.sourceEventId,
        },
      }),
      db!.groupVoiceParticipantFailureEvent.count({
        where: {
          groupVoiceSessionId: fixture.sessionId,
          sourceEventId: failure.sourceEventId,
        },
      }),
    ]);

    expect(first.kind).toBe("next");
    expect(duplicate.kind).toBe("duplicate");
    expect(session).toMatchObject({
      orchestrationPhase: "queued",
      floorOwnerAvatarId: fixture.avatarIds[1],
    });
    expect(turns.map(({ status }) => status)).toEqual(["failed", "claimed"]);
    expect(providerFailureEvents).toBe(0);
    expect(failureReceipts).toBe(1);
  });

  it("keeps a retried participant and its new floor intact when an old failure is redelivered", async () => {
    const fixture = await createFixture("durable-participant-failure", 2);
    const firstFloor = await createQueuedRound(fixture, [fixture.avatarIds[0]!]);
    const failureInput = {
      sourceEventId: "durable-failure:session-stopped:a",
      participantAttemptId: fixture.participantAttemptIds[0]!,
      reason: "session_stopped",
      expectedTurnId: firstFloor.turn.id,
    };
    const firstFailure = await fixture.repository.failParticipant(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!,
      failureInput
    );
    expect(firstFailure.kind).toBe("completed");

    const failedParticipant = await db!.groupVoiceParticipant.findFirstOrThrow({
      where: {
        groupVoiceSessionId: fixture.sessionId,
        avatarAgentId: fixture.avatarIds[0]!,
      },
    });
    const retry = await fixture.repository.beginParticipantRetry(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!
    );
    expect(retry).not.toBeNull();
    await fixture.repository.activateParticipantConnection(
      failedParticipant.id,
      retry!.realtimeSessionId!,
      "provider-session-retry-a",
      "ciphertext-retry-a"
    );
    const newFloor = await createQueuedRound(fixture, [fixture.avatarIds[0]!]);

    const redelivery = await fixture.repository.failParticipant(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!,
      failureInput
    );
    const [participant, session, turn, receiptCount] = await Promise.all([
      db!.groupVoiceParticipant.findUnique({ where: { id: failedParticipant.id } }),
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.groupPlannedTurn.findUnique({ where: { id: newFloor.turn.id } }),
      db!.groupVoiceParticipantFailureEvent.count({
        where: {
          groupVoiceSessionId: fixture.sessionId,
          sourceEventId: failureInput.sourceEventId,
        },
      }),
    ]);

    expect(redelivery.kind).toBe("duplicate");
    expect(redelivery.participant.status).toBe("active");
    expect(participant?.status).toBe("active");
    expect(session).toMatchObject({
      orchestrationPhase: "queued",
      floorOwnerAvatarId: fixture.avatarIds[0],
      floorTurnId: newFloor.turn.id,
    });
    expect(turn?.status).toBe("claimed");
    expect(receiptCount).toBe(1);
  });

  it("does not let a stale interrupt cancel the next avatar's turn", async () => {
    const fixture = await createFixture("stale-interrupt", 2);
    const queued = await createQueuedRound(fixture, fixture.avatarIds);
    await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "stale:start:1",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "speak_started",
    });
    const ended = await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "stale:end:1",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "speak_ended",
      content: "Primera respuesta",
    });
    expect(ended.kind).toBe("next");

    const interruption = await fixture.repository.interruptRound(fixture.userId, fixture.sessionId, {
      avatarId: fixture.avatarIds[0]!,
      turnId: queued.turn.id,
    });
    const session = await db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } });

    expect(interruption.kind).toBe("stale");
    expect(session).toMatchObject({
      orchestrationPhase: "queued",
      floorOwnerAvatarId: fixture.avatarIds[1],
    });
  });

  it("ends active rounds and enqueues provider cleanup atomically", async () => {
    const fixture = await createFixture("end-session", 2);
    const queued = await createQueuedRound(fixture, fixture.avatarIds);

    await fixture.repository.endSession(fixture.userId, fixture.sessionId);
    const [session, round, turns, cleanupJobs] = await Promise.all([
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.groupVoiceRound.findUnique({ where: { id: queued.turn.roundId } }),
      db!.groupPlannedTurn.findMany({
        where: { roundId: queued.turn.roundId },
        orderBy: { position: "asc" },
      }),
      db!.job.findMany({
        where: {
          type: "session_cleanup",
          dedupeKey: { in: fixture.participantAttemptIds.map((id) => `liveavatar-session-cleanup:${id}`) },
        },
      }),
    ]);

    expect(session).toMatchObject({
      status: "ended",
      orchestrationPhase: "ended",
      floorOwnerAvatarId: null,
      floorTurnId: null,
    });
    expect(round?.status).toBe("cancelled");
    expect(turns.map(({ status }) => status)).toEqual(["interrupted", "interrupted"]);
    expect(cleanupJobs).toHaveLength(2);
  });

  it("keeps the participant order from the conversation snapshot after the group is reordered", async () => {
    const fixture = await createFixture("snapshot-order", 3);
    await fixture.repository.update(fixture.userId, fixture.groupId, {
      avatarIds: [...fixture.avatarIds].reverse(),
    });

    const session = await fixture.repository.findVoiceSessionForOwner(fixture.userId, fixture.sessionId);

    expect(session?.participants.map(({ avatarAgentId }) => avatarAgentId)).toEqual(fixture.avatarIds);
  });

  it("omits a revoked shared member while preserving the order of two available participants", async () => {
    if (!db) throw new Error("TEST_DATABASE_URL is required");
    const suffix = `revoked-member-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [owner, participant] = await Promise.all([
      db.user.create({
        data: {
          email: `owner-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Avatar owner",
        },
      }),
      db.user.create({
        data: {
          email: `participant-${suffix}@integration.yuni.test`,
          passwordHash: "integration-only",
          name: "Group owner",
        },
      }),
    ]);
    createdUserIds.push(owner.id, participant.id);
    const [first, shared, third] = await Promise.all([
      createTestAvatar(participant.id, `${suffix}-first`, 0),
      createTestAvatar(owner.id, `${suffix}-shared`, 1),
      createTestAvatar(participant.id, `${suffix}-third`, 2),
    ]);
    const grant = await db.accessGrant.create({
      data: {
        avatarAgentId: shared.id,
        ownerId: owner.id,
        participantEmail: participant.email,
        participantUserId: participant.id,
        status: "active",
      },
    });
    const repository = createAvatarGroupRepository(db);
    const group = await repository.create(participant.id, {
      name: `Group ${suffix}`,
      avatarIds: [first.id, shared.id, third.id],
    });
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { status: "revoked", revokedAt: new Date() },
    });

    const session = await repository.createVoiceSession(participant.id, group.id);
    const snapshot = await db.conversationAvatar.findMany({
      where: { conversationId: session.conversationId },
      orderBy: { position: "asc" },
    });

    expect(session.participants.map(({ avatarAgentId }) => avatarAgentId)).toEqual([first.id, third.id]);
    expect(snapshot.map(({ avatarAgentId, position }) => ({ avatarAgentId, position }))).toEqual([
      { avatarAgentId: first.id, position: 0 },
      { avatarAgentId: third.id, position: 1 },
    ]);
  });

  it("deletes a live group only after durably enqueueing each provider session cleanup", async () => {
    const fixture = await createFixture("delete-group", 2);

    await fixture.repository.delete(fixture.userId, fixture.groupId);
    const [group, session, conversation, cleanupJobs] = await Promise.all([
      db!.avatarGroup.findUnique({ where: { id: fixture.groupId } }),
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.conversation.findUnique({ where: { id: fixture.conversationId } }),
      db!.job.findMany({
        where: {
          type: "session_cleanup",
          dedupeKey: { in: fixture.participantAttemptIds.map((id) => `liveavatar-session-cleanup:${id}`) },
        },
      }),
    ]);

    expect(group).toBeNull();
    expect(session).toBeNull();
    expect(conversation).toMatchObject({ avatarGroupId: null, status: "ended" });
    expect(cleanupJobs).toHaveLength(2);
  });

  it("never loses a provider token when activation races session end", async () => {
    const fixture = await createFixture("activate-end-race", 2);
    await fixture.repository.failParticipant(fixture.userId, fixture.sessionId, fixture.avatarIds[0]!, {
      sourceEventId: "activate-end-race:failure",
      participantAttemptId: fixture.participantAttemptIds[0]!,
      reason: "stream_error",
    });
    const retry = await fixture.repository.beginParticipantRetry(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!
    );
    if (!retry?.realtimeSessionId) throw new Error("Expected a retry attempt");

    await Promise.all([
      fixture.repository.activateParticipantConnection(
        retry.id,
        retry.realtimeSessionId,
        "provider-race",
        "ciphertext-race"
      ),
      fixture.repository.endSession(fixture.userId, fixture.sessionId),
    ]);
    const [session, cleanupJob] = await Promise.all([
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.job.findUnique({
        where: { dedupeKey: `liveavatar-session-cleanup:${retry.realtimeSessionId}` },
      }),
    ]);

    expect(session?.status).toBe("ended");
    expect(cleanupJob?.payload).toMatchObject({
      realtimeSessionId: retry.realtimeSessionId,
      providerSessionTokenCiphertext: "ciphertext-race",
    });
  });

  it("serializes participant retry against session end", async () => {
    const fixture = await createFixture("retry-end-race", 2);
    await fixture.repository.failParticipant(fixture.userId, fixture.sessionId, fixture.avatarIds[0]!, {
      sourceEventId: "retry-end-race:failure",
      participantAttemptId: fixture.participantAttemptIds[0]!,
      reason: "stream_error",
    });

    const [retryResult, endResult] = await Promise.allSettled([
      fixture.repository.beginParticipantRetry(fixture.userId, fixture.sessionId, fixture.avatarIds[0]!),
      fixture.repository.endSession(fixture.userId, fixture.sessionId),
    ]);
    const [session, participant, realtimeAttempts, cleanupJobs] = await Promise.all([
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.groupVoiceParticipant.findFirst({
        where: {
          groupVoiceSessionId: fixture.sessionId,
          avatarAgentId: fixture.avatarIds[0]!,
        },
      }),
      db!.realtimeSession.findMany({
        where: {
          conversationId: fixture.conversationId,
          avatarAgentId: fixture.avatarIds[0]!,
        },
      }),
      db!.job.findMany({
        where: {
          type: "session_cleanup",
          dedupeKey: { startsWith: "liveavatar-session-cleanup:" },
          avatarAgentId: fixture.avatarIds[0]!,
        },
      }),
    ]);

    expect(endResult.status).toBe("fulfilled");
    expect(session?.status).toBe("ended");
    expect(["ended", "errored"]).toContain(participant?.status);
    expect(realtimeAttempts.every(({ status }) => status === "ended")).toBe(true);
    const cleanupIds = new Set(
      cleanupJobs.map(({ dedupeKey }) => dedupeKey?.replace("liveavatar-session-cleanup:", ""))
    );
    for (const attempt of realtimeAttempts.filter(
      ({ providerSessionTokenCiphertext }) => providerSessionTokenCiphertext !== null
    )) {
      expect(cleanupIds.has(attempt.id)).toBe(true);
    }
    if (retryResult.status === "fulfilled" && retryResult.value) {
      expect(retryResult.value.realtimeSessionId).not.toBe(fixture.participantAttemptIds[0]);
      expect(participant?.status).toBe("ended");
    }
  });

  it("marks a previous speaker errored when its failure arrives after the floor advanced", async () => {
    const fixture = await createFixture("stale-participant-failure", 2);
    const queued = await createQueuedRound(fixture, fixture.avatarIds);
    await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "stale-failure:start:a",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "speak_started",
    });
    const ended = await fixture.repository.recordProviderEvent(fixture.userId, fixture.sessionId, {
      sourceEventId: "stale-failure:end:a",
      turnId: queued.turn.id,
      avatarId: fixture.avatarIds[0]!,
      type: "speak_ended",
      content: "Respuesta de A",
    });
    expect(ended.kind).toBe("next");

    const failure = await fixture.repository.failParticipant(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!,
      {
        sourceEventId: "stale-failure:session-stopped:a",
        participantAttemptId: fixture.participantAttemptIds[0]!,
        reason: "session_stopped",
        expectedTurnId: queued.turn.id,
      }
    );
    const afterFailure = await db!.groupVoiceParticipant.findFirst({
      where: {
        groupVoiceSessionId: fixture.sessionId,
        avatarAgentId: fixture.avatarIds[0]!,
      },
    });
    const retryClaimed = await fixture.repository.beginParticipantRetry(
      fixture.userId,
      fixture.sessionId,
      fixture.avatarIds[0]!
    );
    const [afterRetry, session, turns] = await Promise.all([
      db!.groupVoiceParticipant.findFirst({
        where: {
          groupVoiceSessionId: fixture.sessionId,
          avatarAgentId: fixture.avatarIds[0]!,
        },
      }),
      db!.groupVoiceSession.findUnique({ where: { id: fixture.sessionId } }),
      db!.groupPlannedTurn.findMany({
        where: { roundId: queued.turn.roundId },
        orderBy: { position: "asc" },
      }),
    ]);

    expect(failure.kind).toBe("degraded");
    expect(failure.participant.status).toBe("errored");
    expect(afterFailure?.status).toBe("errored");
    expect(retryClaimed).not.toBeNull();
    expect(afterRetry?.status).toBe("connecting");
    expect(session).toMatchObject({
      orchestrationPhase: "queued",
      floorOwnerAvatarId: fixture.avatarIds[1],
      floorTurnId: ended.next?.turn.id,
    });
    expect(turns.map(({ status }) => status)).toEqual(["completed", "claimed"]);
  });
});

async function createFixture(label: string, avatarCount: number) {
  if (!db) throw new Error("TEST_DATABASE_URL is required");
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await db.user.create({
    data: {
      email: `${suffix}@integration.yuni.test`,
      passwordHash: "integration-only",
      name: "Floor integration",
    },
  });
  createdUserIds.push(user.id);
  const avatars = await Promise.all(
    Array.from({ length: avatarCount }, (_, position) =>
      db.avatarAgent.create({
        data: {
          ownerId: user.id,
          name: `Avatar ${position + 1}`,
          description: "Especialista de integración",
          instructions: "Respondé de forma breve.",
          context: "Contexto de integración",
          voiceConfig: { provider: "elevenlabs", voiceId: `voice-${suffix}-${position}` },
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: `live-${suffix}-${position}`,
            mode: "lite",
            sandbox: true,
          },
          status: "active",
        },
      })
    )
  );
  const repository = createAvatarGroupRepository(db);
  const group = await repository.create(user.id, {
    name: `Group ${suffix}`,
    avatarIds: avatars.map(({ id }) => id),
  });
  const session = await repository.createVoiceSession(user.id, group.id);
  const participantAttemptIds: string[] = [];
  for (const participant of session.participants) {
    const connection = await repository.createRealtimeParticipant(
      participant.id,
      session.conversationId,
      participant.avatarAgentId
    );
    const participantAttemptId = connection.realtimeSessionId!;
    participantAttemptIds.push(participantAttemptId);
    await repository.activateParticipantConnection(
      participant.id,
      participantAttemptId,
      null,
      `ciphertext-${participant.id}`
    );
  }
  await repository.markSessionActive(session.id);
  return {
    repository,
    userId: user.id,
    sessionId: session.id,
    groupId: group.id,
    conversationId: session.conversationId,
    avatarIds: avatars.map(({ id }) => id),
    participantAttemptIds,
  };
}

function createTestAvatar(ownerId: string, suffix: string, position: number) {
  if (!db) throw new Error("TEST_DATABASE_URL is required");
  return db.avatarAgent.create({
    data: {
      ownerId,
      name: `Avatar ${position + 1}`,
      description: "Especialista de integración",
      instructions: "Respondé de forma breve.",
      context: "Contexto de integración",
      voiceConfig: { provider: "elevenlabs", voiceId: `voice-${suffix}-${position}` },
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: `live-${suffix}-${position}`,
        mode: "lite",
        sandbox: true,
      },
      status: "active",
    },
  });
}

async function createQueuedRound(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  avatarIds: string[],
  leaseMs = 75_000
) {
  const beginning = await fixture.repository.beginRound(fixture.userId, fixture.sessionId, {
    sourceEventId: `scribe:${Date.now()}:${Math.random()}`,
    content: "Pregunta de integración",
  });
  if (beginning.kind !== "created") throw new Error("Expected a newly-created round");
  const queued = await fixture.repository.queueRound(
    fixture.sessionId,
    beginning.round.id,
    {
      intent: avatarIds.length > 1 ? "collective" : "normal",
      routingPlan: { strategy: "deterministic" },
      turns: avatarIds.map((avatarAgentId, position) => ({
        avatarAgentId,
        position,
        instructionText: "Respondé una vez.",
      })),
    },
    leaseMs
  );
  if (!queued) throw new Error("Expected the round to acquire the floor");
  return queued;
}
