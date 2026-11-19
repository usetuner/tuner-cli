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
export type RunReason = "agent_failed" | "tuner_error" | "timeout" | "canceled";

/** Worst first: an agent failure, then a problem the customer must fix, then a Tuner fault. */
const SEVERITY: readonly number[] = [EXIT.AGENT_FAILED, EXIT.USAGE, EXIT.TUNER_FAULT];

const TUNER_FAULT_CODES = new Set(["tuner_error", "internal_error", "run_start_failed"]);

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
  if (reason === "tuner_error" || reason === "canceled" || reason === "timeout") {
    codes.push(EXIT.TUNER_FAULT);
  }
  if (codes.length > 0) return worstExit(codes);
  return result === "passed" ? EXIT.OK : EXIT.TUNER_FAULT;
}

/**
 * Exit code for a run we stopped at `--timeout` (3), unless the server already says the
 * agent failed. Our cancel makes the server say `canceled`, which adds nothing.
 */
export function exitForTimeout(result: RunResult | null, serverReason: RunReason | null): number {
  const codes: number[] = [EXIT.TUNER_FAULT];
  if (result === "failed" || serverReason === "agent_failed") codes.push(EXIT.AGENT_FAILED);
  return worstExit(codes);
}

/** Exit code for an error `code` (API or CLI), with the HTTP status when there is one. */
export function exitForError(code: string, status?: number): number {
  if (TUNER_FAULT_CODES.has(code) || (status !== undefined && status >= 500)) {
    return EXIT.TUNER_FAULT;
  }
  return EXIT.USAGE;
}
