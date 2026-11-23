import type { RunResult } from "./types.js";

export const EXIT = {
  OK: 0,
  AGENT_FAILED: 1,
  USAGE: 2,
  TUNER_FAULT: 3,
  SIGINT: 130,
  SIGTERM: 143,
} as const;

export type Signal = "SIGINT" | "SIGTERM";

/** `reason` codes for a run that started. */
export type RunReason = "agent_failed" | "setup_error" | "tuner_error" | "timeout" | "canceled";

/** Worst first: an agent failure, then a problem the customer must fix, then a Tuner fault. */
const SEVERITY: readonly number[] = [EXIT.AGENT_FAILED, EXIT.USAGE, EXIT.TUNER_FAULT];

/** Exit for every error `code` the CLI raises or the API returns. */
export const EXIT_FOR_CODE: Readonly<Record<string, number>> = {
  usage_error: EXIT.USAGE,
  config_error: EXIT.USAGE,
  invalid_api_key: EXIT.USAGE,
  insufficient_access: EXIT.USAGE,
  workspace_not_found: EXIT.USAGE,
  agent_not_found: EXIT.USAGE,
  scenario_not_found: EXIT.USAGE,
  run_not_found: EXIT.USAGE,
  no_scenarios_for_tag: EXIT.USAGE,
  run_too_large: EXIT.USAGE,
  unresolved_name: EXIT.USAGE,
  insufficient_credits: EXIT.USAGE,
  run_in_flight: EXIT.USAGE,
  simulation_not_configured: EXIT.USAGE,
  validation_error: EXIT.USAGE,
  // Retried like an outage; still failing when retries run out is Tuner's side.
  rate_limited: EXIT.TUNER_FAULT,
  run_start_failed: EXIT.TUNER_FAULT,
  internal_error: EXIT.TUNER_FAULT,
  tuner_error: EXIT.TUNER_FAULT,
  unexpected_response: EXIT.TUNER_FAULT,
  start_outcome_unknown: EXIT.TUNER_FAULT,
};

export function exitForSignal(signal: Signal): number {
  return signal === "SIGINT" ? EXIT.SIGINT : EXIT.SIGTERM;
}

/** The worst of several outcome codes (1 > 2 > 3 > 0). */
export function worstExit(codes: number[]): number {
  for (const code of SEVERITY) if (codes.includes(code)) return code;
  return EXIT.OK;
}

/** Exit code for a run that started and was not stopped by our own signal. */
export function exitForRun(result: RunResult | null, reason: RunReason | null): number {
  const codes: number[] = [];
  if (result === "failed" || reason === "agent_failed") codes.push(EXIT.AGENT_FAILED);
  if (reason === "setup_error") codes.push(EXIT.USAGE);
  if (reason === "tuner_error" || reason === "canceled" || reason === "timeout") {
    codes.push(EXIT.TUNER_FAULT);
  }
  if (codes.length > 0) return worstExit(codes);
  return result === "passed" ? EXIT.OK : EXIT.TUNER_FAULT;
}

/**
 * Exit code for a run we stopped at `--timeout` (3), unless the server already says the
 * agent failed or the setup did. Our cancel makes the server say `canceled`, which adds nothing.
 */
export function exitForTimeout(result: RunResult | null, serverReason: RunReason | null): number {
  const codes: number[] = [EXIT.TUNER_FAULT];
  if (result === "failed" || serverReason === "agent_failed") codes.push(EXIT.AGENT_FAILED);
  if (serverReason === "setup_error") codes.push(EXIT.USAGE);
  return worstExit(codes);
}

/**
 * Exit code for an error `code` (API or CLI). A 5xx is always 3. An unknown code falls back
 * by HTTP status: 4xx is 2, anything else 3.
 */
export function exitForError(code: string, status?: number): number {
  if (status !== undefined && status >= 500) return EXIT.TUNER_FAULT;
  const known = EXIT_FOR_CODE[code];
  if (known !== undefined) return known;
  return status !== undefined && status >= 400 ? EXIT.USAGE : EXIT.TUNER_FAULT;
}
