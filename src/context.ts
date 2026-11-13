import { TunerClient, withRetry } from "./client.js";
import {
  type GlobalFlags,
  type ResolvedKey,
  describeKeySource,
  requireApiKey,
  resolveAgentRef,
  resolveBaseUrl,
} from "./config.js";
import { ApiError, CliError, GaveUpError, detailText } from "./errors.js";
import type { Runtime } from "./runtime.js";
import type { ResolvedAgent, Whoami } from "./types.js";

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

export interface ErrorContext {
  keySource?: string;
  agentRef?: string;
  tag?: string;
}

const LIST_COMMAND: Record<string, string> = {
  language: "tuner languages list",
  profile: "tuner profiles list",
  noise: "tuner noise list",
};

/** Maps an API error to the message the CLI prints. Exit 2 unless the caller overrides it. */
export function toCliError(err: unknown, ctx: ErrorContext = {}): CliError {
  if (err instanceof CliError) return err;
  if (err instanceof GaveUpError) {
    return new CliError(`Tuner is unavailable: ${err.lastError.message}`, "tuner_error");
  }
  if (!(err instanceof ApiError)) {
    return new CliError(err instanceof Error ? err.message : String(err), "tuner_error");
  }
  const detail = detailText(err.detail);
  const body = err.body;
  switch (err.code) {
    case "invalid_api_key":
      return new CliError(
        `API key rejected: ${detail}${ctx.keySource ? ` (key from ${ctx.keySource})` : ""}`,
        err.code,
      );
    case "insufficient_access":
      return new CliError(`This API key can't access this resource: ${detail}`, err.code);
    case "agent_not_found":
      return new CliError(
        ctx.agentRef ? `Agent '${ctx.agentRef}' not found in this workspace.` : detail,
        err.code,
      );
    case "scenario_not_found":
      return new CliError(`${detail}. Run \`tuner scenarios list\` to see scenario IDs.`, err.code);
    case "no_scenarios_for_tag":
      return new CliError(
        `${ctx.tag ? `No scenarios tagged '${ctx.tag}'.` : detail} ` +
          "Run `tuner scenarios list` to see tags.",
        err.code,
      );
    case "unresolved_name": {
      const first = Array.isArray(err.detail) ? (err.detail[0] as Record<string, unknown>) : {};
      const loc = Array.isArray(first?.loc) ? first.loc : [];
      const field = typeof loc[1] === "string" ? loc[1] : undefined;
      const hint = field && LIST_COMMAND[field] ? ` Run \`${LIST_COMMAND[field]}\`.` : "";
      return new CliError(`${detail}${hint}`, err.code, undefined, {
        field,
        value: first?.input,
      });
    }
    case "insufficient_credits":
      return new CliError(`No credits left for this workspace: ${detail}`, err.code);
    case "run_in_flight": {
      const runId = body.run_id;
      const url = body.dashboard_url;
      return new CliError(
        `The agent already has a run in progress${runId !== undefined ? ` (run ${runId})` : ""}.` +
          (url ? ` ${url}` : "") +
          (runId !== undefined ? `\nCheck it with \`tuner runs get ${runId}\`.` : ""),
        err.code,
        undefined,
        { run_id: runId, dashboard_url: url },
      );
    }
    case "simulation_not_configured":
      return new CliError(`The agent isn't set up for simulations: ${detail}`, err.code);
    default:
      return new CliError(detail || err.message, err.code);
  }
}
