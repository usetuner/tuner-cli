import { TunerClient, withRetry } from "./client.js";
import { describeKeySource, requireApiKey } from "./config.js";
import {
  type GlobalFlags,
  type ResolvedKey,
  resolveAgentRef,
  resolveBaseUrl,
} from "./domain/config.js";
import { toCliError } from "./domain/error-message.js";
import { CliError } from "./domain/errors.js";
import type { Runtime } from "./ports.js";
import type { ResolvedAgent, Whoami } from "./domain/types.js";

export interface Target {
  client: TunerClient;
  key: ResolvedKey;
  baseUrl: string;
  whoami: Whoami;
  workspace: { id: number; name: string };
  agent?: ResolvedAgent;
}

export interface TargetOptions {
  flags: GlobalFlags;
  runtime: Runtime;
  /** `--agent` value; resolved with TUNER_AGENT_ID when `needAgent`. */
  agent?: string;
  needAgent: boolean;
  /** Budget for 429/5xx/network retries. */
  giveUpMs: number;
  signal?: AbortSignal;
}

const DIGITS = /^\d+$/;

export async function resolveTarget(opts: TargetOptions): Promise<Target> {
  const { flags, runtime } = opts;
  const baseUrl = resolveBaseUrl(flags, runtime);
  const key = await requireApiKey(flags, runtime);
  const agentRef = opts.needAgent ? resolveAgentRef(opts.agent, runtime) : undefined;
  if (opts.needAgent && !agentRef) {
    throw new CliError(
      "No agent. Pass --agent <agent-remote-id> or set TUNER_AGENT_ID.",
      "config_error",
    );
  }
  const client = new TunerClient({ baseUrl, apiKey: key.key, runtime, verbose: flags.verbose });
  const retry = <T>(fn: () => Promise<T>) =>
    withRetry(fn, { runtime, giveUpMs: opts.giveUpMs, signal: opts.signal });

  const remoteId = agentRef && !DIGITS.test(agentRef) ? agentRef : undefined;
  const whoami = await call(() => retry(() => client.whoami(remoteId)), key, runtime, agentRef);
  if (!whoami) throw new CliError("Interrupted.", "canceled");

  const expected = runtime.env.TUNER_WORKSPACE_ID?.trim();
  if (expected && expected !== String(whoami.workspace.id)) {
    throw new CliError(
      `TUNER_WORKSPACE_ID is ${expected} but the API key belongs to workspace ` +
        `${whoami.workspace.id} (${whoami.workspace.name}).`,
      "config_error",
    );
  }

  let agent: ResolvedAgent | undefined;
  if (agentRef && whoami.agent) {
    agent = whoami.agent;
  } else if (agentRef) {
    const found = await call(
      () => retry(() => client.getAgent(whoami.workspace.id, agentRef)),
      key,
      runtime,
      agentRef,
    );
    if (!found) throw new CliError("Interrupted.", "canceled");
    agent = { id: found.id, remote_identifier: found.remote_identifier, name: found.name };
  }

  return { client, key, baseUrl, whoami, workspace: whoami.workspace, agent };
}

async function call<T>(
  fn: () => Promise<T>,
  key: ResolvedKey,
  runtime: Runtime,
  agentRef: string | undefined,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toCliError(err, { keySource: describeKeySource(key.source, runtime), agentRef });
  }
}
