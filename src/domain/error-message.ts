import { ApiError, CliError, GaveUpError, detailText } from "./errors.js";
import { exitForError } from "./exit.js";

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

/** Maps an error to the message the CLI prints and its exit code. */
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
  const exit = exitForError(err.code, err.status);
  switch (err.code) {
    case "invalid_api_key":
      return new CliError(
        `API key rejected: ${detail}${ctx.keySource ? ` (key from ${ctx.keySource})` : ""}`,
        err.code,
        exit,
      );
    case "insufficient_access":
      return new CliError(`This API key can't access this resource: ${detail}`, err.code, exit);
    case "agent_not_found":
      return new CliError(
        ctx.agentRef ? `Agent '${ctx.agentRef}' not found in this workspace.` : detail,
        err.code,
        exit,
      );
    case "scenario_not_found":
      return new CliError(
        `${detail}. Run \`tuner scenarios list\` to see scenario IDs.`,
        err.code,
        exit,
      );
    case "no_scenarios_for_tag":
      return new CliError(
        `${ctx.tag ? `No scenarios tagged '${ctx.tag}'.` : detail} ` +
          "Run `tuner scenarios list` to see tags.",
        err.code,
        exit,
      );
    case "unresolved_name": {
      const first = Array.isArray(err.detail) ? (err.detail[0] as Record<string, unknown>) : {};
      const loc = Array.isArray(first?.loc) ? first.loc : [];
      const field = typeof loc[1] === "string" ? loc[1] : undefined;
      const hint = field && LIST_COMMAND[field] ? ` Run \`${LIST_COMMAND[field]}\`.` : "";
      return new CliError(`${detail}${hint}`, err.code, exit, {
        field,
        value: first?.input,
      });
    }
    case "insufficient_credits":
      return new CliError(`No credits left for this workspace: ${detail}`, err.code, exit);
    case "run_in_flight": {
      const runId = body.run_id;
      const url = body.dashboard_url;
      return new CliError(
        `The agent already has a run in progress${runId !== undefined ? ` (run ${runId})` : ""}.` +
          (url ? ` ${url}` : "") +
          (runId !== undefined ? `\nCheck it with \`tuner runs get ${runId}\`.` : ""),
        err.code,
        exit,
        { run_id: runId, dashboard_url: url },
      );
    }
    case "simulation_not_configured":
      return new CliError(`The agent isn't set up for simulations: ${detail}`, err.code, exit);
    default:
      return new CliError(detail || err.message, err.code, exit);
  }
}
