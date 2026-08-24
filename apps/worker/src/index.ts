import { loadLocalEnv } from "@yuni/config/load-env";

loadLocalEnv();

const { rawEnv, requireProductionServerEnv } = await import("@yuni/config");
requireProductionServerEnv(rawEnv);

const { startWorker } = await import("./main");
const stop = await startWorker();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
