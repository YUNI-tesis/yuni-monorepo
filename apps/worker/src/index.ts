import { appConfig } from "@yuni/config";
import { createLogger } from "@yuni/observability";

const logger = createLogger("@yuni/worker");

logger.info(`${appConfig.appName} worker ready`);

function shutdown(signal: NodeJS.Signals) {
  logger.info(`received ${signal}; shutting down`);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
