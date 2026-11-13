import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "./errors.js";
import type { Runtime } from "./runtime.js";

export const DEFAULT_BASE_URL = "https://api.usetuner.ai";
const CREDENTIALS_FILE = "credentials.json";

export interface GlobalFlags {
  apiKey?: string;
  baseUrl?: string;
  verbose?: boolean;
}

export type KeySource = "flag" | "env" | "stored";

export interface ResolvedKey {
  key: string;
  source: KeySource;
}

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
    throw new CliError(
      "No API key. Set TUNER_API_KEY or run `tuner auth login`.",
      "config_error",
    );
  }
  return key;
}

export function describeKeySource(source: KeySource, runtime: Runtime): string {
  if (source === "flag") return "--api-key";
  if (source === "env") return "TUNER_API_KEY";
  return credentialsPath(runtime);
}

export function resolveBaseUrl(flags: GlobalFlags, runtime: Runtime): string {
  const raw = flags.baseUrl || runtime.env.TUNER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError(`Invalid base URL '${raw}'.`, "usage_error");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError(`Base URL must be http or https, got '${raw}'.`, "usage_error");
  }
  return raw.replace(/\/+$/, "");
}

export function resolveAgentRef(flagAgent: string | undefined, runtime: Runtime): string | undefined {
  const value = flagAgent?.trim() || runtime.env.TUNER_AGENT_ID?.trim();
  return value || undefined;
}
