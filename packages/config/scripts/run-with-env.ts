import { spawn } from "node:child_process";
import { loadLocalEnv } from "../src/load-env";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error("Missing command. Usage: tsx packages/config/scripts/run-with-env.ts <command> [...args]");
}

loadLocalEnv({ force: true });

const child = spawn(command, args, {
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
