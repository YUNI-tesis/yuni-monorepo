/* global Buffer, Response, process */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLocalUrl,
  assertSandbox,
  checkConversation,
  deadline,
  inspectSandboxSessionToken,
  readAgents,
  safeError,
} from "./runtime.mjs";

test("QA deadlines are distinguishable from provider or application errors without logging text", async () => {
  const error = await deadline(new Promise(() => {}), 1, "private label").catch((failure) => failure);
  assert.deepEqual(safeError(error, "full-app"), {
    name: "QaDeadlineExceeded",
    stage: "full-app",
    timeoutMs: 1,
  });
});

test("pre-start sandbox inspection is conservative and explicitly does not verify signatures", () => {
  const token = (claims) =>
    Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") +
    "." +
    Buffer.from(JSON.stringify(claims)).toString("base64url") +
    ".signature-not-verified";
  const valid = { exp: 2000, sid: "session-qa", start_session_data: { is_sandbox: true } };
  const result = inspectSandboxSessionToken(token(valid), "session-qa", 1000);
  assert.equal(result.passed, true);
  assert.equal(result.signatureVerified, false);
  assert.equal(result.sidMatches, true);
  assert.equal(result.expiresInSeconds, 1000);
  for (const claims of [
    { ...valid, exp: 999 },
    { ...valid, exp: "2000" },
    { ...valid, exp: undefined },
    { ...valid, sid: "another-session" },
    { ...valid, start_session_data: { is_sandbox: false } },
    { ...valid, start_session_data: { is_sandbox: "true" } },
    { ...valid, start_session_data: JSON.stringify({ is_sandbox: true }) },
    { ...valid, is_sandbox: false },
  ])
    assert.equal(inspectSandboxSessionToken(token(claims), "session-qa", 1000).passed, false);
  assert.equal(
    inspectSandboxSessionToken(
      token({ ...valid, is_sandbox: true, start_session_data: undefined }),
      "session-qa",
      1000
    ).passed,
    true
  );
  assert.ok(!JSON.stringify(result).includes("signature-not-verified"));
});

test("full-app URL guard rejects non-local targets and embedded credentials", () => {
  assert.equal(assertLocalUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(assertLocalUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.throws(() => assertLocalUrl("https://example.com"));
  assert.throws(() => assertLocalUrl("https://localhost.example.com"));
  assert.throws(() => assertLocalUrl("http://user:secret@localhost:3000"));
});

test("provider runs require an explicit sandbox and reject production", () => {
  const savedSandbox = process.env.LIVEAVATAR_SANDBOX;
  const savedEnvironment = process.env.APP_ENV;
  try {
    delete process.env.LIVEAVATAR_SANDBOX;
    assert.throws(assertSandbox);
    process.env.LIVEAVATAR_SANDBOX = "false";
    assert.throws(assertSandbox);
    process.env.LIVEAVATAR_SANDBOX = "true";
    process.env.APP_ENV = "development";
    assert.doesNotThrow(assertSandbox);
    process.env.APP_ENV = "production";
    assert.throws(assertSandbox);
  } finally {
    if (savedSandbox === undefined) delete process.env.LIVEAVATAR_SANDBOX;
    else process.env.LIVEAVATAR_SANDBOX = savedSandbox;
    if (savedEnvironment === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = savedEnvironment;
  }
});

test("roster validation excludes duplicate names, arbitrary IDs and excessive participants", () => {
  const saved = process.env.YUNI_QA_AGENTS;
  try {
    process.env.YUNI_QA_AGENTS = JSON.stringify([{ name: "QA A", agentId: "agent_a" }]);
    assert.equal(readAgents().length, 1);
    process.env.YUNI_QA_AGENTS = JSON.stringify([
      { name: "A", agentId: "agent_a" },
      { name: "A", agentId: "agent_b" },
    ]);
    assert.throws(readAgents);
    process.env.YUNI_QA_AGENTS = JSON.stringify([{ name: "A", agentId: "https://example.com" }]);
    assert.throws(readAgents);
    process.env.YUNI_QA_AGENTS = JSON.stringify(
      Array.from({ length: 4 }, (_, index) => ({ name: String(index), agentId: `agent_${index}` }))
    );
    assert.throws(readAgents);
  } finally {
    if (saved === undefined) delete process.env.YUNI_QA_AGENTS;
    else process.env.YUNI_QA_AGENTS = saved;
  }
});

test("provider final state checks receipt without returning transcript text", async (context) => {
  const saved = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "qa-not-a-real-key";
  context.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          status: "done",
          has_audio: true,
          transcript: [
            { role: "user", message: "private-request" },
            { role: "agent", message: "private-answer" },
          ],
        })
      )
  );
  try {
    const result = await checkConversation({
      participant: { name: "A", agentId: "agent_a" },
      createdAt: new Date().toISOString(),
      conversationId: "conv_qa",
      expectedUserText: "private-request",
    });
    assert.equal(result.outcome, "passed");
    assert.equal(result.exactUserMessageReceived, true);
    assert.ok(!JSON.stringify(result).includes("private-"));
  } finally {
    if (saved === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = saved;
  }
});

test("processing at deadline is inconclusive, not failed delivery", async (context) => {
  const saved = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "qa-not-a-real-key";
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ status: "processing", transcript: [] }))
  );
  try {
    const result = await checkConversation({
      participant: { name: "A", agentId: "agent_a" },
      createdAt: new Date().toISOString(),
      conversationId: "conv_qa",
      expectedUserText: "request",
      maxWaitMs: 5,
    });
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.exactUserMessageReceived, undefined);
  } finally {
    if (saved === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = saved;
  }
});
