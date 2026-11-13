import {
  type GlobalFlags,
  type ResolvedKey,
  resolveAgentRef,
  resolveBaseUrl,
} from "../domain/config.js";
import { toCliError } from "../domain/error-message.js";
import { CliError } from "../domain/errors.js";
import type { ResolvedAgent, Whoami } from "../domain/types.js";
import type { AppDeps, TunerApi } from "../ports.js";
import { describeKeySource, requireApiKey } from "./credentials.js";
import { withRetry } from "./retry.js";

export interface Target {
  api: TunerApi;
  key: ResolvedKey;
  baseUrl: string;
  whoami: Whoami;
  workspace: { id: number; name: string };
  agent?: ResolvedAgent;
}

export interface TargetOptions {
  flags: GlobalFlags;
  /** `--agent` value; resolved with TUNER_AGENT_ID when `needAgent`. */
  agent?: string;
  needAgent: boolean;
  /** Budget for 429/5xx/network retries. */
  giveUpMs: number;
  signal?: AbortSignal;
}

const DIGITS = /^\d+$/;

/** Resolves the key, base URL, workspace and agent a command runs against. */
export async function resolveTarget(deps: AppDeps, opts: TargetOptions): Promise<Target> {
  const { flags } = opts;
  const baseUrl = resolveBaseUrl(flags, deps);
  const key = await requireApiKey(flags, deps);
  const agentRef = opts.needAgent ? resolveAgentRef(opts.agent, deps) : undefined;
  if (opts.needAgent && !agentRef) {
    throw new CliError(
      "No agent. Pass --agent <agent-remote-id> or set TUNER_AGENT_ID.",
      "config_error",
    );
  }
  const api = deps.connect(baseUrl, key.key);
  const retry = <T>(fn: () => Promise<T>) =>
    withRetry(fn, { clock: deps.clock, giveUpMs: opts.giveUpMs, signal: opts.signal });
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw toCliError(err, { keySource: describeKeySource(key.source, deps), agentRef });
    }
  };

  const remoteId = agentRef && !DIGITS.test(agentRef) ? agentRef : undefined;
  const whoami = await call(() => retry(() => api.whoami(remoteId)));
  if (!whoami) throw new CliError("Interrupted.", "canceled");

  const expected = deps.env.TUNER_WORKSPACE_ID?.trim();
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
    const found = await call(() => retry(() => api.getAgent(whoami.workspace.id, agentRef)));
    if (!found) throw new CliError("Interrupted.", "canceled");
    agent = { id: found.id, remote_identifier: found.remote_identifier, name: found.name };
  }

  return { api, key, baseUrl, whoami, workspace: whoami.workspace, agent };
}
