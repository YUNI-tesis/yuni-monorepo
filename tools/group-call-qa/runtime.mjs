/* global AbortSignal, URL, fetch, process, setTimeout, clearTimeout */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const directory = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(directory, "../..");
export const args = process.argv.slice(2);
export const arg = (name, fallback) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
export const run = args.includes("--run");
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function assertSandbox() {
  if (process.env.LIVEAVATAR_SANDBOX !== "true") {
    throw new Error("Explicit LIVEAVATAR_SANDBOX=true is required for provider QA");
  }
  if (process.env.APP_ENV === "production") throw new Error("QA cannot target production");
}

export function assertLocalUrl(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Full-app QA only allows loopback URLs");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Unexpected URL credentials or suffix");
  return url.origin;
}

export function loadBrowser() {
  const modules = process.env.YUNI_QA_NODE_MODULES;
  if (!modules || !path.isAbsolute(modules)) {
    throw new Error(
      "Set YUNI_QA_NODE_MODULES to an absolute external node_modules directory containing playwright"
    );
  }
  const require = createRequire(import.meta.url);
  return require(path.join(modules, "playwright")).chromium;
}

export function browserOptions() {
  const executablePath = arg("browser-path", process.env.YUNI_QA_BROWSER_PATH);
  return {
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  };
}

export async function outputDirectory() {
  const explicit = arg("output-dir");
  if (!explicit) return fs.mkdtemp(path.join(os.tmpdir(), "yuni-group-call-qa-"));
  const resolved = path.resolve(explicit);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

export function deadline(operation, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

export async function providerJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Provider request failed: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export function readAgents() {
  let roster;
  try {
    roster = JSON.parse(arg("agents", process.env.YUNI_QA_AGENTS ?? "[]"));
  } catch {
    throw new Error("--agents/YUNI_QA_AGENTS must be a JSON array");
  }
  if (
    !Array.isArray(roster) ||
    roster.length > 3 ||
    roster.some(
      (item) =>
        !item ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 100 ||
        typeof item.agentId !== "string" ||
        !/^agent_[a-zA-Z0-9_-]+$/.test(item.agentId)
    )
  ) {
    throw new Error("Provide one to three {name, agentId} entries; names must be unique");
  }
  if (new Set(roster.map((item) => item.name)).size !== roster.length)
    throw new Error("Agent names must be unique");
  if (run && roster.length === 0) throw new Error("Provider runs require --agents or YUNI_QA_AGENTS");
  return roster.map(({ name, agentId }) => ({ name, agentId }));
}

// Do not record SDK errors verbatim: messages can include tokens or transcript text.
export function safeError(error, stage) {
  return { name: error?.name ?? "Error", stage };
}

export async function checkConversation({
  participant,
  createdAt,
  conversationId,
  expectedUserText,
  maxWaitMs = 45000,
}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { name: participant.name, outcome: "inconclusive", reason: "missing_api_key" };
  const until = Date.now() + maxWaitMs;
  let status = null;
  while (Date.now() < until) {
    try {
      if (!conversationId) {
        const list = await providerJson(
          `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${encodeURIComponent(participant.agentId)}&page_size=10`,
          { headers: { "xi-api-key": key } }
        );
        const candidates = (list.conversations ?? []).filter(
          (item) => item.start_time_unix_secs >= Math.floor(Date.parse(createdAt) / 1000) - 2
        );
        if (candidates.length > 1)
          return { name: participant.name, outcome: "inconclusive", reason: "ambiguous_conversation" };
        if (candidates.length === 1) conversationId = candidates[0].conversation_id;
      }
      if (conversationId) {
        const conversation = await providerJson(
          `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
          { headers: { "xi-api-key": key } }
        );
        status = conversation.status;
        if (status === "done" || status === "failed") {
          const transcript = conversation.transcript ?? [];
          const userIndex = transcript.findIndex(
            (item) =>
              item.role === "user" &&
              item.message &&
              (expectedUserText == null || item.message === expectedUserText)
          );
          const response =
            userIndex >= 0
              ? transcript.slice(userIndex + 1).find((item) => item.role === "agent" && item.message)
              : null;
          return {
            name: participant.name,
            conversationId,
            status,
            outcome: status === "done" && userIndex >= 0 && response ? "passed" : "failed",
            hasAudio: conversation.has_audio,
            userMessageReceived: userIndex >= 0,
            ...(expectedUserText == null ? {} : { exactUserMessageReceived: userIndex >= 0 }),
            userMessages: transcript.filter((item) => item.role === "user" && item.message).length,
            agentMessages: transcript.filter((item) => item.role === "agent" && item.message).length,
            generatedResponseAfterUser: Boolean(response),
            responseLength: response?.message?.length ?? 0,
            transcriptEntryCount: transcript.length,
          };
        }
      }
    } catch {
      // Provider diagnostics are best-effort; processing or read failures are not proof of failed delivery.
    }
    await sleep(Math.max(0, Math.min(2000, until - Date.now())));
  }
  return {
    name: participant.name,
    conversationId: conversationId ?? null,
    status,
    outcome: "inconclusive",
    reason: "provider_processing_or_lookup_deadline",
  };
}
