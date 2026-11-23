import type { Run, Verdict } from "./types.js";

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  canceled: number;
  pending: number;
}

const INCONCLUSIVE: Verdict[] = [
  "not_connected",
  "setup_error",
  "platform_error",
  "unreported",
  "analysis_failed",
];

/** Counts the server's verdicts; it never derives its own. */
export function summarize(run: Run | undefined): Summary {
  const summary: Summary = {
    total: 0,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    canceled: 0,
    pending: 0,
  };
  for (const call of run?.simulation_calls ?? []) {
    summary.total += 1;
    if (call.verdict === "passed" || call.verdict === "ran") summary.passed += 1;
    else if (call.verdict === "failed") summary.failed += 1;
    else if (call.verdict === "canceled") summary.canceled += 1;
    else if (INCONCLUSIVE.includes(call.verdict)) summary.inconclusive += 1;
    else summary.pending += 1;
  }
  return summary;
}
