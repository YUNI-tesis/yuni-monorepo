/* global Response, process */
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalUrl, assertSandbox, checkConversation, readAgents } from "./runtime.mjs";

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
