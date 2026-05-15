import { WebSocketServer } from "ws";
import { serverConfig } from "@yuni/config";
import { createLogger } from "@yuni/observability";

const logger = createLogger("@yuni/realtime");
const server = new WebSocketServer({ port: serverConfig.realtimePort });

server.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "session.ready", service: "@yuni/realtime" }));
});

server.on("listening", () => {
  logger.info(`ready on ws://localhost:${serverConfig.realtimePort}`);
});

function shutdown() {
  logger.info("shutting down");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
