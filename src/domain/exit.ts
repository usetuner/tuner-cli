import type { RunResult } from "./types.js";

export const EXIT = {
  OK: 0,
  AGENT_FAILED: 1,
  USAGE: 2,
  TUNER_FAULT: 3,
  AUTH: 4,
  NOTHING_TO_RUN: 5,
  TIMEOUT: 124,
  SIGINT: 130,
  SIGTERM: 143,
} as const;

export type Signal = "SIGINT" | "SIGTERM";

/** `reason` codes for a run that started. */
export type RunReason = "agent_failed" | "tuner_error" | "timeout" | "canceled";

/** Worst first: an agent failure beats a Tuner fault, which beats a timeout. */
const SEVERITY: readonly number[] = [EXIT.AGENT_FAILED, EXIT.TUNER_FAULT, EXIT.TIMEOUT];

const AUTH_CODES = new Set(["invalid_api_key", "insufficient_access"]);
const NOTHING_TO_RUN_CODES = new Set([
  "no_scenarios_for_tag",
  "workspace_not_found",
  "agent_not_found",
  "scenario_not_found",
]);
const TUNER_FAULT_CODES = new Set(["tuner_error", "internal_error", "run_start_failed"]);

export function exitForSignal(signal: Signal): number {
  return signal === "SIGINT" ? EXIT.SIGINT : EXIT.SIGTERM;
}

/** The worst of several outcome codes (1 > 3 > 124 > 0). */
export function worstExit(codes: number[]): number {
  for (const code of SEVERITY) if (codes.includes(code)) return code;
  return EXIT.OK;
}

/** Exit code for a run that started and was not stopped by our own signal. */
export function exitForRun(result: RunResult | null, reason: RunReason | null): number {
  const codes: number[] = [];
  if (result === "failed" || reason === "agent_failed") codes.push(EXIT.AGENT_FAILED);
  if (reason === "tuner_error" || reason === "canceled") codes.push(EXIT.TUNER_FAULT);
  if (reason === "timeout") codes.push(EXIT.TIMEOUT);
  if (codes.length > 0) return worstExit(codes);
  return result === "passed" ? EXIT.OK : EXIT.TUNER_FAULT;
}

/**
 * Exit code for a run we stopped at `--timeout`. Our cancel makes the server say `canceled`,
 * so only its `agent_failed` or `tuner_error` can beat 124.
 */
export function exitForTimeout(result: RunResult | null, serverReason: RunReason | null): number {
  const codes: number[] = [EXIT.TIMEOUT];
  if (result === "failed" || serverReason === "agent_failed") codes.push(EXIT.AGENT_FAILED);
  if (serverReason === "tuner_error") codes.push(EXIT.TUNER_FAULT);
  return worstExit(codes);
}

/** Exit code for an error `code` (API or CLI), with the HTTP status when there is one. */
export function exitForError(code: string, status?: number): number {
  if (AUTH_CODES.has(code) || status === 401 || status === 403) return EXIT.AUTH;
  if (NOTHING_TO_RUN_CODES.has(code)) return EXIT.NOTHING_TO_RUN;
  if (TUNER_FAULT_CODES.has(code) || (status !== undefined && status >= 500)) {
    return EXIT.TUNER_FAULT;
  }
  return EXIT.USAGE;
}
