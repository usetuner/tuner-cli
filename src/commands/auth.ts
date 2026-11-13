import { TunerClient } from "../adapters/http-client.js";
import { FileCredentialStore } from "../adapters/credential-store.js";
import { describeKeySource } from "../config.js";
import { resolveTarget } from "../context.js";
import { resolveBaseUrl } from "../domain/config.js";
import { toCliError } from "../domain/error-message.js";
import { CliError } from "../domain/errors.js";
import { EXIT } from "../domain/exit.js";
import { type CommandContext, SHORT_GIVE_UP_MS, guard } from "./shared.js";

export function authLogin(ctx: CommandContext): Promise<number> {
  const { runtime, flags } = ctx;
  return guard(runtime, async () => {
    const baseUrl = resolveBaseUrl(flags, runtime);
    let key = flags.apiKey?.trim();
    if (!key) {
      key = runtime.stdinIsTTY
        ? (await runtime.promptSecret("Tuner API key: ")).trim()
        : (await runtime.readStdin()).trim();
    }
    if (!key) {
      throw new CliError(
        "No API key given. Pass --api-key, pipe the key on stdin, or run in a terminal.",
        "usage_error",
      );
    }
    const client = new TunerClient({ baseUrl, apiKey: key, runtime, verbose: flags.verbose });
    let whoami;
    try {
      whoami = await client.whoami();
    } catch (err) {
      throw toCliError(err);
    }
    const path = await new FileCredentialStore(runtime.configDir).write(key);
    runtime.stdout.write(
      `Logged in to workspace ${whoami.workspace.name} (${whoami.workspace.id}) ` +
        `with key ${whoami.api_key.name} (…${whoami.api_key.last_four}).\nSaved to ${path}\n`,
    );
    return EXIT.OK;
  });
}

export function authLogout(ctx: CommandContext): Promise<number> {
  const { runtime } = ctx;
  return guard(runtime, async () => {
    const store = new FileCredentialStore(runtime.configDir);
    const removed = await store.delete();
    runtime.stdout.write(removed ? `Removed ${store.path}\n` : "No stored API key.\n");
    if (runtime.env.TUNER_API_KEY) {
      runtime.stderr.write("TUNER_API_KEY is still set in this environment.\n");
    }
    return EXIT.OK;
  });
}

export function authStatus(ctx: CommandContext): Promise<number> {
  const { runtime } = ctx;
  return guard(runtime, async () => {
    const t = await resolveTarget({ ...ctx, needAgent: false, giveUpMs: SHORT_GIVE_UP_MS });
    runtime.stdout.write(
      [
        `Key:       ${t.whoami.api_key.name} (…${t.whoami.api_key.last_four}) from ${describeKeySource(t.key.source, runtime)}`,
        `Workspace: ${t.workspace.name} (${t.workspace.id})`,
        `Base URL:  ${t.baseUrl}`,
      ].join("\n") + "\n",
    );
    return EXIT.OK;
  });
}
