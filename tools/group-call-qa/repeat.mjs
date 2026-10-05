/* global console, process */
import path from "node:path";
import { spawn } from "node:child_process";
import { args, arg, directory, run } from "./runtime.mjs";

const calls = Number(arg("calls", "1"));
if (!Number.isInteger(calls) || calls < 1 || calls > 6)
  throw new Error("--calls must be an integer from 1 to 6");
if (!arg("group-id")) throw new Error("--group-id is required");
const forwarded = args.filter((value) => !value.startsWith("--calls="));
if (!run) {
  console.log(
    JSON.stringify({
      run: false,
      calls,
      scope: "Would repeat independent full-app calls sequentially; no calls started",
    })
  );
} else {
  for (let index = 0; index < calls; index++) {
    console.log(JSON.stringify({ stage: "repeat", call: index + 1, calls }));
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(directory, "full-app.mjs"), ...forwarded], {
        env: process.env,
        stdio: "inherit",
        shell: false,
      });
      child.on("error", reject);
      child.on("exit", (exitCode) => resolve(exitCode ?? 1));
    });
    if (code !== 0) {
      process.exitCode = code;
      console.log(
        JSON.stringify({ stage: "repeat_stopped", call: index + 1, reason: "failed_or_inconclusive" })
      );
      break;
    }
  }
}
