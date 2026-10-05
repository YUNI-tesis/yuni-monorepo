/* global AbortSignal, console, fetch, process, window */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import {
  arg,
  args,
  assertSandbox,
  browserOptions,
  checkConversation,
  deadline,
  directory,
  inspectSandboxSessionToken,
  loadBrowser,
  outputDirectory,
  providerJson,
  readAgents,
  repo,
  run,
  safeError,
} from "./runtime.mjs";

const require = createRequire(import.meta.url);
const chromium = loadBrowser();
const pnpm = path.join(repo, "node_modules/.pnpm");
const dirs = await fs.readdir(pnpm);
const esbuildDir = dirs.find((name) => name.startsWith("esbuild@"));
if (!esbuildDir) throw new Error("Install workspace dependencies before running this probe");
const { build } = require(path.join(pnpm, esbuildDir, "node_modules/esbuild"));
const variant = arg("variant", "official");
if (!["official", "omitted", "uuid", "custom"].includes(variant)) throw new Error("Invalid variant");
const scenario = arg("scenario", "normal");
if (!["normal", "interrupt-reuse"].includes(scenario)) throw new Error("Invalid scenario");
const sdkFile = path.resolve(
  arg("sdk-file", path.join(repo, "apps/web/node_modules/@heygen/liveavatar-web-sdk/lib/index.esm.js"))
);
const voiceChat = arg("voice-chat", "muted");
if (!["muted", "off"].includes(voiceChat)) throw new Error("Invalid voice-chat option");
const roster = readAgents();
const selected = args.includes("--group")
  ? roster
  : roster.filter((item) => item.name === arg("avatar", roster[0]?.name));
if (run && !selected.length) throw new Error("No matching avatar");
if (scenario === "interrupt-reuse" && (variant !== "official" || (run && selected.length !== 1)))
  throw new Error("Interrupt reuse requires the official SDK and exactly one avatar");
