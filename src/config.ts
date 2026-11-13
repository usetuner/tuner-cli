import { FileCredentialStore } from "./adapters/credential-store.js";
import type { GlobalFlags, KeySource, ResolvedKey } from "./domain/config.js";
import { CliError } from "./domain/errors.js";
import type { Runtime } from "./ports.js";

export async function resolveApiKey(
  flags: GlobalFlags,
  runtime: Runtime,
): Promise<ResolvedKey | undefined> {
  if (flags.apiKey) return { key: flags.apiKey, source: "flag" };
  const fromEnv = runtime.env.TUNER_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env" };
  const stored = await new FileCredentialStore(runtime.configDir).read();
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
  return new FileCredentialStore(runtime.configDir).path;
}
