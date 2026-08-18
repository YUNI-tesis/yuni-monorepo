import { loadLocalEnv } from "@yuni/config/load-env";

loadLocalEnv();

const { startWorker } = await import("./main");
const stop = await startWorker();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