const text = arg(
  "text",
  scenario === "interrupt-reuse"
    ? "Explicá en dos frases largas, de al menos treinta palabras cada una, cómo organizarías una revisión técnica de una aplicación y qué revisarías primero para mejorar su confiabilidad. No uses listas ni hagas preguntas."
    : "Respondé únicamente con la palabra azul."
);
const secondText = "Respondé únicamente con la palabra azul.";
if (run) {
  assertSandbox();
  for (const key of ["LIVEAVATAR_API_KEY", "LIVEAVATAR_ELEVENLABS_SECRET_ID", "ELEVENLABS_API_KEY"]) {
    if (!process.env[key]) throw new Error("Missing required environment variable: " + key);
  }
}
const temp = await outputDirectory();
const bundle = await build({
  entryPoints: [path.join(directory, "browser.js")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  logLevel: "silent",
  alias: { "@heygen/liveavatar-web-sdk": sdkFile },
  nodePaths: [
    path.join(repo, "apps/web/node_modules/@heygen/liveavatar-web-sdk/node_modules"),
    path.join(repo, "apps/web/node_modules"),
    ...dirs
      .filter((name) => /^(livekit-client@|events@|webrtc-issue-detector@)/.test(name))
      .map((name) => path.join(pnpm, name, "node_modules")),
  ],
});
const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/probe.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(bundle.outputFiles[0].contents);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<!doctype html><title>YUNI isolated provider probe</title><body><script src="/probe.js"></script></body>'
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port;
let browser, page;
const tokens = [];
const report = {
  createdAt: new Date().toISOString(),
  variant,
  scenario,
  voiceChat,
  sdkFile,
  participants: selected.map(({ name, agentId }) => ({ name, agentId })),
  run,
  steps: [],
  providerChecks: [],
};
const request = providerJson;
const stopToken = async ({ sessionToken, name }) => {
  try {
    const response = await fetch("https://api.liveavatar.com/v1/sessions/stop", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + sessionToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    return { name, status: response.status };
  } catch (error) {
    return { name, errorName: error.name };
  }
};
try {
  browser = await chromium.launch(browserOptions());
  const context = await browser.newContext({ permissions: ["microphone"] });
  page = await context.newPage();
  // Never forward console messages or network request bodies; SDK may log sensitive material.
  page.on("pageerror", (error) => report.steps.push({ type: "pageerror", errorName: error.name }));
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.probeStart));
  console.log(
    JSON.stringify({
      stage: "smoke",
      ok: true,
      run,
      variant,
      scenario,
      voiceChat,
      participants: selected.map((item) => item.name),
    })
  );
  if (run) {
    for (const key of ["LIVEAVATAR_API_KEY", "LIVEAVATAR_ELEVENLABS_SECRET_ID", "ELEVENLABS_API_KEY"]) {
      if (!process.env[key]) throw new Error("Missing required environment variable: " + key);
    }
    for (const participant of selected) {
      const body = await request("https://api.liveavatar.com/v1/sessions/token", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.LIVEAVATAR_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          mode: "LITE",
          avatar_id: "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a",
          is_sandbox: true,
          elevenlabs_agent_config: {
            secret_id: process.env.LIVEAVATAR_ELEVENLABS_SECRET_ID,
            agent_id: participant.agentId,
          },
        }),
      });
      const data = body.data ?? body;
      const sessionToken = data.session_token ?? data.sessionToken ?? data.token;
      if (!sessionToken) throw new Error("Provider token response missing token");
      tokens.push({ ...participant, sessionToken, sessionId: data.session_id ?? null });
      if (scenario === "interrupt-reuse") {
        const guard = inspectSandboxSessionToken(sessionToken, data.session_id);
        guard.trust = "authenticated_provider_api";
        report.tokenGuard = guard;
        if (!guard.passed) throw new Error("Sandbox token guard denied native reuse probe");
      }
    }
    report.steps.push({
      type: "connected",
      participants: await deadline(
        page.evaluate(({ tokens, variant, voiceChat }) => window.probeStart(tokens, { variant, voiceChat }), {
          tokens,
          variant,
          voiceChat,
        }),
        45000,
        "Provider startup"
      ),
    });
    if (scenario === "interrupt-reuse") {
      const sessionId = tokens[0].sessionId;
      const metadata = await request(
        "https://api.liveavatar.com/v1/sessions/" + encodeURIComponent(sessionId),
        {
          headers: { "X-API-KEY": process.env.LIVEAVATAR_API_KEY },
        }
      );
      report.postStartGuard = { sessionId, isSandbox: (metadata.data ?? metadata).is_sandbox === true };
      if (!report.postStartGuard.isSandbox) throw new Error("Started session sandbox was not confirmed");
      const result = await deadline(
        page.evaluate(({ name, text, secondText }) => window.probeInterruptReuse(name, text, secondText), {
          name: selected[0].name,
          text,
          secondText,
        }),
        55000,
        "Native interrupt reuse"
      );
      console.log(JSON.stringify({ stage: "interrupt_reuse", ...result }));
    } else
      for (const participant of selected) {
        const result = await deadline(
          page.evaluate(({ name, text, variant }) => window.probeTurn(name, text, variant), {
            name: participant.name,
            text,
            variant,
          }),
          30000,
          "Provider turn"
        );
        console.log(JSON.stringify({ stage: "turn", ...result }));
      }
    report.browser = await page.evaluate(() => window.probeReport());
    await deadline(
      page.evaluate(() => window.probeStop()),
      6000,
      "Browser cleanup"
    );
    report.cleanup = await Promise.all(tokens.map(stopToken));
    report.providerChecks =
      scenario === "interrupt-reuse"
        ? await Promise.all(
            [text, ...(report.browser.interruptReuse?.commandsSent === 2 ? [secondText] : [])].map(
              async (expectedUserText, index) => ({
                ordinal: index + 1,
                ...(await checkConversation({
                  participant: selected[0],
                  createdAt: report.createdAt,
                  conversationId: report.browser.conversations.find(
                    (item) => item.avatar === selected[0].name
                  )?.conversationId,
                  expectedUserText,
                })),
              })
            )
          )
        : await Promise.all(
            selected.map((participant) =>
              checkConversation({
                participant,
                createdAt: report.createdAt,
                conversationId: report.browser.conversations.find((item) => item.avatar === participant.name)
                  ?.conversationId,
                expectedUserText: text,
              })
            )
          );
    for (const check of report.providerChecks) console.log(JSON.stringify({ stage: "elevenlabs", ...check }));
    if (scenario === "interrupt-reuse") {
      report.outcome = "inconclusive";
      report.experimental = true;
      report.exactlyTwoProviderMessagesReceived =
        report.providerChecks.length === 2 &&
        report.providerChecks.every((check) => check.exactUserMessageReceived && check.userMessages === 2);
    } else
      report.outcome =
        report.providerChecks.some((check) => check.outcome === "inconclusive") ||
        report.browser.turns.some((turn) => turn.audioSampleCount === 0)
          ? "inconclusive"
          : report.providerChecks.every((check) => check.outcome === "passed") &&
              report.browser.turns.length === selected.length &&
              report.browser.turns.every((turn) => turn.completed && turn.nonSilentUnmutedSamples > 0) &&
              report.browser.maxUnmutedElements <= 1
            ? "passed"
            : "failed";
    if (report.outcome !== "passed") process.exitCode = 1;
  }
} catch (error) {
  report.error = safeError(error, "probe");
  console.error(JSON.stringify({ stage: "error", ...report.error }));
  process.exitCode = 1;
} finally {
  if (page) {
    try {
      report.browser ??= await page.evaluate(() => window.probeReport());
    } catch {
      // Preserve cleanup if the browser context disappeared.
    }
    try {
      await deadline(
        page.evaluate(() => window.probeStop()),
        6000,
        "Browser cleanup"
      );
    } catch {
      // REST cleanup below remains available if SDK cleanup fails.
    }
  }
  if (tokens.length && !report.cleanup) report.cleanup = await Promise.all(tokens.map(stopToken));
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  const reportPath = path.join(temp, "report-" + Date.now() + "-" + variant + ".json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ stage: "report", path: reportPath }));
}
