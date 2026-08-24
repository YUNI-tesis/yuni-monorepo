import { loadLocalEnv } from "@yuni/config/load-env";

loadLocalEnv();

const { rawEnv, requireProductionServerEnv, serverConfig } = await import("@yuni/config");
requireProductionServerEnv(rawEnv);

const [
  { serve },
  { createLogger },
  { app, startExternalSessionMaintenance, startGroupVoiceSessionMaintenance },
] = await Promise.all([import("@hono/node-server"), import("@yuni/observability"), import("./app.js")]);
const logger = createLogger("@yuni/api");
startExternalSessionMaintenance();
startGroupVoiceSessionMaintenance();

serve(
  {
    fetch: app.fetch,
    port: serverConfig.processPort ?? serverConfig.apiPort,
  },
  (info) => {
    logger.info(`ready on http://localhost:${info.port}`);
  }
);
