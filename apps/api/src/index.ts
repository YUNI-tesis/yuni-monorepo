import { loadLocalEnv } from "@yuni/config/load-env";

loadLocalEnv();

const [{ serve }, { serverConfig }, { createLogger }, { app, startPublicSessionMaintenance }] =
  await Promise.all([
    import("@hono/node-server"),
    import("@yuni/config"),
    import("@yuni/observability"),
    import("./app.js"),
  ]);
const logger = createLogger("@yuni/api");
startPublicSessionMaintenance();

serve(
  {
    fetch: app.fetch,
    port: serverConfig.apiPort,
  },
  (info) => {
    logger.info(`ready on http://localhost:${info.port}`);
  }
);
