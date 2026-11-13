import type { GlobalFlags, KeySource, ResolvedKey } from "../domain/config.js";
import { CliError } from "../domain/errors.js";
import type { AppDeps } from "../ports.js";

type KeyDeps = Pick<AppDeps, "env" | "credentials">;

/** Flag, then TUNER_API_KEY, then the stored key. */
export async function resolveApiKey(
  flags: GlobalFlags,
  deps: KeyDeps,
): Promise<ResolvedKey | undefined> {
  if (flags.apiKey) return { key: flags.apiKey, source: "flag" };
  const fromEnv = deps.env.TUNER_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env" };
  const stored = await deps.credentials.read();
  return stored ? { key: stored, source: "stored" } : undefined;
}

export async function requireApiKey(flags: GlobalFlags, deps: KeyDeps): Promise<ResolvedKey> {
  const key = await resolveApiKey(flags, deps);
  if (!key) {
    throw new CliError("No API key. Set TUNER_API_KEY or run `tuner auth login`.", "config_error");
  }
  return key;
}

export function describeKeySource(source: KeySource, deps: Pick<AppDeps, "credentials">): string {
  if (source === "flag") return "--api-key";
  if (source === "env") return "TUNER_API_KEY";
  return deps.credentials.path;
}
