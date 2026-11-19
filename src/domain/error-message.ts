import {
  ApiError,
  CliError,
  GaveUpError,
  NetworkError,
  UnexpectedResponseError,
  detailText,
} from "./errors.js";
import { exitForError } from "./exit.js";

export interface ErrorContext {
  keySource?: string;
  agentRef?: string;
  /** The resolved agent's name, once known. */
  agentName?: string;
  tag?: string;
  runId?: number;
}

const LIST_COMMAND: Record<string, string> = {
  language: "tuner languages list",
  profile: "tuner profiles list",
  noise: "tuner noise list",
};

const NETWORK_HINT = "Check your network and --base-url (or TUNER_BASE_URL).";
const noDot = (text: string) => text.replace(/\.+$/, "");

/** Maps an error to the message the CLI prints and its exit code. */
export function toCliError(err: unknown, ctx: ErrorContext = {}): CliError {
  if (err instanceof CliError) return err;
  if (err instanceof GaveUpError) return gaveUp(err.lastError);
  if (err instanceof NetworkError) {
    return new CliError(`${err.message}. ${NETWORK_HINT}`, "tuner_error");
  }
  if (err instanceof UnexpectedResponseError) {
    return new CliError(err.message, "unexpected_response");
  }
  if (!(err instanceof ApiError)) {
    const text = err instanceof Error ? err.message : String(err);
    return new CliError(
      `Unexpected error: ${text}. Re-run with --verbose and report it.`,
      "tuner_error",
    );
  }
  return fromApi(err, ctx);
}

function gaveUp(last: ApiError | NetworkError): CliError {
  if (last instanceof NetworkError) {
    return new CliError(`${last.message}, and retries ran out. ${NETWORK_HINT}`, "tuner_error");
  }
  const what =
    last.status === 429
      ? "Tuner kept rate limiting requests (429 rate_limited)"
      : `Tuner kept failing (${last.status} ${last.code})`;
  return new CliError(`${what}, and retries ran out. Try again later.`, "tuner_error");
}

function fromApi(err: ApiError, ctx: ErrorContext): CliError {
  const detail = detailText(err.detail);
  const make = (message: string, extra?: Record<string, unknown>) =>
    new CliError(message, err.code, exitForError(err.code, err.status), extra);
  switch (err.code) {
    case "invalid_api_key":
      return make(
        `API key rejected (${noDot(detail)})${ctx.keySource ? `; key from ${ctx.keySource}` : ""}. ` +
          "Set a valid key in TUNER_API_KEY or run `tuner auth login`.",
      );
    case "insufficient_access":
      return make(
        `This API key can't access it: ${noDot(detail)}. Use a key from the agent's workspace.`,
      );
    case "workspace_not_found":
      return make(`${noDot(detail)}. Check the key's workspace with \`tuner auth status\`.`);
    case "agent_not_found":
      return make(
        `${ctx.agentRef ? `Agent '${ctx.agentRef}' not found in this workspace` : noDot(detail)}. ` +
          "Run `tuner agents list` to see agent IDs.",
      );
    case "scenario_not_found":
      return make(`${noDot(detail)}. Run \`tuner scenarios list\` to see scenario IDs.`);
    case "run_not_found":
      return make(
        `${ctx.runId !== undefined ? `Run ${ctx.runId} not found for this agent` : noDot(detail)}. ` +
          "Check the run ID and --agent.",
      );
    case "no_scenarios_for_tag":
      return make(
        `${ctx.tag ? `No scenarios tagged '${ctx.tag}'.` : detail} ` +
          "Run `tuner scenarios list` to see tags.",
      );
    case "run_too_large":
      return make(`${noDot(detail)}. Split it into smaller tags or scenario lists.`);
    case "unresolved_name":
      return unresolvedName(err, detail, make);
    case "insufficient_credits":
      return make(
        `Not enough credits to start this run (${noDot(detail)}). ` +
          "Add credits or check the workspace plan in Tuner.",
      );
    case "run_in_flight":
      return runInFlight(err, ctx, make);
    case "simulation_not_configured":
      return make(
        `The agent isn't set up for simulations: ${noDot(detail)}. Fix it in the agent's settings in Tuner.`,
      );
    case "run_start_failed":
      return make(`Tuner couldn't start the run: ${noDot(detail)}.`);
    case "rate_limited":
      return make(`Tuner is rate limiting requests (${noDot(detail)}). Try again in a minute.`);
    case "internal_error":
      return make(`Tuner had an internal error (${err.status}): ${noDot(detail)}.`);
    case "validation_error":
      return make(`Tuner rejected the request (${err.status}): ${noDot(detail) || err.message}.`);
    default:
      return make(`${noDot(detail) || "No details"} (${err.status} ${err.code}).`);
  }
}

type Make = (message: string, extra?: Record<string, unknown>) => CliError;

function unresolvedName(err: ApiError, detail: string, make: Make): CliError {
  const first = Array.isArray(err.detail) ? (err.detail[0] as Record<string, unknown>) : {};
  const loc = Array.isArray(first?.loc) ? first.loc : [];
  const field = typeof loc[1] === "string" ? loc[1] : undefined;
  const hint = field && LIST_COMMAND[field] ? ` Run \`${LIST_COMMAND[field]}\`.` : "";
  return make(`${detail}${hint}`, { field, value: first?.input });
}

function runInFlight(err: ApiError, ctx: ErrorContext, make: Make): CliError {
  const runId = err.body.run_id;
  const url = err.body.dashboard_url;
  const name = ctx.agentName ?? ctx.agentRef;
  const agent = name ? `Agent '${name}'` : "The agent";
  return make(
    `${agent} already has a run in progress${runId !== undefined ? ` (${String(runId)})` : ""}. ` +
      "Wait for it to finish, then try again." +
      (typeof url === "string" ? ` ${url}` : "") +
      (runId !== undefined ? `\nCheck it with \`tuner runs get ${String(runId)}\`.` : ""),
    { run_id: runId, dashboard_url: url },
  );
}

/**
 * The start request was sent but no answer came back, so a run may exist. `inFlight` is the
 * agent's run in progress, null when there is none, undefined when the lookup failed.
 */
export function startOutcomeUnknown(cause: string, inFlight: number | null | undefined): CliError {
  const head = `The connection to Tuner was lost after the start request was sent (${cause}), so a run may have started.`;
  const tail =
    inFlight === undefined
      ? "Check the agent's runs in the dashboard before you try again."
      : inFlight === null
        ? "No run is in progress for this agent, so it most likely did not start. Try again."
        : `Run ${inFlight} is in progress for this agent and may be the one this command started. ` +
          `Check it with \`tuner runs get ${inFlight}\`, or cancel it with \`tuner runs cancel ${inFlight}\`.`;
  return new CliError(
    `${head} ${tail}`,
    "start_outcome_unknown",
    undefined,
    inFlight ? { run_id: inFlight } : {},
  );
}
