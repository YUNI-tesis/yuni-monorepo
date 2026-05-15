import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const values: Record<string, string> = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function findWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start);

  while (current !== resolve(current, "..")) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    current = resolve(current, "..");
  }

  return resolve(start);
}

export type LoadLocalEnvOptions = {
  cwd?: string;
  force?: boolean;
};

export function loadLocalEnv(options: LoadLocalEnvOptions = {}) {
  if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
    return { loadedFiles: [] as string[] };
  }

  const rootDir = findWorkspaceRoot(options.cwd);
  const files = [resolve(rootDir, ".env"), resolve(rootDir, ".env.local")];
  const loadedFiles: string[] = [];

  for (const file of files) {
    const values = parseEnvFile(file);

    if (Object.keys(values).length === 0) {
      continue;
    }

    loadedFiles.push(file);

    for (const [key, value] of Object.entries(values)) {
      if (options.force || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  return { loadedFiles };
}
