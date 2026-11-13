import { login, logout, status } from "../app/auth.js";
import { EXIT } from "../domain/exit.js";
import { type CommandContext, guard } from "./shared.js";

export function authLogin(ctx: CommandContext): Promise<number> {
  const { runtime } = ctx;
  return guard(runtime, async () => {
    const readKey = () =>
      runtime.stdinIsTTY ? runtime.promptSecret("Tuner API key: ") : runtime.readStdin();
    const { whoami, path } = await login(ctx.deps, ctx.flags, readKey);
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
    const { removed, path, envKeySet } = await logout(ctx.deps);
    runtime.stdout.write(removed ? `Removed ${path}\n` : "No stored API key.\n");
    if (envKeySet) runtime.stderr.write("TUNER_API_KEY is still set in this environment.\n");
    return EXIT.OK;
  });
}

export function authStatus(ctx: CommandContext): Promise<number> {
  const { runtime } = ctx;
  return guard(runtime, async () => {
    const { whoami, keySource, baseUrl } = await status(ctx.deps, ctx.flags);
    runtime.stdout.write(
      [
        `Key:       ${whoami.api_key.name} (…${whoami.api_key.last_four}) from ${keySource}`,
        `Workspace: ${whoami.workspace.name} (${whoami.workspace.id})`,
        `Base URL:  ${baseUrl}`,
      ].join("\n") + "\n",
    );
    return EXIT.OK;
  });
}
