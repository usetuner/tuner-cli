import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type GlobalFlags, type KeySource, type ResolvedKey } from "./domain/config.js";
import { CliError } from "./domain/errors.js";
import type { Runtime } from "./runtime.js";

const CREDENTIALS_FILE = "credentials.json";

export function credentialsPath(runtime: Runtime): string {
  return join(runtime.configDir, CREDENTIALS_FILE);
}

export async function readStoredKey(runtime: Runtime): Promise<string | undefined> {
  try {
    const raw = await readFile(credentialsPath(runtime), "utf8");
    const parsed = JSON.parse(raw) as { api_key?: unknown };
    return typeof parsed.api_key === "string" && parsed.api_key ? parsed.api_key : undefined;
  } catch {
    return undefined;
  }
}

export async function writeStoredKey(runtime: Runtime, apiKey: string): Promise<string> {
  const path = credentialsPath(runtime);
  await mkdir(runtime.configDir, { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ api_key: apiKey }, null, 2) + "\n", { mode: 0o600 });
  // writeFile keeps the mode of an existing file.
  await chmod(path, 0o600);
  return path;
}

/** Returns true when a stored key was removed. */
export async function deleteStoredKey(runtime: Runtime): Promise<boolean> {
  const path = credentialsPath(runtime);
  try {
    await readFile(path);
  } catch {
    return false;
  }
  await rm(path, { force: true });
  return true;
}

export async function resolveApiKey(
  flags: GlobalFlags,
  runtime: Runtime,
): Promise<ResolvedKey | undefined> {
  if (flags.apiKey) return { key: flags.apiKey, source: "flag" };
  const fromEnv = runtime.env.TUNER_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env" };
  const stored = await readStoredKey(runtime);
  return stored ? { key: stored, source: "stored" } : undefined;
}

export async function requireApiKey(flags: GlobalFlags, runtime: Runtime): Promise<ResolvedKey> {
  const key = await resolveApiKey(flags, runtime);
  if (!key) {
    throw new CliError("No API key. Set TUNER_API_KEY or run `tuner auth login`.", "config_error");
  }
  return key;
}

export function describeKeySource(source: KeySource, runtime: Runtime): string {
  if (source === "flag") return "--api-key";
  if (source === "env") return "TUNER_API_KEY";
  return credentialsPath(runtime);
}
