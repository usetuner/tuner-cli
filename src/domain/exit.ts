import type { RunResult } from "./types.js";

export const EXIT = {
  OK: 0,
  AGENT_FAILED: 1,
  NOTHING_RAN: 2,
  SIGINT: 130,
  SIGTERM: 143,
} as const;

export type Signal = "SIGINT" | "SIGTERM";

/** `reason` codes for a run that started. */
export type RunReason = "agent_failed" | "tuner_error" | "timeout" | "canceled";

export function exitForSignal(signal: Signal): number {
  return signal === "SIGINT" ? EXIT.SIGINT : EXIT.SIGTERM;
}

/** Exit code for a run that started and was not stopped by a signal. */
export function exitForRun(
  result: RunResult | null,
  reason: RunReason | null,
  failOnInconclusive: boolean,
): number {
  if (result === "failed" || reason === "agent_failed") return EXIT.AGENT_FAILED;
  if (result === "passed" && reason === null) return EXIT.OK;
  return failOnInconclusive ? EXIT.AGENT_FAILED : EXIT.OK;
}
