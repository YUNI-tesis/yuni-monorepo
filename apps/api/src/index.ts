import { serve } from "@hono/node-server";
import { serverConfig } from "@yuni/config";
import { createLogger } from "@yuni/observability";
import { app } from "./app.js";

const logger = createLogger("@yuni/api");

serve(
  {
    fetch: app.fetch,
    port: serverConfig.apiPort,
  },
  (info) => {
    logger.info(`ready on http://localhost:${info.port}`);
  }
);
