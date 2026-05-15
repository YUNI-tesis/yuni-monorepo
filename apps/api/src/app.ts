import { Hono } from "hono";
import { appConfig } from "@yuni/config";

export const app = new Hono();

app.get("/health", (context) => context.json({ ok: true, service: "@yuni/api" }));

app.get("/version", (context) =>
  context.json({
    name: appConfig.appName,
    service: "@yuni/api",
    version: "0.1.0",
  })
);
