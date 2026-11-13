import type { GlobalFlags } from "../domain/config.js";
import { resolveBaseUrl } from "../domain/config.js";
import { toCliError } from "../domain/error-message.js";
import { CliError } from "../domain/errors.js";
import type { Whoami } from "../domain/types.js";
import type { AppDeps } from "../ports.js";
import { describeKeySource } from "./credentials.js";
import { SHORT_GIVE_UP_MS } from "./retry.js";
import { resolveTarget } from "./target.js";

/** Validates a key with whoami, then stores it. `readKey` runs only without --api-key. */
export async function login(
  deps: AppDeps,
  flags: GlobalFlags,
  readKey: () => Promise<string>,
): Promise<{ whoami: Whoami; path: string }> {
  const baseUrl = resolveBaseUrl(flags, deps);
  let key = flags.apiKey?.trim();
  if (!key) key = (await readKey()).trim();
  if (!key) {
    throw new CliError(
      "No API key given. Pass --api-key, pipe the key on stdin, or run in a terminal.",
      "usage_error",
    );
  }
  let whoami: Whoami;
  try {
    whoami = await deps.connect(baseUrl, key).whoami();
  } catch (err) {
    throw toCliError(err);
  }
  const path = await deps.credentials.write(key);
  return { whoami, path };
}

export async function logout(
  deps: AppDeps,
): Promise<{ removed: boolean; path: string; envKeySet: boolean }> {
  const removed = await deps.credentials.delete();
  return { removed, path: deps.credentials.path, envKeySet: Boolean(deps.env.TUNER_API_KEY) };
}

export async function status(
  deps: AppDeps,
  flags: GlobalFlags,
): Promise<{ whoami: Whoami; keySource: string; baseUrl: string }> {
  const t = await resolveTarget(deps, { flags, needAgent: false, giveUpMs: SHORT_GIVE_UP_MS });
  return { whoami: t.whoami, keySource: describeKeySource(t.key.source, deps), baseUrl: t.baseUrl };
}
